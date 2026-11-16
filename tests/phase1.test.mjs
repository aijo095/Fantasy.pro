/* اختبارات المرحلة الأولى: كاشف التضارب (6) + ذاكرة القرارات والندم وجودة القرار (1، 4، 13)
   تشغيل:  node --test tests/  */
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage وهمي (التطبيق يشتغل بالمتصفح)
const LSD = new Map();
globalThis.localStorage = { getItem: (k) => (LSD.has(k) ? LSD.get(k) : null), setItem: (k, v) => LSD.set(k, String(v)), removeItem: (k) => LSD.delete(k), key: (i) => [...LSD.keys()][i], get length() { return LSD.size; } };

const { setGame } = await import('../js/engine.js');
const guard = await import('../js/guard.js');
const DM = await import('../js/memory.js');

/* ---------- لعبة صغيرة: 4 أندية، 20 لاعب ---------- */
function makeGame() {
  const teams = { 1: { id: 1, short: 'AAA', name: 'A' }, 2: { id: 2, short: 'BBB', name: 'B' }, 3: { id: 3, short: 'CCC', name: 'C' }, 4: { id: 4, short: 'DDD', name: 'D' }, 5: { id: 5, short: 'EEE', name: 'E' }, 6: { id: 6, short: 'FFF', name: 'F' } };
  const P = []; let id = 1;
  const add = (pos, team, price, extra = {}) => P.push({ id: id++, name: `${pos}${id}`, pos, team, price, st: 'a', chance: null, ppg: 4, form: 4, ep: null, min: 900, own: 10, ...extra });
  // تشكيلة المدرب (15): GK 1-2, DEF 3-7, MID 8-12, FWD 13-15
  add('GK', 1, 5); add('GK', 2, 4.5);
  add('DEF', 1, 6); add('DEF', 2, 5); add('DEF', 3, 5); add('DEF', 4, 4.5); add('DEF', 5, 4.5);
  add('MID', 1, 10); add('MID', 2, 8); add('MID', 3, 7); add('MID', 4, 6); add('MID', 6, 5);
  add('FWD', 3, 9); add('FWD', 5, 7.5); add('FWD', 6, 6);
  // سوق: 16 MID غالي, 17 MID غير متاح, 18 MID نادي 6, 19 DEF مشكوك, 20 FWD رخيص
  add('MID', 5, 14); add('MID', 4, 6, { st: 'i', chance: 0 }); add('MID', 6, 5); add('DEF', 6, 4.5, { st: 'd', chance: 50 }); add('FWD', 4, 5); add('MID', 1, 5); // 21 MID من نادي 1
  const PM = Object.fromEntries(P.map((p) => [p.id, p]));
  const fx = { 10: [{ h: 1, a: 2, hd: 3, ad: 3 }, { h: 3, a: 4, hd: 3, ad: 3 }, { h: 5, a: 6, hd: 3, ad: 3 }] };
  return { teams, players: P, PM, fx, next: 10, finished: 9, lastGW: 38, events: [{ id: 10, deadline: '2099-01-01T00:00:00Z' }] };
}
const G = makeGame(); setGame(G);
const PMf = (id) => G.PM[id];
const plan = () => ({ squad: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], xi: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], bench: [2, 7, 12, 15], cap: 8, vc: 9, bank: 1.0, ft: 1, chip: '' });
const ctx = { G, PM: PMf, sell10: null, chipsLeft: { '3xc': 1, bboost: 0 }, maxHits: 1 };
const codes = (r) => r.issues.map((x) => x.code);

test('guard: توصية سليمة تعدي', () => {
  const r = guard.checkRecommendation(plan(), { transfers: [{ out: 11, in: 18 }], cap: 8, vc: 9 }, ctx);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});
