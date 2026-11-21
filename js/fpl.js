/* =========================================================
   طبقة البيانات: جلب بيانات الفانتازي الرسمية عبر /api/fpl
   - كاش بالذاكرة + localStorage لعرض آخر نسخة إذا الشبكة فشلت
   - كل استجابة تسجّل وقت آخر تحديث
========================================================= */
import { LS } from './ui.js';
import { simWrap, simOn } from './livesim.js';
/* الترتيب والنقاط: سريع وقت المباريات وكل ساعة إذا ماكو مباراة (التطبيق يحدد الحالة بـ setMatchNow) */
let MATCH_NOW = () => null;
export const setMatchNow = (f) => { MATCH_NOW = f; };
const rt = (fast) => (MATCH_NOW() === false ? 3600 : fast);
const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const mem = new Map();
export const lastUpdated = {};

/** وضع «الفانتازي يتحدث»: نعرض آخر بيانات محفوظة بدل ما يوكف التطبيق */
export const staleState = { on: false, since: 0 };
const markStale = (on) => { if (on && !staleState.on) staleState.since = Date.now(); staleState.on = on; };
// محاكاة المباراة (?livesim=1): البيانات تمر عليها قبل ما توصل للتطبيق، وبدونها ما يتغير شي
async function get(path, params = {}, opts = {}) {
  const d = await getRaw(path, params, opts);
  return simOn() ? simWrap(path, params, d) : d;
}
async function getRaw(path, params = {}, { ttl = 0, fresh = false } = {}) {
  const qs = new URLSearchParams({ path, ...params, ...(fresh ? { fresh: '1' } : {}) }).toString();
  const key = qs.replace('&fresh=1', '');
  const hit = mem.get(key);
  if (!fresh && hit && Date.now() - hit.t < ttl * 1000) return expand(hit.d);
  // بيانات اللاعبين العامة: إذا التطبيق انفتح خلال 5 دقايق من آخر جلب ناخذها من التلفون بدون طلب
  if (!fresh && !hit && path === 'bootstrap-static/') {
    const c = LS.get('fpc_' + key);
    if (c && c.d && Date.now() - c.t < Math.min(ttl, 300) * 1000) { mem.set(key, c); lastUpdated[path] = c.t; return c.d; }
  }
  const fallback = (err) => {
    const cached = hit ? { t: hit.t, d: hit.d } : LS.get('fpc_' + key);
    if (cached) { lastUpdated[path] = cached.t; markStale(true); return expand(cached.d); }
    throw err;
  };
  let res;
  // إذا عندنا نسخة: نرسل بصمتها، والسيرفر يرجّع 304 (بدون بيانات) إذا ما تغيّر شي
  const prev = hit || LS.get('fpc_' + key);
  try { res = await fetch('/api/fpl?' + qs, prev?.e ? { headers: { 'If-None-Match': prev.e }, cache: 'no-store' } : undefined); }
  catch { return fallback(new Error('تعذّر الاتصال بالسيرفر — تأكد من الإنترنت')); }
  if (res.status === 304 && !prev?.d) { try { res = await fetch('/api/fpl?' + qs, { cache: 'no-store' }); } catch { return fallback(new Error('تعذّر الاتصال بالسيرفر — تأكد من الإنترنت')); } }
  if (res.status === 304 && prev?.d) {
    const now = Date.now(); mem.set(key, { t: now, d: prev.d, e: prev.e }); lastUpdated[path] = now; markStale(false);
    return expand(prev.d);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data == null) {
    if (res.status === 404) throw Object.assign(new Error(data?.error || 'غير موجود'), { status: 404 });
    return fallback(Object.assign(new Error(data?.error || 'خطأ ' + res.status), { status: res.status }));
  }
  const stale = res.headers.get('X-FP-Stale') === '1';
  if (stale) markStale(true);
  const now = Date.now();
  const etag = stale ? null : res.headers.get('ETag');
  mem.set(key, { t: stale ? now - ttl * 1000 : now, d: data, e: etag }); lastUpdated[path] = now;
  if (path === 'bootstrap-static/' && Array.isArray(data.elements)) ALL_IDS = data.elements.map((e) => e.id);
  if (!stale) { const str = JSON.stringify(data); if (str.length < (path === 'bootstrap-static/' ? 2500000 : 400000)) { try { localStorage.setItem('fpc_' + key, JSON.stringify({ t: now, d: data, e: etag })); } catch { pruneLS(); } } }
  return expand(data);
}
/* المباشر المخفف: السيرفر يرسل بس اللاعبين اللي عندهم أرقام، وهنا نرجّع الباقين أصفار حتى كل الأقسام تشتغل مثل قبل */
let ALL_IDS = null;
function expand(d) {
  if (!d || !d.slim || !Array.isArray(d.elements)) return d;
  if (!ALL_IDS) { const b = mem.get(new URLSearchParams({ path: 'bootstrap-static/' }).toString()); if (b?.d?.elements) ALL_IDS = b.d.elements.map((e) => e.id); }
  const have = new Set(d.elements.map((e) => e.id)), out = d.elements.slice();
  if (ALL_IDS) for (const id of ALL_IDS) if (!have.has(id)) out.push({ id, stats: { ...d.zero }, explain: [] });
  return { elements: out.sort((a, b) => a.id - b.id) };
}
function pruneLS() { try { Object.keys(localStorage).filter((k) => k.startsWith('fpc_') && !k.includes('bootstrap')).forEach((k) => localStorage.removeItem(k)); } catch {} }
export const clearStale = () => markStale(false);


