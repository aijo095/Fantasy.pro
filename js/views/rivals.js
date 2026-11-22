/* =========================================================
   متتبّع المنافسين — الدوريات الكلاسيكية + دوريات المواجهات (H2H)
   بعد إغلاق الجولة: تشكيلة كل منافس، الكابتن، الكروت، الانتقالات والخصم،
   نقاطه المباشرة، اللاعبين اللي عنده وانت ما عندك (الخطر) والعكس (فرصتك)،
   ونسبة فوزك بالدوري (محاكاة) أو بمواجهة هالأسبوع (H2H)
========================================================= */
import { ST, PM, tShort } from '../store.js';
import { tt, t } from '../i18n.js';
import { esc, I, fmt, toast, openSheet, sheetHead, morphHTML } from '../ui.js';
import * as FPL from '../fpl.js';
import { liveCalc } from '../live-engine.js';
import { xp } from '../engine.js';
import { pShirt } from './common.js';

let sel = null, S = {}, busy = false, lastRefresh = 0, showAll = false, ltOfficial = false;
const CHIP = { wildcard: tt('وايلد كارد', 'Wildcard'), freehit: tt('فري هت', 'Free Hit'), bboost: tt('بنش بوست', 'Bench Boost'), '3xc': tt('تريبل كابتن', 'Triple Captain'), manager: tt('المدرب', 'Manager') };
function leagues() {
  const c = (ST.E.entry.leagues?.classic || []).filter((l) => l.league_type === 'x').map((l) => ({ id: l.id, name: l.name, kind: 'c', rank: l.entry_rank, n: l.rank_count }));
  const h = (ST.E.entry.leagues?.h2h || []).map((l) => ({ id: l.id, name: l.name, kind: 'h', rank: l.entry_rank, n: l.rank_count }));
  return [...h, ...c];
}
const gwStarted = () => { const ev = ST.G.events.find((e) => e.id === ST.G.cur); return ev && new Date(ev.deadline) < new Date(); };
/* نقاط مباشرة خاصة بالمتتبّع: تنجلب طازجة وتتحدث كل 30 ثانية وقت المباريات */
let LV = { gw: 0, map: null, at: 0 }, lvTimer = 0, openEntry = null, openGW = null;
const LVG = {}, XG = {}, MT = {}; let mtGW = null;
/* الجولة شغّالة؟ نعتمد على وقت انطلاق المباريات حتى لو بيانات المباريات بالجهاز قديمة */
const isLiveGW = (g) => { const now = Date.now(); return (ST.G.fx[g] || []).some((f) => !f.fin && (f.started || (f.ko && new Date(f.ko) <= now && now - new Date(f.ko) < 4 * 3600e3))); };
const normFx = (x) => ({ id: x.id, ev: x.event, h: x.team_h, a: x.team_a, hd: x.team_h_difficulty, ad: x.team_a_difficulty, ko: x.kickoff_time, fin: !!(x.finished || (x.finished_provisional && (x.minutes || 0) >= 90)), started: x.started, hs: x.team_h_score, as: x.team_a_score, min: x.minutes, stats: x.stats || [] });
async function refreshFx(gw) { try { const fx = await FPL.loadFixturesGW(gw, true); if (Array.isArray(fx) && fx.length) ST.G.fx[gw] = fx.map((x) => FPL.fxBest(normFx(x))); } catch {} }
async function ensureLive(gw, fresh = false) {
  if (!fresh && LV.gw === gw && LV.map && Date.now() - LV.at < 25e3) return;
  const l = await FPL.loadLive(gw, fresh); LV = { gw, map: Object.fromEntries(l.elements.map((x) => [x.id, x.stats])), at: Date.now() }; LVG[gw] = LV.map;
  if (gw === ST.G.cur) { ST.live = LV.map; ST.liveRaw = l.elements; ST.liveRawGW = gw; }
}
const liveMap = (gw) => (gw === LV.gw ? LV.map : LVG[gw]);
async function liveFor(gw, fresh = false) { if (!fresh && LVG[gw]) return LVG[gw]; const l = await FPL.loadLive(gw, fresh); LVG[gw] = Object.fromEntries(l.elements.map((x) => [x.id, x.stats])); if (gw === LV.gw) LV = { gw, map: LVG[gw], at: Date.now() }; return LVG[gw]; }
const lpts = (id, gw = S.gw) => liveMap(gw)?.[id]?.total_points ?? 0;
/** بيانات فريق بجولة معيّنة (الجولة الحالية من القائمة، والباقي من كاش الجولات) */
const entryFor = (e, gw) => (gw === S.gw ? S.members?.find((x) => x.entry === e) || S.extra?.[e] : XG[gw]?.[e]);
const recalc = (m) => { if (m?.picks) m.calc = liveCalc(m.picks, S.gw ?? LV.gw, undefined, LV.map); };
function startLiveTimer() {
  clearInterval(lvTimer);
  lvTimer = setInterval(async () => {
    if (ST.view !== 'rivals' || !S.members) return clearInterval(lvTimer);
    if (document.hidden || S.gw !== ST.G.cur) return;
    const evc = ST.G.events.find((e) => e.id === S.gw); if (!evc || evc.fin) return;
    if (!isLiveGW(S.gw) && Date.now() - (LV.at || 0) < 60e3) return; // بين المباريات: كل دقيقة (البونص والتعديلات)
    try { await Promise.all([ensureLive(S.gw, true), refreshFx(S.gw)]); } catch { return; }
    await pool(S.members.filter((m) => !m.picks), 4, async (m) => { try { m.picks = await FPL.fetchPicks(m.entry, S.gw); } catch {} });
    if (sel?.kind === 'h') { const k = `${S.L.id}:${S.gw}`; if (MT[k]?.rows && Date.now() - (MT[k].at || 0) > 60e3) loadMT(S.L, S.gw, true); }
    S.members.forEach(recalc); Object.values(S.extra || {}).forEach(recalc); (S.others || []).forEach(recalc);
    Object.values(XG[S.gw] || {}).forEach(recalc);
    if (openEntry && document.getElementById('rvSheet')) morphHTML(document.getElementById('rvSheet'), sheetBody(openEntry, openGW));
    else if (!document.querySelector('.ov')) window.render();
  }, 15e3);
}
const pool = async (arr, n, fn) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(...(await Promise.all(arr.slice(i, i + n).map(fn)))); return out; };

