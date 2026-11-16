/* =========================================================
   ذاكرة القرارات وتقييمها — المرحلة الأولى من تطوير المحرك
   (1) ذاكرة القرارات البديلة: قبل الديدلاين نحفظ القرار + كل البدائل اللي درسها المحرك،
       توقع كل بديل، سبب الاختيار والرفض، الثقة، والقيود (البنك، الانتقالات، الضربة…)
   (4) ذاكرة الندم الاستراتيجي: بعد الجولة نقارن القرار بأفضل بديل "معقول" كان متاح وقتها
   (13) جودة القرار بعيداً عن الحظ: نفصل "هل القرار منطقي بمعلومات وقته" عن "شنو صار"،
       ونقيس التوقعات بـ MAE وBrier Score وCalibration ونقارنها بخطوط أساس بسيطة
   قواعد ثابتة:
   - كل مدرب له ملف مستقل (المفتاح برقم فريقه) — ما يقرأ أي ملف لمدرب ثاني
   - بعد الديدلاين القرار يتجمّد، والتقييم يستخدم بس اللي انحفظ قبلها (بدون تسرب بيانات المستقبل)
   - هذا الملف ما يعدّل أي وزن بالمحرك. يسجّل ويقيس بس (اعتماد التعديلات بالمرحلة الثالثة)
   - الملف "نقي": ياخذ كل البيانات كمعاملات، حتى ينختبر بسهولة
========================================================= */
import { ENGINE_VER } from './flags.js';

const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;
const KEEP_RECS = 8, KEEP_EVALS = 38, KEEP_REGRET = 60;
const keyOf = (entryId) => `fp_dm_v1_${entryId}`;
const blank = (entryId) => ({ v: 1, entry: entryId, recs: {}, evals: [], regret: [], guard: {}, byVer: {}, proposals: [] });

/* ---------- التخزين (مستقل لكل مدرب) ---------- */
let MEMO = null;
function store() { return typeof localStorage !== 'undefined' ? localStorage : null; }
export function load(entryId) {
  if (!entryId) return null;
  if (MEMO && MEMO.entry === entryId) return MEMO;
  let b = null;
  try { b = JSON.parse(store()?.getItem(keyOf(entryId)) || 'null'); } catch {}
  if (!b || b.entry !== entryId) b = blank(entryId); // حماية: ملف بغير رقم فريق ينرفض
  MEMO = b; return b;
}
export function save(b) {
  if (!b?.entry) return;
  const gws = Object.keys(b.recs).map(Number).sort((a, c) => c - a);
  gws.slice(KEEP_RECS).forEach((g) => delete b.recs[g]);
  b.evals = b.evals.slice(-KEEP_EVALS); b.regret = b.regret.slice(-KEEP_REGRET);
  try { store()?.setItem(keyOf(b.entry), JSON.stringify(b)); } catch {}
}
export const _reset = () => { MEMO = null; };

/* ---------- (1) حفظ القرار وبدائله قبل الديدلاين ---------- */
/**
 * @param ctx {entryId, gw, deadline, now}
 * @param rec {cap:{id, v, conf, why, risk}, capAlts:[{id,v,risk,own,why}], tr:{kind, out, in, g, conf, why}, trAlts:[{out,in,g,why}],
 *             constraints:{ft,bank,hitBar,ftBar,chip}, guard:[issues], preds:{id:[xp, availProb, ppg, form, nFix]}, trXp:{id:[xp g, g+1, g+2]}}
 * @returns true إذا انحفظ
 */
export function record(ctx, rec) {
  const { entryId, gw, deadline } = ctx, now = ctx.now ?? Date.now();
  if (!entryId || !gw) return false;
  if (deadline && new Date(deadline).getTime() <= now) return false; // بعد الديدلاين القرار متجمّد
  const b = load(entryId);
  const sig = JSON.stringify([rec.cap?.id, rec.tr?.kind, rec.tr?.out, rec.tr?.in, (rec.capAlts || []).map((x) => x.id), rec.constraints]);
  const old = b.recs[gw];
  if (old && old.sig === sig && now - old.t < 10 * 60e3) return false; // نفس القرار — ما نعيد الكتابة
  b.recs[gw] = { t: now, ver: ENGINE_VER, deadline: deadline || null, sig, cap: rec.cap || null, capAlts: rec.capAlts || [], tr: rec.tr || null, trAlts: rec.trAlts || [], constraints: rec.constraints || {}, guard: (rec.guard || []).map((x) => [x.code, x.sev, x.ids || []]), preds: (typeof rec.preds === 'function' ? rec.preds() : rec.preds) || old?.preds || {}, trXp: rec.trXp || {} };
  (rec.guard || []).forEach((x) => { b.guard[x.code] = (b.guard[x.code] || 0) + 1; });
  save(b); return true;
}

