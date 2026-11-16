/* =========================================================
   مفاتيح تشغيل قدرات المحرك الجديدة (Feature Flags)
   - كل قدرة جديدة تشتغل كطبقة فوق المحرك الحالي، وإذا انطفت يرجع المحرك يشتغل مثل قبل بالضبط
   - للإيقاف من جهاز معيّن: localStorage.setItem('fp_flags', '{"guard":false}')
   - ENGINE_VER يتسجل ويا كل توصية حتى نقارن الإصدارات لاحقاً (المرحلة 3)
========================================================= */
export const ENGINE_VER = '3.1.0-p1';

const DEFAULTS = {
  decisionMemory: true, // 1 + 4 + 13: حفظ البدائل، الندم، وتقييم جودة القرار
  guard: true,          // 6: كاشف تضارب التوصيات
};

let cache = null;
export function flag(name) {
  if (!cache) {
    let o = {};
    try { o = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('fp_flags')) || '{}') || {}; } catch {}
    cache = { ...DEFAULTS, ...o };
  }
  return cache[name] !== false;
}
export const _resetFlags = () => { cache = null; };
