/* =========================================================
   كاشف تضارب التوصيات — Recommendation Conflict Detector (القدرة 6)
   طبقة تحقق أخيرة: أي توصية (انتقال، كابتن، تشكيلة، ورقة) تنفحص هنا قبل ما تطلع للمدرب.
   إذا بيها مخالفة "block" ما تنعرض، والمدرب الذكي ياخذ البديل اللي بعدها أو يوصي بالاحتفاظ.
   كل الفحوصات من بيانات اللعبة الرسمية وقوانينها — ما أكو أرقام مخترعة.
========================================================= */
import { avail, fixturesFor, validXI } from './engine.js';

const SHAPE = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const CHIP_FREE = new Set(['wildcard', 'freehit']); // الانتقالات بيها بدون خصم

// المخالفات اللي سببها الانتقال نفسه (مو حالة الفريق الحالية)
const TR_CODES = new Set(['dup_buy_sell', 'buy_owned', 'sell_not_owned', 'pos_mismatch', 'unknown_player', 'unavailable', 'doubtful_buy', 'budget', 'too_many_hits', 'hit', 'squad_size', 'squad_shape', 'club_limit']);
const issue = (code, sev, msg, ids = []) => ({ code, sev, msg, ids });

/** يطبّق انتقالات على نسخة من الخطة (بدون ما يغيّر الأصل) */
export function applyTransfers(plan, transfers, PM, sell10) {
  const P = { ...plan, squad: [...plan.squad], xi: [...plan.xi], bench: [...plan.bench], bank10: Math.round((plan.bank || 0) * 10) };
  for (const t of transfers || []) {
    const rep = (a) => a.map((x) => (x === t.out ? t.in : x));
    P.squad = rep(P.squad); P.xi = rep(P.xi); P.bench = rep(P.bench);
    if (P.cap === t.out) P.cap = t.in; if (P.vc === t.out) P.vc = t.in;
    const sv = sell10 ? sell10(t.out) : Math.round((PM(t.out)?.price || 0) * 10);
    P.bank10 += sv - Math.round((PM(t.in)?.price || 0) * 10);
  }
  return P;
}

/**
 * فحص توصية كاملة.
 * @param plan الخطة الحالية للمدرب {squad, xi, bench, cap, vc, bank, ft, chip}
 * @param rec  التوصية {transfers:[{out,in}], cap, vc, chip, capRisk}
 * @param ctx  {G, PM, sell10, chipsLeft:{name:n}, maxHits}
 */