/* حالة المباراة ما ترجع لورا: إذا وصلت نسخة أقدم (مثلاً من الكاش وفيها الدقيقة 45)، نبقي على الأحدث (دقيقة أكبر / بدت / خلصت) */
const FXB = new Map();
export function fxBest(o) {
  if (!o || o.id == null) return o;
  const rank = (x) => (x.fin ? 1e6 : 0) + (x.started ? 1e3 : 0) + (x.min || 0), b = FXB.get(o.id);
  if (b && rank(b) > rank(o)) return { ...o, fin: b.fin, started: b.started, hs: b.hs, as: b.as, min: b.min, stats: b.stats?.length ? b.stats : o.stats };
  FXB.set(o.id, { fin: o.fin, started: o.started, hs: o.hs, as: o.as, min: o.min, stats: o.stats });
  return o;
}
/* النتائج السريعة من ESPN: الفانتازي يتأخر دقايق بتحديث الأهداف ونهاية المباراة، فندمج نتيجة ESPN فوقه */
const ymdUTC = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
let SC = { k: '', t: 0, d: [] };
export async function loadScores(fxs) {
  const now = Date.now(), act = (fxs || []).filter((f) => f.ko && !f.fin && new Date(f.ko) - now < 10 * 60e3 && now - new Date(f.ko) < 5 * 3600e3);
  if (!act.length) return [];
  const days = [...new Set(act.flatMap((f) => { const k = new Date(f.ko); return [ymdUTC(new Date(k - 5 * 3600e3)), ymdUTC(k)]; }))].slice(0, 3).join(',');
  if (SC.k === days && now - SC.t < 3000) return SC.d;
  try { const r = await fetch('/api/lineups?scores=' + days); const d = r.ok ? await r.json() : null; if (Array.isArray(d)) SC = { k: days, t: now, d }; } catch {}
  return SC.k === days ? SC.d : [];
}
export function espnMerge(fxs, sc, teams) {
  if (!sc?.length) return fxs;
  const sh = (id) => teams?.[id]?.short;
  return fxs.map((f) => {
    if (!f.ko) return f;
    const H = sh(f.h), A = sh(f.a), ko = new Date(f.ko);
    const e = sc.find((x) => x.h === H && x.a === A && Math.abs(new Date(x.ko) - ko) < 6 * 3600e3) || sc.find((x) => (x.h === H || x.a === A) && Math.abs(new Date(x.ko) - ko) < 3 * 3600e3);
    if (!e || e.st === 'pre') return f;
    const o = { ...f, started: true, ht: !e.done && e.ht };
    if (!f.fin && e.hs != null && e.as != null) { o.hs = e.hs; o.as = e.as; }
    if (e.done) { o.fin = true; o.min = Math.max(f.min || 0, 90); }
    else if (!f.fin && e.min != null) o.min = Math.max(f.min || 0, e.min);
    return fxBest(o);
  });
}
export async function loadGame(fresh = false) {
  const [b, f] = await Promise.all([get('bootstrap-static/', {}, { ttl: 900, fresh }), get('fixtures/', {}, { ttl: 1800, fresh })]);
  const teams = {};
  b.teams.forEach((t) => (teams[t.id] = { id: t.id, name: t.name, short: t.short_name, str: t.strength, sh: t.strength_overall_home, sa: t.strength_overall_away }));
  const players = b.elements.filter((e) => POS[e.element_type]).map((e) => ({
    id: e.id, code: e.code, name: e.web_name, full: `${e.first_name} ${e.second_name}`.trim(), team: e.team, pos: POS[e.element_type],
    price: e.now_cost / 10, form: +e.form || 0, ppg: +e.points_per_game || 0, ep: e.ep_next != null ? +e.ep_next : null,
    total: e.total_points, own: +e.selected_by_percent || 0, st: e.status, chance: e.chance_of_playing_next_round, news: e.news || '',
    gls: e.goals_scored, ast: e.assists, cs: e.clean_sheets, min: e.minutes, starts: e.starts ?? null, yc: e.yellow_cards, rc: e.red_cards, og: e.own_goals || 0, pm: e.penalties_missed || 0, ps: e.penalties_saved || 0,
    saves: e.saves, bonus: e.bonus, bps: e.bps, gc: e.goals_conceded, xg: +e.expected_goals || 0, xa: +e.expected_assists || 0,
    xgi: +e.expected_goal_involvements || 0, ict: +e.ict_index || 0, threat: +e.threat || 0, creativity: +e.creativity || 0,
    cc: (e.cost_change_event || 0) / 10, ccs: (e.cost_change_start || 0) / 10, tin: e.transfers_in_event || 0, tout: e.transfers_out_event || 0,
    pcp: e.price_change_percent != null && e.price_change_percent !== '' && !isNaN(+e.price_change_percent) ? +e.price_change_percent : null,
    pcRate: e.price_change_hourly_rate != null ? +e.price_change_hourly_rate : null,
    pcProj: Array.isArray(e.price_change_projections) ? e.price_change_projections.map((x) => ({ o: +x.offset, pct: +x.projected_percent, lik: +x.likelihood })).sort((a, b) => a.o - b.o) : null,
    pcLock: e.price_change_locked_until || null, pcCal: !!e.price_change_calibrating,
    dc: e.defensive_contribution || 0, dc90: +e.defensive_contribution_per_90 || 0, pen: e.penalties_order ?? null, cor: e.corners_and_indirect_freekicks_order ?? null, dfk: e.direct_freekicks_order ?? null,
  }));
  const events = b.events.map((e) => ({ id: e.id, deadline: e.deadline_time, cur: e.is_current, next: e.is_next, fin: e.finished, checked: e.data_checked,
    avg: e.average_entry_score, top: e.highest_score, topEl: e.top_element, cap: e.most_captained, chipPlays: e.chip_plays || [] }));
  const cur = events.find((e) => e.cur), nxt = events.find((e) => e.next);
  const fx = {}, fxList = [];
  f.forEach((x) => {
    const o = fxBest({ id: x.id, ev: x.event, h: x.team_h, a: x.team_a, hd: x.team_h_difficulty, ad: x.team_a_difficulty, ko: x.kickoff_time, fin: !!(x.finished || (x.finished_provisional && (x.minutes || 0) >= 90)), started: x.started, hs: x.team_h_score, as: x.team_a_score, min: x.minutes, stats: x.stats || [] });
    fxList.push(o); if (x.event) (fx[x.event] = fx[x.event] || []).push(o);
  });
  return {
    teams, players, PM: Object.fromEntries(players.map((p) => [p.id, p])), events, fx, fxList,
    cur: cur ? cur.id : 0, next: nxt ? nxt.id : null, deadline: nxt ? nxt.deadline : null,
    finished: events.filter((e) => e.fin).length, totalPlayers: b.total_players || 0, lastGW: events.length ? events[events.length - 1].id : 38,
    chipRules: (b.chips || []).map((c) => ({ name: c.name, number: c.number, start: c.start_event, stop: c.stop_event })),
    fetchedAt: Date.now(),
  };
}

