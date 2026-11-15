/* =========================================================
   المدرب الذكي المحلي — أسلوب خاص لكل مدرب
   يحلل جولات المدرب نفسه (التشكيلات، الكابتن، الانتقالات، الضربات، الدكة، الأوراق)
   ويبني منها "بصمة" تخصه، وبعدين يطلع قرارات الجولة على مقاسه:
   - تقييم اللاعب يعتمد على الاستمرارية (xG/xA لكل 90، ضمان الدقائق، الجدول) مو على جولة وحدة تألق بيها
   - نفس الاقتراح يختلف من مدرب لمدرب حسب أسلوبه ونقاط ضعفه المثبتة بالأرقام
========================================================= */
import { ST, PM, tShort, tName } from './store.js';
import { tt } from './i18n.js';
import * as FPL from './fpl.js';
import { xp, xpN, avail, avgFdr, teamCount, dgwBgw, r1, clamp } from './engine.js';
import { pricePredict } from './predict.js';
import * as LR from './learn.js';

const VER = 2, WIN = 10; // نحلل آخر 10 جولات منتهية
const key = () => `fp_coach_v${VER}_${ST.E?.entry?.id}`;
let MEM = null, BUSY = null;

/* ---------- البيانات: تشكيلات المدرب + نقاط كل لاعب بالجولات (تنحفظ مضغوطة) ---------- */
function loadCache() { try { return JSON.parse(localStorage.getItem(key()) || 'null') || { picks: {}, pts: {} }; } catch { return { picks: {}, pts: {} }; } }
function saveCache(c) { try { localStorage.setItem(key(), JSON.stringify(c)); } catch {} }
async function pool(items, n, fn) { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const x = q.shift(); try { await fn(x); } catch {} } })); }

export async function ensureCoach(onProgress) {
  if (!ST.E?.entry?.id || !ST.G) return null;
  if (MEM && MEM.entry === ST.E.entry.id && MEM.fin === ST.G.finished) return MEM;
  if (BUSY) return BUSY;
  BUSY = (async () => {
    const id = ST.E.entry.id, G = ST.G, c = loadCache();
    const played = (ST.E.hist?.current || []).map((h) => h.event).filter((g) => G.events.find((e) => e.id === g)?.fin);
    const gws = played.slice(-WIN);
    const needPicks = gws.filter((g) => !c.picks[g]), needPts = [...new Set([...gws, ...gws.map((g) => g + 1), ...gws.map((g) => g + 2)])].filter((g) => g <= G.finished && G.events.find((e) => e.id === g)?.fin && !c.pts[g]);
    let done = 0; const total = needPicks.length + needPts.length; const tick = () => onProgress && onProgress(total ? ++done / total : 1);
    await pool(needPicks, 3, async (g) => { const d = await FPL.fetchPicks(id, g); c.picks[g] = { chip: d.active_chip || null, p: d.picks.map((x) => [x.element, x.multiplier, x.position, x.is_captain ? 1 : x.is_vice_captain ? 2 : 0]) }; tick(); });
    await pool(needPts, 2, async (g) => { const l = await FPL.loadLive(g); const o = {}; l.elements.forEach((e) => { const s = e.stats; if (s.total_points || s.minutes) o[e.id] = [s.total_points, s.minutes]; }); c.pts[g] = o; tick(); });
    // نخلي آخر 14 جولة بس حتى ما يكبر التخزين
    const keepFrom = (G.finished || 0) - 14; Object.keys(c.pts).forEach((g) => { if (+g < keepFrom) delete c.pts[g]; }); Object.keys(c.picks).forEach((g) => { if (+g < keepFrom) delete c.picks[g]; });
    saveCache(c);
    // التعلّم: أول مرة من التاريخ، وبعدين من كل جولة تخلص (مقارنة توقعاتنا بالنتيجة)
    try { LR.bootstrap(c); await LR.evaluate(c); } catch {}
    MEM = { entry: id, fin: G.finished, gws, ...profile(c, gws) };
    return MEM;
  })();
  try { return await BUSY; } finally { BUSY = null; }
}
export const coachReady = () => (MEM && MEM.entry === ST.E?.entry?.id ? MEM : null);