/* ---------- أدوات التقييم ---------- */
const ptsOf = (act, id) => act?.[id]?.[0] ?? 0;
const minOf = (act, id) => act?.[id]?.[1] ?? 0;

/**
 * (13) جودة القرار: الحكم على العملية بمعلومات وقتها، والنتيجة لوحدها
 * process: 'sound' إذا ما أكو بديل متاح كان توقعه أعلى بوضوح وقتها
 * outcome: 'good' إذا النتيجة ضمن هامش من أفضل بديل معقول
 * luck: نفسّر الفرق: غياب ما جان متوقع، أو تذبذب طبيعي
 */
export function judge({ chosenV, altVs, chosenPts, bestAltPts, margin = 0.8, tol = 2, chosenAvail = null, chosenMin = null }) {
  const bestAltV = altVs.length ? Math.max(...altVs) : -Infinity;
  const process = chosenV >= bestAltV - margin ? 'sound' : 'unsound';
  const outcome = bestAltPts == null ? null : chosenPts >= bestAltPts - tol ? 'good' : 'bad';
  let cell = null;
  if (outcome) cell = process === 'sound' ? (outcome === 'good' ? 'earned' : 'unlucky') : (outcome === 'good' ? 'lucky' : 'mistake');
  let luck = null;
  if (outcome === 'bad' && chosenMin === 0 && chosenAvail != null && chosenAvail >= 0.9) luck = 'unforeseen_absence';
  else if (outcome === 'bad' && process === 'sound') luck = 'variance';
  else if (outcome === 'good' && process === 'unsound') luck = 'fortunate';
  return { process, outcome, cell, luck };
}

/** (13) مقاييس التوقع للجولة: MAE للمحرك ولخطوط الأساس، Brier للمشاركة، ومعايرة */
export function predMetrics(preds, act) {
  let n = 0, e = 0, eP = 0, eF = 0, br = 0, nb = 0;
  const bins = [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 0.9], [0.9, 1.01]].map(([lo, hi]) => ({ lo, hi, n: 0, p: 0, o: 0 }));
  for (const [id, row] of Object.entries(preds || {})) {
    const [xp, pa, ppg, form, nFix] = row, a = ptsOf(act, id), played = minOf(act, id) > 0 ? 1 : 0, f = nFix ?? 1;
    n++; e += Math.abs(a - xp);
    if (ppg != null) eP += Math.abs(a - ppg * f); // خط أساس: معدل النقاط
    if (form != null) eF += Math.abs(a - form * f); // خط أساس: الفورمة
    if (pa != null && f > 0) { br += (pa - played) ** 2; nb++; const bn = bins.find((x) => pa >= x.lo && pa < x.hi); if (bn) { bn.n++; bn.p += pa; bn.o += played; } }
  }
  if (!n) return null;
  return {
    n, mae: r2(e / n), base: { ppg: r2(eP / n), form: r2(eF / n) },
    brier: nb ? +(br / nb).toFixed(3) : null,
    calib: bins.filter((x) => x.n).map((x) => ({ range: [x.lo, Math.min(1, x.hi)], n: x.n, pred: r2(x.p / x.n), obs: r2(x.o / x.n) })),
  };
}

/* ---------- مقاطع للتحيز (8) والتعلم من النجاح (15) ----------
   صف التوقع: [xp, احتمال المشاركة, ppg, form, عدد المباريات, ملكية, سعر, صعوبة المباراة, نقاط آخر جولة, xGI لكل 90]
   نخزن مجاميع مضغوطة بس (مو كل لاعب)، تكفي لحساب الانحياز واختبار تعديله لاحقاً */