async function load(L) {
  busy = true; const me = ST.profile.teamId, gw = ST.G.cur; S = { L, err: '' }; window.render();
  try {
    await Promise.all([ensureLive(gw, true).catch(() => {}), refreshFx(gw)]);
    let members = [], opp = null, table = null;
    if (L.kind === 'c') {
      const d = await FPL.loadLeague(L.id, 1); const res = d.standings?.results || []; table = res;
      const myIdx = res.findIndex((r) => r.entry === me);
      const pick = new Set(res.slice(0, 10).map((r) => r.entry)); if (myIdx >= 0) res.slice(Math.max(0, myIdx - 3), myIdx + 4).forEach((r) => pick.add(r.entry));
      members = res.filter((r) => pick.has(r.entry)).map((r) => ({ entry: r.entry, name: r.entry_name, mgr: r.player_name, rank: r.rank, total: r.total, gwPts: r.event_total }));
      if (myIdx < 0) members.push({ entry: me, name: ST.E.entry.name, mgr: '', rank: L.rank, total: ST.E.entry.summary_overall_points, gwPts: 0 });
    } else {
      const d = await FPL.loadH2H(L.id); table = d.standings?.results || [];
      members = table.slice(0, 24).map((r) => ({ entry: r.entry, name: r.entry_name, mgr: r.player_name, rank: r.rank, total: r.total, pf: r.points_for, w: r.matches_won, dr: r.matches_drawn, l: r.matches_lost }));
      const oppOf = async (g) => { try { const m = await FPL.loadH2HMatches(L.id, g); const mm = (m.results || []).find((x) => x.entry_1_entry === me || x.entry_2_entry === me); return mm ? (mm.entry_1_entry === me ? mm.entry_2_entry : mm.entry_1_entry) : null; } catch { return null; } };
      if (gwStarted()) opp = await oppOf(gw);
      var nextOpp = ST.G.next && ST.G.next !== gw ? await oppOf(ST.G.next) : null;
      if (!members.some((x) => x.entry === me)) members.push({ entry: me, name: ST.E.entry.name, rank: L.rank });
    }
    // تشكيلات + انتقالات الجولة
    await pool(members, 6, async (m) => {
      try { m.picks = await FPL.fetchPicks(m.entry, gw); m.calc = liveCalc(m.picks, gw, undefined, LV.map); } catch { m.picks = null; }
      if (m.entry !== me) { try { const tr = await FPL.fetchTransfers(m.entry); m.tr = (Array.isArray(tr) ? tr : []).filter((x) => x.event === gw); } catch { m.tr = []; } }
    });
    startLiveTimer();
    S = { L, members, opp, nextOpp: typeof nextOpp !== 'undefined' ? nextOpp : null, table, gw, at: Date.now() };
    if (L.kind === 'c') simSeason(members).catch(() => {});
    loadOthers().catch(() => {});
    if (L.kind === 'h' && gwStarted()) loadMT(L, gw).then(() => { if (ST.view === 'rivals' && !document.querySelector('.ov')) window.render(); }).catch(() => {});
  } catch (e) { S = { L, err: e.message }; }
  busy = false; if (ST.view === 'rivals') window.render();
}

/* ---------- محاكاة نهاية الموسم (كلاسيك) ---------- */
async function simSeason(members) {
  const top = [...members].sort((a, b) => b.total - a.total).slice(0, 12);
  await pool(top, 6, async (m) => { try { const h = await FPL.fetchHistory(m.entry); const pts = h.current.slice(-10).map((x) => x.points - (x.event_transfers_cost || 0)); const mu = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length); m.mu = mu; m.sd = Math.max(8, Math.sqrt(pts.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, pts.length))); } catch { m.mu = 50; m.sd = 14; } });
  const R = Math.max(0, ST.G.lastGW - ST.G.cur), N = 4000, wins = new Map(top.map((m) => [m.entry, 0]));
  const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let s = 0; s < N; s++) { let best = null, bv = -1e9; for (const m of top) { const v = m.total + R * m.mu + Math.sqrt(R) * m.sd * randn(); if (v > bv) { bv = v; best = m.entry; } } wins.set(best, wins.get(best) + 1); }
  top.forEach((m) => { m.win = (wins.get(m.entry) / N) * 100; });
  S.sim = { R, top: top.sort((a, b) => b.win - a.win) };
  if (ST.view === 'rivals') window.render();
}

/* ---------- احتمال الفوز بمواجهة هالأسبوع (H2H) ---------- */
function remainingXP(m) {
  if (!m?.calc) return { exp: 0, n: 0 };
  const gw = S.gw, fx = ST.G.fx[gw] || []; let exp = 0, n = 0;
  m.calc.rows.forEach((r) => { if (r.m === 0 && !r.subIn) return; const p = PM(r.id); if (!p) return; const f = fx.filter((x) => x.h === p.team || x.a === p.team); const left = f.filter((x) => !x.fin); if (!left.length) return; const frac = left.reduce((a, x) => a + (x.started ? Math.max(0, 1 - (x.min || 0) / 90) : 1), 0) / Math.max(1, f.length); exp += xp(p, gw) * frac * Math.max(1, r.m); n += frac; });
  return { exp, n };
}
const Phi = (z) => { const tt2 = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * tt2 * (0.3193815 + tt2 * (-0.3565638 + tt2 * (1.781478 + tt2 * (-1.821256 + tt2 * 1.330274)))); return z > 0 ? 1 - p : p; };

/* ---------- الترتيب الحالي ---------- */

