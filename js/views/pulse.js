/* =========================================================
   نبض الجولة — تجربة مباشرة لأحداث فريقك ومنافسك وقت المباريات
   · قريب يسجّل / قريب من البونص / قريب من المساهمات الدفاعية (من أرقام الفانتازي المباشرة)
   · منافسك: كابتنه ضد كابتنك، شباكه النظيفة، لاعبينه اللي ما عندك
   · ترتيبك التقديري لحظة بلحظة + سجل أحداث الجولة
========================================================= */
import { ST, PM, tShort } from '../store.js';
import { tt, t } from '../i18n.js';
import { esc, I, fmt, LS, crest } from '../ui.js';
import * as FPL from '../fpl.js';
import { liveCalc } from '../live-engine.js';
import { liveRankEstimate } from '../predict.js';
import { pShirt } from './common.js';

let RV = { gw: 0, list: null, busy: false, sel: null, picks: {} };
const fk = () => `fp_pulse_${ST.profile?.teamId}_${ST.G.cur}`;
const feed = () => LS.get(fk()) || { ev: [], rk: [] };
const saveFeed = (f) => { f.ev = f.ev.slice(0, 80); f.rk = f.rk.slice(-120); LS.set(fk(), f); };

/* ---------- المنافسين: خصم المواجهة + اللي فوقك وتحتك بدورياتك ---------- */
async function loadRivals() {
  if (RV.busy || (RV.list && RV.gw === ST.G.cur)) return; RV.busy = true;
  const me = ST.profile.teamId, gw = ST.G.cur, out = [], seen = new Set([me]);
  const add = (entry, name, mgr, why, kind) => { if (!entry) return; const ex = out.find((x) => x.entry === entry); if (ex) { if (kind === 'h') { ex.kind = 'h'; ex.leagues = [...(ex.leagues || []), why]; } return; } if (seen.has(entry)) return; seen.add(entry); out.push({ entry, name, mgr, why, kind, leagues: kind === 'h' ? [why] : [] }); };
  const L = ST.E.entry.leagues || {};
  try {
    // كل دوريات المواجهات بدون استثناء
    await Promise.all((L.h2h || []).map(async (l) => {
      let r = null, page = 1, rows = [];
      do { r = await FPL.loadH2HMatches(l.id, gw, page).catch(() => null); rows = rows.concat(r?.results || []); page++; } while (r?.has_next && page <= 5);
      r = { results: rows };
      const m = (r?.results || []).find((x) => x.entry_1_entry === me || x.entry_2_entry === me);
      if (m) { const a = m.entry_1_entry === me; add(a ? m.entry_2_entry : m.entry_1_entry, a ? m.entry_2_name : m.entry_1_name, a ? m.entry_2_player_name : m.entry_1_player_name, l.name, 'h'); }
    }));
    out.forEach((x) => { if (x.kind === 'h') x.why = tt(`خصمك بـ ${x.leagues.join('، ')}`, `H2H: ${x.leagues.join(', ')}`); });
    for (const l of (L.classic || []).filter((x) => x.league_type === 'x').slice(0, 2)) {
      const d = await FPL.loadLeague(l.id).catch(() => null), rows = d?.standings?.results || [];
      const i = rows.findIndex((x) => x.entry === me); if (i < 0) continue;
      if (rows[i - 1]) add(rows[i - 1].entry, rows[i - 1].entry_name, rows[i - 1].player_name, tt(`فوقك بـ ${l.name}`, `Above you in ${l.name}`), 'c');
      if (rows[i + 1]) add(rows[i + 1].entry, rows[i + 1].entry_name, rows[i + 1].player_name, tt(`تحتك بـ ${l.name}`, `Below you in ${l.name}`), 'c');
    }
  } catch {}
  const keep = LS.get(`fp_pulse_rv_${me}`);
  RV = { gw, list: out, busy: false, sel: out.find((x) => x.entry === keep)?.entry || out[0]?.entry || null, picks: RV.gw === gw ? RV.picks : {} };
  await loadRivalPicks();
}
const tracked = () => (RV.list || []).filter((x) => x.kind === 'h' || x.entry === RV.sel);
async function loadRivalPicks() {
  const need = tracked().filter((x) => RV.picks[x.entry] === undefined);
  await Promise.all(need.map(async (x) => { try { RV.picks[x.entry] = await FPL.fetchPicks(x.entry, ST.G.cur); } catch { RV.picks[x.entry] = null; } }));
  rerender();
}
const rerender = () => { if (ST.view === 'pulse' && !document.querySelector('.ov')) window.render(); };