export function checkRecommendation(plan, rec, ctx) {
  const { G, PM } = ctx, gw = G.next, out = [];
  const trs = rec.transfers || [];
  const chip = rec.chip ?? plan.chip ?? '';
  const ins = trs.map((t) => t.in), outs = trs.map((t) => t.out);

  // 1) تعارض الشراء والبيع
  trs.forEach((t) => {
    if (t.in === t.out) out.push(issue('dup_buy_sell', 'block', 'نفس اللاعب بالشراء والبيع', [t.in]));
    if (plan.squad.includes(t.in) && !outs.includes(t.in)) out.push(issue('buy_owned', 'block', 'توصية بشراء لاعب موجود بالفريق', [t.in]));
    if (!plan.squad.includes(t.out)) out.push(issue('sell_not_owned', 'block', 'توصية ببيع لاعب مو بالفريق', [t.out]));
    if (PM(t.in) && PM(t.out) && PM(t.in).pos !== PM(t.out).pos) out.push(issue('pos_mismatch', 'block', 'البديل لازم يكون بنفس المركز', [t.out, t.in]));
  });
  if (new Set(ins).size !== ins.length || new Set(outs).size !== outs.length) out.push(issue('dup_buy_sell', 'block', 'لاعب مكرر بخطة الانتقالات'));
  if (ins.some((id) => outs.includes(id))) out.push(issue('dup_buy_sell', 'block', 'نفس اللاعب ينشرى وينباع بنفس الخطة'));

  // 2) لاعب غير متاح أو مشكوك بيه
  ins.forEach((id) => { const p = PM(id); if (!p) return out.push(issue('unknown_player', 'block', 'لاعب غير موجود ببيانات اللعبة', [id]));
    const a = avail(p, gw);
    if (p.st === 'u' || a === 0) out.push(issue('unavailable', 'block', `${p.name} غير متاح`, [id]));
    else if (a < 0.75) out.push(issue('doubtful_buy', 'warn', `${p.name} مشكوك بمشاركته (${Math.round(a * 100)}%)`, [id])); });

  // 3) الميزانية وعدد الانتقالات
  const after = applyTransfers(plan, trs, PM, ctx.sell10);
  if (after.bank10 < 0) out.push(issue('budget', 'block', `تتجاوز الميزانية بـ${(-after.bank10 / 10).toFixed(1)}م`));
  const paid = CHIP_FREE.has(chip) ? 0 : Math.max(0, trs.length - (plan.ft ?? 1));
  if (paid > (ctx.maxHits ?? 1)) out.push(issue('too_many_hits', 'block', `الخطة تحتاج ${paid} ضربات (−${paid * 4})، أكثر من المسموح`));
  else if (paid) out.push(issue('hit', 'warn', `الخطة بيها ضربة −${paid * 4}`));

  // 4) قوانين الفريق: 15 لاعب، 2/5/5/3، حد 3 من نفس النادي
  const shape = { GK: 0, DEF: 0, MID: 0, FWD: 0 }, club = {};
  after.squad.forEach((id) => { const p = PM(id); if (!p) return; shape[p.pos]++; club[p.team] = (club[p.team] || 0) + 1; });
  if (after.squad.length !== 15 || new Set(after.squad).size !== 15) out.push(issue('squad_size', 'block', 'الفريق لازم يكون 15 لاعب بدون تكرار'));
  Object.keys(SHAPE).forEach((k) => { if (shape[k] !== SHAPE[k]) out.push(issue('squad_shape', 'block', `عدد ${k} لازم ${SHAPE[k]}`)); });
  Object.entries(club).forEach(([t, n]) => { if (n > 3) out.push(issue('club_limit', 'block', `أكثر من 3 لاعبين من ${G.teams?.[t]?.short || t}`)); });

  // 5) التشكيلة والدكة
  if (!validXI(after.xi)) out.push(issue('xi_invalid', 'block', 'التشكيلة الأساسية مخالفة للمراكز المسموحة'));
  if (after.bench.length !== 4 || PM(after.bench[0])?.pos !== 'GK') out.push(issue('bench_order', 'block', 'أول لاعب بالدكة لازم يكون الحارس الاحتياط'));
  const outBench = after.bench.slice(1);
  const blankIdx = outBench.findIndex((id) => PM(id) && !fixturesFor(PM(id).team, gw).length);
  if (blankIdx >= 0 && outBench.slice(blankIdx + 1).some((id) => PM(id) && fixturesFor(PM(id).team, gw).length)) out.push(issue('bench_blank_first', 'warn', 'لاعب بدون مباراة مقدَّم على بديل عنده مباراة بالدكة', [outBench[blankIdx]]));
  after.xi.forEach((id) => { const p = PM(id); if (p && !fixturesFor(p.team, gw).length) out.push(issue('xi_blank', 'warn', `${p.name} أساسي وفريقه ما عنده مباراة`, [id])); });

  // 6) الكابتن
  const cap = rec.cap ?? after.cap, vc = 'vc' in rec ? rec.vc : after.vc; // vc: null = النائب يتعدّل ويا الكابتن
  if (cap != null) {
    const p = PM(cap);
    if (!after.xi.includes(cap)) out.push(issue('cap_not_xi', 'block', 'الكابتن لازم يكون بالتشكيلة الأساسية', [cap]));
    if (p) {
      const a = avail(p, gw);
      if (p.st === 'u' || a === 0) out.push(issue('cap_unavailable', 'block', `الكابتن ${p.name} غير متاح`, [cap]));
      else if (a < 0.75) out.push(issue('cap_doubtful', 'block', `الكابتن ${p.name} مشكوك بمشاركته (${Math.round(a * 100)}%)`, [cap]));
      if (!fixturesFor(p.team, gw).length) out.push(issue('cap_blank', 'block', `الكابتن ${p.name} فريقه ما عنده مباراة`, [cap]));
      if (rec.capRisk != null && rec.capRisk >= 50) out.push(issue('cap_role', 'warn', `مخاطرة مشاركة الكابتن عالية (${rec.capRisk}%) حسب تحليل الدقائق`, [cap]));
    }
    if (vc != null && vc === cap) out.push(issue('vc_same', 'block', 'الكابتن والنائب نفس اللاعب', [cap]));
  }

  // 7) الأوراق
  if (chip) {
    const left = ctx.chipsLeft?.[chip];
    if (left != null && left <= 0) out.push(issue('chip_used', 'block', `ورقة ${chip} مستخدمة أو مو متاحة`));
    if (chip === '3xc' && cap != null && PM(cap) && avail(PM(cap), gw) < 1) out.push(issue('chip_cap_risk', 'block', 'الكابتن الثلاثي على لاعب مو مضمون المشاركة'));
    if (chip === 'bboost') { const bad = after.bench.filter((id) => PM(id) && (avail(PM(id), gw) < 0.75 || !fixturesFor(PM(id).team, gw).length)); if (bad.length) out.push(issue('chip_bench_weak', 'warn', `البنش بوست ويا ${bad.length} بدلاء ما مضمون يلعبون`, bad)); }
    if (CHIP_FREE.has(chip) && trs.some((t) => t.cost > 0)) out.push(issue('chip_hit_conflict', 'warn', 'خصم ضربة محسوب ويا ورقة انتقالات مجانية'));
  }
  return { ok: !out.some((x) => x.sev === 'block'), issues: out, after };
}