/* ---------- الترتيب المباشر: نعيد حساب جدول الدوري من النقاط المباشرة ---------- */
async function loadOthers() {
  if (!S.table || !S.members) return;
  const have = new Set(S.members.map((m) => m.entry)), gw = S.gw;
  const others = S.table.filter((r) => !have.has(r.entry)).slice(0, 50).map((r) => ({ entry: r.entry }));
  S.others = others;
  await pool(others, 6, async (m) => { try { m.picks = await FPL.fetchPicks(m.entry, gw); m.calc = liveCalc(m.picks, gw, undefined, LV.map); } catch { m.picks = null; } });
  if (ST.view === 'rivals' && !document.querySelector('.ov')) window.render();
}
const calcOf = (e) => (S.members?.find((x) => x.entry === e) || S.others?.find((x) => x.entry === e))?.calc || null;
const liveTableOn = () => { const ev = ST.G.events.find((e) => e.id === S.gw); return !!(S.table?.length && S.gw === ST.G.cur && ev && !ev.fin && gwStarted() && LV.map); };
function liveTable() {
  if (!liveTableOn()) return null;
  if (sel.kind === 'c') {
    const rows = S.table.map((r) => {
      const m = S.members?.find((x) => x.entry === r.entry) || S.others?.find((x) => x.entry === r.entry);
      const c = m?.calc, eh = m?.picks?.entry_history, cost = eh?.event_transfers_cost || 0;
      // نقاط الجولة بالفانتازي ممكن تكون قبل الخصم أو بعده — نكتشفها من سجل الجولة
      const fplNet = cost && eh && r.event_total === eh.points ? r.event_total - cost : r.event_total || 0;
      const base = (r.total || 0) - fplNet, gwPts = c ? c.total : fplNet;
      return { ...r, lgw: gwPts, ltot: base + gwPts, has: !!c };
    });
    rows.sort((a, b) => b.ltot - a.ltot || a.rank - b.rank);
    rows.forEach((r, i) => { r.lrank = i > 0 && rows[i - 1].ltot === r.ltot ? rows[i - 1].lrank : i + 1; });
    return rows;
  }
  const mt = MT[`${S.L.id}:${S.gw}`]?.rows; if (!mt) return null;
  const rows = S.table.map((r) => ({ ...r, lw: r.matches_won, ld: r.matches_drawn, ll: r.matches_lost, lpf: r.points_for, lpts: r.total, lres: '' }));
  const by = Object.fromEntries(rows.map((r) => [r.entry, r]));
  mt.forEach((x) => {
    const a = x.entry_1_entry, b = x.entry_2_entry; if (!a || !b || !by[a] || !by[b]) return;
    const pa = calcOf(a)?.total ?? x.entry_1_points ?? 0, pb = calcOf(b)?.total ?? x.entry_2_points ?? 0;
    by[a].lpf += pa; by[b].lpf += pb;
    if (pa > pb) { by[a].lw++; by[a].lpts += 3; by[b].ll++; by[a].lres = 'w'; by[b].lres = 'l'; }
    else if (pb > pa) { by[b].lw++; by[b].lpts += 3; by[a].ll++; by[a].lres = 'l'; by[b].lres = 'w'; }
    else { by[a].ld++; by[b].ld++; by[a].lpts++; by[b].lpts++; by[a].lres = by[b].lres = 'd'; }
  });
  rows.sort((a, b) => b.lpts - a.lpts || b.lpf - a.lpf || a.rank - b.rank);
  rows.forEach((r, i) => { r.lrank = i + 1; });
  return rows;
}
function standings() {
  const off = S.table || [], me = ST.profile.teamId; if (!off.length) return '';
  const h2h = sel.kind === 'h', LT = liveTable(), live = !!LT && !ltOfficial;
  const rows = live ? LT : off, rk = (r) => (live ? r.lrank : r.rank);
  const myIdx = rows.findIndex((r) => r.entry === me);
  let list = rows;
  if (!showAll && rows.length > 12) { const keep = new Set(rows.slice(0, 10).map((r) => r.entry)); if (myIdx >= 0) rows.slice(Math.max(0, myIdx - 1), myIdx + 2).forEach((r) => keep.add(r.entry)); list = rows.filter((r) => keep.has(r.entry)); }
  const arrow = (from, to) => (from && from !== to ? `<span class="${from > to ? 'up' : 'down'}" style="font-size:10px">${from > to ? '▲' : '▼'}${Math.abs(from - to)}</span>` : '<span class="mut" style="font-size:10px">–</span>');
  const mv = (r) => (live ? arrow(r.rank, r.lrank) : arrow(r.last_rank, r.rank));
  let prev = 0, idx = 0;
  const body = list.map((r) => { const pos = rows.indexOf(r) + 1; const gap = pos - prev > 1 && prev ? '<div class="st-gap">⋯</div>' : ''; prev = pos; const R = rk(r); const medal = R <= 3 ? `style="background:${['#FBBF24', '#CBD5E1', '#D97706'][R - 1]};color:#111"` : '';
    const res = live && h2h && r.lres ? `<i class="st-res ${r.lres}"></i>` : '';
    return `${gap}<div class="st-row ${r.entry === me ? 'me' : ''} ${r.entry === S.opp ? 'opp' : r.entry === S.nextOpp ? 'nopp' : ''}" style="--o:${idx++}" onclick="rvOpen(${r.entry})"><span class="st-rk" ${medal}>${R}</span><span class="st-mv">${mv(r)}</span><div class="st-tm"><b>${res}${esc(r.entry_name)}</b><small>${esc(r.player_name || '')}</small></div>${h2h
      ? `<span class="st-n num up">${live ? r.lw : r.matches_won}</span><span class="st-n num">${live ? r.ld : r.matches_drawn}</span><span class="st-n num down">${live ? r.ll : r.matches_lost}</span><span class="st-c num mut">${fmt(live ? r.lpf : r.points_for)}</span><b class="st-c num" style="color:var(--acc)">${live ? r.lpts : r.total}</b>`
      : `<span class="st-c num ${live ? 'lv' : 'mut'}">${live ? r.lgw : r.event_total ?? '—'}</span><b class="st-c num">${fmt(live ? r.ltot : r.total)}</b>`}</div>`; }).join('');
  const hd = h2h ? `<span class="st-n">${tt('فوز', 'W')}</span><span class="st-n">${tt('تعادل', 'D')}</span><span class="st-n">${tt('خسارة', 'L')}</span><span class="st-c">${tt('مجموع', 'PF')}</span><span class="st-c">${tt('نقاط', 'Pts')}</span>` : `<span class="st-c">${tt('الجولة', 'GW')}</span><span class="st-c">${tt('المجموع', 'Total')}</span>`;
  const tog = LT ? `<div class="st-tog"><button class="${live ? 'on' : ''}" onclick="rvLT(0)"><i class="dot"></i>${tt('مباشر', 'Live')}</button><button class="${live ? '' : 'on'}" onclick="rvLT(1)">${tt('رسمي', 'Official')}</button></div>` : `<span class="mut" style="font-size:12px">${off.length}${off.length >= 50 ? '+' : ''} ${tt('فريق', 'teams')}</span>`;
  const note = live ? `<p class="st-note">${h2h ? tt('النقاط والفوز والخسارة محسوبة من نتائج مواجهات هالجولة المباشرة', 'Includes live results of this GW’s matches') : tt('المجموع محسوب من نقاط الجولة المباشرة، والسهم يقارن بالترتيب الرسمي', 'Totals use live GW points; arrows vs official rank')}${!h2h && off.length >= 50 ? tt(' · أول 50 فريق', ' · top 50') : ''}</p>` : '';
  return `<div class="sec"><h2>${I('i-list')}${live ? tt('الترتيب المباشر', 'Live standings') : tt('الترتيب الحالي', 'Current standings')}</h2>${tog}</div>
   <div class="card st-card ${live ? 'is-live' : ''}"><div class="st-row st-head"><span class="st-rk">#</span><span class="st-mv"></span><div class="st-tm">${tt('الفريق', 'Team')}</div>${hd}</div>${body}
   ${rows.length > 12 ? `<button class="btn btn-g btn-b btn-sm" style="margin-top:8px" onclick="rvAll()">${showAll ? tt('عرض أقل', 'Show less') : tt(`عرض كل الترتيب (${rows.length})`, `Show all (${rows.length})`)}</button>` : ''}${note}</div>`;
}

/* ---------- الرسم ---------- */
function diffs(me, them, gw = S.gw) {
  const mm = new Map((me?.picks?.picks || []).map((p) => [p.element, p.multiplier])), tm = new Map((them?.picks?.picks || []).map((p) => [p.element, p.multiplier]));
  const ids = new Set([...mm.keys(), ...tm.keys()]); const mine = [], theirs = [];
  ids.forEach((id) => { const a = mm.get(id) || 0, b = tm.get(id) || 0; if (a > b) mine.push({ id, d: a - b }); else if (b > a) theirs.push({ id, d: b - a }); });
  const pts = (id) => lpts(id, gw);
  return { mine: mine.sort((x, y) => pts(y.id) * y.d - pts(x.id) * x.d), theirs: theirs.sort((x, y) => pts(y.id) * y.d - pts(x.id) * x.d) };
}
function threats(members, meE) {
  const me = members.find((m) => m.entry === meE), mine = new Set((me?.picks?.picks || []).filter((p) => p.multiplier > 0).map((p) => p.element));
  const others = members.filter((m) => m.entry !== meE && m.picks);
  const cnt = new Map(), capC = new Map();
  others.forEach((m) => m.picks.picks.forEach((p) => { if (p.multiplier > 0) { cnt.set(p.element, (cnt.get(p.element) || 0) + 1); if (p.multiplier >= 2) capC.set(p.element, (capC.get(p.element) || 0) + 1); } }));
  const n = Math.max(1, others.length);
  const th = [...cnt].filter(([id]) => !mine.has(id)).map(([id, c]) => ({ id, pct: Math.round((c / n) * 100), cap: capC.get(id) || 0 })).sort((a, b) => b.pct - a.pct).slice(0, 6);
  const op = [...mine].map((id) => ({ id, pct: Math.round(((cnt.get(id) || 0) / n) * 100) })).filter((x) => x.pct <= 30).sort((a, b) => a.pct - b.pct).slice(0, 6);
  return { th, op, n: others.length };
}
const chipTag = (c) => (c ? `<span class="tag" style="background:rgba(167,139,250,.18);color:var(--violet);font-size:10.5px">${CHIP[c] || c}</span>` : '');
function rivalCard(m, me, i) {
  const isMe = m.entry === ST.profile.teamId, cap = m.picks?.picks.find((p) => p.is_captain), capP = cap && PM(cap.element);
  const live = m.calc?.total ?? m.gwPts ?? null, gap = !isMe && me?.calc && m.calc ? m.calc.total - me.calc.total : null;
  const hit = m.picks?.entry_history?.event_transfers_cost || 0;
  return `<div class="rv-c ${isMe ? 'me' : ''} ${m.entry === S.opp ? 'opp' : m.entry === S.nextOpp ? 'nopp' : ''}" style="--d:${Math.min(i, 14) * 35}ms" onclick="rvOpen(${m.entry})">
   <div class="rv-rank">${m.rank ?? '—'}</div>
   <div style="flex:1;min-width:0"><div class="flex" style="gap:6px;flex-wrap:wrap;align-items:center"><b class="rv-name">${esc(m.name)}</b>${isMe ? `<span class="tag lime" style="font-size:10.5px">${tt('إنت', 'You')}</span>` : ''}${m.entry === S.opp ? `<span class="tag" style="background:rgba(239,68,68,.15);color:var(--bad);font-size:10.5px">${tt(`خصمك بالجولة ${S.gw}`, `Opponent GW${S.gw}`)}</span>` : ''}${m.entry === S.nextOpp ? `<span class="tag" style="background:rgba(251,146,60,.16);color:#FB923C;font-size:10.5px">${tt(`خصمك الجاي (ج${ST.G.next})`, `Next opponent (GW${ST.G.next})`)}</span>` : ''}${chipTag(m.picks?.active_chip)}</div>
    <div class="mut" style="font-size:12px;margin-top:2px">${capP ? `${I('i-crown', 'i', 'width:12px;height:12px;vertical-align:-2px;color:var(--gold)')} ${esc(capP.name)} (${lpts(capP.id) * (cap.multiplier || 2)})` : tt('التشكيلة تنكشف بعد الإغلاق', 'Hidden until deadline')}${!isMe && m.tr?.length ? ` · ${I('i-swap', 'i', 'width:12px;height:12px;vertical-align:-2px')} ${m.tr.length}${hit ? ` <span class="down">(−${hit})</span>` : ''}` : ''}</div>
    ${!isMe && m.tr?.length ? `<div class="rv-tr">${m.tr.slice(0, 3).map((x) => `<span class="mv" dir="ltr"><s class="mut">${esc(PM(x.element_out)?.name || '?')}</s><i class="mv-a">→</i><b class="up">${esc(PM(x.element_in)?.name || '?')}</b></span>`).join('')}</div>` : ''}</div>
   <div class="rv-pts"><b class="num">${live ?? '—'}</b><small>${tt('الجولة', 'GW')}</small>${gap != null ? `<span class="${gap > 0 ? 'down' : gap < 0 ? 'up' : 'mut'}" style="font-size:11px">${gap > 0 ? '+' + gap : gap}</span>` : ''}</div></div>`;
}