/* ---------- سجل الأحداث: يقارن كل تحديث بالسابق ---------- */
window.__pulseDiff = (prev, next) => {
  try {
    if (!prev || !ST.E?.picks) return;
    const f = feed(), now = Date.now(), mine = new Set(ST.E.picks.picks.map((x) => x.element));
    const have = new Set(f.ev.map((e) => e.key));
    const push = (k, who, id, v, tone, n = 0, rv = 0) => { const key = `${k}_${id}_${v}_${rv}`; if (have.has(key)) return; have.add(key); f.ev.unshift({ key, at: now, k, who, id, n, tone, rival: rv || null }); dispatchEvent(new CustomEvent('fp:ev', { detail: { k, who } })); };
    const d = (id, k) => (next[id]?.[k] || 0) - (prev[id]?.[k] || 0);
    // لاعبينك
    mine.forEach((id) => { if (!prev[id] || !next[id]) return; const b = next[id];
      if (d(id, 'goals_scored') > 0) push('goal', 'me', id, b.goals_scored, 'good');
      if (d(id, 'assists') > 0) push('assist', 'me', id, b.assists, 'good');
      if (d(id, 'clean_sheets') < 0) push('csl', 'me', id, b.clean_sheets, 'bad');
      if (d(id, 'red_cards') > 0) push('red', 'me', id, b.red_cards, 'bad');
      if (d(id, 'bonus') > 0) push('bonus', 'me', id, b.bonus, 'good', d(id, 'bonus')); });
    // لاعبين كل خصم (اللي ما عندك)
    tracked().forEach((x) => { const pk = RV.picks[x.entry]; (pk?.picks || []).forEach(({ element: id }) => { if (mine.has(id) || !prev[id] || !next[id]) return; const b = next[id], rv = x.entry;
      if (d(id, 'goals_scored') > 0) push('goal', 'rv', id, b.goals_scored, 'bad', 0, rv);
      if (d(id, 'assists') > 0) push('assist', 'rv', id, b.assists, 'bad', 0, rv);
      if (d(id, 'clean_sheets') > 0) push('cs', 'rv', id, b.clean_sheets, 'bad', 0, rv);
      if (d(id, 'red_cards') > 0) push('red', 'rv', id, b.red_cards, 'good', 0, rv);
      if (d(id, 'bonus') > 0) push('bonus', 'rv', id, b.bonus, 'bad', d(id, 'bonus'), rv); }); });
    // الترتيب التقديري
    const c = liveCalc(ST.E.picks, ST.G.cur, undefined, next), R = c && liveRankEstimate(c.total);
    if (R?.rank) { const last = f.rk[f.rk.length - 1]; f.rk.push({ at: now, r: R.rank, p: c.total });
      if (last && Math.abs(last.r - R.rank) / last.r > 0.08) push('rank', 'me', 0, R.rank, R.rank < last.r ? 'good' : 'bad', last.r); }
    saveFeed(f);
  } catch {}
};