/** مخالفات الانتقال نفسه فقط (للفلترة قبل الاختيار) */
export function transferBlocks(plan, transfers, ctx) {
  return checkRecommendation(plan, { transfers, cap: null }, ctx).issues.filter((x) => x.sev === 'block' && TR_CODES.has(x.code));
}
/** مخالفات الكابتن فقط */
export function captainBlocks(plan, capId, ctx, capRisk = null) {
  return checkRecommendation(plan, { transfers: [], cap: capId, vc: null, capRisk }, ctx).issues.filter((x) => x.sev === 'block' && x.code.startsWith('cap'));
}

/** يختار أول كابتن سليم من قائمة مرتبة (الكابتن المقترح ثم البدائل) */
export function firstValidCaptain(plan, list, ctx, extra = {}) {
  const rejected = [];
  for (const c of list) {
    const r = checkRecommendation(plan, { transfers: extra.transfers || [], cap: c.p.id, vc: null, capRisk: c.risk }, ctx);
    const capIss = r.issues.filter((x) => x.sev === 'block' && x.code.startsWith('cap'));
    if (!capIss.length) return { pick: c, rejected, warn: r.issues.filter((x) => x.code.startsWith('cap') && x.sev === 'warn') };
    rejected.push({ id: c.p.id, issues: capIss });
  }
  return { pick: null, rejected, warn: [] };
}

/** يختار أول انتقال سليم من قائمة مرتبة {o, c} */
export function firstValidMove(plan, moves, ctx) {
  const rejected = [];
  for (const m of moves) {
    const r = checkRecommendation(plan, { transfers: [{ out: m.o.id, in: m.c.id }], cap: null }, ctx);
    const bl = r.issues.filter((x) => x.sev === 'block' && TR_CODES.has(x.code));
    if (!bl.length) return { pick: m, rejected, warn: r.issues.filter((x) => TR_CODES.has(x.code)) };
    rejected.push({ out: m.o.id, in: m.c.id, issues: bl });
  }
  return { pick: null, rejected, warn: [] };
}