/* ---------- كل مباريات دوري الـ H2H لكل جولة ---------- */
async function loadMT(L, g, fresh = false) {
  const k = `${L.id}:${g}`; if (!fresh && MT[k]?.rows) return;
  MT[k] = { ...(MT[k] || {}), busy: true };
  try {
    let page = 1, rows = [], more = true;
    while (more && page <= 5) { const r = await FPL.loadH2HMatches(L.id, g, page, fresh); rows = rows.concat(r?.results || []); more = !!r?.has_next; page++; }
    MT[k] = { rows, at: Date.now() };
  } catch { MT[k] = { rows: MT[k]?.rows || null, err: true }; }
  if (ST.view === 'rivals' && sel?.id === L.id && mtGW === g) { const el = document.getElementById('rvMT'); if (el) morphHTML(el, matchesInner()); }
}
function matchesInner() {
  const L = sel, g = mtGW, k = `${L.id}:${g}`, d = MT[k];
  if (!d?.rows) { if (!d?.busy && !d?.err) loadMT(L, g); return d?.err ? `<div class="mut" style="text-align:center;padding:14px;font-size:12.5px">${tt('تعذّر جلب المباريات', 'Could not load matches')}</div>` : `<div class="aiload" style="padding:14px"><i></i><i></i><i></i></div>`; }
  const ev = ST.G.events.find((e) => e.id === g), live = isLiveGW(g), fin = !!ev?.fin, startedG = ev && new Date(ev.deadline) < new Date();
  const meE = ST.profile.teamId;
  // الجولة الحالية: نحسب النقاط بأنفسنا من النقاط المباشرة (ما ننتظر الفانتازي يحدّث المواجهات)
  const curOpen = g === S.gw && g === ST.G.cur && !fin;
  const pts = (e, raw) => { if (curOpen) { const m = S.members?.find((x) => x.entry === e); if (m?.calc && liveMap(g)) return m.calc.total; } return raw ?? 0; };
  if (!d.rows.length) return `<div class="mut" style="text-align:center;padding:14px;font-size:12.5px">${tt('ماكو مباريات بهاي الجولة', 'No matches this GW')}</div>`;
  const nameBtn = (e, nm, mg, side) => e ? `<button class="mt-t ${side}" onclick="rvOpenGW(${e},${g})"${!startedG ? ' disabled' : ''}><b>${esc(nm)}</b><small>${esc(mg || '')}</small></button>` : `<div class="mt-t ${side} bye"><b>${tt('راحة', 'BYE')}</b></div>`;
  const rows = d.rows.map((r) => {
    const a = r.entry_1_entry, b = r.entry_2_entry, mine = a === meE || b === meE;
    const pa = pts(a, r.entry_1_points), pb = pts(b, r.entry_2_points);
    const w = startedG && (fin || live || pa || pb) ? (pa > pb ? 1 : pb > pa ? 2 : 0) : -1;
    const mid = !startedG ? `<div class="mt-sc pend">${tt('لم تبدأ', 'TBD')}</div>` : `<div class="mt-sc${live || curOpen ? ' live' : ''}"><span class="${w === 1 ? 'w' : ''}" dir="ltr">${pa}</span><i>-</i><span class="${w === 2 ? 'w' : ''}" dir="ltr">${pb}</span></div>`;
    return `<div class="mt-row${mine ? ' me' : ''}${w === 1 ? ' w1' : w === 2 ? ' w2' : ''}">${nameBtn(a, r.entry_1_name, r.entry_1_player_name, 'r')}${mid}${nameBtn(b, r.entry_2_name, r.entry_2_player_name, 'l')}</div>`;
  }).join('');
  const note = live || curOpen ? `<div class="mt-note">${I('i-live', 'i', 'width:12px;height:12px')} ${tt('نقاط مباشرة — تتحدّث تلقائياً', 'Live points')}</div>` : !startedG ? `<div class="mt-note">${tt('القرعة فقط — التشكيلات تنكشف بعد الديدلاين', 'Pairings only')}</div>` : '';
  return note + rows;
}
const mtScroll = () => { const c = document.getElementById('rvMTgw'), b = c?.querySelector('button.on'); if (c && b) c.scrollLeft = b.offsetLeft - c.clientWidth / 2 + b.offsetWidth / 2; };
function matchesBlock() {
  const last = Math.max(...ST.G.events.map((e) => e.id));
  if (!mtGW || mtGW > last) mtGW = S.gw || ST.G.cur || 1;
  const chips = ST.G.events.map((e) => `<button class="${e.id === mtGW ? 'on' : ''}${e.id === S.gw ? ' cur' : ''}" onclick="rvMT(${e.id})">${e.id}</button>`).join('');
  setTimeout(mtScroll, 0);
  return `<div class="sec"><h2>${I('i-swords')}${tt('مباريات الدوري', 'League fixtures')}</h2><small class="mut">${tt('اضغط على أي اسم لتشكيلته', 'Tap a name for lineup')}</small></div>
   <div class="card mt-card"><div class="mt-gws" id="rvMTgw">${chips}</div><div id="rvMT">${matchesInner()}</div></div>`;
}