export const SEGS = {
  all: () => true,
  popular: (r) => r[5] != null && r[5] >= 30, unpopular: (r) => r[5] != null && r[5] < 10,
  premium: (r) => r[6] != null && r[6] >= 9, budget: (r) => r[6] != null && r[6] <= 5.5,
  hotForm: (r) => r[2] != null && r[3] - r[2] >= 2, coldForm: (r) => r[2] != null && r[3] - r[2] <= -2,
  afterHaul: (r) => r[8] != null && r[8] >= 10,
  easyFix: (r) => r[7] != null && r[7] <= 2, hardFix: (r) => r[7] != null && r[7] >= 4,
  lowQuality: (r) => r[9] != null && r[2] >= 5 && r[9] < 0.3,
};
export function segStats(preds, act) {
  const o = {};
  for (const [id, r] of Object.entries(preds || {})) {
    if ((r[4] ?? 1) === 0) continue; // ما عنده مباراة
    const p = r[0], a = ptsOf(act, id);
    for (const [k, f] of Object.entries(SEGS)) { if (!f(r)) continue; const x = (o[k] = o[k] || [0, 0, 0, 0, 0, 0]); x[0]++; x[1] += p; x[2] += a; x[3] += p * p; x[4] += a * a; x[5] += p * a; }
  }
  Object.values(o).forEach((x) => { for (let i = 1; i < 6; i++) x[i] = r2(x[i]); });
  return o;
}
/** نسبة "الجولات الكبيرة" (8+ نقاط) لكل سمة — لاكتشاف أنماط النجاح */
export const HAUL = 8;
export function haulStats(preds, act) {
  const o = {};
  for (const [id, r] of Object.entries(preds || {})) {
    if ((r[4] ?? 1) === 0 || minOf(act, id) < 1) continue;
    const h = ptsOf(act, id) >= HAUL ? 1 : 0;
    for (const [k, f] of Object.entries(SEGS)) { if (!f(r)) continue; const x = (o[k] = o[k] || [0, 0]); x[0]++; x[1] += h; }
  }
  return o;
}
/** نجاحات تشكيلة المدرب: تحليل صحيح لو حظ؟ */
function winsOf(R, act, picks, under) {
  const xi = picks.filter((x) => x[2] <= 11).map((x) => x[0]);
  const ranked = xi.map((id) => [id, R.preds?.[id]?.[0] ?? null]).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  return xi.filter((id) => ptsOf(act, id) >= 10).slice(0, 4).map((id) => {
    const xp = R.preds?.[id]?.[0] ?? null, rank = ranked.indexOf(id) + 1 || null, u = under?.[id] || null;
    const und = u && u.xg != null && u.xa != null ? r2(u.xg + u.xa) : null;
    // تحليل صحيح: كان من أعلى 3 توقعات بتشكيلته أو توقعه 5+، والأداء الحقيقي يسند (xGI ≥ 0.5) إذا متوفر
    let verdict = 'unknown';
    if (und != null) verdict = und >= 0.5 && (rank && rank <= 3 || (xp ?? 0) >= 5) ? 'skill' : und < 0.3 ? 'luck' : 'mixed';
    else if (xp != null) verdict = rank && rank <= 3 ? 'expected' : 'unexpected';
    return { id, pts: ptsOf(act, id), xp, rank, und, verdict, unexpected: rank != null && rank > 5 };
  });
}

/* ---------- (4) + (13) تقييم الجولة بعد ما تخلص ---------- */
/**
 * @param ctx {entryId, gw, act:{id:[pts,min]}, actNext:{gw:{id:[pts,min]}}, picks:[[id,mult,pos,capFlag]], chip, transfers:[{event,element_in,element_out}], ftBefore}
 */