/* نص الحدث (نفس الشكل للأحداث المحلية وأحداث السيرفر) */
function txtOf(e) {
  const nm = e.id ? PM(e.id)?.name || '#' + e.id : '', rv = e.who === 'rv', rname = e.rname || RV.list?.find((x) => x.entry === e.rival)?.name || tt('منافسك', 'your rival');
  switch (e.k) {
    case 'goal': return rv ? tt(`${nm} سجّل لـ ${rname}`, `${nm} scored for ${rname}`) : tt(`${nm} سجّل!`, `${nm} scored!`);
    case 'assist': return rv ? tt(`${nm} صنع هدف لـ ${rname}`, `${nm} assisted for ${rname}`) : tt(`${nm} صنع هدف`, `${nm} assisted`);
    case 'cs': return tt(`${rname} حصل كلين شيت من ${nm}`, `${rname} got a clean sheet: ${nm}`);
    case 'csl': return tt(`${nm} خسر الكلين شيت`, `${nm} lost the clean sheet`);
    case 'red': return tt(`${nm} كرت أحمر`, `${nm} red card`) + (rv ? tt(` (عند ${rname})`, ` (${rname})`) : '');
    case 'bonus': return tt(`${nm} +${e.n || ''} بونص`, `${nm} +${e.n || ''} bonus`) + (rv ? tt(` (عند ${rname})`, ` (${rname})`) : '');
    case 'rank': { const r = +e.key.split('_')[2]; return e.tone === 'good' ? tt(`ترتيبك صعد لـ ${fmt(r)}`, `Rank up to ${fmt(r)}`) : tt(`ترتيبك نزل لـ ${fmt(r)}`, `Rank down to ${fmt(r)}`); }
    default: return e.txt || '';
  }
}
/* مزامنة ويا السيرفر: نسجّل الفريق والمنافس، ونجيب الأحداث اللي صارت والتطبيق مسكّر */
let regKey = '', syncAt = 0;
function serverSync() {
  const team = ST.profile.teamId, k = `${team}:${RV.sel || 0}`;
  if (k !== regKey) { regKey = k; fetch('/api/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team, rival: RV.sel || null, rname: RV.list?.find((x) => x.entry === RV.sel)?.name || '' }) }).catch(() => {}); }
  if (Date.now() - syncAt < 60e3) return; syncAt = Date.now();
  fetch(`/api/pulse?team=${team}&gw=${ST.G.cur}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d?.ev?.length) return;
    const f = feed(), have = new Map(f.ev.map((e) => [e.key, e])); let add = 0;
    d.ev.forEach((e) => { const o = have.get(e.key); if (!o) { f.ev.push(e); add++; } else if (e.at < o.at) o.at = e.at; });
    if (!add) return; f.ev.sort((a, b) => b.at - a.at); saveFeed(f); rerender();
  }).catch(() => {});
}

/* ---------- الواجهة ---------- */
const liveFx = () => (ST.G.fx[ST.G.cur] || []).filter((f) => f.started && !f.fin);
const playing = (p) => liveFx().some((f) => f.h === p.team || f.a === p.team);
const ago = (ts) => { const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? tt('هسة', 'now') : s < 3600 ? tt(`قبل ${Math.round(s / 60)} د`, `${Math.round(s / 60)}m`) : tt(`قبل ${Math.round(s / 3600)} س`, `${Math.round(s / 3600)}h`); };
function bpsRank(id) {
  const p = PM(id); const f = liveFx().find((x) => x.h === p.team || x.a === p.team); if (!f) return null;
  const b = (f.stats || []).find((s) => s.identifier === 'bps'); if (!b) return null;
  const all = [...(b.h || []), ...(b.a || [])].sort((x, y) => y.value - x.value), i = all.findIndex((x) => x.element === id);
  return i >= 0 && i < 3 ? i + 1 : null;
}
/* الهيرو المرتب : أنت ومنافسك بنفس الحجم والمكان */
const PH2 = () => true; // صار للكل
function hero2(my, rc, rv, diff, R, f, gw) {
  const meN = ST.profile?.teamName || ST.E?.entry?.name || tt('أنت', 'You'), rvN = rv ? rv.name : tt('منافسك', 'Rival');
  const a = my.total, b = rc ? rc.total : null, lead = b == null ? 0 : Math.sign(a - b);
  const pct = b == null || a + b <= 0 ? 50 : Math.round((a / (a + b)) * 100);
  const ini = (n) => esc((n || '?').trim()[0] || '?').toUpperCase();
  // أرقام المقارنة: الكابتن، اللي باقين يلعبون، البونص
  const done = (team) => { const fx = (ST.G.fx[gw] || []).filter((x) => x.h === team || x.a === team); return !fx.length || fx.every((x) => x.fin); };
  const stat = (c) => { if (!c) return null; const on = c.rows.filter((r) => r.m > 0); const cap = c.rows.find((r) => r.m >= 2);
    return { cap: cap ? cap.pts * cap.m : 0, capN: cap ? PM(cap.id)?.name : '—', left: on.filter((r) => r.min === 0 && !done(PM(r.id)?.team)).length, bonus: on.reduce((x, r) => x + (r.bonus || 0) * r.m, 0) }; };
  const A = stat(my), B = stat(rc);
  const team = (cls, who, nm, win) => `<div class="pz-team ${cls}${win > 0 ? ' win' : ''}"><span class="pz-av">${ini(nm)}</span><b class="pz-nm">${esc(nm)}</b><small>${who}</small></div>`;
  const status = diff == null ? tt('اختار منافس', 'Pick a rival') : diff > 0 ? tt(`متقدم بـ ${diff}`, `Ahead by ${diff}`) : diff < 0 ? tt(`متأخر بـ ${-diff}`, `Behind by ${-diff}`) : tt('تعادل', 'Level');
  const cmp = (lbl, x, y, sub) => { const px = x + y > 0 ? Math.round((x / (x + y)) * 100) : 50, z = x + y === 0;
    return `<div class="pz-row"><b class="num ${x > y ? 'hi' : ''}">${x}</b><div class="pz-mid"><span>${lbl}</span><div class="pz-mini${z ? ' z' : ''}"><i class="m" style="width:${px}%"></i><i class="r" style="width:${100 - px}%"></i></div>${sub ? `<small>${sub}</small>` : ''}</div><b class="num ${y > x ? 'hi rv' : ''}">${y}</b></div>`; };
  return `<div class="pz">
      ${team('me', tt('أنت', 'You'), meN, lead)}
      <div class="pz-sb"><b class="num ${lead > 0 ? 'w' : ''}">${a ?? '…'}</b><i></i><b class="num ${lead < 0 ? 'w rv' : ''}">${b ?? '…'}</b></div>
      ${team('rv', tt('منافسك', 'Rival'), rvN, -lead)}
    </div>
    <div class="pz-st ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${status}</div>
    <div class="pz-bar"><span class="num">${pct}%</span><div><i style="width:${pct}%"></i></div><span class="num">${100 - pct}%</span></div>
    ${A && B ? `<div class="pz-cmp">${cmp(tt('الكابتن', 'Captain'), A.cap, B.cap, `${esc(A.capN)} · ${esc(B.capN)}`)}${cmp(tt('باقين يلعبون', 'Yet to play'), A.left, B.left)}${cmp(tt('البونص', 'Bonus'), A.bonus, B.bonus)}</div>` : ''}
    ${R ? `<div class="pz-rank"><div><small>${tt('ترتيبك التقديري الآن', 'Live rank (est.)')}</small><b class="num">${fmt(R.rank)}</b>${R.move ? `<em class="${R.move > 0 ? 'up' : 'down'}">${R.move > 0 ? '▲' : '▼'} ${fmt(Math.abs(R.move))}</em>` : ''}</div>${f.rk.length > 2 ? spark(f.rk) : ''}</div>` : ''}`;
}
function spark(rk) {
  if (rk.length < 2) return '';
  const W = 300, H = 54, rs = rk.map((x) => x.r), mn = Math.min(...rs), mx = Math.max(...rs), sp = Math.max(1, mx - mn);
  const pts = rk.map((x, i) => `${(i / (rk.length - 1)) * W},${6 + ((x.r - mn) / sp) * (H - 12)}`).join(' ');
  return `<svg class="pu-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" dir="ltr"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const ICO = { goal: '⚽', assist: '🎯', cs: '🧱', csl: '🥅', red: '🟥', bonus: '⭐', rank: '📈' };

/* ---------- الأحداث المباشرة: كل حدث بنقاطه حسب قواعد الفانتازي ---------- */
const GOALP = { GK: 10, DEF: 6, MID: 5, FWD: 4 }, CSP2 = { GK: 4, DEF: 4, MID: 1, FWD: 0 }, DCT2 = { DEF: 10, MID: 12, FWD: 12 };
function realCtx() {
  return {
    fx: (p) => (ST.G.fx[ST.G.cur] || []).find((f) => f.h === p.team || f.a === p.team),
    minute: (f) => (f ? f.min || 0 : 0), live: (f) => !!(f && f.started && !f.fin), done: (f) => !!(f && f.fin),
    bps: (p) => bpsRank(p.id),
  };
}
/** يحول إحصاءات اللاعب لقائمة أحداث، كل حدث بنقاطه */
function evList(p, s, C) {
  const E = [], f = C.fx(p), M = C.minute(f), pos = p.pos, add = (k, txt, pts, extra = '') => E.push({ k, txt, pts, extra });
  const mins = s.minutes || 0; if (!mins && !s.total_points) return E;
  // دخول وخروج بالدقيقة
  const started = s.starts != null ? s.starts > 0 : null;
  if (started === false && mins > 0) add('in', tt(`دخل بالدقيقة ${Math.max(1, M - mins)}`, `On at ${Math.max(1, M - mins)}′`), null);
  if (started && (C.done(f) ? mins < 88 : M - mins >= 3) && !s.red_cards) add('out', tt(`طلع بالدقيقة ${mins}`, `Off at ${mins}′`), null);
  if (mins > 0) E.push({ k: 'min', hide: true, pts: mins >= 60 ? 2 : 1 }); // نقاط المشاركة تنحسب بالمجموع بس ما تنعرض
  for (let i = 0; i < (s.goals_scored || 0); i++) add('goal', tt('هدف', 'Goal'), GOALP[pos]);
  for (let i = 0; i < (s.assists || 0); i++) add('assist', tt('صناعة', 'Assist'), 3);
  if (s.clean_sheets && CSP2[pos]) add('cs', tt('شباك نظيفة', 'Clean sheet'), CSP2[pos], C.live(f) ? tt('مؤقت', 'prov.') : '');
  if ((pos === 'GK' || pos === 'DEF') && s.goals_conceded >= 2) add('gc', tt(`استقبل ${s.goals_conceded} أهداف`, `Conceded ${s.goals_conceded}`), -Math.floor(s.goals_conceded / 2));
  if (pos === 'GK' && s.saves >= 3) add('save', tt(`وصل التصدي ${s.saves}`, `${s.saves} saves`), Math.floor(s.saves / 3));
  if (s.penalties_saved) add('pensave', tt(`صد ${s.penalties_saved > 1 ? s.penalties_saved + ' ' : ''}ضربة جزاء`, 'Penalty save'), 5 * s.penalties_saved);
  const dct = DCT2[pos], dc = s.defensive_contribution || 0; if (dct && dc >= dct) add('dc', tt(`مساهمات دفاعية ${dc}/${dct}`, `DefCon ${dc}/${dct}`), 2);
  if (s.yellow_cards) add('yellow', tt('إنذار', 'Yellow card'), -1);
  if (s.red_cards) add('red', tt('طرد', 'Red card'), -3);
  for (let i = 0; i < (s.own_goals || 0); i++) add('og', tt('هدف عكسي', 'Own goal'), -2);
  for (let i = 0; i < (s.penalties_missed || 0); i++) add('penmiss', tt('ضيّع ضربة جزاء', 'Penalty miss'), -2);
  if (s.bonus) add('bonus', tt(`بونص ${s.bonus}`, `Bonus ${s.bonus}`), s.bonus, `<bdi dir="ltr">${s.bps} BPS</bdi>`);
  else { const r = C.bps(p); if (r) add('bonus', tt(`دخل البونص ${4 - r}`, `Bonus ${4 - r}`), 4 - r, `<bdi dir="ltr">${s.bps} BPS</bdi>`); }
  return E;
}
const EVI = { in: '↑', out: '↓', min: '⏱', goal: '⚽', assist: '🎯', cs: '🧱', gc: '🥅', save: '🧤', pensave: '🧤', dc: '🛡️', yellow: '🟨', red: '🟥', og: '😬', penmiss: '✖', bonus: '⭐' };
function evSection(rows, C, anyLive) {
  const list = rows.map((r) => { const all = evList(r.p, r.s, C), pts = all.reduce((a, e) => a + (e.pts || 0), 0), E = all.filter((e) => !e.hide); return { ...r, E, pts, f: C.fx(r.p) }; }).filter((r) => r.E.length);
  if (!list.length) return `<div class="card mut pu-empty">${anyLive ? tt('بعد ما صار شي للاعبينك أو لاعبين خصمك', 'Nothing yet for your or your rival\'s players') : tt('ماكو مباراة شغّالة هسة', 'No live match right now')}</div>`;
  // لاعب ما ينحسب لأي طرف (بالدكة عند الكل) ينزل لآخر القائمة
  const dead = (r) => (r.who === 'me' ? r.bMe && (!r.sh || r.bRv) : r.bRv);
  list.sort((a, b) => (dead(a) ? 1 : 0) - (dead(b) ? 1 : 0) || (C.live(b.f) ? 1 : 0) - (C.live(a.f) ? 1 : 0) || b.E.length - a.E.length || b.pts - a.pts);
  const sum = (w) => list.filter((r) => r.who === w && !(w === 'me' ? r.bMe : r.bRv)).reduce((a, r) => a + r.pts * Math.max(1, r.m), 0);
  const bnote = (r) => { const t = r.sh ? (r.bMe && r.bRv ? tt('بالدكة عندك وعند خصمك', 'Benched by both') : r.bMe ? tt('عندك بالدكة', 'On your bench') : r.bRv ? tt('عند خصمك بالدكة', 'On rival bench') : '') : r.bMe ? tt('بالدكة عندك', 'On your bench') : r.bRv ? tt('بالدكة عند خصمك', 'On rival bench') : ''; return t ? `<span class="ev2-bn">${I('i-bench', 'i', 'width:12px;height:12px')}${t}</span>` : ''; };
  return `<div class="ev2-sum"><span class="me">${tt('لاعبينك', 'Yours')} <b dir="ltr">${sum('me')}</b></span><span class="rv">${tt('لاعبين خصمك', 'Rival')} <b dir="ltr">${sum('rv')}</b></span></div>
  <div class="ev2">${list.map((r) => `<div class="ev2-p ${r.who}${r.sh ? ' sh' : ''}${dead(r) ? ' bn' : ''}" onclick="playerGW(${r.p.id},${ST.G.cur})">
      <div class="ev2-h"><span class="mini">${pShirt(r.p)}</span><span class="ev2-n"><b>${esc(r.p.name)}</b>${bnote(r)}<small><span class="ev2-who">${r.sh ? tt('لاعب مشترك', 'Shared') : r.who === 'me' ? tt('لاعبك', 'Yours') : tt('خصمك', 'Rival')}</span>${tShort(r.p.team)} · ${r.p.pos}${r.m > 1 ? ` · <i class="ev2-c">${r.m === 3 ? '3×' : 'C ×2'}</i>` : ''}${C.live(r.f) ? ` · <i class="ev2-live">${C.minute(r.f)}′</i>` : C.done(r.f) ? ` · ${tt('خلصت', 'FT')}` : ''}</small></span><b class="ev2-t" dir="ltr">${r.pts * Math.max(1, r.m)}</b></div>
      <div class="ev2-e">${r.E.map((e) => `<span class="ev2-x ${e.k}"><i>${EVI[e.k] || '•'}</i>${e.txt}${e.extra ? ` <small>(${e.extra})</small>` : ''}${e.pts != null ? `<em class="${e.pts > 0 ? 'up' : e.pts < 0 ? 'down' : ''}" dir="ltr">${e.pts > 0 ? '+' : ''}${e.pts}</em>` : ''}</span>`).join('')}</div>
    </div>`).join('')}</div>`;
}

/* ---------- محاكاة تجريبية للأحداث المباشرة (معاينة ?pulsedemo=1): لاعبينك ضد لاعبين خصمك ---------- */
const SIMON = () => { try { return localStorage.getItem('fp_pulsedemo') === '1'; } catch { return false; } };
const SIM = { min: 0, run: true, t: null, ht: 0 };
function simCast() {
  const G = ST.G, picks = (ST.E?.picks?.picks || []).filter((x) => x.multiplier > 0), mine = new Set((ST.E?.picks?.picks || []).map((x) => x.element));
  const my = picks.map((x) => ({ p: PM(x.element), m: x.multiplier })).filter((x) => x.p);
  const pickPos = (L, pos, used) => L.find((x) => pos.includes(x.p.pos) && !used.has(x.p.id));
  const used = new Set(), take = (x) => (x && used.add(x.p.id), x);
  const cap = my.find((x) => x.m > 1 && x.p.pos !== 'GK');
  const me1 = take(pickPos(my, ['GK'], used)), me2 = take(cap || pickPos(my, ['FWD', 'MID'], used)), me3 = take(pickPos(my, ['DEF'], used)), me4 = take(pickPos(my, ['MID', 'FWD'], used));
  const rp = RV.picks?.[RV.sel];
  let rvL = rp ? (rp.picks || []).filter((x) => x.multiplier > 0 && !mine.has(x.element)).map((x) => ({ p: PM(x.element), m: x.multiplier })).filter((x) => x.p) : [];
  if (rvL.length < 3) rvL = G.players.filter((p) => !mine.has(p.id) && p.st === 'a').sort((a, b) => b.own - a.own).slice(0, 30).map((p) => ({ p, m: 1 }));
  const ru = new Set(), rtake = (x) => (x && ru.add(x.p.id), x);
  const rv1 = rtake(pickPos(rvL, ['FWD', 'MID'], ru)), rv2 = rtake(pickPos(rvL, ['DEF'], ru)), rv3 = rtake(pickPos(rvL, ['MID', 'FWD'], ru));
  const C = { me1, me2, me3, me4, rv1, rv2, rv3 }; Object.keys(C).forEach((k) => { if (!C[k]) delete C[k]; });
  return Object.keys(C).length >= 4 ? C : null;
}
// السيناريو: دقيقة + دور + تغيير بالإحصاءات (بنفس أسماء إحصاءات الفانتازي)
const SUBS = { rv3: { on: 60 }, me4: { off: 70 } };
const SCRIPT = [
  [15, 'rv2', { defensive_contribution: 3, bps: 2 }], [18, 'me2', { goals_scored: 1, bps: 12 }], [18, 'me4', { assists: 1, bps: 9 }], [18, 'rv2', { goals_conceded: 1 }],
  [24, 'me1', { saves: 1, bps: 2 }], [30, 'rv2', { defensive_contribution: 3, bps: 2 }], [31, 'me1', { saves: 1, bps: 2 }], [33, 'rv1', { yellow_cards: 1, bps: -3 }],
  [39, 'me1', { saves: 1, bps: 3 }], [40, 'me3', { defensive_contribution: 5, bps: 3 }], [44, 'rv2', { defensive_contribution: 4, bps: 3 }],
  [52, 'rv1', { goals_scored: 1, bps: 12 }], [52, 'me1', { goals_conceded: 1 }], [52, 'me3', { goals_conceded: 1 }],
  [66, 'me3', { defensive_contribution: 5, bps: 3 }], [74, 'rv1', { goals_scored: 1, bps: 12 }], [74, 'rv3', { assists: 1, bps: 9 }], [74, 'me1', { goals_conceded: 1 }], [74, 'me3', { goals_conceded: 1 }],
  [78, 'me2', { yellow_cards: 1, bps: -3 }], [85, 'rv2', { own_goals: 1, bps: -6, goals_conceded: 1 }], [86, 'me1', { saves: 1, bps: 2 }], [88, 'me1', { saves: 2, bps: 4 }],
];
function simStats(C, m) {
  const S = {};
  Object.entries(C).forEach(([k, x]) => { const sb = SUBS[k] || {}, on = sb.on || 0, off = sb.off || 90, st = !sb.on;
    const mins = m <= on ? 0 : Math.max(0, Math.min(m, off) - on);
    S[k] = { minutes: mins, starts: st ? 1 : 0, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, saves: 0, defensive_contribution: 0, yellow_cards: 0, red_cards: 0, own_goals: 0, penalties_missed: 0, penalties_saved: 0, bonus: 0, bps: mins ? 3 + Math.floor(mins / 30) * 2 : 0, total_points: 0 }; });
  SCRIPT.forEach(([min, k, d]) => { if (min > m || !S[k]) return; Object.entries(d).forEach(([f, v]) => (S[k][f] += v)); });
  Object.entries(S).forEach(([k, x]) => { const pos = C[k].p.pos; if (x.minutes >= 60 && !x.goals_conceded && CSP2[pos]) x.clean_sheets = 1; });
  if (m >= 90) { const r = Object.entries(S).filter(([, x]) => x.minutes).sort((a, b) => b[1].bps - a[1].bps); r.slice(0, 3).forEach(([, x], i) => (x.bonus = 3 - i)); }
  return S;
}
function simHTML() {
  const C = simCast(); if (!C) return `<div class="card mut pu-empty">${tt('افتح فريقك أول حتى نسوي المحاكاة بلاعبينك', 'Load your team first')}</div>`;
  const m = SIM.min, S = simStats(C, m), fx = { min: m, started: m > 0, fin: m >= 90 };
  const ranks = Object.entries(S).filter(([, x]) => x.minutes).sort((a, b) => b[1].bps - a[1].bps).map(([k]) => k);
  const ctx = { fx: () => fx, minute: () => m, live: () => m > 0 && m < 90, done: () => m >= 90, bps: (p) => { const k = Object.keys(C).find((x) => C[x].p.id === p.id), i = ranks.indexOf(k); return m < 90 && i >= 0 && i < 3 ? i + 1 : null; } };
  const rows = Object.entries(C).map(([k, x]) => ({ p: x.p, s: S[k], m: x.m, who: k.startsWith('me') ? 'me' : 'rv' }));
  const clock = m === 0 ? tt('قبل البداية', 'Pre-match') : m >= 90 ? tt('انتهت', 'FT') : SIM.ht ? tt('استراحة', 'HT') : `${m}′`;
  setTimeout(simTick, 0);
  return `<div class="card sim" id="puSim">
    <div class="sim-tag">${tt('محاكاة تجريبية بلاعبينك ولاعبين خصمك — مو بيانات حقيقية', 'Demo with your & your rival\'s players — not real data')}</div>
    <div class="sim-clk"><i class="${SIM.run && m > 0 && m < 90 && !SIM.ht ? 'on' : ''}"></i>${clock}</div>
    <div class="sim-bar"><i style="width:${Math.min(100, (m / 90) * 100)}%"></i></div>
    <div class="sim-ctl"><button onclick="simCtl('toggle')">${SIM.run ? tt('⏸ إيقاف', '⏸ Pause') : tt('▶ تشغيل', '▶ Play')}</button><button onclick="simCtl('reset')">${tt('⟲ من البداية', '⟲ Restart')}</button><button onclick="simCtl('skip')">${tt('+10 دقائق', '+10 min')}</button></div>
    ${m === 0 ? `<div class="mut sim-empty">${tt('اضغط تشغيل أو انتظر تبدي المباراة', 'Press play')}</div>` : evSection(rows, ctx, true)}
  </div>`;
}
function simTick() {
  if (SIM.t) return;
  SIM.t = setInterval(() => {
    const el = document.getElementById('puSim'); if (!el) { clearInterval(SIM.t); SIM.t = null; return; }
    if (!SIM.run || document.hidden || SIM.min >= 90) return;
    if (SIM.min === 45 && SIM.ht < 4) { SIM.ht++; } else { SIM.ht = 0; SIM.min++; }
    el.outerHTML = simHTML();
  }, 650);
}
window.simCtl = (a) => { if (a === 'toggle') SIM.run = !SIM.run; if (a === 'reset') { SIM.min = 0; SIM.ht = 0; SIM.run = true; } if (a === 'skip') SIM.min = Math.min(90, SIM.min + 10); const el = document.getElementById('puSim'); if (el) el.outerHTML = simHTML(); };

export function vPulse() {
  const gw = ST.G.cur, ev = ST.G.events.find((e) => e.id === gw);
  if (SIMON() && (!ST.E?.picks || !ST.live || ST.liveRawGW !== gw)) return `<div class="sec"><h2>${I('i-target')}${tt('الأحداث المباشرة', 'Live events')}</h2></div>` + simHTML();
  if (!ST.E?.picks || !ST.live || ST.liveRawGW !== gw) return `<section class="hero"><div class="mut" style="font-size:12.5px">${tt('نبض الجولة', 'GW pulse')}</div><p style="margin-top:8px;line-height:1.8">${tt('يشتغل وقت المباريات: أحداث فريقك ومنافسك لحظة بلحظة. ارجع أول ما تبدي مباريات الجولة.', 'Comes alive during matches. Check back at kick-off.')}</p></section>`;
  if (!RV.list || RV.gw !== gw) loadRivals(); else serverSync();
  const my = liveCalc(ST.E.picks, gw), rp = RV.picks[RV.sel], rc = rp ? liveCalc(rp, gw) : null, rv = RV.list?.find((x) => x.entry === RV.sel);
  const R = liveRankEstimate(my?.total), f = feed(), anyLive = liveFx().length > 0;
  // الهيرو: أنت ضد منافسك
  const diff = rc ? my.total - rc.total : null;
  const heroOld = () => `<div class="pu-vs"><div class="me"><small>${tt('أنت', 'You')}</small><b class="big-num num">${my.total}</b></div><div class="mid">${diff == null ? '—' : `<span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}" dir="ltr">${diff > 0 ? '+' : ''}${diff}</span>`}<small>${diff == null ? '' : diff > 0 ? tt('متقدم', 'ahead') : diff < 0 ? tt('متأخر', 'behind') : tt('تعادل', 'level')}</small></div><div class="rv"><small>${rv ? esc(rv.name) : tt('منافسك', 'Rival')}</small><b class="num">${rc ? rc.total : '…'}</b></div></div>
    ${R ? `<div class="pu-rank"><div><small>${tt('ترتيبك التقديري الآن', 'Live rank (est.)')}</small><b class="num">${fmt(R.rank)}</b><em class="${R.move > 0 ? 'up' : R.move < 0 ? 'down' : ''}">${R.move ? `${R.move > 0 ? '▲' : '▼'} ${fmt(Math.abs(R.move))}` : ''}</em></div>${spark(f.rk)}</div>` : ''}`;
  const hero = `<section class="hero pu-hero"><div class="pu-top"><span class="mut" style="font-size:12.5px">${tt('نبض الجولة', 'GW pulse')} ${gw}</span>${anyLive ? `<span class="livebadge">${tt('مباشر', 'Live')}</span>` : ev?.fin ? `<span class="tag">${tt('خلصت', 'Done')}</span>` : ''}</div>
    ${PH2() ? hero2(my, rc, rv, diff, R, f, gw) : heroOld()}</section>`;
  // اختيار المنافس
  const chips = RV.list?.length ? `<div class="seg pu-rv">${RV.list.map((x) => `<button class="${x.entry === RV.sel ? 'on' : ''}" onclick="puRv(${x.entry})">${esc(x.name)}<small>${esc(x.why)}</small></button>`).join('')}</div>` : RV.list ? '' : `<div class="aiload" style="padding:8px"><i></i><i></i><i></i></div>`;
  // الأحداث المباشرة: لاعبينك + لاعبين خصمك اللي ما عندك
  const myIds = new Set((ST.E.picks.picks || []).map((x) => x.element));
  // كل لاعبين التشكيلتين (الأساسيين والدكة) — لاعب الدكة ينعرض ويا ملاحظة وما تنحسب نقاطه
  const rvM = new Map((rp?.picks || []).map((x) => [x.element, x.multiplier]));
  const rows = (ST.E.picks.picks || []).map((x) => ({ p: PM(x.element), s: ST.live[x.element], m: x.multiplier, who: 'me', sh: rvM.has(x.element), bMe: x.multiplier === 0, bRv: rvM.get(x.element) === 0 }));
  if (rp) (rp.picks || []).filter((x) => !myIds.has(x.element)).forEach((x) => rows.push({ p: PM(x.element), s: ST.live[x.element], m: x.multiplier, who: 'rv', bRv: x.multiplier === 0 }));
  const nearHTML = SIMON() ? simHTML() : evSection(rows.filter((r) => r.p && r.s), realCtx(), anyLive);
  // منافسك
  let rvHTML = '';
  if (rc && rp) {
    const cap = (c) => c.rows.find((r) => r.cap && r.m > 1) || c.rows.find((r) => r.m > 1);
    const mc = cap(my), oc = cap(rc), mcp = mc ? mc.pts * mc.m : 0, ocp = oc ? oc.pts * oc.m : 0;
    const mine = new Set(ST.E.picks.picks.map((x) => x.element));
    const theirs = rc.rows.filter((r) => r.m > 0 && !mine.has(r.id)).sort((a, b) => b.pts * b.m - a.pts * a.m);
    // الكلين شيت بدقة: كل لاعبين المنافس الأساسيين (بعد التبديل التلقائي) اللي حصلوا كلين شيت — المهاجم ما ياخذ نقاط عليه
    const CSP = { GK: 4, DEF: 4, MID: 1 };
    const csOf = (c) => c.rows.filter((r) => r.m > 0 && ST.live[r.id]?.clean_sheets > 0 && CSP[PM(r.id)?.pos]).map((r) => ({ r, p: PM(r.id), pts: CSP[PM(r.id).pos] * r.m })).sort((x, y) => y.pts - x.pts);
    const rvCS = csOf(rc), myCS = csOf(my);
    const csName = (x) => `<span class="pu-csn${playing(x.p) ? ' prov' : ''}">${esc(x.p.name)}${x.r.m > 1 ? ` <i>×${x.r.m}</i>` : ''}<em dir="ltr">+${x.pts}</em></span>`;
    const rvDiff = rvCS.filter((x) => !mine.has(x.r.id)), rvSame = rvCS.filter((x) => mine.has(x.r.id));
    const sum = (L) => L.reduce((a, x) => a + x.pts, 0);
    const csBox = rvCS.length || myCS.length ? `<div class="pu-cs">
        <div class="pu-csr rv"><b>🧱 ${tt(`منافسك: كلين شيت من ${rvCS.length} ${rvCS.length === 1 ? 'لاعب' : rvCS.length === 2 ? 'لاعبين' : 'لاعبين'}`, `Rival: ${rvCS.length} clean sheets`)}</b><span class="num" dir="ltr">+${sum(rvCS)}</span></div>
        ${rvDiff.length ? `<div class="pu-csg"><small>${tt('ما عندك', 'Not in your team')}</small>${rvDiff.map(csName).join('')}</div>` : ''}
        ${rvSame.length ? `<div class="pu-csg same"><small>${tt('عندك هم', 'You have too')}</small>${rvSame.map(csName).join('')}</div>` : ''}
        ${!rvCS.length ? `<div class="pu-csg"><small>—</small></div>` : ''}
        <div class="pu-csr me"><b>${tt(`إنت: كلين شيت من ${myCS.length} ${myCS.length === 1 ? 'لاعب' : 'لاعبين'}`, `You: ${myCS.length} clean sheets`)}</b><span class="num" dir="ltr">+${sum(myCS)}</span></div>
        ${myCS.length ? `<div class="pu-csg">${myCS.map(csName).join('')}</div>` : ''}
        ${[...rvCS, ...myCS].some((x) => playing(x.p)) ? `<p class="pu-csn-note">${tt('المخطط بخط متقطع: مباراته بعدها شغالة والكلين شيت ممكن يروح', 'Dashed: match still live, clean sheet can still be lost')}</p>` : ''}
      </div>` : '';
    rvHTML = `<div class="card pu-cap"><div class="pu-c ${mcp >= ocp ? 'win' : ''}"><small>${tt('كابتنك', 'Your captain')}</small>${mc ? `<div class="mini">${pShirt(PM(mc.id))}</div><b>${esc(PM(mc.id).name)}</b><em class="num">${mcp}</em>` : '—'}</div><div class="pu-cvs">${mcp === ocp ? '=' : mcp > ocp ? '›' : '‹'}</div><div class="pu-c ${ocp > mcp ? 'win' : ''}"><small>${tt('كابتنه', 'Their captain')}</small>${oc ? `<div class="mini">${pShirt(PM(oc.id))}</div><b>${esc(PM(oc.id).name)}</b><em class="num">${ocp}</em>` : '—'}</div></div>
      ${ocp > mcp ? `<p class="pu-warn">${tt(`كابتن منافسك متفوق عليك بـ ${ocp - mcp} نقطة`, `Their captain leads yours by ${ocp - mcp}`)}</p>` : ''}
      ${csBox}
      <div class="sec"><h2>${I('i-alert')}${tt('عنده وما عندك', 'They have, you don’t')}</h2><span class="mut" style="font-size:12px">${theirs.reduce((a, r) => a + r.pts * r.m, 0)} ${tt('نقطة', 'pts')}</span></div>
      <div class="list">${theirs.slice(0, 6).map((r) => { const p = PM(r.id); return `<div class="row tap" onclick="playerGW(${p.id},${gw},${r.m})"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)}${r.cap ? ' ©' : ''}</b><span>${tShort(p.team)}${playing(p) ? ` · <span class="up">${tt('يلعب هسة', 'playing')}</span>` : ''}</span></div><div class="col num" style="font-size:16px">${r.pts * r.m}</div></div>`; }).join('') || `<div class="row mut">—</div>`}</div>`;
  } else if (RV.list && !RV.list.length) rvHTML = `<div class="card mut pu-empty">${tt('ما لكينا منافس بدورياتك الخاصة', 'No rival found in your private leagues')}</div>`;
  else rvHTML = `<div class="aiload" style="padding:10px"><i></i><i></i><i></i></div>`;
  // كل مواجهاتك بهالجولة
  const h2 = (RV.list || []).filter((x) => x.kind === 'h');
  const h2HTML = h2.length ? `<div class="sec"><h2>${I('i-swords')}${tt('مواجهاتك بهالجولة', 'Your H2H matches')}</h2><span class="mut" style="font-size:12px">${h2.length}</span></div><div class="card pu-h2">${h2.map((x) => { const c = RV.picks[x.entry] ? liveCalc(RV.picks[x.entry], gw) : null, o = c ? c.total : null, d2 = o == null ? null : my.total - o;
      return `<button class="pu-h2r ${x.entry === RV.sel ? 'on' : ''}" onclick="puRv(${x.entry})"><div><b>${esc(x.name)}</b><small>${esc(x.leagues.join('، '))}</small></div><span class="pu-h2s"><b class="${d2 > 0 ? 'up' : ''}">${my.total}</b><i>-</i><b class="${d2 < 0 ? 'down' : ''}">${o ?? '…'}</b></span><em class="${d2 > 0 ? 'w' : d2 < 0 ? 'l' : 'd'}">${d2 == null ? '' : d2 > 0 ? tt('متقدم', 'ahead') : d2 < 0 ? tt('متأخر', 'behind') : tt('تعادل', 'level')}</em></button>`; }).join('')}</div>` : '';
  // سجل الأحداث
  const evs = f.ev.slice(0, 30);
  const feedHTML = evs.length ? `<div class="card pu-feed">${evs.map((e) => `<div class="pu-ev ${e.tone}"><span class="pu-ei">${ICO[e.k] || '•'}</span><div><b>${esc(txtOf(e))}</b><small>${ago(e.at)}${e.who === 'rv' ? ` · ${tt('منافسك', 'rival')}` : ''}</small></div></div>`).join('')}</div>` : `<div class="card mut pu-empty">${tt('الأحداث تنسجل هنا أول ما تصير (هدف، صناعة، كلين شيت، بونص، تغيّر ترتيبك) — حتى لو التطبيق مسكّر', 'Events are logged here as they happen — even with the app closed')}</div>`;
  return hero + chips
    + `<div class="sec"><h2>${I('i-target')}${tt('الأحداث المباشرة', 'Live events')}</h2></div>${nearHTML}`
    + h2HTML + `<div class="sec"><h2>${I('i-swords')}${tt('أنت ومنافسك', 'You vs your rival')}</h2></div>${rvHTML}`;
}
window.puRv = (e) => { RV.sel = e; LS.set(`fp_pulse_rv_${ST.profile.teamId}`, e); loadRivalPicks(); window.render(); };
/* تسجيل تلقائي عند فتح التطبيق، حتى السيرفر يكمّل يسجّل أحداثك حتى لو ما فتحت هالصفحة */
(function autoReg(n = 0) {
  if (!ST.profile?.teamId || !ST.G) { if (n < 60) setTimeout(() => autoReg(n + 1), 1000); return; }
  const team = ST.profile.teamId, rival = LS.get(`fp_pulse_rv_${team}`) || null;
  regKey = `${team}:${rival || 0}`;
  fetch('/api/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team, rival }) }).catch(() => {});
})();
