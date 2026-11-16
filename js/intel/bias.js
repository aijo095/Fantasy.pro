/* =========================================================
   نظام اكتشاف تحيز المحرك — AI Bias Detection (القدرة 8)
   نقارن توقعات المحرك بالنتائج حسب نوع اللاعب والسياق (من ذاكرة القرارات):
   الشعبيين، الغاليين والرخاص، اللي فورمتهم أعلى من مستواهم (الاعتماد على آخر المباريات)،
   بعد جولة استثنائية (المبالغة برد الفعل)، المباريات السهلة والصعبة (المبالغة بأثر الجدول)،
   ومعدل نقاط عالي بفرص ضعيفة. وكذلك تكرار نفس الكابتن بدون مبرر.
   الانحياز ينحسب بس إذا: الفرق عن خطأ المحرك العام ≥ 0.5 نقطة، |t| ≥ 2.5، عينة 40+ عبر 3 جولات أو أكثر.
   عند اكتشافه: نقترح معامل تعديل، ونختبره "زمنياً": نحسبه من الجولات الأقدم ونجربه على الأحدث.
   المقترح ينحفظ بس — ما ينطبق على المحرك قبل نظام الحماية (المرحلة الثالثة).
========================================================= */
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const add = (A, x) => { for (let i = 0; i < 6; i++) A[i] += x[i] || 0; return A; };
const Z = () => [0, 0, 0, 0, 0, 0];
// [n, Σp, Σa, Σp², Σa², Σpa]
const meanErr = (x) => (x[0] ? (x[1] - x[2]) / x[0] : 0);
const varErr = (x) => { if (x[0] < 2) return 0; const m = meanErr(x), se2 = (x[3] - 2 * x[5] + x[4]) / x[0]; return Math.max(0, (se2 - m * m) * x[0] / (x[0] - 1)); };
const mseScaled = (x, m) => (x[0] ? (m * m * x[3] - 2 * m * x[5] + x[4]) / x[0] : 0);

/** @param evals من memory (كل واحد بيه seg) */
export function detectBias(evals, { minN = 40, minGw = 3, minD = 0.5, minT = 2.5 } = {}) {
  const E = (evals || []).filter((e) => e.seg?.all).sort((a, b) => a.gw - b.gw);
  if (E.length < minGw) return { flags: [], n: E.length, enough: false };
  const tot = {}; E.forEach((e) => Object.entries(e.seg).forEach(([k, x]) => (tot[k] = add(tot[k] || Z(), x))));
  const all = tot.all, mAll = meanErr(all), flags = [];
  for (const [k, x] of Object.entries(tot)) {
    if (k === 'all' || x[0] < minN) continue;
    const gwN = E.filter((e) => e.seg[k]?.[0]).length; if (gwN < minGw) continue;
    const d = meanErr(x) - mAll, se = Math.sqrt(varErr(x) / x[0]), t = se ? d / se : 0;
    if (Math.abs(d) < minD || Math.abs(t) < minT) continue;
    flags.push({ seg: k, d: r2(d), t: r2(t), n: x[0], gws: gwN, dir: d > 0 ? 'over' : 'under', proposal: propose(E, k) });
  }
  return { flags: flags.sort((a, b) => Math.abs(b.t) - Math.abs(a.t)), n: E.length, enough: true, mAll: r2(mAll) };
}

/** معامل تعديل يتحسب من النصف الأقدم ويتجرب على النصف الأحدث (بدون تسرب) */
export function propose(E, k) {
  const half = Math.floor(E.length / 2); if (half < 2) return null;
  const tr = E.slice(0, half).reduce((A, e) => add(A, e.seg[k] || Z()), Z()), te = E.slice(half).reduce((A, e) => add(A, e.seg[k] || Z()), Z());
  if (tr[0] < 15 || te[0] < 15 || !tr[3]) return null;
  const m = r2(clamp(tr[5] / tr[3], 0.8, 1.2)); // أفضل معامل بالمربعات الصغرى، محدود ±20%
  const before = r2(mseScaled(te, 1)), after = r2(mseScaled(te, m));
  return { m, train: tr[0], test: te[0], before, after, passed: after < before * 0.98 };
}

/** تكرار نفس الكابتن 4 جولات متتالية أو أكثر والبديل كان قريب جداً كل مرة */
export function captainRepeat(recs) {
  const G = Object.keys(recs || {}).map(Number).sort((a, b) => a - b);
  let run = [], best = [];
  for (const g of G) {
    const R = recs[g]; if (!R?.cap) { run = []; continue; }
    const alt = Math.max(-Infinity, ...(R.capAlts || []).filter((a) => a.id !== R.cap.id && !a.blocked).map((a) => a.v));
    const close = R.cap.v - alt <= 0.3;
    if (run.length && run[run.length - 1].id === R.cap.id && close) run.push({ g, id: R.cap.id }); else run = close ? [{ g, id: R.cap.id }] : [];
    if (run.length > best.length) best = [...run];
  }
  return best.length >= 4 ? { id: best[0].id, n: best.length, from: best[0].g, to: best[best.length - 1].g } : null;
}