export async function loadEntry(id, fresh = false) {
  const [entry, hist, transfers] = await Promise.all([
    get(`entry/${id}/`, {}, { ttl: rt(60), fresh }), get(`entry/${id}/history/`, {}, { ttl: rt(120), fresh }), get(`entry/${id}/transfers/`, {}, { ttl: 120, fresh }).catch(() => []),
  ]);
  const gw = entry.current_event || null;
  const picks = gw ? await get(`entry/${id}/event/${gw}/picks/`, {}, { ttl: 300, fresh }).catch(() => null) : null;
  // بعد الفري هيت الفريق يرجع لتشكيلة الجولة اللي قبلها
  let basePicks = picks, fhRevert = false;
  if (picks?.active_chip === 'freehit' && gw > 1) { const prev = await get(`entry/${id}/event/${gw - 1}/picks/`, {}, { ttl: 3600, fresh }).catch(() => null); if (prev) { basePicks = prev; fhRevert = true; } }
  // الانتقالات اللي سويتها للجولة الجاية (تنعرض فوراً بالواجهة العامة)
  const pending = (Array.isArray(transfers) ? transfers : []).filter((t) => t.event > gw).sort((a, b) => new Date(a.time) - new Date(b.time));
  return { entry, hist, transfers, picks, basePicks, fhRevert, pending, gw };
}
export const fetchEntry = (id, fresh = false) => get(`entry/${id}/`, {}, { ttl: 60, fresh });
export const fetchHistory = (id) => get(`entry/${id}/history/`, {}, { ttl: 300 });
export const loadSetPieceNotes = () => get('team/set-piece-notes/', {}, { ttl: 3600 });
export const fetchTransfers = (id) => get(`entry/${id}/transfers/`, {}, { ttl: 120 });
export const fetchPicks = (id, gw) => get(`entry/${id}/event/${gw}/picks/`, {}, { ttl: 3600 });
export const loadH2H = (id, page = 1) => get(`leagues-h2h/${id}/standings/`, { page }, { ttl: rt(120) });
export const loadH2HMatches = (id, event, page = 1, fresh = false) => get(`leagues-h2h-matches/league/${id}/`, { ...(event ? { event } : {}), page }, { ttl: 60, fresh });
export const loadLeague = (id, page = 1) => get(`leagues-classic/${id}/standings/`, { page }, { ttl: rt(120) });
export const loadLive = (gw, fresh = false) => get(`event/${gw}/live/`, {}, { ttl: 1, fresh });
export const loadFixturesGW = (gw, fresh = false) => get('fixtures/', { event: gw }, { ttl: 1, fresh });
export const loadPlayerSummary = (id) => get(`element-summary/${id}/`, {}, { ttl: 3600 });
export const serverStatus = () => fetch('/api/fpl?status=1').then((r) => r.json());