/* ---------- تقييم اللاعب المستدام (مو فقاعة جولة وحدة) ---------- */
const POSG = { GK: 6, DEF: 6, MID: 5, FWD: 4 }, POSCS = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
function recentPts(id, n = 4) {
  const c = MEM ? loadCacheMem() : null; if (!c) return null;
  const gws = Object.keys(c.pts).map(Number).sort((a, b) => b - a).slice(0, n);
  return gws.map((g) => c.pts[g][id]?.[0] || 0);
}
let CM = null; function loadCacheMem() { if (!CM || CM.k !== key() || CM.fin !== ST.G.finished) CM = { k: key(), fin: ST.G.finished, ...loadCache() }; return CM; }

/** معامل الاستمرارية: يقارن الإنتاج الحقيقي بالمتوقع (xGI) وضمان الدقائق */
export function sustain(p) {
  const G = ST.G, fin = Math.max(1, G.finished);
  const mins = p.min || 0, n90 = mins / 90;
  const start = p.starts != null ? p.starts / fin : clamp(mins / (90 * fin), 0, 1);
  const sec = clamp(0.35 + 0.75 * Math.min(1, start * 1.1), 0.35, 1.05); // ضمان المشاركة
  let reg = 1, note = '';
  if (n90 >= 3 && (p.pos === 'MID' || p.pos === 'FWD' || p.pos === 'DEF')) {
    const real = (p.gls * POSG[p.pos] + p.ast * 3) / n90, exp = (p.xg * POSG[p.pos] + p.xa * 3) / n90;
    if (real > 0.1 || exp > 0.1) { const r = (exp + 0.3) / (real + 0.3); reg = clamp(0.8 + 0.2 * r, 0.82, 1.12); if (r < 0.7) note = 'over'; else if (r > 1.35) note = 'under'; }
  }
  // فقاعة: نقاط آخر جولة عالية والباقي ضعيف والمؤشرات ما تسند
  const rp = recentPts(p.id, 5); let spike = false;
  if (rp && rp.length >= 3) { const last = rp[0], rest = rp.slice(1), avg = rest.reduce((a, x) => a + x, 0) / rest.length; if (last >= 10 && avg <= 3 && (p.xgi / Math.max(1, n90)) < 0.45) spike = true; }
  const pen = p.pen === 1 ? 1.05 : 1;
  return { k: clamp(sec * reg * pen * (spike ? 0.88 : 1), 0.3, 1.2), sec, reg, spike, note, start };
}
/** النقاط المتوقعة المعدلة على N جولات */
export function rx(p, from = ST.G.next, n = 5) { let v = 0; for (let g = from; g < from + n && g <= ST.G.lastGW; g++) v += xp(p, g); return r1(LR.adj(p, v) * sustain(p).k); }

