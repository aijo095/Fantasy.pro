/* =========================================================
   مفاتيح تشغيل قدرات المحرك الجديدة (Feature Flags)
   - كل قدرة جديدة تشتغل كطبقة فوق المحرك الحالي، وإذا انطفت يرجع المحرك يشتغل مثل قبل بالضبط
   - للإيقاف من جهاز معيّن: localStorage.setItem('fp_flags', '{"guard":false}')
   - ENGINE_VER يتسجل ويا كل توصية حتى نقارن الإصدارات لاحقاً (المرحلة 3)
========================================================= */
export const ENGINE_VER = '3.2.0-p2';

const DEFAULTS = {
  decisionMemory: true, // 1 + 4 + 13: حفظ البدائل، الندم، وتقييم جودة القرار
  guard: true,          // 6: كاشف تضارب التوصيات
  changeDetector: true, // 2: كاشف تغير دور اللاعب
  hiddenValue: true,    // 7: القيمة المخفية
  seasonal: true,       // 12: الأنماط الموسمية
  timing: true,         // 3: أفضل توقيت للقرار
  sequential: true,     // 9: مقارنة خطط متعددة الجولات
  managerModel: true,   // 5: توقع سلوك المدرب
  crossManager: true,   // 10: الفرص من مقارنة المدربين (أفضل 10,000)
  biasDetect: true,     // 8: اكتشاف تحيز المحرك (مقترحات فقط)
  positiveLearn: true,  // 15: التعلم من النجاح
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