/** تقدير الانتقالات المجانية من سجل الجولات (الحد 5) */
export function estimateFT(hist) {
  const chips = {}; (hist.chips || []).forEach((c) => (chips[c.event] = c.name));
  const cur = hist.current || []; if (!cur.length) return 1;
  let ft = 1;
  cur.forEach((h, i) => { if (i === 0) { ft = 1; return; } if (chips[h.event] !== 'wildcard' && chips[h.event] !== 'freehit') ft = Math.max(0, ft - (h.event_transfers || 0)); ft = Math.min(5, ft + 1); });
  return ft;
}
/** حالة الأوراق حسب قوانين الموسم القادمة من الفانتازي نفسه (bootstrap.chips) */
export function chipStatus(G, hist) {
  const used = hist.chips || [];
  const rules = G.chipRules.length ? G.chipRules : [{ name: 'wildcard', number: 1, start: 1, stop: 38 }, { name: 'freehit', number: 1, start: 1, stop: 38 }, { name: 'bboost', number: 1, start: 1, stop: 38 }, { name: '3xc', number: 1, start: 1, stop: 38 }];
  return rules.map((r) => {
    const u = used.filter((c) => c.name === r.name && c.event >= r.start && c.event <= r.stop);
    const ref = G.next || G.cur || 1;
    const open = ref >= r.start && ref <= r.stop;
    return { ...r, used: u, left: Math.max(0, r.number - u.length), open, expired: ref > r.stop };
  });
}

/** الجولة الجاية حسب الوقت الحقيقي: أول جولة موعد إغلاقها بعد هسة (حتى لو بيانات الفانتازي بعدها ما تحدّثت) */
export function upcoming(G) {
  if (!G?.events) return { gw: G?.next, deadline: G?.deadline };
  const now = Date.now(), e = G.events.find((x) => x.deadline && new Date(x.deadline).getTime() > now);
  return e ? { gw: e.id, deadline: e.deadline } : { gw: null, deadline: null };
}