export function evaluateGW(ctx) {
  const { entryId, gw, act } = ctx; const b = load(entryId); const R = b?.recs[gw];
  if (!R || !act || b.evals.find((x) => x.gw === gw)) return null;
  const ev = { gw, ver: R.ver, at: Date.now(), m: predMetrics(R.preds, act), seg: segStats(R.preds, act), hauls: haulStats(R.preds, act) };
  const regrets = [];
  const picks = ctx.picks || null, xiIds = picks ? picks.filter((x) => x[2] <= 11).map((x) => x[0]) : null;
  const mineCap = picks?.find((x) => x[3] === 1)?.[0] ?? null, mult = picks?.find((x) => x[3] === 1)?.[1] || 2;

  // الكابتن: قرار المحرك
  if (R.cap) {
    const alts = R.capAlts.filter((a) => a.id !== R.cap.id);
    // البدائل المعقولة = اللي درسها المحرك وكانت قريبة بالتوقع ومتاحة وقتها
    const reasonable = alts.filter((a) => !a.blocked && a.v >= R.cap.v - 1.5 && (a.risk == null || a.risk < 50));
    const capPts = ptsOf(act, R.cap.id), bestAlt = reasonable.length ? Math.max(...reasonable.map((a) => ptsOf(act, a.id))) : null;
    const pa = R.preds?.[R.cap.id]?.[1] ?? null;
    const j = judge({ chosenV: R.cap.v, altVs: alts.map((a) => a.v), chosenPts: capPts, bestAltPts: bestAlt, chosenAvail: pa, chosenMin: minOf(act, R.cap.id) });
    ev.cap = { id: R.cap.id, v: R.cap.v, conf: R.cap.conf || null, pts: capPts, bestAlt, ...j, followed: mineCap != null ? mineCap === R.cap.id : null };
    if (bestAlt != null && bestAlt > capPts) {
      const bestId = reasonable.find((a) => ptsOf(act, a.id) === bestAlt)?.id;
      regrets.push({ gw, who: 'engine', type: 'captain', size: r1((bestAlt - capPts) * 2), alt: bestId, chosen: R.cap.id, avoidable: j.process === 'unsound', cause: j.luck || j.cell });
    }
    // قرار المدرب نفسه (إذا ما اتبع التوصية): نقيّمه بنفس المعلومات اللي جانت وقتها
    if (mineCap != null && mineCap !== R.cap.id) {
      const mv = R.capAlts.find((a) => a.id === mineCap)?.v ?? R.preds?.[mineCap]?.[0] ?? null;
      if (mv != null) {
        const mPts = ptsOf(act, mineCap);
        const jm = judge({ chosenV: mv, altVs: [R.cap.v, ...alts.map((a) => a.v)], chosenPts: mPts, bestAltPts: capPts });
        ev.mgrCap = { id: mineCap, v: mv, pts: mPts, mult, ...jm, engineBetter: capPts > mPts };
        if (capPts > mPts) regrets.push({ gw, who: 'manager', type: 'captain', size: r1((capPts - mPts) * (mult || 2)), alt: R.cap.id, chosen: mineCap, avoidable: jm.process === 'unsound', cause: jm.luck || jm.cell, ignoredRec: true });
      }
    }
  }

  // الانتقال: يحتاج 3 جولات حتى ينحكم عليه — إذا بعد ما خلصت، نأجله ونرجعله لاحقاً
  if (R.tr) {
    if (ctx.full || [gw + 1, gw + 2].every((g) => ctx.actNext?.[g])) { const t = evalTransfer(R, ctx); ev.tr = t.tr; regrets.push(...t.regrets); }
    else ev.trPending = true;
  }

  // إهدار انتقال مجاني: كان عنده 5 (الحد الأعلى) وما سوى انتقال
  if (ctx.ftBefore != null && ctx.ftBefore >= 5 && !(ctx.transfers || []).some((t) => t.event === gw) && !['wildcard', 'freehit'].includes(ctx.chip)) {
    regrets.push({ gw, who: 'manager', type: 'ft_wasted', size: 1, avoidable: true, cause: 'cap_reached' });
  }
  if (picks) ev.wins = winsOf(R, act, picks, ctx.under || null);
  ev.regret = regrets.length;
  b.evals.push(ev); b.regret.push(...regrets);
  accumulateVersion(b, ev);
  save(b); return ev;
}

