/* =========================================================
   محاكاة سلوك المدرب المستقبلي — Manager Behavior Prediction (القدرة 5)
   نموذج مستقل لكل مدرب من سجله هو بس:
   - يسوي انتقال أو يجمع؟ ياخذ ضربة؟ وشلون يتغير هذا بعد جولة سيئة أو لما ترتيبه ينزل
   - يختار كابتن الأغلبية لو يختلف؟ يستخدم الأوراق بأي وقت؟ يتبع توصيات المحرك؟
   التقدير: تكرار سلوكه مع "تنعيم" نحو قيمة عامة (Beta prior) حتى ما نحكم من جولتين.
   ونختبر النموذج على تاريخه (كل جولة نتوقعها من اللي قبلها بس) ونقارنه بخط أساس ثابت —
   إذا ما يتفوق نقول "ضعيف" وما نبني عليه.
   الهدف: نفهم المدرب حتى نصيغ النصيحة صح — مو نكرر أخطاءه. التوصية نفسها تبقى أفضل قرار تحليلي.
========================================================= */
const PRIOR = { tr: [0.7, 4], hit: [0.15, 4], tpl: [0.55, 4], follow: [0.5, 2] }; // [القيمة العامة, قوتها]
const r2 = (n) => Math.round(n * 100) / 100;
const est = (k, n, [p0, s]) => (k + p0 * s) / (n + s);

/** صفوف السلوك لكل جولة من سجل المدرب */
export function behaviourRows({ hist, events, picks }) {
  const cur = hist?.current || [], chips = Object.fromEntries((hist?.chips || []).map((c) => [c.event, c.name]));
  const avg = Object.fromEntries((events || []).map((e) => [e.id, e.avg]));
  const mc = Object.fromEntries((events || []).map((e) => [e.id, e.cap]));
  return cur.map((h, i) => {
    const prev = cur[i - 1], prev2 = cur[i - 2];
    const bad = prev && avg[prev.event] != null ? prev.points - avg[prev.event] <= -8 : null;
    const falling = prev && prev2 && prev.overall_rank && prev2.overall_rank ? prev.overall_rank > prev2.overall_rank : null;
    const cap = picks?.[h.event]?.p?.find((x) => x[3] === 1)?.[0] ?? null;
    return { gw: h.event, tr: (h.event_transfers || 0) > 0 && !['wildcard', 'freehit'].includes(chips[h.event]), hit: (h.event_transfers_cost || 0) > 0, chip: chips[h.event] || null, bad, falling, tpl: cap != null && mc[h.event] ? cap === mc[h.event] : null };
  }).filter((r) => r.gw > (cur[0]?.event || 0)); // أول جولة ما بيها قرار انتقال
}

/** النموذج: احتمالات عامة ومشروطة */
export function fit(rows, follow = null) {
  const cnt = (f, g = () => true) => { const R = rows.filter(g); return [R.filter(f).length, R.length]; };
  const P = (key, f, g) => { const [k, n] = cnt(f, g); return { p: r2(est(k, n, PRIOR[key])), n }; };
  const trs = (r) => r.tr || r.hit;
  return {
    n: rows.length,
    tr: P('tr', trs), trBad: P('tr', trs, (r) => r.bad === true), trOk: P('tr', trs, (r) => r.bad === false),
    hit: P('hit', (r) => r.hit), hitBad: P('hit', (r) => r.hit, (r) => r.bad === true), hitFalling: P('hit', (r) => r.hit, (r) => r.falling === true),
    tpl: P('tpl', (r) => r.tpl === true, (r) => r.tpl != null),
    chipsUsed: rows.filter((r) => r.chip).map((r) => [r.gw, r.chip]),
    follow: follow && follow.n ? { p: r2(est(follow.yes, follow.n, PRIOR.follow)), n: follow.n } : null,
  };
}

/** توقع الجولة الجاية حسب وضعه هسه */
export function predict(M, ctx) {
  const pick = (a, b) => (ctx.bad === true && a.n >= 2 ? a : b);
  return { tr: pick(M.trBad, M.trOk.n >= 2 ? M.trOk : M.tr).p, hit: (ctx.bad === true && M.hitBad.n >= 2 ? M.hitBad : ctx.falling === true && M.hitFalling.n >= 2 ? M.hitFalling : M.hit).p, tpl: M.tpl.p, follow: M.follow?.p ?? null };
}

/** اختبار تاريخي بدون تسرب: كل جولة نتوقع "يسوي انتقال؟" من الجولات اللي قبلها بس، ونقارن بخط أساس ثابت */
export function backtest(rows) {
  let bm = 0, bb = 0, n = 0;
  for (let i = 4; i < rows.length; i++) {
    const M = fit(rows.slice(0, i)), r = rows[i], y = r.tr || r.hit ? 1 : 0;
    const p = predict(M, { bad: r.bad, falling: r.falling }).tr;
    bm += (p - y) ** 2; bb += (PRIOR.tr[0] - y) ** 2; n++;
  }
  if (n < 4) return { n, model: null, base: null, useful: false };
  return { n, model: +(bm / n).toFixed(3), base: +(bb / n).toFixed(3), useful: bm < bb * 0.95 };
}
