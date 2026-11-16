/* اختبارات المرحلة الثالثة: اختبار المقاومة (11) + الحماية من التراجع (14) */
import test from 'node:test';
import assert from 'node:assert/strict';
const LSD = new Map();
globalThis.localStorage = { getItem: (k) => (LSD.has(k) ? LSD.get(k) : null), setItem: (k, v) => LSD.set(k, String(v)), removeItem: (k) => LSD.delete(k) };
const SX = await import('../js/intel/stress.js');
const RG = await import('../js/intel/regress.js');

/* ---------- (11) ---------- */
const POS = { 1: 'GK', 2: 'DEF', 3: 'DEF', 4: 'DEF', 5: 'MID', 6: 'MID', 7: 'MID', 8: 'MID', 9: 'FWD', 10: 'FWD', 11: 'MID', 12: 'GK', 13: 'DEF', 14: 'MID', 15: 'FWD' };
const plan = { xi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], bench: [12, 13, 14, 15], cap: 9, vc: 5 };
const posOf = (id) => POS[id];
test('stress: التبديل التلقائي يحترم المراكز والترتيب', () => {
  // المدافع 2 ما يلعب: البديل الأول 13 (مدافع) يدخل
  assert.equal(SX.scorePlan(plan, posOf, () => 2, (id) => id !== 2), 22 + 2); // 11 لاعب×2 + كابتن×2
  // الحارس ما يلعب: يدخل الحارس الاحتياط بس
  assert.equal(SX.scorePlan(plan, posOf, (id) => (id === 12 ? 5 : 2), (id) => id !== 1), 20 + 5 + 2);
  // 3 مدافعين بس وواحد غايب والبديل الأول وسط: لازم يتخطاه للمدافع
  const p2 = { ...plan, bench: [12, 14, 13, 15] };
  assert.equal(SX.scorePlan(p2, posOf, (id) => (id === 13 ? 7 : id === 14 ? 9 : 2), (id) => id !== 2), 20 + 7 + 2);
});
test('stress: غياب الكابتن ينقل الشارة للنائب', () => {
  assert.equal(SX.scorePlan(plan, posOf, (id) => (id === 5 ? 6 : 2), (id) => id !== 9 && id !== 13 && id !== 14 && id !== 15 && id !== 12), 2 * 9 + 12);
});
test('stress: السيناريوهات + المتوقع المرجّح باحتمالات المشاركة', () => {
  const av = (id) => (id === 7 ? 0.5 : 1), xp = (id) => (id === 9 ? 8 : id === 7 ? 2 : 4);
  const s = SX.stress(plan, { posOf, xp, avail: av, start: (id) => (id === 10 ? 0.5 : 1) });
  assert.ok(s.sc.capOut < s.base && s.sc.capBlank < s.base && s.sc.tough < s.base);
  assert.ok(s.sc.shortMin < s.base); // اللاعب 10 لاعب دوران
  assert.ok(s.weighted > 0 && s.spread > 0); assert.equal(s.worst, Math.min(...Object.values(s.sc)));
});
test('stress: التصنيف — الأكثر استقرار مقابل الأعلى توقع', () => {
  const c = SX.compare([{ k: 'a', s: { weighted: 60, worst: 40, spread: 20 } }, { k: 'b', s: { weighted: 58, worst: 50, spread: 8 } }]);
  assert.equal(c.best.k, 'a'); assert.equal(c.stable.k, 'b'); assert.equal(c.risky.k, 'a'); assert.equal(c.balanced.k, 'b');
});