export function vRivals() {
  const Ls = leagues();
  if (!Ls.length) return `<div class="empty">${I('i-users', 'i', 'width:40px;height:40px')}<b>${tt('ما مشترك بأي دوري خاص', 'No private leagues')}</b></div>`;
  if (!sel) sel = Ls[0];
  // بدت جولة جديدة؟ نحدّث بيانات الجولة ونعيد التحميل حتى ينتقل الأحمر لخصمك الجديد
  const nx = ST.G.events.find((e) => e.id === ST.G.next);
  if (nx && new Date(nx.deadline) < new Date() && Date.now() - lastRefresh > 60e3) { lastRefresh = Date.now(); window.loadAll?.(true).then(() => { S = {}; if (ST.view === 'rivals') window.render(); }); }
  if (S.gw && S.gw !== ST.G.cur && !busy) S = {};
  if (!S.L || S.L.id !== sel.id) { if (!busy) load(sel); }
  const picker = `<div class="rv-lgs">${Ls.map((l) => `<button class="${sel.id === l.id ? 'on' : ''}" onclick="rvSel(${l.id},'${l.kind}')">${I(l.kind === 'h' ? 'i-swords' : 'i-trophy', 'i', 'width:14px;height:14px')}<span>${esc(l.name)}</span><small>${l.kind === 'h' ? 'H2H' : '#' + (l.rank ?? '—')}</small></button>`).join('')}</div>`;
  if (busy || !S.members) return picker + (S.err ? `<div class="card mut" style="margin-top:12px">${esc(S.err)}</div>` : `<div class="card aiload" style="margin-top:12px"><i></i><i></i><i></i><span>${tt('جارِ جلب تشكيلات منافسينك…', 'Fetching rivals’ teams…')}</span></div>`);
  const meE = ST.profile.teamId, me = S.members.find((m) => m.entry === meE), started = gwStarted();
  const T = threats(S.members, meE);
  let top = '';
  const curFin = !!ST.G.events.find((e) => e.id === S.gw)?.fin;
  if (sel.kind === 'h' && S.opp && !(curFin && S.nextOpp)) {
    const o = S.members.find((m) => m.entry === S.opp);
    if (o && me?.calc && o.calc) {
      const a = remainingXP(me), b = remainingXP(o), mu = me.calc.total + a.exp - (o.calc.total + b.exp), sd = Math.max(1.5, Math.sqrt((a.n + b.n) * 16));
      const pw = Math.round(Phi(mu / sd) * 100);
      top = `<div class="card rv-h2h"><div class="mut" style="font-size:12px;text-align:center">${tt(`مواجهتك بالجولة ${S.gw}`, `Your GW${S.gw} match`)}</div><div class="rv-vs"><div><b>${tt('إنت', 'You')}</b><span class="num big-num">${me.calc.total}</span></div><div class="rv-prob" style="--p:${pw}"><b>${pw}%</b><small>${tt('احتمال فوزك', 'Win chance')}</small></div><div><b>${esc(o.name)}</b><span class="num big-num">${o.calc.total}</span></div></div><div class="mut" style="font-size:11.5px;text-align:center">${tt(`متبقي متوقع: إنت +${a.exp.toFixed(1)} · هو +${b.exp.toFixed(1)}`, `Remaining xP: you +${a.exp.toFixed(1)} · them +${b.exp.toFixed(1)}`)}</div><button class="btn btn-g btn-b" style="margin-top:10px" onclick="rvOpen(${o.entry})">${I('i-pitch', 'i', 'width:16px;height:16px')}${tt('شوف تشكيلته والفروقات', 'See lineup & differentials')}</button></div>`;
    }
  }
  if (sel.kind === 'h' && S.nextOpp && !top) {
    const o = S.members.find((m) => m.entry === S.nextOpp);
    if (o) top = `<div class="card rv-h2h" style="border-color:rgba(251,146,60,.4)"><div class="mut" style="font-size:12px;text-align:center">${tt(`مواجهتك الجاية · الجولة ${ST.G.next}`, `Next match · GW${ST.G.next}`)}</div><div class="rv-vs"><div><b>${tt('إنت', 'You')}</b><span class="num big-num">${me?.rank ?? '—'}</span><small class="mut">${tt('ترتيبك', 'rank')}</small></div><div class="mut" style="font-size:20px;font-weight:700">VS</div><div><b>${esc(o.name)}</b><span class="num big-num">${o.rank ?? '—'}</span><small class="mut">${tt('ترتيبه', 'rank')} · <span class="up">${o.w ?? 0} ${tt('فوز', 'W')}</span> · ${o.dr ?? 0} ${tt('تعادل', 'D')} · <span class="down">${o.l ?? 0} ${tt('خسارة', 'L')}</span></small></div></div><div class="mut" style="font-size:11.5px;text-align:center">${tt('تشكيلته للجولة الجاية تنكشف بعد الإغلاق — هسة تگدر تشوف تشكيلته الحالية', 'Their next lineup appears after the deadline')}</div><button class="btn btn-g btn-b" style="margin-top:10px" onclick="rvOpen(${o.entry})">${I('i-pitch', 'i', 'width:16px;height:16px')}${tt('شوف تشكيلته الحالية', 'See current lineup')}</button></div>`;
  }
  if (sel.kind === 'c') top = S.sim ? `<div class="card"><b style="font-size:14px">${I('i-trophy', 'i', 'width:16px;height:16px;vertical-align:-3px;color:var(--gold)')} ${tt('نسبة الفوز بالدوري', 'Chance to win the league')}</b><span class="mut" style="font-size:11.5px"> · ${tt(`محاكاة ${S.sim.R} جولة متبقية`, `${S.sim.R} GWs simulated`)}</span>
     <div class="rv-sim">${S.sim.top.slice(0, 6).map((m) => `<div class="${m.entry === meE ? 'me' : ''}"><span>${esc(m.name)}</span><div class="dc-bar"><i style="width:${Math.max(2, m.win)}%;background:${m.entry === meE ? 'var(--acc)' : '#60A5FA'}"></i></div><b class="num">${m.win < 1 && m.win > 0 ? '<1' : Math.round(m.win)}%</b></div>`).join('')}</div>
     ${S.sim.top.some((m) => m.entry === meE) ? '' : `<div class="mut" style="font-size:12px;margin-top:6px">${tt('إنت بعيد عن الصدارة حالياً — الفرص الأكبر للي فوك', 'You are currently far from the top')}</div>`}</div>` : `<div class="card aiload"><i></i><i></i><i></i><span>${tt('جارِ حساب نسبة الفوز بالدوري…', 'Simulating the season…')}</span></div>`;
  const thr = started && T.n ? `<div class="grid g2" style="margin-top:10px"><div class="card"><b style="font-size:13.5px;color:var(--bad)">${I('i-alert', 'i', 'width:15px;height:15px;vertical-align:-3px')} ${tt('خطر عليك', 'Threats')}</b><div class="mut" style="font-size:11px;margin-bottom:6px">${tt('عند منافسينك وانت ما عندك', 'Owned by rivals, not you')}</div>${T.th.map((x) => `<div class="rv-own" onclick="openPlayer(${x.id})"><span>${esc(PM(x.id)?.name || '')}${x.cap ? ` ${I('i-crown', 'i', 'width:11px;height:11px;color:var(--gold)')}${x.cap}` : ''}</span><b class="num">${x.pct}%</b><small class="num">${lpts(x.id)}${tt('ن', 'p')}</small></div>`).join('') || '<p class="mut">—</p>'}</div>
     <div class="card"><b style="font-size:13.5px;color:var(--acc)">${I('i-sparkle', 'i', 'width:15px;height:15px;vertical-align:-3px')} ${tt('فرصتك', 'Your edge')}</b><div class="mut" style="font-size:11px;margin-bottom:6px">${tt('عندك وقليل منهم عنده', 'Yours, rarely owned')}</div>${T.op.map((x) => `<div class="rv-own" onclick="openPlayer(${x.id})"><span>${esc(PM(x.id)?.name || '')}</span><b class="num">${x.pct}%</b><small class="num">${lpts(x.id)}${tt('ن', 'p')}</small></div>`).join('') || '<p class="mut">—</p>'}</div></div>` : '';
  const list = [...S.members].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return picker + `<div style="margin-top:12px">${top}</div>${standings()}${sel.kind === 'h' ? matchesBlock() : ''}${thr}
   <div class="sec"><h2>${I('i-users')}${tt(`منافسينك بالجولة ${S.gw}`, `Rivals in GW${S.gw}`)}</h2><button class="icon-btn" onclick="rvReload(this)" aria-label="refresh">${I('i-refresh')}</button></div>
   ${!started ? `<div class="note">${I('i-info', 'i', 'color:var(--info)')}<span>${tt('تشكيلات وانتقالات الجولة الجاية تنكشف بعد الإغلاق — هسة تشوف تشكيلاتهم بالجولة الحالية.', 'Next GW picks appear after the deadline.')}</span></div>` : ''}
   <div class="rv-list">${list.map((m, i) => rivalCard(m, me, i)).join('')}</div>
   <p class="mut" style="font-size:11px;text-align:center;margin-top:10px">${sel.kind === 'c' ? tt('يعرض أول 10 بالدوري واللي حواليك. اضغط على أي فريق حتى تشوف تشكيلته كاملة والفروقات.', 'Shows top 10 and those around you. Tap a team for full lineup.') : tt('اضغط على أي فريق حتى تشوف تشكيلته كاملة والفروقات.', 'Tap a team for full lineup.')}</p>`;
}