/* ---------- بصمة المدرب ---------- */
function profile(c, gws) {
  const G = ST.G, H = Object.fromEntries((ST.E.hist?.current || []).map((h) => [h.event, h]));
  const pts = (g, id) => c.pts[g]?.[id]?.[0] ?? 0, has = (g) => !!c.pts[g];
  const N = gws.length || 1;
  // 1) الكابتن
  let capBest = 0, capNear = 0, capTpl = 0, capN = 0, capLost = 0;
  gws.forEach((g) => { const P = c.picks[g]; if (!P || !has(g)) return; const xi = P.p.filter((x) => x[2] <= 11); const cap = P.p.find((x) => x[3] === 1); if (!cap) return; capN++;
    const best = Math.max(...xi.map((x) => pts(g, x[0]))), cp = pts(g, cap[0]); if (cp >= best) capBest++; if (cp >= best - 2) capNear++; capLost += Math.max(0, best - cp);
    const ev = G.events.find((e) => e.id === g); if (ev?.cap && ev.cap === cap[0]) capTpl++; });
  // 2) الدكة
  const benchPts = gws.reduce((a, g) => a + (H[g]?.points_on_bench || 0), 0) / N;
  // 3) الانتقالات والضربات
  const TR = (ST.E.transfers || []).filter((t) => gws.includes(t.event));
  const hitsN = gws.reduce((a, g) => a + (H[g]?.event_transfers_cost || 0), 0) / 4;
  const actv = TR.length / N, rolled = gws.filter((g) => (H[g]?.event_transfers || 0) === 0).length / N;
  let roiSum = 0, roiN = 0, chase = 0, chaseFail = 0, panic = 0, hitRoi = 0, hitGWs = 0;
  const byGw = {}; TR.forEach((t) => (byGw[t.event] = byGw[t.event] || []).push(t));
  Object.entries(byGw).forEach(([g, L]) => { g = +g; let gGain = 0, ok = false;
    L.forEach((t) => { const span = [g, g + 1, g + 2].filter(has); if (span.length) { ok = true; const d = span.reduce((a, x) => a + pts(x, t.element_in) - pts(x, t.element_out), 0); roiSum += d; roiN++; gGain += d; }
      if (has(g - 1)) { const prevIn = pts(g - 1, t.element_in); const pin = PM(t.element_in); if (prevIn >= 10 && pin && pin.xgi / Math.max(1, pin.min / 90) < 0.5) { chase++; if (span.length && span.reduce((a, x) => a + pts(x, t.element_in), 0) / span.length < 4) chaseFail++; }
        const prevOut = pts(g - 1, t.element_out), po = PM(t.element_out); if (prevOut <= 2 && po && po.ppg >= 4.5) panic++; } });
    const cost = H[g]?.event_transfers_cost || 0; if (cost > 0 && ok) { hitRoi += gGain - cost; hitGWs++; } });
  // 4) المخاطرة: ملكية اللاعبين الأساسيين بآخر جولة + الكابتن
  const lastG = gws[gws.length - 1], LP = c.picks[lastG]?.p || [];
  const ownAvg = LP.filter((x) => x[2] <= 11).reduce((a, x) => a + (PM(x[0])?.own || 0), 0) / Math.max(1, LP.filter((x) => x[2] <= 11).length);
  const diffN = LP.filter((x) => x[2] <= 11 && (PM(x[0])?.own || 0) < 10).length;
  // 5) الصبر: معدل بقاء اللاعب بالفريق
  const seen = {}; gws.forEach((g) => (c.picks[g]?.p || []).forEach((x) => (seen[x[0]] = (seen[x[0]] || 0) + 1)));
  const hold = Object.values(seen).reduce((a, x) => a + x, 0) / Math.max(1, Object.keys(seen).length);
  // 6) الهيكل والتشكيل المفضل
  const fm = {}; gws.forEach((g) => { const xi = (c.picks[g]?.p || []).filter((x) => x[2] <= 11).map((x) => PM(x[0])).filter(Boolean); if (xi.length === 11 && xi.filter((p) => p.pos === 'GK').length === 1) { const k = ['DEF', 'MID', 'FWD'].map((pos) => xi.filter((p) => p.pos === pos).length).join('-'); fm[k] = (fm[k] || 0) + 1; } });
  const favF = Object.entries(fm).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const prem = LP.filter((x) => (PM(x[0])?.price || 0) >= 10).length;
  // 7) المقارنة بالمعدل
  const vsAvg = gws.reduce((a, g) => a + ((H[g]?.points || 0) - (G.events.find((e) => e.id === g)?.avg || 0)), 0) / N;
  const rk = gws.map((g) => H[g]?.overall_rank).filter(Boolean), rkMove = rk.length >= 2 ? rk[0] - rk[rk.length - 1] : 0;
  const chips = (ST.E.hist?.chips || []).map((x) => x.name);

  // مؤشرات من 0 إلى 100
  const T = {
    risk: clamp(Math.round((40 - ownAvg) / 35 * 70 + diffN * 8), 0, 100),
    patience: clamp(Math.round(rolled * 60 + Math.min(1, hold / N) * 40), 0, 100),
    captain: capN ? Math.round((capNear / capN) * 100) : null,
    transfers: roiN ? clamp(Math.round(50 + (roiSum / roiN) * 8), 0, 100) : null,
    bench: clamp(Math.round(100 - benchPts * 9), 0, 100),
    discipline: clamp(Math.round(100 - hitsN / N * 120 - (hitGWs && hitRoi < 0 ? 15 : 0)), 0, 100),
  };
  const S = { capBest, capNear, capTpl, capN, capLost, benchPts: r1(benchPts), hitsN, actv: r1(actv), rolled, roiAvg: roiN ? r1(roiSum / roiN) : null, roiN, chase, chaseFail, panic, hitRoi: r1(hitRoi), hitGWs, ownAvg: r1(ownAvg), diffN, hold: r1(hold), favF, prem, vsAvg: r1(vsAvg), rkMove, chips, N };
  return { T, S, arch: archetype(T, S) };
}