/* ---------- (14) ---------- */
const ACTIVE = { posK: { GK: 1, DEF: 1, MID: 1, FWD: 1 }, formK: 1 };
const posOf2 = () => 'MID';
const gwData = (scale) => { const P = {}, act = {}; for (let i = 1; i <= 40; i++) { P[i] = [5, 0]; act[i] = [Math.round(5 * scale + ((i % 5) - 2)), 90]; } return { P, act }; };
test('regress: تعديل ما ينعتمد من جولة وحدة', () => {
  const st = { active: { ...ACTIVE, posK: { ...ACTIVE.posK } }, cand: { posK: { GK: 1, DEF: 1, MID: 0.8, FWD: 1 }, formK: 1, sa: 0, sc: 0, n: 0, g: 0 }, watch: null };
  const { P, act } = gwData(0.8);
  assert.equal(RG.gateStep(st, P, act, posOf2, 10).length, 0); assert.ok(st.cand); assert.equal(st.active.posK.MID, 1);
});
test('regress: يعتمد التعديل اللي يثبت على جولتين جديدتين', () => {
  const st = { active: { ...ACTIVE, posK: { ...ACTIVE.posK } }, cand: { posK: { GK: 1, DEF: 1, MID: 0.8, FWD: 1 }, formK: 1, sa: 0, sc: 0, n: 0, g: 0 }, watch: null };
  [10, 11].forEach((g) => { const { P, act } = gwData(0.8); RG.gateStep(st, P, act, posOf2, g); });
  assert.equal(st.active.posK.MID, 0.8); assert.ok(st.watch);
});
test('regress: يرفض التعديل اللي يخرّب', () => {
  const st = { active: { ...ACTIVE, posK: { ...ACTIVE.posK } }, cand: { posK: { GK: 1, DEF: 1, MID: 0.8, FWD: 1 }, formK: 1, sa: 0, sc: 0, n: 0, g: 0 }, watch: null };
  let log = []; [10, 11].forEach((g) => { const { P, act } = gwData(1); log = log.concat(RG.gateStep(st, P, act, posOf2, g)); });
  assert.equal(log[0].type, 'reject'); assert.equal(st.active.posK.MID, 1); assert.equal(st.cand, null);
});
test('regress: يرجع تلقائياً إذا التعديل المعتمد صار أسوأ بعدين', () => {
  const st = { active: { posK: { GK: 1, DEF: 1, MID: 0.8, FWD: 1 }, formK: 1 }, cand: null, watch: { prev: { posK: { ...ACTIVE.posK }, formK: 1 }, sa: 0, sp: 0, g: 0 } };
  let log = []; [12, 13].forEach((g) => { const { P, act } = gwData(1); log = log.concat(RG.gateStep(st, P, act, posOf2, g)); });
  assert.equal(log.length, 0); // جولتين ما تكفي
  const { P, act } = gwData(1); log = RG.gateStep(st, P, act, posOf2, 14);
  assert.equal(log[0].type, 'rollback'); assert.equal(st.active.posK.MID, 1);
});
test('regress: المرشح يتعلم بس إذا الفرق حقيقي', () => {
  const st = { active: { ...ACTIVE, posK: { ...ACTIVE.posK } }, cand: null, watch: null };
  RG.learnCand(st, { sp: { GK: 0, DEF: 0, MID: 50, FWD: 0 }, sa: { GK: 0, DEF: 0, MID: 30, FWD: 0 }, fP: 0, fA: 0 });
  assert.ok(st.cand && st.cand.posK.MID < 1); assert.equal(st.active.posK.MID, 1); // ما ينطبق مباشرة
});
test('regress: معامل التحيز يتقيّم للأمام بس (بعد إنشائه)', () => {
  const seg = (p, a, n = 30) => [n, p * n, a * n, p * p * n, a * a * n, p * a * n];
  const ev = [{ gw: 5, seg: { popular: seg(6, 4) } }, { gw: 6, seg: { popular: seg(6, 4.5) } }, { gw: 7, seg: { popular: seg(6, 4.6) } }];
  assert.equal(RG.segForward({ seg: 'popular', m: 0.8, gwAt: 6 }, ev).status, 'testing'); // جولة وحدة بعده
  ev.push({ gw: 8, seg: { popular: seg(6, 4.8) } });
  assert.equal(RG.segForward({ seg: 'popular', m: 0.8, gwAt: 6 }, ev).status, 'adopt');
  assert.equal(RG.segForward({ seg: 'popular', m: 1.2, gwAt: 6 }, ev).status, 'reject');
});
test('regress: تراجع إصدار الكود', () => {
  const v = (n, mae, ppg, capN, capGood, last) => ({ n, mae: mae * n, ppg: ppg * n, form: 0, brier: 0, nb: 0, capN, capGood, capSound: 0, trN: 0, trReal: 0, first: 1, last });
  assert.equal(RG.versionCheck({ a: v(5, 2.0, 2.1, 5, 3, 10), b: v(4, 2.3, 2.1, 4, 2, 14) }, 'b').status, 'regressed');
  assert.equal(RG.versionCheck({ a: v(5, 2.0, 2.1, 5, 3, 10), b: v(4, 2.0, 2.1, 4, 3, 14) }, 'b').status, 'ok');
  assert.equal(RG.versionCheck({ a: v(5, 2.0, 2.1, 5, 3, 10), b: v(2, 3, 2.1, 2, 0, 14) }, 'b').status, 'insufficient'); // جولتين ما تكفي
});
test('regress: المراقبة بعد الاعتماد تشتغل حتى لو أكو مرشح جديد يتجرب', () => {
  const st = { active: { posK: { GK: 1, DEF: 1, MID: 0.8, FWD: 1 }, formK: 1 }, cand: { posK: { GK: 1, DEF: 1, MID: 0.79, FWD: 1 }, formK: 1, sa: 0, sc: 0, n: 0, g: 0 }, watch: { prev: { posK: { GK: 1, DEF: 1, MID: 1, FWD: 1 }, formK: 1 }, sa: 0, sp: 0, g: 0 } };
  let log = []; [12, 13, 14].forEach((g) => { const { P, act } = gwData(1); log = log.concat(RG.gateStep(st, P, act, posOf2, g)); });
  assert.ok(log.find((x) => x.type === 'rollback')); assert.equal(st.active.posK.MID, 1);
});