test('guard: تجاوز الميزانية', () => { assert.ok(codes(guard.checkRecommendation(plan(), { transfers: [{ out: 12, in: 16 }] }, ctx)).includes('budget')); });
test('guard: لاعب غير متاح', () => { assert.ok(codes(guard.checkRecommendation(plan(), { transfers: [{ out: 11, in: 17 }] }, ctx)).includes('unavailable')); });
test('guard: حد 3 لاعبين من نفس النادي', () => {
  // نادي 1 عنده 3 (1,3,8). شراء 21 (نادي 1) بدل 9 (نادي 2) = 4
  assert.ok(codes(guard.checkRecommendation(plan(), { transfers: [{ out: 9, in: 21 }] }, ctx)).includes('club_limit'));
});
test('guard: تعارض الشراء والبيع + نفس المركز + شراء لاعب موجود', () => {
  const c = codes(guard.checkRecommendation(plan(), { transfers: [{ out: 8, in: 8 }, { out: 3, in: 20 }, { out: 9, in: 10 }] }, ctx));
  ['dup_buy_sell', 'pos_mismatch', 'buy_owned'].forEach((k) => assert.ok(c.includes(k), k));
});
test('guard: عدد الانتقالات أكثر من المسموح', () => {
  const p = plan(); p.ft = 0;
  assert.ok(codes(guard.checkRecommendation(p, { transfers: [{ out: 11, in: 18 }, { out: 15, in: 20 }] }, ctx)).includes('too_many_hits'));
  assert.ok(codes(guard.checkRecommendation(p, { transfers: [{ out: 11, in: 18 }] }, ctx)).includes('hit'));
});
test('guard: ورقة الوايلد كارد تلغي الخصم', () => {
  const p = plan(); p.ft = 0;
  assert.ok(!codes(guard.checkRecommendation(p, { transfers: [{ out: 11, in: 18 }, { out: 15, in: 20 }], chip: 'wildcard' }, ctx)).includes('too_many_hits'));
});
test('guard: الكابتن — مو بالتشكيلة / مشكوك / نفس النائب', () => {
  assert.ok(codes(guard.checkRecommendation(plan(), { cap: 12 }, ctx)).includes('cap_not_xi'));
  assert.ok(codes(guard.checkRecommendation(plan(), { cap: 8, vc: 8 }, ctx)).includes('vc_same'));
  const p = plan(); G.PM[8].st = 'd'; G.PM[8].chance = 50; setGame(G);
  assert.ok(codes(guard.checkRecommendation(p, { cap: 8 }, ctx)).includes('cap_doubtful'));
  G.PM[8].st = 'a'; G.PM[8].chance = null; setGame(G);
});
test('guard: تشكيلة ودكة مخالفة', () => {
  const p = plan(); p.xi = [1, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15]; p.bench = [2, 5, 6, 7]; // دفاع 2 فقط
  assert.ok(codes(guard.checkRecommendation(p, {}, ctx)).includes('xi_invalid'));
  const q = plan(); q.bench = [7, 2, 12, 15];
  assert.ok(codes(guard.checkRecommendation(q, {}, ctx)).includes('bench_order'));
});
test('guard: الأوراق — مستخدمة / كابتن ثلاثي على مشكوك', () => {
  assert.ok(codes(guard.checkRecommendation(plan(), { chip: 'bboost' }, ctx)).includes('chip_used'));
  G.PM[8].chance = 75; setGame(G);
  assert.ok(codes(guard.checkRecommendation(plan(), { cap: 8, chip: '3xc' }, ctx)).includes('chip_cap_risk'));
  G.PM[8].chance = null; setGame(G);
});
test('guard: الكابتن البديل والانتقال البديل يختارون أول خيار سليم', () => {
  const list = [{ p: G.PM[12], v: 9, risk: 5 }, { p: G.PM[9], v: 8, risk: 5 }];
  assert.equal(guard.firstValidCaptain(plan(), list, ctx).pick.p.id, 9); // 12 بالدكة
  const mv = guard.firstValidMove(plan(), [{ o: G.PM[11], c: G.PM[17] }, { o: G.PM[12], c: G.PM[16] }, { o: G.PM[11], c: G.PM[18] }], ctx);
  assert.equal(mv.pick.c.id, 18); assert.equal(mv.rejected.length, 2);
});
test('guard: النائب الحالي ينفع يصير كابتن (النائب يتبدل)', () => {
  assert.equal(guard.captainBlocks(plan(), 9, ctx).length, 0); // 9 هو النائب
  assert.ok(codes(guard.checkRecommendation(plan(), { cap: 9 }, ctx)).includes('vc_same'));
});
test('guard: كابتن الفريق المشكوك ما يمنع فحص الانتقالات', () => {
  G.PM[8].chance = 25; setGame(G);
  assert.equal(guard.transferBlocks(plan(), [{ out: 11, in: 18 }], ctx).length, 0);
  G.PM[8].chance = null; setGame(G);
});