function archetype(T, S) {
  const c = [];
  if (S.chase >= 2 && S.chase >= S.roiN * 0.25) c.push(['chaser', 3 + S.chase]);
  if (S.hitsN >= 2 && S.hitsN / S.N >= 0.25) c.push(['gambler', 2 + S.hitsN]);
  if (T.risk >= 62) c.push(['maverick', T.risk / 20]);
  if (T.risk <= 28 && S.capTpl >= S.capN * 0.6) c.push(['template', 3 + S.capTpl / 2]);
  if (T.patience >= 65 && S.hitsN <= 1) c.push(['strategist', T.patience / 20]);
  c.sort((a, b) => b[1] - a[1]);
  return c[0]?.[0] || 'balanced';
}
export const ARCH = () => ({
  chaser: [tt('تشتري اللاعب بعد جولة وحدة قوية', 'Buys after one big week'), tt('لهذا نحكم على اللاعب من دقائقه وفرصه الحقيقية (xG/xA) ومبارياته الجاية، مو من جولة وحدة.', 'You buy after a haul. We weight consistency harder so you skip the bubbles.')],
  gambler: [tt('تاخذ ضربات (−4) كثيرة', 'Takes many hits'), tt('لهذا ما ننصحك بضربة إلا إذا ترجع أكثر من نقاطها بوضوح بالجولات الجاية.', 'You take many hits. A hit must clearly pay back before we suggest it.')],
  maverick: [tt('تختار لاعبين قليلين الملكية', 'Picks low-owned players'), tt('لهذا نطلعلك لاعبين قليلين الملكية تسندهم أرقام حقيقية، مو أسماء عشوائية.', 'You like low-owned picks. We surface differentials backed by real numbers.')],
  template: [tt('تختار نفس لاعبين الأغلبية', 'Picks what most managers pick'), tt('لهذا نركز على الخيارات الآمنة اللي تحمي ترتيبك، ونكلك متى يستاهل تختلف عن الأغلبية.', 'You follow the crowd to protect rank. We focus on safety and when to break the template.')],
  strategist: [tt('صبور وتجمع الانتقالات', 'Patient, rolls transfers'), tt('لهذا نبنيلك خطط على كم جولة قدام بدل ردود الفعل السريعة.', 'You plan and roll. We build multi-week plans instead of reactions.')],
  balanced: [tt('أسلوبك متوازن', 'Balanced style'), tt('ما عندك ميل واضح لجهة وحدة. نشتغل على أكثر نقطة تخسر منها نقاط.', 'A balanced style. We target where you leak the most points.')],
});