async function lineupSheet(entry, gw = S.gw) {
  const meE = ST.profile.teamId;
  const need = (e) => !entryFor(e, gw);
  if (need(entry) || (entry !== meE && need(meE))) {
    const r = (S.table || []).find((x) => x.entry === entry);
    openSheet(`${sheetHead(I('i-users'), esc(r?.entry_name || ''))}<div class="aiload"><i></i><i></i><i></i><span>${t('loading')}</span></div>`);
    const L = await liveFor(gw).catch(() => null);
    const load = async (e) => {
      const rr = (S.table || []).find((x) => x.entry === e) || {};
      const m = { entry: e, name: rr.entry_name || (e === meE ? ST.E.entry.name : '#' + e), mgr: rr.player_name, rank: rr.rank, total: rr.total };
      try { m.picks = await FPL.fetchPicks(e, gw); m.calc = liveCalc(m.picks, gw, undefined, L); } catch { m.picks = null; }
      try { const tr = await FPL.fetchTransfers(e); m.tr = (Array.isArray(tr) ? tr : []).filter((x) => x.event === gw); } catch { m.tr = []; }
      if (gw === S.gw) (S.extra = S.extra || {})[e] = m; else (XG[gw] = XG[gw] || {})[e] = m;
    };
    await Promise.all([entry, meE].filter((e, k, a) => a.indexOf(e) === k && need(e)).map(load));
  }
  openEntry = entry; openGW = gw;
  openSheet(`<div id="rvSheet">${sheetBody(entry, gw)}</div>`);
  rvSheetLoop(); rvCount();
  if (isLiveGW(gw)) liveFor(gw, true).then(() => { [entry, meE].forEach((e) => recalcGW(entryFor(e, gw), gw)); if (gw === S.gw) S.members.forEach(recalc); const el = document.getElementById('rvSheet'); if (el && openEntry === entry) morphHTML(el, sheetBody(entry, gw)); }).catch(() => {});
}
/* الأرقام الكبيرة تعدّ لفوك أول ما تنفتح الورقة */
function rvCount() { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; document.querySelectorAll('#rvSheet .rv3-cnt').forEach((el) => { const v = +el.dataset.v; if (!v) return; const t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(v * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }); }
const recalcGW = (m, gw) => { if (m?.picks) m.calc = liveCalc(m.picks, gw, undefined, liveMap(gw)); };

/* ---------- سجل المواجهات المباشرة بيني وبين مدرب ---------- */
const H2 = {};
const h2Key = (entry) => `${sel?.id}:${entry}`;
async function loadH2(entry) {
  const k = h2Key(entry); if (H2[k]) return;
  H2[k] = { busy: true };
  const meE = ST.profile.teamId, cur = ST.G.cur, L = sel, list = [];
  try {
    if (L.kind === 'h') {
      const gws = Array.from({ length: cur }, (_, i) => i + 1);
      await pool(gws, 5, async (g) => { await loadMT(L, g); });
      gws.forEach((g) => (MT[`${L.id}:${g}`]?.rows || []).forEach((r) => {
        const a = r.entry_1_entry, b = r.entry_2_entry;
        if ((a === meE && b === entry) || (a === entry && b === meE)) list.push({ gw: g, me: a === meE ? r.entry_1_points : r.entry_2_points, him: a === meE ? r.entry_2_points : r.entry_1_points });
      }));
    } else {
      const hh = await FPL.fetchHistory(entry);
      const net = (x) => (x.points || 0) - (x.event_transfers_cost || 0);
      const mine = Object.fromEntries((ST.E.hist.current || []).map((x) => [x.event, net(x)]));
      (hh.current || []).forEach((x) => { if (mine[x.event] != null && x.event <= cur) list.push({ gw: x.event, me: mine[x.event], him: net(x) }); });
    }
    H2[k] = { list: list.sort((a, b) => a.gw - b.gw), kind: L.kind };
  } catch { H2[k] = { err: true }; setTimeout(() => delete H2[k], 15e3); }
  const el = document.getElementById('rvH2'); if (el && +el.dataset.e === entry) morphHTML(el, h2Inner(entry));
}
function h2Inner(entry) {
  const d = H2[h2Key(entry)];
  if (!d || d.busy) { if (!d) loadH2(entry); return `<div class="aiload" style="padding:10px"><i></i><i></i><i></i></div>`; }
  if (d.err) return `<p class="mc-none" style="text-align:center">${tt('تعذّر جلب المواجهات', 'Could not load')}</p>`;
  const meE = ST.profile.teamId, cur = ST.G.cur, evc = ST.G.events.find((e) => e.id === cur), open = evc && !evc.fin;
  // الجولة الحالية إذا بعدها ما خلصت: نقاط مباشرة وما تنحسب بالسجل
  const rows = d.list.map((x) => { if (x.gw === cur && open) { const a = entryFor(meE, cur), b = entryFor(entry, cur); return { ...x, me: a?.calc?.total ?? x.me, him: b?.calc?.total ?? x.him, live: true }; } return x; });
  const done = rows.filter((x) => !x.live), w = done.filter((x) => x.me > x.him).length, l = done.filter((x) => x.me < x.him).length, dr = done.length - w - l;
  const pf = done.reduce((a, x) => a + x.me, 0), pa = done.reduce((a, x) => a + x.him, 0);
  const title = d.kind === 'h' ? tt('مواجهاتك المباشرة وياه', 'Your head-to-head') : tt('أنت ضده جولة بجولة', 'You vs him, GW by GW');
  if (!rows.length) return `<div class="h2-head"><b>${title}</b></div><p class="mc-none" style="text-align:center">${tt('ما تواجهتوا بعد بهذا الدوري', 'No meetings yet')}</p>`;
  return `<div class="h2-head"><b>${title}</b><small>${done.length} ${d.kind === 'h' ? tt('مواجهة', 'matches') : tt('جولة', 'GWs')}</small></div>
    <div class="h2-wdl"><div class="w"><b class="num">${w}</b><span>${tt('فزت', 'Won')}</span></div><div class="d"><b class="num">${dr}</b><span>${tt('تعادل', 'Drawn')}</span></div><div class="l"><b class="num">${l}</b><span>${tt('خسرت', 'Lost')}</span></div></div>
    <div class="h2-bar">${w ? `<i class="w" style="flex:${w}"></i>` : ''}${dr ? `<i class="d" style="flex:${dr}"></i>` : ''}${l ? `<i class="l" style="flex:${l}"></i>` : ''}</div>
    <div class="h2-sum"><span>${tt('مجموع نقاطك', 'Your points')} <b class="num">${pf}</b></span><span>${tt('مجموع نقاطه', 'His points')} <b class="num">${pa}</b></span></div>
    <details class="h2-det"><summary>${tt('نتائج المواجهات', 'Match results')}</summary>
      ${rows.slice().reverse().map((x) => { const r = x.live ? 'live' : x.me > x.him ? 'w' : x.me < x.him ? 'l' : 'd'; return `<button class="h2-row" onclick="rvOpenGW(${entry},${x.gw})"><span class="g">${tt('الجولة', 'GW')} ${x.gw}</span><span class="h2-sc"><b class="${x.me > x.him ? 'on' : ''}">${x.me}</b><i>-</i><b class="${x.him > x.me ? 'on' : ''}">${x.him}</b></span><em class="${r}">${r === 'live' ? tt('جارية', 'Live') : r === 'w' ? tt('فوز', 'W') : r === 'l' ? tt('خسارة', 'L') : tt('تعادل', 'D')}</em></button>`; }).join('')}
      <p class="mc-none" style="font-size:10.5px;text-align:center;margin-top:6px">${tt('الرقم اليمين نقاطك واليسار نقاطه · اضغط على أي جولة لتشكيلته بيها', 'First: you, second: him · tap a GW for his lineup')}${d.kind !== 'h' ? tt(' · الدوري مو مواجهات، فالمقارنة بنقاط كل جولة بعد الخصم', ' · classic league: compared by net GW points') : ''}</p>
    </details>`;
}
/* ورقة الخصم — صفحة وحدة بدون تبويبات:
   مواجهة (انت ضده بأرقام متحركة) ← مواجهة الكباتن ← سطر الكرت والانتقالات ← الملعب (المشتركين باهتين لأن نقاطهم تلغي بعض،
   والمختلفين واضحين بلون: لاعبينه أحمر/لاعبينك أخضر) ← الدكة ← ميزان الفروقات ← سجل المواجهات.
   أي لاعب زادت نقاطه من آخر تحديث يطلع فوكه «+N» يطفو. */
const RVPREV = {};
function sheetBody(entry, gw = S.gw) {
  const m = entryFor(entry, gw); if (!m) return '';
  const meE = ST.profile.teamId, me = entryFor(meE, gw), isMe = entry === meE, live = isLiveGW(gw);
  const init = (x) => (x || '?').trim().slice(0, 1).toUpperCase();
  const head = `<div class="rv3-top"><span class="rv3-gw">${tt('الجولة', 'GW')} ${gw}${m.rank ? ` · ${tt('المركز', 'Rank')} <bdi dir="ltr">#${m.rank}</bdi>` : ''}</span>${live ? `<span class="rv3-live"><i></i>${tt('مباشر', 'Live')}</span>` : ''}<button class="icon-btn" onclick="closeSheet()" aria-label="close">${I('i-x')}</button></div>`;
  const h2Block = !isMe && sel ? `<section class="rv3-sec"><div class="card h2-card" id="rvH2" data-e="${entry}">${h2Inner(entry)}</div></section>` : '';
  if (!m.picks) return head + `<div class="rv3-duel solo"><div class="rv3-p him"><span class="av">${esc(init(m.name))}</span><b>${esc(m.name)}</b><small>${esc(m.mgr || '')}</small></div></div>` + h2Block + `<div class="note">${I('i-info')}<span>${tt('التشكيلة تنكشف بعد الإغلاق', 'Lineup hidden until deadline')}</span></div>`;
  const rows = m.calc?.rows || [], R = (id) => rows.find((r) => r.id === id);
  const ps = [...m.picks.picks].sort((a, b) => a.position - b.position), mine = new Set((me?.picks?.picks || []).map((p) => p.element));
  const hit = m.picks.entry_history?.event_transfers_cost || 0, gap = !isMe && me?.calc && m.calc ? (me.calc.total || 0) - (m.calc.total || 0) : null;
  const fxOf = (q) => (ST.G.fx[gw] || []).filter((f) => f.h === q.team || f.a === q.team);
  const left = (c) => (c?.rows || []).filter((r) => r.m > 0 && fxOf(PM(r.id) || {}).some((f) => !f.started)).length;
  const now = (c) => (c?.rows || []).filter((r) => r.m > 0 && fxOf(PM(r.id) || {}).some((f) => f.started && !f.fin)).length;
  // ---- المواجهة
  const P = (who, c, cls, sub) => `<div class="rv3-p ${cls}"><span class="av">${esc(init(who))}</span><b>${esc(who)}</b><small>${sub}</small><strong class="num rv3-cnt" data-v="${c?.total ?? 0}">${c?.total ?? '—'}</strong>${c?.hit ? `<em><s class="num">${c.raw}</s> −${c.hit}</em>` : ''}
    ${live ? `<span class="rv3-left"><i class="on"></i>${tt('يلعب', 'On')} <bdi class="num">${now(c)}</bdi><i></i>${tt('باقي', 'Left')} <bdi class="num">${left(c)}</bdi></span>` : ''}</div>`;
  const my = me?.calc?.total || 0, hs = m.calc?.total || 0, share = my + hs ? Math.round((my / (my + hs)) * 100) : 50;
  const duel = isMe ? `<div class="rv3-duel solo">${P(m.name, m.calc, 'me', esc(m.mgr || ''))}</div>` : `<div class="rv3-duel">
      ${P(ST.E.entry.name || tt('انت', 'You'), me?.calc, 'me', tt('انت', 'You'))}
      <div class="rv3-vs ${gap > 0 ? 'up' : gap < 0 ? 'dn' : ''}"><span>${tt('ضد', 'VS')}</span><b class="num">${gap == null ? '—' : gap === 0 ? '0' : (gap > 0 ? '+' : '−') + Math.abs(gap)}</b><small>${gap > 0 ? tt('متقدم', 'Ahead') : gap < 0 ? tt('متأخر', 'Behind') : tt('متعادلين', 'Level')}</small></div>
      ${P(m.name, m.calc, 'him', esc(m.mgr || ''))}
      <div class="rv3-meter"><i style="--w:${share}%"></i><span style="--w:${share}%"></span></div></div>`;
  // ---- مواجهة الكباتن (معلومة جديدة)
  const capOf = (x, c) => { const p = (x?.picks?.picks || []).find((q) => q.is_captain); if (!p) return null; const r = (c?.rows || []).find((q) => q.id === p.element); const mult = r ? r.m : p.multiplier; const raw = r?.pts ?? lpts(p.element, gw); return { q: PM(p.element), pts: raw * Math.max(mult, 1), mult: Math.max(mult, 1), same: false }; };
  const cm = !isMe ? capOf(me, me?.calc) : null, ch = capOf(m, m.calc);
  const capBox = (c, cls, lbl) => (c?.q ? `<div class="rv3-cap ${cls}"><span class="sh">${pShirt(c.q)}<i>${c.mult === 3 ? '3×' : 'C'}</i></span><div><small>${lbl}</small><b>${esc(c.q.name)}</b></div><strong class="num">${c.pts}</strong></div>` : '');
  const caps = !isMe && cm && ch ? `<section class="rv3-sec"><h5>${I('i-crown')}${tt('مواجهة الكباتن', 'Captain duel')}${cm.q.id === ch.q.id ? `<small>${tt('نفس الكابتن — تلغي بعض', 'Same captain — cancels out')}</small>` : ''}</h5><div class="rv3-caps">${capBox(cm, 'me', tt('كابتنك', 'Yours'))}${capBox(ch, 'him', tt('كابتنه', 'His'))}</div></section>` : '';
  // ---- الكرت والانتقالات
  const chip = m.picks.active_chip ? CHIP[m.picks.active_chip] || m.picks.active_chip : '';
  const meta = chip ? `<div class="rv3-meta">${chip ? `<span class="chip">${I('i-bolt')}${chip}</span>` : ''}</div>` : ''; // الخصم ينعرض بقسم الانتقالات بس
  // ---- انتقالاته بالجولة
  const trP = (id) => { const r = R(id); return r ? r.pts : lpts(id, gw); };
  const trs = m.tr || [];
  const trSide = (id, cls, lbl) => { const q = PM(id); return `<div class="side ${cls}"><span class="sh">${q ? pShirt(q) : ''}</span><div><small>${lbl}</small><b>${esc(q?.name || '?')}</b></div><strong class="num">${trP(id) ?? 0}</strong></div>`; };
  const trHTML = `<section class="rv3-sec"><h5>${I('i-swap')}${isMe ? tt('انتقالاتك بالجولة', 'Your transfers') : tt('انتقالاته بالجولة', 'His transfers')}${hit ? `<small class="dn">${tt('خصم', 'Hit')} <bdi class="num">−${hit}</bdi></small>` : ''}</h5>
    ${trs.length ? `<div class="rv3-trs">${trs.map((x, i) => `<div class="rv3-tr" style="--d:${i * 70}ms">${trSide(x.element_in, 'in', tt('اشترى', 'Bought'))}<span class="ar">${I('i-swap')}</span>${trSide(x.element_out, 'out', tt('باع', 'Sold'))}</div>`).join('')}</div>` : `<p class="rv3-none">${m.picks.active_chip === 'freehit' || m.picks.active_chip === 'wildcard' ? tt('لعب الكرت وغيّر فريقه', 'Played a chip') : tt('ما سوى انتقالات بهالجولة', 'No transfers this GW')}</p>`}</section>`;
  // ---- الملعب
  const prev = RVPREV[`${entry}:${gw}`] || {}, nextPrev = {};
  const card = (p, bench) => {
    const q = PM(p.element); if (!q) return '';
    const r = R(p.element), mult = r ? r.m : p.multiplier, raw = r?.pts ?? lpts(p.element, gw), pts = mult > 0 ? raw * mult : raw;
    const diff = !isMe && !mine.has(p.element), counted = mult > 0, fx = fxOf(q), playing = fx.some((f) => f.started && !f.fin), waiting = fx.length && fx.every((f) => !f.started);
    nextPrev[p.element] = pts; const d = prev[p.element] != null ? pts - prev[p.element] : 0;
    return `<button class="rv3-pl${diff ? ' diff' : !isMe ? ' same' : ''}${r?.subOut ? ' out' : ''}${bench && !counted ? ' benched' : ''}${playing ? ' live' : ''}" onclick="closeSheet();setTimeout(()=>playerGW(${q.id},${gw},${Math.max(1, mult)}),200)">
      ${d > 0 ? `<i class="rv3-bump">+${d}</i>` : ''}
      <span class="rv3-sh">${pShirt(q)}${p.is_captain ? `<i class="b c">${mult === 3 ? '3×' : 'C'}</i>` : p.is_vice_captain ? '<i class="b v">V</i>' : ''}${r?.subIn ? '<i class="b in">↑</i>' : r?.subOut ? '<i class="b ob">↓</i>' : ''}</span>
      <span class="rv3-tag"><span class="nm">${esc(q.name)}</span><span class="pt${p.is_captain && counted ? ' cap' : ''}">${waiting && !raw ? `<small>${fx[0]?.ko ? new Date(fx[0].ko).toLocaleString(document.dir === 'ltr' ? 'en-GB' : 'ar-IQ', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</small>` : pts}</span></span></button>`;
  };
  const xi = ps.filter((p) => p.position <= 11), bench = ps.filter((p) => p.position > 11);
  const lines = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => xi.filter((p) => PM(p.element)?.pos === pos)).filter((l) => l.length); // نفس فريقي: الحارس فوك والمهاجمين تحت
  const pitch = `<section class="rv3-sec"><div class="rv3-pitch">
      <div class="rv3-turf"><svg viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".3"><rect x="2.5" y="2.5" width="63" height="95" rx="1"/><line x1="2.5" y1="50" x2="65.5" y2="50"/><circle cx="34" cy="50" r="8.5"/><circle cx="34" cy="50" r=".6" fill="rgba(255,255,255,.4)"/><rect x="16" y="2.5" width="36" height="14"/><rect x="16" y="83.5" width="36" height="14"/><rect x="26" y="2.5" width="16" height="5"/><rect x="26" y="92.5" width="16" height="5"/><path d="M28 16.5a6 6 0 0 0 12 0M28 83.5a6 6 0 0 1 12 0"/></g></svg></div>
      ${lines.map((l) => `<div class="rv3-row">${l.map((p) => card(p)).join('')}</div>`).join('')}</div>
    <div class="rv3-bench"><span>${tt('الدكة', 'Bench')}</span><div class="rv3-row">${bench.map((p) => card(p, true)).join('')}</div></div>
    ${!isMe ? `<div class="rv3-legend"><span><i class="k diff"></i>${tt('مو عندك (يفرق بالنتيجة)', 'Not in your team')}</span><span><i class="k same"></i>${tt('مشترك (يلغي بعض)', 'Shared')}</span><span><i class="k live"></i>${tt('يلعب هسة', 'Playing')}</span></div>` : ''}</section>`;
  RVPREV[`${entry}:${gw}`] = nextPrev;
  // ---- ميزان الفروقات
  let difHTML = '';
  if (!isMe) {
    const D = diffs(me, m, gw), sum = (L) => L.reduce((a, x) => a + lpts(x.id, gw) * x.d, 0), st = sum(D.theirs), sm = sum(D.mine);
    const li = (x, cls) => { const q = PM(x.id); return q ? `<button class="rv3-own" onclick="closeSheet();setTimeout(()=>openPlayer(${q.id}),200)"><span class="mini-sh">${pShirt(q)}</span><span class="n">${esc(q.name)}${x.d > 1 ? ` <small>×${x.d}</small>` : ''}</span><b class="num ${cls}">${lpts(x.id, gw) * x.d}</b></button>` : ''; };
    difHTML = `<section class="rv3-sec"><h5>${I('i-scale')}${tt('ميزان الفروقات', 'Differentials balance')}</h5>
      <div class="rv3-bal"><div class="s up"><b class="num">${sm}</b><small>${tt('عندك وما عنده', 'Only you')}</small></div><div class="bar"><i class="m" style="flex:${sm || 0.0001}"></i><i class="t" style="flex:${st || 0.0001}"></i></div><div class="s dn"><b class="num">${st}</b><small>${tt('عنده وما عندك', 'Only him')}</small></div></div>
      <div class="rv3-dif"><div>${D.mine.map((x) => li(x, 'up')).join('') || '<p class="mut">—</p>'}</div><div>${D.theirs.map((x) => li(x, 'dn')).join('') || '<p class="mut">—</p>'}</div></div></section>`;
  }
  return head + duel + caps + meta + trHTML + pitch + difHTML + h2Block + (live ? `<p class="rv3-foot"><i></i>${tt('النقاط تتحدث كل 4 ثواني وقت المباريات', 'Points update every 4s during matches')}</p>` : '');
}
/* تحديث ورقة الخصم: كل 4 ثواني إذا أكو مباراة تنلعب والورقة مفتوحة، وإلا كل 30 ثانية */
let rvSheetT = null;
function rvSheetLoop() {
  clearTimeout(rvSheetT);
  const el = document.getElementById('rvSheet'); if (!el || !openEntry) return;
  const gw = openGW, fx = ST.G.fx[gw] || [], matchOn = fx.some((f) => f.started && !f.fin);
  rvSheetT = setTimeout(async () => {
    if (!document.getElementById('rvSheet')) return;
    if (!document.hidden && isLiveGW(gw)) {
      try { await Promise.all([liveFor(gw, true), matchOn ? refreshFx(gw) : null]); } catch {}
      [openEntry, ST.profile.teamId].forEach((e) => recalcGW(entryFor(e, gw), gw));
      const s2 = document.getElementById('rvSheet'); if (s2) morphHTML(s2, sheetBody(openEntry, gw));
    }
    rvSheetLoop();
  }, matchOn ? 4000 : 30000);
}
Object.assign(window, {
  rvSel: (id, kind) => { sel = leagues().find((l) => l.id === id && l.kind === kind) || sel; S = {}; mtGW = null; window.render(); },
  rvReload: (b) => { b?.classList.add('spin'); S = {}; window.render(); },
  rvOpen: (e) => lineupSheet(e),
  rvOpenGW: (e, g) => lineupSheet(e, g),
  rvMT: (g) => { mtGW = g; const c = document.getElementById('rvMTgw'); if (c) c.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.textContent === g)); const el = document.getElementById('rvMT'); if (el) morphHTML(el, matchesInner()); mtScroll(); },
  rvAll: () => { showAll = !showAll; window.render(); },
  rvLT: (v) => { ltOfficial = !!v; window.render(); },
});
