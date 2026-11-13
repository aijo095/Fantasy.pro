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
function hero2(my, rc, rv, diff, R, f) {
  const meN = ST.profile?.teamName || ST.E?.entry?.name || tt('أنت', 'You'), rvN = rv ? rv.name : tt('منافسك', 'Rival');
  const a = my.total, b = rc ? rc.total : null, lead = b == null ? 0 : Math.sign(a - b);
  const pct = b == null || a + b <= 0 ? 50 : Math.round((a / (a + b)) * 100);
  const side = (cls, who, nm, v, win) => `<div class="pu2-s ${cls} ${win > 0 ? 'win' : win < 0 ? 'lose' : ''}"><span class="pu2-av">${esc((nm || '?').trim()[0] || '?').toUpperCase()}</span><small>${who}</small><span class="pu2-nm">${esc(nm)}</span><b class="num">${v ?? '…'}</b></div>`;
  return `<div class="pu2-vs">
      ${side('me', tt('أنت', 'You'), meN, a, lead)}
      <div class="pu2-mid">${diff == null ? '<span>—</span>' : `<span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}" dir="ltr">${diff > 0 ? '+' : ''}${diff}</span>`}<small>${diff == null ? 'VS' : diff > 0 ? tt('متقدم', 'ahead') : diff < 0 ? tt('متأخر', 'behind') : tt('تعادل', 'level')}</small></div>
      ${side('rv', tt('منافسك', 'Rival'), rvN, b, -lead)}
    </div>
    <div class="pu2-tug" style="--p:${pct}%"><i></i></div>
    ${R ? `<div class="pu2-rank"><div class="pu2-rk"><small>${tt('ترتيبك التقديري الآن', 'Live rank (est.)')}</small><b class="num">${fmt(R.rank)}</b></div>${R.move ? `<em class="${R.move > 0 ? 'up' : 'down'}">${R.move > 0 ? '▲' : '▼'} ${fmt(Math.abs(R.move))}</em>` : ''}</div>${f.rk.length > 2 ? spark(f.rk) : ''}` : ''}`;
}
function spark(rk) {
  if (rk.length < 2) return '';
  const W = 300, H = 54, rs = rk.map((x) => x.r), mn = Math.min(...rs), mx = Math.max(...rs), sp = Math.max(1, mx - mn);
  const pts = rk.map((x, i) => `${(i / (rk.length - 1)) * W},${6 + ((x.r - mn) / sp) * (H - 12)}`).join(' ');
  return `<svg class="pu-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" dir="ltr"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const ICO = { goal: '⚽', assist: '🎯', cs: '🧱', csl: '🥅', red: '🟥', bonus: '⭐', rank: '📈' };