/* ---------- قرارات الجولة على مقاس المدرب ---------- */
export function coachPlan(plan) {
  const M = coachReady(); if (!M || !plan) return null;
  const G = ST.G, gw = G.next, T = M.T, S = M.S, A = M.arch;
  const hitBar = A === 'gambler' || (S.hitGWs && S.hitRoi < 0) ? 6 : 4; // كم لازم ترجع الضربة
  const ftBar = A === 'strategist' ? 2.2 : A === 'chaser' ? 2 : 1.5;     // أقل ربح يستاهل انتقال
  const riskW = A === 'maverick' ? 0.06 : A === 'template' ? -0.04 : 0;   // ميل للفروقات أو للقالب

  // الانتقالات: نقارن كل لاعب بفريقك بأفضل بديل على 5 جولات بالتقييم المستدام
  const moves = [];
  plan.squad.forEach((oid) => {
    const o = PM(oid); if (!o) return; const budget = r1(plan.bank + o.price), so = rx(o, gw, 5);
    let best = null;
    for (const c of G.players) {
      if (c.pos !== o.pos || plan.squad.includes(c.id) || c.price > budget || avail(c) < 0.75 || c.st === 'u') continue;
      if (teamCount(c.team, plan.squad) - (o.team === c.team ? 1 : 0) >= 3) continue;
      const su = sustain(c); if (su.start < 0.45) continue;
      let v = rx(c, gw, 5); const own = c.own;
      v *= 1 + riskW * (own < 10 ? 1 : own > 25 ? -1 : 0);
      if (A === 'chaser' && su.spike) continue; // ما نعرض الفقاعات أصلاً لمطارد التألق
      const g = v - so; if (!best || g > best.g) best = { c, g, su };
    }
    if (best && best.g > 0.8) moves.push({ o, c: best.c, g: r1(best.g), su: best.su, so });
  });
  moves.sort((a, b) => b.g - a.g);
  const ft = plan.ft ?? 1, top = moves[0];
  let transfer;
  if (!top || top.g < ftBar) transfer = { kind: 'roll', why: A === 'chaser' ? tt('ما أكو بديل أرقامه ثابتة يستاهل. لا تشتري لاعب لأن سجل هالجولة بس.', 'No sustained upgrade. Do not buy on one haul.') : tt('ما أكو انتقال يرجع ربح واضح. احتفظ بالانتقال وخليه لجولة جاية.', 'No clear gain. Roll the transfer.') };
  else if (ft <= 0 && top.g < hitBar) transfer = { kind: 'nohit', m: top, why: tt(`أفضل انتقال يرجع ${top.g} نقطة بـ5 جولات، وأسلوبك يحتاج +${hitBar} حتى تستاهل الضربة.`, `Best move returns ${top.g} over 5 GWs; you need +${hitBar} for a hit.`) };
  else transfer = { kind: 'go', m: top, alt: moves.slice(1, 3) };

  // الكابتن: توازن بين المتوقع، السقف (نقاط كبيرة ممكنة)، والمخاطرة (الدقائق والمشاركة)
  const xi = plan.xi.map(PM).filter(Boolean);
  const capL = xi.map((p) => { const su = sustain(p), a = avail(p, gw), n90 = p.min / 90, thr = n90 >= 2 ? (p.xgi || 0) / n90 : 0;
    const v = r1(LR.adj(p, xp(p, gw)) * (0.85 + 0.15 * su.k));
    const ceil = r1(v * (1.5 + Math.min(1, thr * 1.4)) + (p.pen === 1 ? 1 : 0));
    const risk = clamp(Math.round((1 - a * Math.min(1, su.start * 1.1)) * 100 + (su.spike ? 15 : 0) + (su.note === 'over' ? 8 : 0)), 0, 100);
    return { p, v, own: p.own, ceil, risk }; }).sort((a, b) => b.v - a.v);
  let cap = capL[0], capAlt = null;
  if (A === 'template' || (T.captain != null && T.captain < 55)) { const safe = capL.slice(0, 3).filter((x) => x.v >= capL[0].v - 0.6).sort((a, b) => b.v + b.own / 40 - (a.v + a.own / 40))[0]; if (safe) cap = safe; }
  if (A === 'maverick') capAlt = capL.slice(1, 4).find((x) => x.own < 15 && x.v >= cap.v - 1.2) || null;
  const capSafe = [...capL.slice(0, 4)].sort((a, b) => (b.v * (1 - b.risk / 200) + b.own / 80) - (a.v * (1 - a.risk / 200) + a.own / 80))[0];
  const capRisk = capL.slice(0, 6).filter((x) => x.p.id !== capSafe.p.id && x.v >= capL[0].v - 1.6 && x.own < 25).sort((a, b) => b.ceil - a.ceil)[0] || null;
  const gap = capL[1] ? capL[0].v - capL[1].v : 2;
  const capConf = cap.risk > 35 || gap < 0.3 ? 'low' : cap.risk < 15 && gap >= 0.8 ? 'high' : 'mid';

  // سيناريوهات الانتقال: احتفظ / انتقال واحد / انتقالين (بضربة إذا لازم) + الآن لو انتظر + السعر
  const scen = [];
  scen.push({ k: 'roll', g: 0, t: tt('احتفظ بالانتقال (يصير عندك ' + Math.min(5, ft + 1) + ' الجولة الجاية)', 'Roll the transfer') });
  if (top) scen.push({ k: 'one', g: top.g - (ft >= 1 ? 0 : 4), m: [top], t: `${top.o.name} → ${top.c.name}` });
  let pair = null;
  for (let a = 0; a < Math.min(6, moves.length); a++) for (let b2 = a + 1; b2 < Math.min(8, moves.length); b2++) {
    const m1 = moves[a], m2 = moves[b2]; if (m1.o.id === m2.o.id || m1.c.id === m2.c.id) continue;
    if (m1.c.price + m2.c.price > plan.bank + m1.o.price + m2.o.price + 1e-9) continue;
    const sq2 = plan.squad.map((x) => (x === m1.o.id ? m1.c.id : x === m2.o.id ? m2.c.id : x));
    if ([m1.c.team, m2.c.team].some((tm) => sq2.filter((x) => PM(x).team === tm).length > 3)) continue;
    const net = m1.g + m2.g - Math.max(0, 2 - ft) * 4; if (!pair || net > pair.g) pair = { k: 'two', g: r1(net), m: [m1, m2], t: `${m1.o.name} → ${m1.c.name} + ${m2.o.name} → ${m2.c.name}` };
  }
  if (pair) scen.push(pair);
  scen.forEach((x) => (x.g = r1(x.g)));
  const bestScen = [...scen].sort((a, b) => b.g - a.g)[0];
  let timing = null;
  if (top) {
    const pp = pricePredict(top.c), near = avgFdr(top.c.team, gw, 2), later = avgFdr(top.c.team, gw + 2, 3);
    if (pp?.prog >= 80) timing = { k: 'now', t: tt(`${top.c.name} قريب يرتفع سعره — إذا ناوي عليه، اشتريه هسه`, `${top.c.name} likely to rise — buy now`) };
    else if (near - later >= 0.6 && ft < 2) timing = { k: 'wait', t: tt(`مباريات ${top.c.name} الجاية صعبة وبعدها تسهل — ممكن تنتظر جولة وتجمع انتقال`, `Tough fixtures first — consider waiting a week`) };
  }
  const trConf = !top ? 'mid' : top.g >= 4 && top.su.start >= 0.75 ? 'high' : top.g < 2 || top.su.start < 0.55 ? 'low' : 'mid';

  // أهم مشكلة بالفريق/الأسلوب — بدليل من الأرقام
  const F = [];
  if (S.capN >= 3 && T.captain != null) F.push({ k: 'captain', sev: (60 - T.captain) / 10 + S.capLost / S.capN / 2, t: tt(`اختيار الكابتن: تخسر بالمعدل ${r1(S.capLost / S.capN)} نقطة كل جولة لأن الكابتن مو أفضل لاعب عندك`, `Captaincy: losing ${r1(S.capLost / S.capN)} pts/GW`) });
  if (S.benchPts >= 3) F.push({ k: 'bench', sev: S.benchPts / 1.5, t: tt(`الدكة: تترك ${S.benchPts} نقطة على الدكة كل جولة`, `Bench: ${S.benchPts} pts left per GW`) });
  if (S.roiN >= 3 && S.roiAvg != null && S.roiAvg < 0) F.push({ k: 'transfers', sev: 3 - S.roiAvg, t: tt(`الانتقالات: اللاعب اللي تشتريه يجيب أقل من اللي تبيعه بـ ${Math.abs(S.roiAvg)} نقطة (3 جولات)`, `Transfers lose ${Math.abs(S.roiAvg)} pts`) });
  if (S.hitGWs && S.hitRoi < 0) F.push({ k: 'hits', sev: 3 + Math.abs(S.hitRoi) / 4, t: tt(`الضربات: خسرت منها ${Math.abs(S.hitRoi)} نقطة صافي`, `Hits cost ${Math.abs(S.hitRoi)} net`) });
  if (S.chase + S.panic >= 3) F.push({ k: 'stability', sev: 2 + (S.chase + S.panic) / 2, t: tt(`الاستقرار: ${S.chase} صفقات وراء جولة تألق و${S.panic} بيع بعد جولة ضعيفة`, `Stability: ${S.chase} chases, ${S.panic} panic sells`) });
  if (S.vsAvg < -3 && T.risk <= 28) F.push({ k: 'differ', sev: 2 + Math.abs(S.vsAvg) / 3, t: tt(`فريقك يشبه الأغلبية وتحت المعدل بـ ${Math.abs(S.vsAvg)} — تحتاج لاعب أو اثنين مختلفين`, `Too template while below average`) });
  if (S.vsAvg < -3 && T.risk >= 62) F.push({ k: 'risk', sev: 2 + Math.abs(S.vsAvg) / 3, t: tt(`مخاطرتك عالية وما ترجع: تحت المعدل بـ ${Math.abs(S.vsAvg)} — قلل الخيارات الغريبة`, `High risk not paying off`) });
  const focus = F.sort((a, b) => b.sev - a.sev)[0] || null;

  // أفكار إبداعية من حالتك أنت
  const ideas = [];
  const nx4 = Object.values(G.teams).map((tm) => ({ tm, f: avgFdr(tm.id, gw, 4) })).sort((a, b) => a.f - b.f);
  const ignored = nx4.slice(0, 4).find((x) => teamCount(x.tm.id, plan.squad) === 0);
  if (ignored) { const star = G.players.filter((p) => p.team === ignored.tm.id && p.st === 'a').sort((a, b) => rx(b, gw, 4) - rx(a, gw, 4))[0]; if (star) ideas.push({ ic: '📅', t: tt(`${tName(ignored.tm.id)} عنده من أسهل جداول الجولات الأربع الجاية وما عندك منه أحد. أبرز اسم: ${star.name} (${star.price}م).`, `${ignored.tm.name} has a top-4 fixture run and you own none. Best: ${star.name}.`), act: `openPlayer(${star.id})` }); }
  const cal = dgwBgw(gw, Math.min(G.lastGW, gw + 5));
  const dg = cal.find((x) => x.dbl.length); if (dg) { const mine = plan.squad.filter((id) => dg.dbl.includes(PM(id).team)).length; ideas.push({ ic: '✌️', t: tt(`الجولة ${dg.gw} مزدوجة لـ${dg.dbl.length} فرق، وعندك منهم ${mine}. ${mine < 4 ? 'ابدأ تحضّر من هسه بانتقال وحدة كل جولة.' : 'وضعك زين، فكّر بالبنش بوست إذا دكتك قوية.'}`, `GW${dg.gw} is a double for ${dg.dbl.length} teams; you own ${mine}.`) }); }
  const bl = cal.find((x) => x.blank.length >= 2); if (bl) { const mine = plan.squad.filter((id) => bl.blank.includes(PM(id).team)).length; if (mine >= 3) ideas.push({ ic: '∅', t: tt(`الجولة ${bl.gw} فارغة لـ${mine} من لاعبينك. خطط الفري هيت أو بدّلهم تدريجياً.`, `GW${bl.gw} blank hits ${mine} of yours.`) }); }
  if (S.benchPts >= 4) ideas.push({ ic: '⇅', t: tt(`تخسر بالمعدل ${S.benchPts} نقطة على الدكة كل جولة. رتب دكتك بأفضل تشكيلة قبل الديدلاين.`, `You leave ${S.benchPts} pts on the bench per GW.`), act: 'bestLineup()' });
  if (S.chase >= 2) ideas.push({ ic: '🎈', t: tt(`من آخر ${S.N} جولات اشتريت ${S.chase} لاعبين بعد جولة تألق بيها، و${S.chaseFail} منهم ما رجعوا بعدها. هالمرة نحكم على xG/xA والدقائق.`, `You bought ${S.chase} players right after a haul; ${S.chaseFail} flopped.`) });
  if (S.panic >= 2) ideas.push({ ic: '🧊', t: tt(`بعت ${S.panic} لاعبين ثابتين بعد جولة وحدة ضعيفة. لاعب معدله فوك 4.5 لا تبيعه على جولة.`, `You sold ${S.panic} reliable players after one blank.`) });
  const drops = plan.squad.map(PM).filter((p) => p && pricePredict(p)?.prog <= -85 && rx(p, gw, 5) < 12);
  if (drops.length) ideas.push({ ic: '▼', t: tt(`${drops.map((p) => p.name).join('، ')} قريب ينزل سعره وأداؤه المتوقع ضعيف. إذا ناوي تبيعه، بيعه قبل النزول.`, `${drops.map((p) => p.name).join(', ')} likely to drop.`) });
  xi.forEach((p) => { const su = sustain(p); if (su.note === 'over' && p.pos !== 'GK') ideas.push({ ic: '📉', t: tt(`${p.name} يسجل أكثر بكثير من فرصه الحقيقية (xG). ممكن يهبط، لا تعتمد عليه كابتن.`, `${p.name} is outscoring his xG.`), act: `openPlayer(${p.id})` }); });
  // فرص خفية من البيانات
  const opp = [];
  const n90 = (p) => p.min / 90;
  const over = plan.squad.map(PM).filter((p) => p && p.own >= 20 && n90(p) >= 4 && (sustain(p).note === 'over' || rx(p, gw, 5) < p.price * 1.2)).sort((a, b) => b.own - a.own)[0];
  if (over) opp.push({ ic: '🔍', t: tt(`${over.name} مملوك عند ${over.own}% بس أرقامه الحقيقية ما تبرر سعره (${over.price}م) — بيعه ممكن يفتح ميزانية`, `${over.name} is popular but his underlying numbers don't justify it`) });
  const gem = G.players.filter((p) => !plan.squad.includes(p.id) && p.own < 7 && n90(p) >= 5 && avail(p) >= 0.9 && p.st === 'a').map((p) => ({ p, s: rx(p, gw, 5) / Math.max(4, p.price) * ((p.xgi || 0) / n90(p) + 0.2) })).sort((a, b) => b.s - a.s)[0];
  if (gem) opp.push({ ic: '💎', t: tt(`${gem.p.name} (${tShort(gem.p.team)}) ملكيته ${gem.p.own}% بس فرصه الحقيقية قوية ومتوقعه عالي لسعره — فرصة ما ينتبهلها أحد`, `${gem.p.name}: low-owned with strong numbers`), act: `openPlayer(${gem.p.id})` });
  const cm = loadCacheMem(), cg = Object.keys(cm.pts || {}).map(Number).sort((a, b) => b - a);
  if (cg.length >= 4) { const mins = (id, g) => cm.pts[g]?.[id]?.[1] || 0;
    const role = G.players.filter((p) => !plan.squad.includes(p.id) && p.st === 'a' && p.pos !== 'GK').filter((p) => mins(p.id, cg[0]) >= 60 && mins(p.id, cg[1]) >= 60 && (mins(p.id, cg[2]) + mins(p.id, cg[3])) / 2 < 30).sort((a, b) => rx(b, gw, 4) - rx(a, gw, 4))[0];
    if (role) opp.push({ ic: '📈', t: tt(`${role.name} صار يلعب أساسي آخر جولتين بعد ما جان احتياط — دوره تغير وممكن يطلع قيمة`, `${role.name} just became a starter`), act: `openPlayer(${role.id})` }); }
  const doubt = xi.filter((p) => avail(p, gw) < 0.9), hard = {}; xi.forEach((p) => { if (avgFdr(p.team, gw, 1) >= 4) hard[p.team] = (hard[p.team] || 0) + 1; });
  const hardT = Object.entries(hard).find(([, n]) => n >= 3);
  if (doubt.length >= 2) opp.push({ ic: '⚠️', t: tt(`مخاطرة مخفية: ${doubt.map((p) => p.name).join('، ')} مشكوك بمشاركتهم — جهز بدلاء بالدكة يلعبون`, `Hidden risk: ${doubt.length} doubtful starters`) });
  if (hardT) opp.push({ ic: '⚠️', t: tt(`عندك ${hardT[1]} أساسيين من ${tName(+hardT[0])} ومباراتهم صعبة هالجولة — مخاطرة مركزة`, `Concentrated risk in one hard fixture`) });
  const ideasAll = [...opp, ...ideas];
  // نحفظ التوصية حتى نقيّمها بعد الجولة (ونتعلم منها)
  try { LR.snapshot({ cap: cap.p.id, tr: transfer.kind === 'go' ? { in: transfer.m.c.id, out: transfer.m.o.id } : null }); } catch {}
  return { transfer, cap, capAlt, capL: capL.slice(0, 3), capSafe, capRisk, capConf, scen, bestScen, timing, trConf, focus, ideas: ideasAll.slice(0, 6), hitBar, ftBar, learn: LR.summary(), at: ST.G.fetchedAt || Date.now() };
}

