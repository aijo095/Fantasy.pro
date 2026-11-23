/* =========================================================
   /api/lineups?ko=2026-11-07T12:30:00Z&h=LEE&a=TOT
   التشكيلة الرسمية للمباراة + التبديلات الحقيقية (منو دخل بدل منو وبأي دقيقة)
   الفانتازي ما ينشر التشكيلات، فنجيبها من بيانات ESPN العامة للمباريات.
========================================================= */
import { endJSON } from './_etag.js';
import { parseMatch } from './_matchstats.js';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/';
const ABBR = { MCI: 'MNC', MUN: 'MAN' }; // رموز الفانتازي ← رموز ESPN
const memo = new Map();

function send(res, code, data, ttl = 0) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', ttl ? `public, s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl, 120)}` : 'no-store');
  endJSON(res, data, code);
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; FantasyPro/2.0)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const clockMin = (s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/); return m ? { min: +m[1], add: m[2] ? +m[2] : 0, txt: s } : null; };

/** يرجّع { code, d, ttl } — يستخدمه الراوتر وكمان محرك الإشعارات (/api/notify) مباشرة */
export async function getLineup(ko, h, a) {
  const key = `${h}-${a}-${ymd(ko)}`;
  const hit = memo.get(key); if (hit && Date.now() < hit.exp) return { code: 200, d: hit.d, ttl: hit.ttl };
  try {
    const H = ABBR[h] || h, A = ABBR[a] || a;
    // تاريخ ESPN حسب توقيت أمريكا الشرقي — نجرب يوم المباراة وقبله
    let ev = null;
    for (const d of [new Date(ko.getTime() - 5 * 3600e3), ko, new Date(ko.getTime() - 29 * 3600e3)]) {
      const sb = await get(`scoreboard?dates=${ymd(d)}`).catch(() => null);
      ev = (sb?.events || []).find((e) => { const c = e.competitions?.[0]?.competitors || []; const hh = c.find((x) => x.homeAway === 'home')?.team?.abbreviation, aa = c.find((x) => x.homeAway === 'away')?.team?.abbreviation; return hh === H && aa === A; });
      if (ev) break;
    }
    if (!ev) return { code: 404, d: { error: 'not found' }, ttl: 60 };
    const s = await get(`summary?event=${ev.id}`);
    const state = ev.status?.type?.state; // pre | in | post
    const sides = {};
    (s.rosters || []).forEach((r) => {
      const side = r.homeAway === 'home' ? 'h' : r.homeAway === 'away' ? 'a' : (r.team?.abbreviation === H ? 'h' : 'a');
      sides[side] = {
        formation: r.formation || '',
        players: (r.roster || []).map((p) => {
          const plays = p.plays || [];
          const sub = plays.filter((x) => x.substitution).map((x) => clockMin(x.clock?.displayValue));
          return {
            id: String(p.athlete?.id || ''), name: p.athlete?.displayName || '', short: p.athlete?.shortName || '', last: p.athlete?.lastName || '', first: p.athlete?.firstName || '',
            jersey: p.jersey || '', pos: p.position?.abbreviation || '', place: p.formationPlace ? +p.formationPlace : 0, starter: !!p.starter,
            subIn: !!p.subbedIn, subOut: !!p.subbedOut, subAt: sub[0] || null,
            yc: plays.filter((x) => x.yellowCard).length, rc: plays.some((x) => x.redCard) ? 1 : 0,
          };
        }),
      };
    });
    // التبديلات الحقيقية: [0] = الداخل، [1] = الخارج
    const subs = (s.keyEvents || []).filter((k) => k.type?.type === 'substitution' && (k.participants || []).length >= 2).map((k) => {
      const inId = String(k.participants[0].athlete?.id || ''), outId = String(k.participants[1].athlete?.id || '');
      const side = Object.keys(sides).find((sd) => sides[sd].players.some((p) => p.id === inId || p.id === outId)) || null;
      return { side, in: inId, out: outId, at: clockMin(k.clock?.displayValue), injury: /injury/i.test(k.text || '') };
    });
    // ركلات الجزاء: اللي سجل منها واللي ضيعها (صدّها الحارس أو طلعت برا)
    const sideOf = (id) => Object.keys(sides).find((sd) => sides[sd].players.some((p) => p.id === id)) || null;
    const pens = (s.keyEvents || []).map((k) => {
      const tt = `${k.type?.type || ''} ${k.type?.text || ''}`, all = `${tt} ${k.text || ''}`;
      if (!/penalt/i.test(all) || /shootout/i.test(all)) return null;
      const id = String(k.participants?.[0]?.athlete?.id || ''); if (!id) return null;
      if (k.scoringPlay && (/penalt/i.test(tt) || /\(penalty\)|converts the penalty|penalty kick|from the penalty spot/i.test(k.text || ''))) return { side: sideOf(id), id, scored: true, at: clockMin(k.clock?.displayValue) };
      if (!k.scoringPlay && /penalt/i.test(tt) && /miss|save/i.test(all) && !/conceded|won|foul/i.test(tt)) return { side: sideOf(id), id, scored: false, at: clockMin(k.clock?.displayValue) };
      return null;
    }).filter(Boolean);
    const d = { event: ev.id, state, sides, subs, pens, at: Date.now() };
    // قبل المباراة: إذا التشكيلة بعدها ما انعلنت نعيد الفحص كل 30 ثانية حتى تبين أول ما تنعلن، وإذا انعلنت تنحفظ 10 دقايق
    const ready = ['h', 'a'].every((k) => (sides[k]?.players || []).filter((p) => p.starter).length >= 11);
    const ttl = state === 'post' ? 86400 : state === 'in' ? 60 : ready ? 600 : 30;
    memo.set(key, { d, exp: Date.now() + ttl * 1000, ttl });
    if (memo.size > 200) memo.delete(memo.keys().next().value);
    return { code: 200, d, ttl };
  } catch (e) {
    return { code: 502, d: { error: String(e.message || e) }, ttl: 0 };
  }
}