/* ---------- محاكاة تجريبية لقسم "قريب من الحدث" (معاينة ?pulsedemo=1): مانشستر يونايتد ضد السيتي ---------- */
const SIMON = () => { try { return localStorage.getItem('fp_pulsedemo') === '1'; } catch { return false; } };
const SIM = { min: 0, run: true, t: null, ht: 0 };
function simCast() {
  const G = ST.G, byT = (sh) => Object.values(G.teams).find((x) => tShort(x.id) === sh)?.id;
  const H = byT('MUN'), A = byT('MCI'); if (!H || !A) return null;
  const top = (tm, pos, i = 0) => G.players.filter((p) => p.team === tm && pos.includes(p.pos)).sort((a, b) => b.price - a.price || b.pts - a.pts)[i];
  return { H, A, h1: top(H, ['MID', 'FWD'], 0), h2: top(H, ['MID', 'FWD'], 1), hd: top(H, ['DEF']), hg: top(H, ['GK']), a1: top(A, ['FWD']), a2: top(A, ['MID'], 0), a3: top(A, ['MID'], 1), ad: top(A, ['DEF']), ag: top(A, ['GK']) };
}
// السيناريو: كل سطر = دقيقة + لاعب + تغيير بإحصاءاته (xg/xa/bps/dc/goal/assist/save)
const SCRIPT = [
  [6, 'a1', { xg: 0.11, bps: 3 }], [9, 'h1', { xa: 0.08, bps: 2 }], [12, 'hd', { dc: 4, bps: 3 }], [14, 'a2', { xa: 0.21, bps: 4 }],
  [18, 'a1', { xg: 0.27, bps: 2 }], [20, 'hg', { save: 1, bps: 2 }], [22, 'a1', { goal: 1, xg: 0.31, bps: 12 }], [22, 'a2', { assist: 1, xa: 0.12, bps: 9 }],
  [27, 'h1', { xg: 0.34, bps: 3 }], [31, 'hd', { dc: 4, bps: 2 }], [34, 'ad', { dc: 5, bps: 3 }], [37, 'h2', { xa: 0.32, bps: 3 }], [40, 'ag', { save: 1, bps: 2 }],
  [44, 'hd', { dc: 1, bps: 1 }], [52, 'a3', { xa: 0.36, bps: 3 }], [55, 'h1', { xg: 0.18, bps: 2 }], [58, 'h1', { goal: 1, xg: 0.22, bps: 12 }], [58, 'h2', { assist: 1, xa: 0.1, bps: 9 }],
  [63, 'ad', { dc: 3, bps: 2 }], [66, 'ad', { dc: 2, bps: 2 }], [70, 'a1', { xg: 0.38, bps: 3 }], [73, 'hg', { save: 1, bps: 2 }], [76, 'a1', { xg: 0.33, bps: 2 }], [79, 'hd', { dc: 2, bps: 3 }],
  [83, 'a1', { goal: 1, xg: 0.45, bps: 12 }], [83, 'a3', { assist: 1, xa: 0.2, bps: 9 }], [88, 'h2', { xg: 0.29, bps: 2 }], [90, 'ag', { save: 1, bps: 2 }],
];
function simState(C, m) {
  const S = {}; ['h1', 'h2', 'hd', 'hg', 'a1', 'a2', 'a3', 'ad', 'ag'].forEach((k) => { if (C[k]) S[k] = { xg: 0, xa: 0, bps: 6, dc: 0, goal: 0, assist: 0, save: 0, p: C[k], side: k[0] }; });
  const ev = []; let hs = 0, as = 0;
  SCRIPT.forEach(([min, k, d]) => { if (min > m || !S[k]) return; const x = S[k]; Object.entries(d).forEach(([f, v]) => (x[f] += v));
    if (d.goal) { x.side === 'h' ? hs++ : as++; ev.push({ min, k: 'goal', p: x.p }); } if (d.assist) ev.push({ min, k: 'assist', p: x.p });
    const thr = x.p.pos === 'DEF' ? 10 : 12; if (d.dc && x.dc >= thr && x.dc - d.dc < thr) ev.push({ min, k: 'dc', p: x.p }); });
  if (m >= 22) S.hg && (S.hg.cs = false); if (m >= 58) S.ag && (S.ag.cs = false);
  const rank = Object.values(S).sort((a, b) => b.bps - a.bps), br = (x) => rank.indexOf(x) + 1;
  const near = [];
  Object.values(S).forEach((x) => {
    const p = x.p; // نفس قواعد القسم الحقيقي بالضبط
    if (x.xg >= 0.3 && !x.goal) near.push({ p, k: 'goal', v: x.xg, txt: tt(`قريب يسجّل · xG ${x.xg.toFixed(2)}`, `Close to scoring · xG ${x.xg.toFixed(2)}`) });
    else if (x.xa >= 0.3 && !x.assist) near.push({ p, k: 'assist', v: x.xa, txt: tt(`قريب يصنع · xA ${x.xa.toFixed(2)}`, `Close to an assist · xA ${x.xa.toFixed(2)}`) });
    const r = br(x); if (r <= 3 && m < 90) near.push({ p, k: 'bonus', v: 4 - r, txt: tt(`المركز ${r} بالـ BPS (${x.bps})`, `#${r} in BPS (${x.bps})`) });
    const thr = p.pos === 'DEF' ? 10 : p.pos === 'GK' ? 0 : 12; if (thr && x.dc >= thr - 3 && x.dc < thr) near.push({ p, k: 'dc', v: x.dc / thr, txt: tt(`مساهمات دفاعية ${x.dc}/${thr} — باقي ${thr - x.dc}`, `DefCon ${x.dc}/${thr}`) });
  });
  near.sort((a, b) => b.v - a.v);
  return { hs, as, near, ev, rank };
}
function simHTML() {
  const C = simCast(); if (!C) return `<div class="card mut pu-empty">${tt('ما لكينا لاعبين اليونايتد والسيتي', 'Teams not found')}</div>`;
  const m = SIM.min, st = simState(C, m), last = st.ev.filter((e) => m - e.min <= 4).slice(-1)[0];
  const clock = m === 0 ? tt('قبل البداية', 'Pre-match') : m >= 90 ? tt('انتهت', 'FT') : SIM.ht ? tt('استراحة', 'HT') : `${m}′`;
  const evTxt = (e) => ({ goal: tt(`⚽ هدف! <bdi>${esc(e.p.name)}</bdi>`, `⚽ Goal! ${esc(e.p.name)}`), assist: tt(`🎯 صناعة: <bdi>${esc(e.p.name)}</bdi>`, `🎯 Assist: ${esc(e.p.name)}`), dc: tt(`🛡️ <bdi>${esc(e.p.name)}</bdi> حصل +2 مساهمات دفاعية`, `🛡️ ${esc(e.p.name)} DefCon +2`) }[e.k]);
  setTimeout(simTick, 0);
  return `<div class="card sim" id="puSim">
    <div class="sim-tag">${tt('محاكاة تجريبية — مو بيانات حقيقية', 'Demo simulation — not real data')}</div>
    <div class="sim-sb" dir="ltr"><span>${crest('MUN', 22)}<b>MUN</b></span><b class="num">${st.hs} – ${st.as}</b><span><b>MCI</b>${crest('MCI', 22)}</span></div>
    <div class="sim-clk"><i class="${SIM.run && m > 0 && m < 90 && !SIM.ht ? 'on' : ''}"></i>${clock}</div>
    <div class="sim-bar"><i style="width:${Math.min(100, (m / 90) * 100)}%"></i></div>
    <div class="sim-ctl"><button onclick="simCtl('toggle')">${SIM.run ? tt('⏸ إيقاف', '⏸ Pause') : tt('▶ تشغيل', '▶ Play')}</button><button onclick="simCtl('reset')">${tt('⟲ من البداية', '⟲ Restart')}</button><button onclick="simCtl('skip')">${tt('+10 دقائق', '+10 min')}</button></div>
    ${last ? `<div class="sim-ev ${last.k}"><span>${evTxt(last)}</span><em dir="ltr">${last.min}′</em></div>` : ''}
    ${st.near.length ? `<div class="list sim-list">${st.near.slice(0, 8).map((n) => `<div class="row"><div class="mini">${pShirt(n.p)}</div><div class="info"><b>${esc(n.p.name)} <small class="mut">${tShort(n.p.team)}</small></b><span>${n.txt}</span></div><span class="pu-k ${n.k}">${ICO[n.k] || '🛡️'}</span></div>`).join('')}</div>` : `<div class="mut sim-empty">${m === 0 ? tt('اضغط تشغيل أو انتظر تبدي المباراة', 'Press play') : tt('ماكو لاعب قريب من حدث هسة', 'Nothing brewing right now')}</div>`}
    ${st.ev.length ? `<div class="sim-log">${st.ev.slice().reverse().map((e) => `<span><em dir="ltr">${e.min}′</em>${evTxt(e)}</span>`).join('')}</div>` : ''}
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
  if (SIMON() && (!ST.E?.picks || !ST.live || ST.liveRawGW !== gw)) return `<div class="sec"><h2>${I('i-target')}${tt('قريب من الحدث', 'About to happen')}</h2></div>` + simHTML();
  if (!ST.E?.picks || !ST.live || ST.liveRawGW !== gw) return `<section class="hero"><div class="mut" style="font-size:12.5px">${tt('نبض الجولة', 'GW pulse')}</div><p style="margin-top:8px;line-height:1.8">${tt('يشتغل وقت المباريات: أحداث فريقك ومنافسك لحظة بلحظة. ارجع أول ما تبدي مباريات الجولة.', 'Comes alive during matches. Check back at kick-off.')}</p></section>`;
  if (!RV.list || RV.gw !== gw) loadRivals(); else serverSync();
  const my = liveCalc(ST.E.picks, gw), rp = RV.picks[RV.sel], rc = rp ? liveCalc(rp, gw) : null, rv = RV.list?.find((x) => x.entry === RV.sel);
  const R = liveRankEstimate(my?.total), f = feed(), anyLive = liveFx().length > 0;
  // الهيرو: أنت ضد منافسك
  const diff = rc ? my.total - rc.total : null;
  const heroOld = () => `<div class="pu-vs"><div class="me"><small>${tt('أنت', 'You')}</small><b class="big-num num">${my.total}</b></div><div class="mid">${diff == null ? '—' : `<span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}" dir="ltr">${diff > 0 ? '+' : ''}${diff}</span>`}<small>${diff == null ? '' : diff > 0 ? tt('متقدم', 'ahead') : diff < 0 ? tt('متأخر', 'behind') : tt('تعادل', 'level')}</small></div><div class="rv"><small>${rv ? esc(rv.name) : tt('منافسك', 'Rival')}</small><b class="num">${rc ? rc.total : '…'}</b></div></div>
    ${R ? `<div class="pu-rank"><div><small>${tt('ترتيبك التقديري الآن', 'Live rank (est.)')}</small><b class="num">${fmt(R.rank)}</b><em class="${R.move > 0 ? 'up' : R.move < 0 ? 'down' : ''}">${R.move ? `${R.move > 0 ? '▲' : '▼'} ${fmt(Math.abs(R.move))}` : ''}</em></div>${spark(f.rk)}</div>` : ''}`;
  const hero = `<section class="hero pu-hero"><div class="pu-top"><span class="mut" style="font-size:12.5px">${tt('نبض الجولة', 'GW pulse')} ${gw}</span>${anyLive ? `<span class="livebadge">${tt('مباشر', 'Live')}</span>` : ev?.fin ? `<span class="tag">${tt('خلصت', 'Done')}</span>` : ''}</div>
    ${PH2() ? hero2(my, rc, rv, diff, R, f) : heroOld()}</section>`;
  // اختيار المنافس
  const chips = RV.list?.length ? `<div class="seg pu-rv">${RV.list.map((x) => `<button class="${x.entry === RV.sel ? 'on' : ''}" onclick="puRv(${x.entry})">${esc(x.name)}<small>${esc(x.why)}</small></button>`).join('')}</div>` : RV.list ? '' : `<div class="aiload" style="padding:8px"><i></i><i></i><i></i></div>`;
  // قريب من الحدث
  const near = [];
  (ST.E.picks.picks || []).filter((x) => x.multiplier > 0).forEach((x) => {
    const p = PM(x.element), s = ST.live[x.element]; if (!p || !s || !playing(p)) return;
    const xg = +s.expected_goals || 0, xa = +s.expected_assists || 0, br = bpsRank(p.id);
    if (xg >= 0.3 && !s.goals_scored) near.push({ p, k: 'goal', v: xg, txt: tt(`قريب يسجّل · xG ${xg.toFixed(2)}`, `Close to scoring · xG ${xg.toFixed(2)}`) });
    else if (xa >= 0.3 && !s.assists) near.push({ p, k: 'assist', v: xa, txt: tt(`قريب يصنع · xA ${xa.toFixed(2)}`, `Close to an assist · xA ${xa.toFixed(2)}`) });
    if (br && !s.bonus) near.push({ p, k: 'bonus', v: 4 - br, txt: tt(`المركز ${br} بالـ BPS (${s.bps})`, `#${br} in BPS (${s.bps})`) });
    const thr = p.pos === 'DEF' ? 10 : p.pos === 'GK' ? 0 : 12, dc = s.defensive_contribution || 0;
    if (thr && dc >= thr - 3 && dc < thr) near.push({ p, k: 'dc', v: dc / thr, txt: tt(`مساهمات دفاعية ${dc}/${thr} — باقي ${thr - dc}`, `DefCon ${dc}/${thr}`) });
  });
  near.sort((a, b) => b.v - a.v);
  const nearHTML = SIMON() ? simHTML() : near.length ? `<div class="list">${near.slice(0, 8).map((n) => `<div class="row tap" onclick="playerGW(${n.p.id},${gw})"><div class="mini">${pShirt(n.p)}</div><div class="info"><b>${esc(n.p.name)}</b><span>${n.txt}</span></div><span class="pu-k ${n.k}">${ICO[n.k] || '🛡️'}</span></div>`).join('')}</div>` : `<div class="card mut pu-empty">${anyLive ? tt('ماكو لاعب قريب من حدث هسة — نراقب كل 15 ثانية', 'Nothing brewing right now') : tt('ماكو مباراة شغّالة هسة', 'No live match right now')}</div>`;
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
    + `<div class="sec"><h2>${I('i-target')}${tt('قريب من الحدث', 'About to happen')}</h2></div>${nearHTML}`
    + h2HTML + `<div class="sec"><h2>${I('i-swords')}${tt('أنت ومنافسك', 'You vs your rival')}</h2></div>${rvHTML}`
    + `<div class="sec"><h2>${I('i-activity')}${tt('سجل أحداث الجولة', 'GW timeline')}</h2></div>${feedHTML}`;
}
window.puRv = (e) => { RV.sel = e; LS.set(`fp_pulse_rv_${ST.profile.teamId}`, e); loadRivalPicks(); window.render(); };
/* تسجيل تلقائي عند فتح التطبيق، حتى السيرفر يكمّل يسجّل أحداثك حتى لو ما فتحت هالصفحة */
(function autoReg(n = 0) {
  if (!ST.profile?.teamId || !ST.G) { if (n < 60) setTimeout(() => autoReg(n + 1), 1000); return; }
  const team = ST.profile.teamId, rival = LS.get(`fp_pulse_rv_${team}`) || null;
  regKey = `${team}:${rival || 0}`;
  fetch('/api/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team, rival }) }).catch(() => {});
})();