/* ---------- جواب مختصر للمحرك المحلي (للأسئلة) ---------- */
export function coachAnswer(kind) {
  const M = coachReady(), P = ST.plan; if (!M || !P) return null; const C = coachPlan(P); if (!C) return null;
  const [an] = ARCH()[M.arch];
  if (kind === 'captain') return `**${tt('كابتنك المقترح', 'Your captain')}: ${C.cap.p.name}** (${C.cap.v} xP)\n${C.capL.map((x, i) => `${i + 1}. ${x.p.name} — ${x.v} xP · ${tt('ملكية', 'own')} ${x.own}%`).join('\n')}${C.capAlt ? `\n- ${tt('خيار فروقات على أسلوبك', 'Differential option')}: **${C.capAlt.p.name}**` : ''}\n- ${tt('أسلوبك', 'Your style')}: ${an}${M.T.captain != null ? ` · ${tt('دقة كابتنك', 'captain accuracy')} ${M.T.captain}%` : ''}`;
  if (kind === 'transfer') { const t = C.transfer; return t.kind === 'go' ? `**${t.m.o.name} → ${t.m.c.name}** (+${t.m.g} xP / 5 ${tt('جولات', 'GWs')})\n${t.alt.map((x) => `- ${x.o.name} → ${x.c.name} (+${x.g})`).join('\n')}\n- ${tt('أسلوبك', 'Your style')}: ${an}` : `**${t.kind === 'roll' ? tt('احتفظ بالانتقال', 'Roll') : tt('لا تاخذ ضربة', 'No hit')}**\n- ${t.why}`; }
  return null;
}

/** تاريخ المدرب من الكاش: منو امتلك بالجولات الأخيرة + نقاط آخر الجولات لكل لاعب */
export function coachHistory() {
  const c = MEM ? loadCacheMem() : loadCache();
  const owned = new Map(); Object.values(c.picks || {}).forEach((P) => (P.p || []).forEach((x) => owned.set(x[0], (owned.get(x[0]) || 0) + 1)));
  const gws = Object.keys(c.pts || {}).map(Number).sort((a, b) => b - a);
  return { owned, hasPts: gws.length > 0, recent: (id, n = 4) => gws.slice(0, n).map((g) => c.pts[g]?.[id]?.[0] || 0) };
}