/* النتائج المباشرة السريعة من ESPN (الفانتازي يتأخر بتحديث النتيجة ونهاية المباراة)
   /api/lineups?scores=20261121,20261122 ← [{h,a,ko,hs,as,st,done,ht,min}] برموز الفانتازي */
const REV = Object.fromEntries(Object.entries(ABBR).map(([k, v]) => [v, k]));
const sbMemo = new Map();
async function scoreboard(day) {
  const hit = sbMemo.get(day); if (hit && Date.now() - hit.t < 6000) return hit.d;
  try {
    const sb = await get(`scoreboard?dates=${day}`);
    const d = (sb?.events || []).map((e) => {
      const c = e.competitions?.[0] || {}, cs = c.competitors || [], st = e.status || c.status || {}, ty = st.type || {};
      const H = cs.find((x) => x.homeAway === 'home'), A = cs.find((x) => x.homeAway === 'away');
      const ab = (x) => { const s = x?.team?.abbreviation || ''; return REV[s] || s; };
      const cl = clockMin(st.displayClock);
      return { h: ab(H), a: ab(A), ko: e.date, hs: H?.score != null ? +H.score : null, as: A?.score != null ? +A.score : null,
        st: ty.state || 'pre', done: !!ty.completed || ty.state === 'post', ht: /HALFTIME/i.test(ty.name || ''), min: cl ? cl.min : null };
    });
    sbMemo.set(day, { t: Date.now(), d }); if (sbMemo.size > 20) sbMemo.delete(sbMemo.keys().next().value);
    return d;
  } catch { return hit ? hit.d : []; }
}

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const sc = u.searchParams.get('scores');
  if (sc != null) {
    if (process.env.FPL_MOCK === '1') return send(res, 200, []);
    const days = [...new Set(sc.split(',').filter((d) => /^\d{8}$/.test(d)))].slice(0, 3);
    const all = (await Promise.all(days.map(scoreboard))).flat();
    return send(res, 200, all, 5);
  }
  // تحليل مباراة (أهداف وتسديدات بالجهة والعمق + إحصائيات الفريقين): /api/lineups?mx=1&ko=..&h=ARS&a=CHE
  if (u.searchParams.get('mx')) {
    const ko2 = new Date(u.searchParams.get('ko') || ''), h2 = (u.searchParams.get('h') || '').toUpperCase().slice(0, 4), a2 = (u.searchParams.get('a') || '').toUpperCase().slice(0, 4);
    if (isNaN(ko2) || !/^[A-Z]{3}$/.test(h2) || !/^[A-Z]{3}$/.test(a2)) return send(res, 400, { error: 'bad params' });
    if (process.env.FPL_MOCK === '1') return send(res, 404, { error: 'mock' });
    try {
      const H = ABBR[h2] || h2, A = ABBR[a2] || a2; let ev = null;
      for (const d of [new Date(ko2.getTime() - 5 * 3600e3), ko2, new Date(ko2.getTime() - 29 * 3600e3)]) {
        const sb = await get(`scoreboard?dates=${ymd(d)}`).catch(() => null);
        ev = (sb?.events || []).find((e) => { const c = e.competitions?.[0]?.competitors || []; return c.find((x) => x.homeAway === 'home')?.team?.abbreviation === H && c.find((x) => x.homeAway === 'away')?.team?.abbreviation === A; });
        if (ev) break;
      }
      if (!ev) return send(res, 404, { error: 'not found' }, 3600);
      const m = parseMatch(await get(`summary?event=${ev.id}`), h2, a2);
      return send(res, 200, m, m.st === 'post' ? 30 * 86400 : 300);
    } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
  }
  const ko = new Date(u.searchParams.get('ko') || ''), h = (u.searchParams.get('h') || '').toUpperCase().slice(0, 4), a = (u.searchParams.get('a') || '').toUpperCase().slice(0, 4);
  if (isNaN(ko) || !/^[A-Z]{3}$/.test(h) || !/^[A-Z]{3}$/.test(a)) return send(res, 400, { error: 'bad params' });
  if (process.env.FPL_MOCK === '1') return send(res, 404, { error: 'mock' });
  const r = await getLineup(ko, h, a);
  return send(res, r.code, r.d, r.ttl);
}
