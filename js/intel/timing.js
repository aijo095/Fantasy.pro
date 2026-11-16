/* =========================================================
   أفضل توقيت لاتخاذ القرار — Optimal Decision Timing (القدرة 3)
   نوازن بين:
   - قيمة المعلومة الجاية: إذا اللاعب اللي تشتريه أو تبيعه مشكوك بمشاركته، الانتظار يكشف وضعه
   - كلفة الانتظار: ارتفاع سعر اللاعب اللي تريده أو نزول سعر اللي تبيعه (من توقع الفانتازي الرسمي)
     وإذا الفرق يخلي الصفقة ما تنفع بالميزانية، نخسر الفرصة كلها
   - الوقت الباقي للديدلاين
   حقيقة مهمة: التشكيلات الرسمية تنعلن ساعة قبل المباراة، والديدلاين قبل أول مباراة بـ90 دقيقة،
   فـ"انتظار التشكيلة" قبل الانتقالات مو ممكن أبداً — والمحرك ما يوصي بيه.
========================================================= */
const r1 = (n) => Math.round(n * 10) / 10;
const H = 36e5;

/** احتمال تغيّر السعر بالتحديث الجاي (من بيانات الفانتازي الرسمية إذا متوفرة) */
export function priceRisk(p) {
  if (!p) return 0;
  if (p.pcLock) return 0;
  const nx = p.pcProj?.find((x) => x.o === 0), pct = nx ? nx.pct : p.pcp;
  if (pct == null) return 0;
  if (Math.abs(pct) >= 100) return Math.sign(pct);
  if (Math.abs(pct) >= 85) return Math.sign(pct) * 0.6;
  return 0;
}

/**
 * @param x {now, deadline, gain, inP, outP, bank10, sell10, avail(p)}
 * @returns {k:'now'|'wait'|'deadline'|'none', by, reason:{...}}
 */
export function decideTiming(x) {
  const left = x.deadline ? (new Date(x.deadline).getTime() - x.now) / H : null;
  if (left == null || left <= 0) return { k: 'none', reason: { code: 'no_deadline' } };
  if (!x.inP || !x.outP) return { k: 'none', reason: { code: 'no_move' } };
  const aIn = x.avail(x.inP), aOut = x.avail(x.outP);
  // قيمة المعلومة: النقاط اللي ممكن نتجنب خسارتها إذا انتظرنا الخبر
  const infoIn = (1 - aIn) * Math.max(0, x.gain), infoOut = aOut < 1 ? aOut * 0.5 * Math.max(0, x.gain) : 0; // إذا اللي نبيعه ممكن يرجع، يمكن ما نحتاج نبيعه
  const info = r1(infoIn + infoOut);
  // كلفة الانتظار: تغيّر السعر قبل الديدلاين (التحديث يومي)
  const updates = Math.max(0, Math.floor(left / 24) + (left >= 1 ? 1 : 0));
  const rIn = updates ? Math.max(0, priceRisk(x.inP)) : 0, rOut = updates ? Math.max(0, -priceRisk(x.outP)) : 0;
  const slack = x.bank10 + x.sell10 - Math.round(x.inP.price * 10); // كم عُشر باقي بعد الصفقة
  const lose = (rIn > 0 && slack < 1) || (rOut > 0 && slack < 1) ? Math.max(rIn, rOut) : 0; // احتمال الصفقة ما تعود ممكنة
  const cost = r1(lose * Math.max(0, x.gain) + (rIn + rOut) * 0.3); // 0.1م ≈ 0.3 نقطة قيمة تقريبية
  const reason = { code: '', info, cost, left: r1(left), aIn, aOut, rIn, rOut, slack };
  if (left < 3) return { k: 'now', reason: { ...reason, code: 'deadline_close' } };
  if (lose >= 0.6) return { k: 'now', reason: { ...reason, code: 'price_lock_out' } };
  if (info > cost + 0.3) return { k: 'wait', by: new Date(new Date(x.deadline).getTime() - 3 * H).toISOString(), reason: { ...reason, code: aIn < 1 ? 'in_doubtful' : 'out_doubtful' } };
  if (cost > 0.2) return { k: 'now', reason: { ...reason, code: 'price_move' } };
  return { k: 'deadline', reason: { ...reason, code: 'no_rush' } };
}