/* ---------- ذاكرة القرارات ---------- */
const recA = (over = {}) => ({
  cap: { id: 8, v: 7, conf: 'high', risk: 5 },
  capAlts: [{ id: 8, v: 7, risk: 5 }, { id: 9, v: 6.5, risk: 5 }, { id: 13, v: 6.0, risk: 10 }, { id: 10, v: 3, risk: 5 }, { id: 11, v: 6.8, risk: 80, blocked: 'cap_doubtful' }],
  tr: { kind: 'go', out: 12, in: 18, g: 3, conf: 'mid' }, trAlts: [{ out: 15, in: 20, g: 2 }],
  constraints: { ft: 1, bank: 1, hitBar: 4, ftBar: 1.5 },
  preds: { 8: [6, 1, 5, 5, 1], 9: [5, 1, 4, 4, 1], 13: [5, 0.9, 5, 6, 1], 10: [3, 1, 3, 3, 1], 11: [4, 0.25, 4, 4, 1], 12: [2, 1, 2, 2, 1], 18: [4, 1, 4, 3, 1] },
  trXp: { 12: [2, 2, 2], 18: [4, 4, 4], 15: [3, 3, 3], 20: [4, 4, 4] }, ...over,
});

test('memory: ملف مستقل لكل مدرب وما يتسرب', () => {
  DM._reset(); LSD.clear();
  assert.equal(DM.record({ entryId: 111, gw: 10, deadline: '2099-01-01', now: 1 }, recA()), true);
  DM._reset();
  const b = DM.load(222);
  assert.deepEqual(Object.keys(b.recs), []);
  // ملف مكتوب بغير رقم فريقه ينرفض
  LSD.set('fp_dm_v1_333', JSON.stringify({ v: 1, entry: 111, recs: { 10: {} }, evals: [], regret: [], guard: {}, byVer: {} }));
  DM._reset(); assert.deepEqual(Object.keys(DM.load(333).recs), []);
  DM._reset(); assert.ok(DM.load(111).recs[10]);
});
test('memory: بعد الديدلاين القرار يتجمّد', () => {
  DM._reset(); LSD.clear();
  assert.equal(DM.record({ entryId: 1, gw: 10, deadline: '2020-01-01' }, recA()), false);
  assert.equal(DM.record({ entryId: 1, gw: 10, deadline: '2099-01-01', now: 1000 }, recA()), true);
  assert.equal(DM.record({ entryId: 1, gw: 10, deadline: '2099-01-01', now: 2000 }, recA()), false); // نفس القرار، ما يعيد الكتابة
});
test('memory: judge يفصل جودة القرار عن الحظ', () => {
  assert.equal(DM.judge({ chosenV: 7, altVs: [6.5], chosenPts: 2, bestAltPts: 12 }).cell, 'unlucky');
  assert.equal(DM.judge({ chosenV: 4, altVs: [7], chosenPts: 12, bestAltPts: 3 }).cell, 'lucky');
  assert.equal(DM.judge({ chosenV: 4, altVs: [7], chosenPts: 2, bestAltPts: 9 }).cell, 'mistake');
  assert.equal(DM.judge({ chosenV: 7, altVs: [6], chosenPts: 10, bestAltPts: 9 }).cell, 'earned');
  assert.equal(DM.judge({ chosenV: 7, altVs: [6], chosenPts: 0, bestAltPts: 9, chosenAvail: 1, chosenMin: 0 }).luck, 'unforeseen_absence');
});
test('memory: MAE وBrier والمعايرة محسوبة صح', () => {
  const m = DM.predMetrics({ 1: [5, 1, 4, 3, 1], 2: [2, 0.5, 2, 1, 1] }, { 1: [7, 90], 2: [0, 0] });
  assert.equal(m.mae, 2); // |7-5|=2, |0-2|=2
  assert.equal(m.base.ppg, 2.5); // |7-4|=3, |0-2|=2
  assert.equal(m.brier, 0.125); // (1-1)^2=0, (0.5-0)^2=.25
  assert.equal(m.calib.length, 2);
});
test('memory: تقييم الكابتن والندم — البديل المستبعد ما ينحسب', () => {
  DM._reset(); LSD.clear();
  DM.record({ entryId: 5, gw: 10, deadline: '2099-01-01', now: 1 }, recA());
  // الكابتن 8 جاب 2، البديل 9 جاب 10، اللاعب 11 (مستبعد لأنه مشكوك) جاب 20
  const act = { 8: [2, 90], 9: [10, 90], 13: [3, 90], 10: [1, 90], 11: [20, 90], 12: [1, 90], 18: [6, 90] };
  const picks = [[9, 2, 1, 1], [8, 1, 2, 0]]; // المدرب كابتن 9
  const ev = DM.evaluateGW({ entryId: 5, gw: 10, act, picks, transfers: [] });
  assert.equal(ev.cap.bestAlt, 10); // مو 20
  assert.equal(ev.cap.cell, 'unlucky'); // القرار منطقي بمعلومات وقته
  assert.equal(ev.cap.followed, false);
  assert.ok(ev.trPending); // الانتقال ينتظر 3 جولات
  const s = DM.summary(5);
  const rg = s.regret.find((r) => r.who === 'engine' && r.type === 'captain');
  assert.equal(rg.size, 16); assert.equal(rg.avoidable, 0);
  assert.equal(ev.mgrCap.id, 9); assert.equal(ev.mgrCap.engineBetter, false);
});
test('memory: ما أكو تسرب للمستقبل — التقييم يعتمد التوقع المحفوظ', () => {
  DM._reset(); LSD.clear();
  DM.record({ entryId: 6, gw: 10, deadline: '2099-01-01', now: 1 }, recA());
  G.PM[8].ppg = 99; // تغيّر البيانات بعد الديدلاين ما يأثر
  const ev = DM.evaluateGW({ entryId: 6, gw: 10, act: { 8: [6, 90] }, transfers: [] });
  assert.equal(ev.m.mae > 0, true); assert.equal(ev.cap.v, 7);
  G.PM[8].ppg = 4;
});
test('memory: الانتقال يتقيّم بعد 3 جولات + سجل الإصدار', () => {
  DM._reset(); LSD.clear();
  DM.record({ entryId: 7, gw: 10, deadline: '2099-01-01', now: 1 }, recA());
  const pts = { 10: { 8: [8, 90], 12: [2, 90], 18: [1, 90] }, 11: { 12: [2, 90], 18: [1, 90] }, 12: { 12: [9, 90], 18: [0, 90] } };
  const fin = new Set([10]);
  const base = { entryId: 7, pts, picks: {}, transfers: [{ event: 10, element_in: 18, element_out: 12 }], lastGW: 38, isFinished: (g) => fin.has(g) };
  let out = DM.evaluateDue(base); assert.equal(out.length, 1); assert.ok(out[0].trPending);
  fin.add(11); fin.add(12); DM.evaluateDue(base);
  const ev = DM.load(7).evals[0];
  assert.equal(ev.tr.real, 2 - 13); assert.equal(ev.tr.followed, true); assert.equal(ev.tr.span, 3);
  const s = DM.summary(7);
  assert.ok(s.regret.find((r) => r.type === 'transfer' && r.size === 11));
  assert.equal(s.byVer[Object.keys(s.byVer)[0]].trN, 1);
});
test('memory: ضياع انتقال مجاني', () => {
  DM._reset(); LSD.clear();
  DM.record({ entryId: 8, gw: 10, deadline: '2099-01-01', now: 1 }, recA({ tr: null, trAlts: [] }));
  DM.evaluateGW({ entryId: 8, gw: 10, act: { 8: [5, 90] }, transfers: [], ftBefore: 5 });
  assert.ok(DM.summary(8).regret.find((r) => r.type === 'ft_wasted'));
});
test('memory: الخطأ المتكرر يحتاج 3 مرات منها اثنين ممكن تجنبهم', () => {
  DM._reset(); LSD.clear();
  for (const g of [10, 11, 12]) {
    // المدرب يختار كابتن توقعه أقل بوضوح (قرار غير منطقي) والمقترح يجيب أكثر
    DM.record({ entryId: 9, gw: g, deadline: '2099-01-01', now: g }, recA({ tr: null, trAlts: [] }));
    DM.evaluateGW({ entryId: 9, gw: g, act: { 8: [9, 90], 10: [2, 90] }, picks: [[10, 2, 1, 1]], transfers: [] });
  }
  const s = DM.summary(9);
  assert.equal(s.recurring[0].type, 'captain'); assert.equal(s.recurring[0].who, 'manager');
  assert.equal(s.follow.ignoredWorse, 3);
});
