/* =========================================================
   كاشف التغير المفاجئ في مستوى اللاعب ودوره — Player Change Detector (القدرة 2)
   نقارن آخر 3 جولات بالجولات اللي قبلها (لحد 5) على الدور مو على النقاط:
   الدقائق، المشاركة أساسي، التهديد والصناعة وxG+xA لكل 90، والمساهمات الدفاعية لكل 90.
   التغير ينحسب "حقيقي" بس إذا تحقق شرطين سوا:
   1) إحصائياً: الفرق أكبر من ضعف خطئه المعياري (|z| ≥ 2)
   2) عملياً: الفرق كبير بما يكفي ليأثر (مثلاً 25 دقيقة بالمباراة)
   غير هيج يعتبر تذبذب عادي، حتى لو النقاط تغيرت.
========================================================= */
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const vari = (a) => { const m = mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : 0; };
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;

/** اختبار فرق متوسطين (Welch) مع حد أدنى للتباين حتى العينات الصغيرة ما تطلع نتائج وهمية */
export function zDiff(a, b, floorSd) {
  if (a.length < 2 || b.length < 2) return { d: 0, z: 0 };
  const d = mean(a) - mean(b), se = Math.sqrt(Math.max(vari(a), floorSd ** 2) / a.length + Math.max(vari(b), floorSd ** 2) / b.length);
  return { d, z: se ? d / se : 0, ma: mean(a), mb: mean(b) };
}
/** قيمة لكل 90 لكل جولة (الجولات اللي لعب بيها 30 دقيقة أو أكثر) */
const per90 = (R, k) => R.filter((r) => r.min >= 30 && r[k] != null).map((r) => (r[k] * 90) / r.min);

const RULES = [
  // [المفتاح, دالة القيم, أقل فرق عملي, حد أدنى للانحراف المعياري]
  ['min', (R) => R.map((r) => r.min), () => 25, 12],
  ['start', (R) => (R.every((r) => r.starts != null) ? R.map((r) => (r.starts ? 1 : 0)) : R.map((r) => (r.min >= 60 ? 1 : 0))), () => 0.5, 0.25],
  ['threat90', (R) => per90(R, 'threat'), (mb) => Math.max(10, 0.4 * mb), 8],
  ['creat90', (R) => per90(R, 'creat'), (mb) => Math.max(10, 0.4 * mb), 8],
  ['xgi90', (R) => R.filter((r) => r.min >= 30 && r.xg != null && r.xa != null).map((r) => ((r.xg + r.xa) * 90) / r.min), (mb) => Math.max(0.15, 0.4 * mb), 0.12],
  ['dc90', (R) => per90(R, 'dc'), (mb) => Math.max(2, 0.3 * mb), 1.5],
];

/**
 * @param rows صفوف اللاعب من الأقدم للأحدث (stats.rows)
 * @returns {changes:[{k, dir, from, to, z}], role:'up'|'down'|null, recentStart, noise:bool, missing:[...]}
 */
export function detect(rows, { recentN = 3, baseN = 5 } = {}) {
  if (!rows || rows.length < recentN + 2) return { changes: [], role: null, recentStart: null, noise: false, missing: ['history'], n: rows?.length || 0 };
  const R = rows.slice(-recentN), B = rows.slice(-(recentN + baseN), -recentN);
  const changes = [], missing = [];
  for (const [k, f, prac, floor] of RULES) {
    const a = f(R), b = f(B);
    if (a.length < 2 || b.length < 2) { if (k !== 'min' && k !== 'start') missing.push(k); continue; }
    const t = zDiff(a, b, floor);
    if (Math.abs(t.z) >= 2 && Math.abs(t.d) >= prac(t.mb)) changes.push({ k, dir: t.d > 0 ? 'up' : 'down', from: r2(t.mb), to: r2(t.ma), z: r1(t.z) });
  }
  const st = RULES[1][1](R);
  const role = changes.find((c) => c.k === 'start' || c.k === 'min')?.dir || null;
  // تذبذب: النقاط تغيرت كثير بس ولا مؤشر من مؤشرات الدور تغير
  const pz = zDiff(R.map((r) => r.pts), B.map((r) => r.pts), 2);
  const noise = !changes.length && Math.abs(pz.z) >= 2;
  return { changes, role, recentStart: r2(mean(st)), noise, missing, n: rows.length, ptsShift: noise ? r1(pz.d) : 0 };
}

/** نسبة المشاركة أساسي اللي يعتمدها المحرك: إذا الدور تغير فعلاً نعتمد الحديثة أكثر */
export function startShare(seasonShare, det) {
  if (!det || !det.role || det.recentStart == null) return seasonShare;
  return 0.7 * det.recentStart + 0.3 * seasonShare;
}
