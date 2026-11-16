/* =========================================================
   محرك التعلم من القرارات الناجحة — Positive Learning Engine (القدرة 15)
   1) كل لاعب بتشكيلة المدرب جاب 10+ نقاط: هل النجاح من تحليل صحيح لو حظ؟
      - "تحليل صحيح": كان من أعلى 3 توقعات بتشكيلته (أو توقعه 5+)، وأداؤه الحقيقي بالجولة يسند (xG+xA ≥ 0.5)
      - "حظ": نقاط عالية وأداء حقيقي ضعيف (xG+xA < 0.3) — هدف من فرصة صغيرة، بونص…
   2) أنماط النجاح: أي سمة (مباراة سهلة، فورمة عالية، سعر رخيص…) تزيد نسبة "الجولات الكبيرة" فعلاً؟
      نختبرها إحصائياً (اختبار فرق نسبتين) على كل الجولات المقيّمة. النمط ينعرض بس إذا الفرق
      مثبت (z ≥ 2) وعينته كافية — وغير هيج نعتبره مصادفة.
   هالنتائج تنحفظ كمعرفة، وما تغيّر أوزان المحرك قبل نظام الحماية (المرحلة الثالثة).
========================================================= */
const r2 = (n) => Math.round(n * 100) / 100;

/** نجاحات المدرب الأخيرة مع الحكم: تحليل لو حظ */
export function wins(evals, n = 8) {
  const W = (evals || []).slice(-n).flatMap((e) => (e.wins || []).map((w) => ({ ...w, gw: e.gw })));
  const c = { skill: 0, luck: 0, mixed: 0, expected: 0, unexpected: 0, unknown: 0 };
  W.forEach((w) => c[w.verdict]++);
  return { list: W, counts: c, surprise: W.filter((w) => w.unexpected && (w.verdict === 'skill' || w.verdict === 'mixed')) };
}

/** أنماط النجاح: نسبة الجولات الكبيرة مع السمة مقابل بدونها */
export function successPatterns(evals, { minN = 60, minGw = 3, minLift = 1.4, minZ = 2 } = {}) {
  const E = (evals || []).filter((e) => e.hauls?.all);
  if (E.length < minGw) return { list: [], enough: false };
  const tot = {}; E.forEach((e) => Object.entries(e.hauls).forEach(([k, [n, h]]) => { const t = (tot[k] = tot[k] || [0, 0]); t[0] += n; t[1] += h; }));
  const [N, Hh] = tot.all, list = [];
  for (const [k, [n, h]] of Object.entries(tot)) {
    if (k === 'all' || n < minN || N - n < minN) continue;
    const p1 = h / n, p0 = (Hh - h) / (N - n), p = Hh / N;
    const se = Math.sqrt(p * (1 - p) * (1 / n + 1 / (N - n))); if (!se) continue;
    const z = (p1 - p0) / se, lift = p0 ? p1 / p0 : null;
    if (z >= minZ && lift != null && lift >= minLift) list.push({ k, rate: r2(p1), base: r2(p0), lift: r2(lift), z: r2(z), n });
  }
  return { list: list.sort((a, b) => b.z - a.z), enough: true, N };
}