/** (1)+(4)+(13) تقييم قرار الانتقال على 3 جولات (أو أقل إذا الموسم خلص) */
function evalTransfer(R, ctx) {
  const { gw, act } = ctx, regrets = []; let ev = {};
  const spanG = [gw, gw + 1, gw + 2].filter((g) => g === gw || ctx.actNext?.[g]);
  const actAt = (g) => (g === gw ? act : ctx.actNext[g]);
  const realGain = (o, i) => spanG.reduce((s, g) => s + ptsOf(actAt(g), i) - ptsOf(actAt(g), o), 0);
  const predGain = (o, i) => spanG.reduce((s, _, k) => s + ((R.trXp[i]?.[k] ?? 0) - (R.trXp[o]?.[k] ?? 0)), 0);
  const done = (o, i) => (ctx.transfers || []).some((t) => t.event === gw && t.element_in === i && (o == null || t.element_out === o));
  if (R.tr.kind === 'go') {
    const rg = realGain(R.tr.out, R.tr.in), pg = predGain(R.tr.out, R.tr.in);
    const altG = R.trAlts.filter((a) => !a.blocked).map((a) => ({ ...a, real: realGain(a.out, a.in) }));
    const bestAlt = altG.length ? Math.max(...altG.map((a) => a.real)) : null;
    const j = judge({ chosenV: R.tr.g, altVs: R.trAlts.filter((a) => !a.blocked).map((a) => a.g), chosenPts: rg, bestAltPts: bestAlt == null ? 0 : Math.max(0, bestAlt), tol: 2 });
    ev = { kind: 'go', out: R.tr.out, in: R.tr.in, conf: R.tr.conf || null, span: spanG.length, pred: r1(pg), real: rg, ...j, followed: done(R.tr.out, R.tr.in) };
    if (rg < 0) regrets.push({ gw, who: 'engine', type: 'transfer', size: -rg, chosen: R.tr.in, alt: R.tr.out, avoidable: j.process === 'unsound', cause: j.luck || j.cell, span: spanG.length });
    if (!ev.followed && rg >= 4 && !(ctx.transfers || []).some((t) => t.event === gw)) regrets.push({ gw, who: 'manager', type: 'hold', size: rg, chosen: R.tr.out, alt: R.tr.in, avoidable: j.process === 'sound', cause: 'ignored_rec', ignoredRec: true, span: spanG.length });
  } else if (R.trAlts.some((a) => !a.blocked)) {
    // احتفظ / لا ضربة: الندم فقط إذا أفضل بديل مدروس رجّع أكثر من العتبة اللي اعتمدها المحرك
    const top = R.trAlts.find((a) => !a.blocked); if (!top) return { tr: { kind: R.tr.kind }, regrets };
  const rg = realGain(top.out, top.in), bar = R.tr.kind === 'nohit' ? (R.constraints.hitBar || 4) : (R.constraints.ftBar || 1.5);
    const j = judge({ chosenV: bar, altVs: [top.g], chosenPts: 0, bestAltPts: rg - (R.tr.kind === 'nohit' ? 4 : 0), tol: 2 });
    ev = { kind: R.tr.kind, top: [top.out, top.in], span: spanG.length, real: rg, ...j };
    if (rg - (R.tr.kind === 'nohit' ? 4 : 0) >= 4) regrets.push({ gw, who: 'engine', type: R.tr.kind === 'nohit' ? 'missed_hit' : 'roll', size: rg - (R.tr.kind === 'nohit' ? 4 : 0), chosen: null, alt: top.in, avoidable: j.process === 'unsound', cause: j.luck || j.cell, span: spanG.length });
  }
  // انتقالات المدرب اللي ما وصاها المحرك: بيع لاعب قبل جولة قوية
  (ctx.transfers || []).filter((t) => t.event === gw && !(R.tr.kind === 'go' && t.element_in === R.tr.in)).forEach((t) => {
    const rg = realGain(t.element_out, t.element_in);
    if (rg <= -4) regrets.push({ gw, who: 'manager', type: 'sold_before_haul', size: -rg, chosen: t.element_in, alt: t.element_out, avoidable: null, cause: 'outcome_only', span: spanG.length });
  });
  return { tr: ev, regrets };
}

/** سجل لكل إصدار من المحرك (Baseline) — تستخدمه المرحلة الثالثة لكشف التراجع */
function accumulateVersion(b, ev) {
  const V = (b.byVer[ev.ver] = b.byVer[ev.ver] || { n: 0, mae: 0, ppg: 0, form: 0, brier: 0, nb: 0, capN: 0, capGood: 0, capSound: 0, trN: 0, trReal: 0, first: ev.gw, last: ev.gw });
  if (ev.m) { V.n++; V.mae += ev.m.mae; V.ppg += ev.m.base.ppg; V.form += ev.m.base.form; if (ev.m.brier != null) { V.brier += ev.m.brier; V.nb++; } }
  if (ev.cap?.outcome) { V.capN++; if (ev.cap.outcome === 'good') V.capGood++; if (ev.cap.process === 'sound') V.capSound++; }
  if (ev.tr?.kind === 'go') { V.trN++; V.trReal += ev.tr.real; }
  V.first = Math.min(V.first, ev.gw); V.last = Math.max(V.last, ev.gw);
}

