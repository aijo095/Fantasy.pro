/* =========================================================
   تحليل مباراة منتهية من بيانات ESPN العامة (التعليق النصي + إحصائيات الفريقين)
   كل هدف وكل تسديدة: الدقيقة، الجهة (يسار/وسط/يمين حسب نظر المهاجم)، العمق
   (داخل الست ياردات/داخل الصندوق/خارجه/جزاء)، القدم أو الرأس، ونوع الصناعة.
   المباراة المنتهية ما تتغير، فتنحفظ بالـ CDN شهر كامل ويستلمها كل المستخدمين.
========================================================= */

const clock = (s) => { const m = String(s || '').match(/(\d+)'(?:\s*\+\s*(\d+))?/); return m ? [+m[1], m[2] ? +m[2] : 0] : [0, 0]; };
const low = (s) => String(s || '').toLowerCase();

// الجهة والعمق من نص الوصف (Opta)
function zoneOf(t) {
  t = low(t);
  if (/penalt/.test(t) && !/penalty area/.test(t)) return ['p', 'c'];
  let depth = 'b', side = 'c';
  if (/six yard box|very close range/.test(t)) depth = 's';
  else if (/outside the box|long range|more than 35 yards|from distance/.test(t)) depth = 'o';
  else if (/difficult angle/.test(t)) depth = 'b';
  if (/left side|on the left|from the left|angle on the left/.test(t)) side = 'l';
  else if (/right side|on the right|from the right|angle on the right/.test(t)) side = 'r';
  else if (/centre of the box|centre of the six|very close range|outside the box/.test(t)) side = 'c';
  return [depth, side];
}
function howOf(t) {
  t = low(t);
  if (/own goal/.test(t)) return 'og';
  if (/penalt/.test(t) && !/penalty area/.test(t)) return 'p';
  if (/header|headed/.test(t)) return 'h';
  if (/left footed|left-footed/.test(t)) return 'l';
  if (/right footed|right-footed/.test(t)) return 'r';
  return 'o';
}
function astOf(t) {
  t = low(t);
  if (/following a corner/.test(t)) return 'k';
  if (/set piece/.test(t)) return 'f';
  if (/fast break/.test(t)) return 'x';
  if (/through ball/.test(t)) return 't';
  if (/with a cross/.test(t)) return 'c';
  if (/headed pass/.test(t)) return 'hp';
  if (/assisted by/.test(t)) return 'a';
  return '';
}
function placeOf(t) {
  t = low(t);
  const m = t.match(/(bottom|top|high|low)?\s*(left|right|centre)\s*(corner|of the goal)?/g) || [];
  const s = m.find((x) => /corner|of the goal|top|bottom|high/.test(x)) || '';
  if (!s) return '';
  const v = /top|high/.test(s) ? 't' : 'b', h = /left/.test(s) ? 'l' : /right/.test(s) ? 'r' : 'c';
  return v + h;
}
const who = (t) => { const m = String(t || '').match(/(?:\.\s|^)([^.()]+?)\s\(([^)]+)\)/); return m ? m[1].replace(/^(Goal!|Attempt \w+|Own Goal by)\s*/i, '').trim() : ''; };
const assister = (t) => { const m = String(t || '').match(/Assisted by ([^.]+?)(?: with| following|\.|$)/); return m ? m[1].trim() : ''; };

const STATN = {
  possessionPct: 'poss', totalShots: 'sh', shotsOnTarget: 'sot', wonCorners: 'cor', foulsCommitted: 'fou', yellowCards: 'yc', redCards: 'rc',
  offsides: 'off', saves: 'sav', totalPasses: 'pas', accuratePasses: 'pasA', totalCrosses: 'crs', accurateCrosses: 'crsA', totalLongBalls: 'lb',
  accurateLongBalls: 'lbA', totalTackles: 'tkl', effectiveTackles: 'tklA', interceptions: 'int', totalClearance: 'clr', blockedShots: 'blk',
};

/** s = ESPN summary JSON، H/A = رموز ESPN للفريقين */
export function parseMatch(s, H, A) {
  const comp = s.header?.competitions?.[0] || {}, cs = comp.competitors || [];
  const ch = cs.find((x) => x.homeAway === 'home'), ca = cs.find((x) => x.homeAway === 'away');
  const names = { h: [], a: [] };
  [['h', ch], ['a', ca]].forEach(([k, c]) => { const t = c?.team || {}; names[k] = [t.displayName, t.shortDisplayName, t.name, t.location, t.abbreviation, t.nickname].filter(Boolean).map(low); });
  (s.boxscore?.teams || []).forEach((b) => { const k = b.homeAway === 'away' || low(b.team?.abbreviation) === low(A) ? 'a' : 'h'; const t = b.team || {}; names[k].push(...[t.displayName, t.shortDisplayName, t.name].filter(Boolean).map(low)); });
  const sideByName = (n) => { n = low(n).trim(); if (!n) return null; for (const k of ['h', 'a']) if (names[k].some((x) => x === n)) return k; for (const k of ['h', 'a']) if (names[k].some((x) => x && (x.includes(n) || n.includes(x)))) return k; return null; };
  const teamIn = (t) => { const m = String(t || '').match(/\(([^)]+)\)/); return m ? sideByName(m[1]) : null; };

  // إحصائيات الفريقين
  const S = { h: {}, a: {} };
  (s.boxscore?.teams || []).forEach((b) => {
    const k = b.homeAway === 'away' ? 'a' : b.homeAway === 'home' ? 'h' : (low(b.team?.abbreviation) === low(A) ? 'a' : 'h');
    (b.statistics || []).forEach((x) => { const n = STATN[x.name]; if (n) { const v = parseFloat(String(x.displayValue).replace('%', '')); if (!isNaN(v)) S[k][n] = v; } });
  });

  // التعليق النصي (أدق)، وإذا ما موجود نرجع للأحداث المهمة
  const feed = (s.commentary || []).map((c) => ({ t: c.text || '', clk: c.time?.displayValue || c.play?.clock?.displayValue || '', team: c.play?.team?.displayName || '' }));
  const kev = (s.keyEvents || []).map((k) => ({ t: k.text || '', clk: k.clock?.displayValue || '', team: k.team?.displayName || '', type: low(k.type?.type || k.type?.text), scoring: !!k.scoringPlay }));
  // ترتيب زمني (تتبّع النتيجة يعتمد عليه)
  const src = (feed.length ? feed : kev).map((e, i) => ({ ...e, i, k: clock(e.clk) })).sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.i - y.i);

  const G = [], X = [], C = [], K = [];
  let sh = 0, sa = 0;
  src.forEach((e) => {
    const t = e.t, lt = low(t), [mn, ad] = clock(e.clk);
    const isGoal = /^goal!|^own goal/i.test(t.trim()) || (e.scoring && /goal/.test(lt));
    if (isGoal) {
      // من سجّل: من تغيّر النتيجة المكتوبة («Goal! Arsenal 1, Chelsea 0.»)
      let side = null; const sc = t.match(/([^.!]+?)\s(\d+),\s([^.]+?)\s(\d+)\./);
      if (sc) { const a1 = +sc[2], a2 = +sc[4], n1 = sideByName(sc[1]); const s1 = n1 || 'h', v1 = a1, v2 = a2; const hS = s1 === 'h' ? v1 : v2, aS = s1 === 'h' ? v2 : v1; side = hS > sh ? 'h' : aS > sa ? 'a' : null; sh = Math.max(sh, hS); sa = Math.max(sa, aS); }
      if (!side) { const tm = teamIn(t) || sideByName(e.team); side = /own goal/.test(lt) ? (tm === 'h' ? 'a' : 'h') : tm; if (side === 'h') sh++; else if (side === 'a') sa++; }
      if (!side) return;
      const how = howOf(t), [dz, sz] = how === 'og' ? ['', ''] : zoneOf(t);
      G.push([side, mn, ad, how, dz, sz, how === 'og' ? '' : astOf(t), placeOf(t.replace(/^[^.]*\./, '')), who(t) || (t.match(/Own Goal by ([^,]+)/i)?.[1] || ''), assister(t)]);
      X.push([side, mn, how, dz, sz, 'g']);
      return;
    }
    if (/^attempt (saved|missed|blocked)/i.test(t.trim()) || /hits the (left |right )?(post|bar|crossbar)/i.test(t)) {
      const side = teamIn(t) || sideByName(e.team); if (!side) return;
      const out = /saved/.test(lt) ? 's' : /blocked/.test(lt) ? 'b' : /post|bar/.test(lt) ? 'w' : 'm';
      const [dz, sz] = zoneOf(t); X.push([side, mn, howOf(t), dz, sz, out]);
      return;
    }
    if (/^corner,/i.test(t.trim())) { const m = t.match(/^Corner,\s*([^.]+)\./i); const side = m ? sideByName(m[1]) : null; if (side) K.push([side, mn]); return; }
    if (/yellow card|red card|second yellow/i.test(t) && /\(([^)]+)\)/.test(t)) { const side = teamIn(t); if (side) C.push([side, mn, /red card|second yellow/i.test(t) ? 'r' : 'y']); }
  });

  const gi = s.gameInfo || {};
  return {
    v: 1, st: comp.status?.type?.state || '', h: H, a: A,
    hs: ch?.score != null ? +ch.score : null, as: ca?.score != null ? +ca.score : null,
    ven: gi.venue?.fullName || '', att: gi.attendance || null, ref: (gi.officials || []).find((o) => /referee/i.test(o.position?.name || o.position?.displayName || '') && !/assistant|var|fourth/i.test(o.position?.name || ''))?.displayName || (gi.officials || [])[0]?.displayName || '',
    S, G, X, C, K, src: feed.length ? 'c' : 'k',
  };
}
