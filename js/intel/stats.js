/* =========================================================
   مخزن إحصاءات اللاعبين بكل جولة (بيانات عامة — مشتركة بين كل المدربين على نفس الجهاز)
   المصدر: event/{gw}/live الرسمي. نخزن بشكل مضغوط آخر 8 جولات منتهية بس:
   [نقاط, دقائق, أساسي, xG×100, xA×100, تهديد, صناعة, مساهمات دفاعية]
   ملاحظة صادقة عن البيانات: الفانتازي ما ينشر التسديدات ولا التمريرات المفتاحية ولا اللمسات
   داخل منطقة الجزاء. نستخدم بدالها مؤشراته الرسمية: Threat (التهديد) وCreativity (الصناعة) وxG/xA.
   إذا الحقل ما موجود بالبيانات نخزنه null، وكل التحليلات تتجاهله بدل ما تفترض صفر.
========================================================= */
const KEY = 'fp_pstats_v1', KEEP = 8;
const LS = () => (typeof localStorage !== 'undefined' ? localStorage : null);
let S = null;

const num = (v, k = 1) => (v == null || v === '' || isNaN(+v) ? null : Math.round(+v * k));
/** يحوّل استجابة live لصفوف مضغوطة (بس اللي لعبوا أو جابوا نقاط) */
export function compact(elements) {
  const o = {};
  for (const e of elements || []) {
    const s = e.stats || {}; if (!(s.minutes || s.total_points)) continue;
    o[e.id] = [s.total_points || 0, s.minutes || 0, num(s.starts), num(s.expected_goals, 100), num(s.expected_assists, 100), num(s.threat), num(s.creativity), num(s.defensive_contribution)];
  }
  return o;
}
export function load() { if (S) return S; try { S = JSON.parse(LS()?.getItem(KEY) || 'null'); } catch {} if (!S?.gws) S = { gws: {} }; return S; }
function save() { const k = Object.keys(S.gws).map(Number).sort((a, b) => b - a); k.slice(KEEP).forEach((g) => delete S.gws[g]); try { LS()?.setItem(KEY, JSON.stringify(S)); } catch {} }
/** يضيف جولة جاهزة (مثلاً من جلب المدرب الذكي) بدون طلب جديد */
export function put(gw, elements) { load(); if (!S.gws[gw]) { S.gws[gw] = compact(elements); save(); } }
export const _set = (s) => { S = s; };

/** يتأكد إن آخر 8 جولات منتهية موجودة — يجيب الناقص بس */
export async function ensure(G, loadLive) {
  load();
  const fin = G.events.filter((e) => e.fin).map((e) => e.id).sort((a, b) => b - a).slice(0, KEEP);
  const need = fin.filter((g) => !S.gws[g]);
  for (const g of need) { try { const l = await loadLive(g); S.gws[g] = compact(l.elements); } catch {} }
  if (need.length) save();
  return S;
}
/** صفوف لاعب مرتبة من الأقدم للأحدث على الجولات المخزنة */
export function rows(id, s = load()) {
  return Object.keys(s.gws).map(Number).sort((a, b) => a - b).map((g) => {
    const r = s.gws[g][id];
    return r ? { gw: g, pts: r[0], min: r[1], starts: r[2], xg: r[3] == null ? null : r[3] / 100, xa: r[4] == null ? null : r[4] / 100, threat: r[5], creat: r[6], dc: r[7] }
      : { gw: g, pts: 0, min: 0, starts: 0, xg: 0, xa: 0, threat: 0, creat: 0, dc: 0, absent: true };
  });
}
export const gws = (s = load()) => Object.keys(s.gws).map(Number).sort((a, b) => a - b);