/** يقيّم كل الجولات المنتهية اللي عندها توصية محفوظة وما تقيّمت */
export function evaluateDue(ctx) {
  const b = load(ctx.entryId); if (!b) return [];
  const out = [];
  Object.keys(b.recs).map(Number).sort((a, c) => a - c).forEach((g) => {
    if (!ctx.isFinished(g)) return;
    const act = ctx.pts?.[g]; if (!act) return;
    const actNext = {}; [g + 1, g + 2].forEach((x) => { if (ctx.isFinished(x) && ctx.pts?.[x]) actNext[x] = ctx.pts[x]; });
    const full = g + 2 > (ctx.lastGW || 38) || (ctx.lastGW && g >= ctx.lastGW - 1 && ctx.isFinished(ctx.lastGW));
    const c = { entryId: ctx.entryId, gw: g, act, actNext, picks: ctx.picks?.[g]?.p, chip: ctx.picks?.[g]?.chip, transfers: ctx.transfers, ftBefore: ctx.ftBefore?.(g), full, under: ctx.under?.(g) || null };
    const old = b.evals.find((x) => x.gw === g);
    if (!old) { const e = evaluateGW(c); if (e) out.push(e); return; }
    if (old.trPending && b.recs[g]?.tr && (full || (actNext[g + 1] && actNext[g + 2]))) {
      const t = evalTransfer(b.recs[g], c); old.tr = t.tr; delete old.trPending; old.regret += t.regrets.length; b.regret.push(...t.regrets);
      const V = b.byVer[old.ver]; if (V && t.tr.kind === 'go') { V.trN++; V.trReal += t.tr.real; }
      save(b); out.push(old);
    }
  });
  return out;
}

/** (8) مقترحات تعديل النموذج بعد اختبارها — تنحفظ بس، وما تنطبق (الاعتماد بالمرحلة الثالثة) */
export function saveProposals(entryId, list) {
  const b = load(entryId); if (!b) return;
  b.proposals = b.proposals || [];
  list.forEach((p) => { const i = b.proposals.findIndex((x) => x.seg === p.seg && x.ver === ENGINE_VER); const row = { ...p, ver: ENGINE_VER, at: Date.now(), applied: false }; if (i >= 0) b.proposals[i] = row; else b.proposals.push(row); });
  b.proposals = b.proposals.slice(-20); save(b);
}

/* ---------- الملخص: ملف المدرب التحليلي ---------- */
export function summary(entryId) {
  const b = load(entryId); if (!b) return null;
  const E = b.evals, n = E.length;
  const caps = E.filter((e) => e.cap?.outcome), cells = { earned: 0, unlucky: 0, lucky: 0, mistake: 0 };
  caps.forEach((e) => { if (e.cap.cell) cells[e.cap.cell]++; });
  const followed = E.filter((e) => e.cap?.followed != null), fy = followed.filter((e) => e.cap.followed).length;
  const ign = E.filter((e) => e.mgrCap), ignWorse = ign.filter((e) => e.mgrCap.engineBetter).length;
  // الندم حسب النوع + التكرار (آخر 8 جولات)
  const recent = Math.max(0, ...E.map((e) => e.gw)) - 8;
  const byType = {};
  b.regret.forEach((r) => { const k = `${r.who}:${r.type}`; const t = (byType[k] = byType[k] || { who: r.who, type: r.type, n: 0, size: 0, avoidable: 0, recentN: 0 }); t.n++; t.size += r.size; if (r.avoidable) t.avoidable++; if (r.gw > recent) t.recentN++; });
  const recurring = Object.values(byType).filter((t) => t.recentN >= 3 && t.avoidable >= 2).sort((a, c) => c.size - a.size);
  // معايرة الثقة: نسبة النتائج الجيدة حسب مستوى الثقة
  const confCal = {}; caps.forEach((e) => { const c = e.cap.conf || 'na'; const o = (confCal[c] = confCal[c] || { n: 0, good: 0 }); o.n++; if (e.cap.outcome === 'good') o.good++; });
  const M = E.filter((e) => e.m), avg = (f) => (M.length ? r2(M.reduce((a, e) => a + f(e), 0) / M.length) : null);
  return {
    n, ver: ENGINE_VER,
    pred: M.length ? { mae: avg((e) => e.m.mae), ppg: avg((e) => e.m.base.ppg), form: avg((e) => e.m.base.form), brier: M.some((e) => e.m.brier != null) ? +(M.filter((e) => e.m.brier != null).reduce((a, e) => a + e.m.brier, 0) / M.filter((e) => e.m.brier != null).length).toFixed(3) : null } : null,
    cap: caps.length ? { n: caps.length, cells, confCal } : null,
    follow: followed.length ? { n: followed.length, yes: fy, ignoredN: ign.length, ignoredWorse: ignWorse } : null,
    regret: Object.values(byType).sort((a, c) => c.size - a.size).map((t) => ({ ...t, size: r1(t.size) })),
    recurring, guard: b.guard, byVer: b.byVer, proposals: b.proposals || [], last: E[n - 1] || null, pending: Object.keys(b.recs).map(Number).filter((g) => !E.find((e) => e.gw === g)),
  };
}
