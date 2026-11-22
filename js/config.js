/* =========================================================
   إعدادات التطبيق — عدّل هذا الملف فقط
   ---------------------------------------------------------
   1) انسخ إعدادات Firebase من:
      Firebase Console ← Project settings ← Your apps ← Web app ← SDK setup and configuration
   2) فعّل طرق الدخول من: Authentication ← Sign-in method
   3) إذا تركت apiKey فارغاً يشتغل التطبيق بـ"وضع التجربة" بدون Firebase
========================================================= */
export const CONFIG = {
  appName: 'فانتازي برو',

  firebase: {
    apiKey: 'AIzaSyCzS9DNZsf1fvdo0A2Qb4xt3EoRFjgtCps',            // مثال: 'AIzaSy...'
    authDomain: 'fantasy-pro-b77e0.firebaseapp.com',        // مثال: 'fantasy-pro-123.firebaseapp.com'
    projectId: 'fantasy-pro-b77e0',         // مثال: 'fantasy-pro-123'
    appId: '1:681211768665:web:82e78029df80bec56ae648',             // مثال: '1:1234567890:web:abc123'
  },

  // طرق الدخول الظاهرة بشاشة الدخول (لازم تفعّلها أيضاً داخل Firebase)
  providers: {
    google: true,
    apple: false,      // يحتاج حساب Apple Developer
    facebook: false,   // يحتاج تطبيق على Meta for Developers
    x: false,          // يحتاج مفاتيح من X Developer Portal
  },

  // المدرب الذكي: يشتغل إذا ضفت ANTHROPIC_API_KEY بإعدادات Vercel
  aiCoach: true,
};
