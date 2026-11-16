/* اختبارات المرحلة الثانية — تشغيل: npm test */
import test from 'node:test';
import assert from 'node:assert/strict';
const LSD = new Map();
globalThis.localStorage = { getItem: (k) => (LSD.has(k) ? LSD.get(k) : null), setItem: (k, v) => LSD.set(k, String(v)), removeItem: (k) => LSD.delete(k) };

const CH = await import('../js/intel/change.js');
const VA = await import('../js/intel/value.js');
const PS = await import('../js/intel/stats.js');

const row = (min, threat = 20, creat = 15, starts = min >= 60 ? 1 : 0, pts = 2, xg = 0.1, xa = 0.1, dc = 3) => ({ min, threat, creat, starts, pts, xg, xa, dc });

/* ---------- (2) كاشف تغير الدور ---------- */
test('change: لاعب صار أساسي = تغير حقيقي', () => {
  const R = [row(10), row(0), row(15), row(5), row(12), row(90), row(88), row(90)];
  const d = CH.detect(R);
  assert.equal(d.role, 'up'); assert.ok(d.changes.find((c) => c.k === 'min' && c.dir === 'up'));
  assert.ok(CH.startShare(0.2, d) > 0.7);
});
test('change: لاعب خسر مكانه', () => {
  const d = CH.detect([row(90), row(90), row(85), row(90), row(88), row(20), row(0), row(15)]);
  assert.equal(d.role, 'down');
});
test('change: نقاط عالية بجولة وحدة بدون تغير بالدور = تذبذب', () => {
  const R = [row(90, 20, 15, 1, 2), row(90, 22, 14, 1, 3), row(90, 19, 16, 1, 2), row(90, 21, 15, 1, 1), row(90, 20, 15, 1, 2), row(90, 21, 15, 1, 15), row(90, 20, 16, 1, 13), row(90, 19, 15, 1, 14)];
  const d = CH.detect(R);
  assert.equal(d.changes.length, 0); assert.equal(d.role, null); assert.equal(d.noise, true);
});
test('change: تذبذب بسيط بالدقائق ما ينحسب تغير', () => {
  const d = CH.detect([row(80), row(90), row(75), row(90), row(85), row(70), row(90), row(78)]);
  assert.equal(d.role, null);
});
test('change: تهديد هجومي ارتفع مع نفس الدقائق', () => {
  const d = CH.detect([row(90, 10), row(90, 12), row(90, 9), row(90, 11), row(90, 10), row(90, 45), row(90, 50), row(90, 40)]);
  assert.ok(d.changes.find((c) => c.k === 'threat90' && c.dir === 'up'));
  assert.equal(d.role, null);
});
test('change: بيانات قليلة = ما نحكم', () => {
  const d = CH.detect([row(90), row(0), row(90)]);
  assert.equal(d.changes.length, 0); assert.deepEqual(d.missing, ['history']);
});
test('change: حقل ناقص بالبيانات يتسجل ناقص بدل ما يصير صفر', () => {
  const R = [row(90), row(90), row(90), row(90), row(90), row(90), row(90), row(90)].map((r) => ({ ...r, threat: null }));
  assert.ok(CH.detect(R).missing.includes('threat90'));
});
test('stats: ضغط استجابة live وقراءة الصفوف', () => {
  PS._set({ gws: {} });
  PS.put(5, [{ id: 1, stats: { total_points: 6, minutes: 90, starts: 1, expected_goals: '0.45', expected_assists: '0.10', threat: '30.0', creativity: '12.0', defensive_contribution: 4 } }, { id: 2, stats: { minutes: 0, total_points: 0 } }]);
  PS.put(6, [{ id: 3, stats: { total_points: 2, minutes: 90 } }]);
  const r = PS.rows(1);
  assert.equal(r.length, 2); assert.equal(r[0].xg, 0.45); assert.equal(r[0].threat, 30); assert.equal(r[1].absent, true);
  assert.equal(PS.rows(3)[1].xg, null); // حقل مو موجود = null مو صفر
});

/* ---------- (7) القيمة المخفية ---------- */
const P = (o) => ({ id: o.id, pos: 'MID', price: 6, own: 5, st: 'a', min: 900, starts: 10, xg: 2, xa: 1.5, cs: 2, bonus: 4, saves: 0, dc90: 0, ppg: 4, form: 4, pcp: null, ...o });
const G = { next: 10, lastGW: 38, finished: 9 };
const ctx = (players) => ({ G, xp: (p) => p.xpv ?? 4, avail: () => 1, PMn: VA.posMeans(players) });
test('value: عينة صغيرة ما تتصدر (انكماش + حد أدنى للدقائق)', () => {
  const base = Array.from({ length: 10 }, (_, i) => P({ id: 100 + i, own: 30 }));
  const tiny = P({ id: 1, min: 120, starts: 1, xg: 1.5, xa: 0.5, price: 4.5, ppg: 2 }); // 1.33 مباراة بإنتاج خيالي
  const pl = [...base, tiny];
  const M = VA.posMeans(pl);
  assert.ok(VA.shrunk90(tiny, M) < VA.raw90(tiny) / 2); // الانكماش يقص أكثر من النص
  assert.equal(VA.valueOf(tiny, ctx(pl)).conf, 'low');
  assert.ok(!VA.hiddenGems(pl, ctx(pl)).some((r) => r.p.id === 1));
});
test('value: يكشف لاعب نقاطه أقل من أدائه وسعره رخيص', () => {
  const peers = Array.from({ length: 12 }, (_, i) => P({ id: 100 + i, price: 8, own: 30 }));
  const gem = P({ id: 7, price: 5, own: 3, xg: 4, xa: 2.5, ppg: 3.2, xpv: 5.5 });
  const pl = [...peers, gem];
  const r = VA.hiddenGems(pl, ctx(pl), { limit: 3 });
  assert.equal(r[0].p.id, 7); assert.ok(r[0].v.ppgGap > 0.3);
});
test('value: لاعب شعبي نقاطه أعلى من أدائه = مبالغ بقيمته', () => {
  const pl = [P({ id: 1, own: 40, ppg: 7.5, xg: 0.8, xa: 0.5 }), ...Array.from({ length: 6 }, (_, i) => P({ id: 10 + i }))];
  const o = VA.overvalued(pl, ctx(pl));
  assert.equal(o[0].p.id, 1);
});
test('value: المدى القصير والمتوسط', () => {
  const p = P({ id: 1 }); const v = VA.valueOf(p, { ...ctx([p]), xp: () => 2 });
  assert.equal(v.short, 6); assert.equal(v.med, 12);
});

/* ---------- (12) الأنماط الموسمية ---------- */
const SE = await import('../js/intel/season.js');
function league(nGw, gdFn) {
  // 6 فرق، مواجهات تتبدل كل جولة، ومباراة وحدة بكل جولة تنلعب بعد 3 أيام من اللي قبلها (فروقات راحة حقيقية)
  const R = [[[1, 2], [3, 4], [5, 6]], [[1, 4], [3, 6], [5, 2]], [[1, 6], [3, 2], [5, 4]]];
  const fx = {}, last = {}; let t = Date.UTC(2026, 7, 1);
  for (let g = 1; g <= nGw; g++) {
    t += 7 * 864e5;
    fx[g] = R[g % 3].map(([h, a], i) => {
      const ko = t + (i === g % 3 ? -4 : 0) * 864e5; // مباراة وحدة بكل جولة قبل الباقي بـ4 أيام
      const rh = last[h] ? (ko - last[h]) / 864e5 : null, ra = last[a] ? (ko - last[a]) / 864e5 : null; last[h] = ko; last[a] = ko;
      const gd = gdFn(g, h, a, rh, ra);
      return { h, a, hd: 3, ad: 3, ko: new Date(ko).toISOString(), fin: true, hs: Math.max(0, gd) + 1, as: Math.max(0, -gd) + 1 };
    });
  }
  return fx;
}
test('season: يكتشف أثر ضغط المباريات إذا موجود فعلاً', () => {
  // الفريق المضيف يخسر بعد راحة قصيرة، ويفوز بالعادي
  const fx = league(30, (g, h, a, rh, ra) => (rh != null && ra != null && Math.abs(rh - ra) >= 2 ? (rh < ra ? -2 : 2) : ((g + h) % 3) - 1));
  const P = SE.patterns({ fx, PM: {} });
  const c = P.find((x) => x.kind === 'congestion');
  assert.ok(c, JSON.stringify(P)); assert.ok(c.effect < 0);
});
test('season: ما يطلع نمط من بيانات عشوائية متوازنة', () => {
  const fx = league(30, (g, h) => ((g * 7 + h * 3) % 5) - 2);
  const P = SE.patterns({ fx, PM: {} });
  assert.ok(!P.find((x) => x.kind === 'congestion' && x.level === 'confirmed'));
});
test('season: عينة صغيرة ما تتعمم', () => {
  const fx = league(4, (g, h, a, rh, ra) => (rh != null && ra != null && rh < ra ? -3 : 2));
  assert.equal(SE.patterns({ fx, PM: {} }).filter((x) => x.kind === 'congestion').length, 0);
});
test('season: أيام الراحة للمباراة الجاية من الجدول المعلن', () => {
  const fx = league(8, () => 0); fx[8].forEach((m) => { m.fin = false; m.hs = null; m.as = null; });
  const r = SE.upcomingRest({ fx, next: 8 }, 1, 8);
  assert.ok([3, 7, 11].includes(r), String(r));
});

/* ---------- (3) توقيت القرار ---------- */
const TI = await import('../js/intel/timing.js');
const now = Date.UTC(2026, 10, 16, 12);
const pl = (o) => ({ price: 6, pcp: 10, ...o });
const base = { now, deadline: new Date(now + 48 * 36e5).toISOString(), gain: 4, bank10: 5, sell10: 60, avail: (p) => p.a ?? 1 };
test('timing: اللاعب المطلوب مشكوك = انتظر الخبر', () => {
  const d = TI.decideTiming({ ...base, inP: pl({ a: 0.5 }), outP: pl({}) });
  assert.equal(d.k, 'wait'); assert.equal(d.reason.code, 'in_doubtful'); assert.ok(d.by);
});
test('timing: سعره راح يرتفع والميزانية ضيقة = هسه', () => {
  const d = TI.decideTiming({ ...base, bank10: 0, inP: pl({ a: 0.5, pcp: 120 }), outP: pl({}) });
  assert.equal(d.k, 'now'); assert.equal(d.reason.code, 'price_lock_out');
});
test('timing: قريب من الديدلاين ما يوصي بالانتظار أبداً', () => {
  const d = TI.decideTiming({ ...base, deadline: new Date(now + 2 * 36e5).toISOString(), inP: pl({ a: 0.25 }), outP: pl({}) });
  assert.equal(d.k, 'now');
});
test('timing: ما أكو سبب لا للعجلة ولا للانتظار', () => {
  assert.equal(TI.decideTiming({ ...base, inP: pl({}), outP: pl({}) }).reason.code, 'no_rush');
});
test('timing: بعد الديدلاين ما أكو قرار', () => {
  assert.equal(TI.decideTiming({ ...base, deadline: new Date(now - 1000).toISOString(), inP: pl({}), outP: pl({}) }).k, 'none');
});

/* ---------- (9) القرارات المتسلسلة ---------- */
const SQ = await import('../js/intel/sequence.js');
test('sequence: عدم اليقين يزيد ويا اللاعبين المشكوكين', () => {
  const steps = [{ gw: 10, squad: [1, 2] }];
  const a = SQ.planSd(steps, () => 5, () => 1), b = SQ.planSd(steps, () => 5, (id) => (id === 1 ? 0.5 : 1));
  assert.ok(b > a);
});
test('sequence: التصنيف — الأعلى توقع، الأكثر استقرار، الأعلى مخاطرة', () => {
  const P = [{ k: 'a', total: 100, ftEnd: 1, sd: 20 }, { k: 'b', total: 97, ftEnd: 1, sd: 10 }, { k: 'c', total: 99, ftEnd: 1, sd: 14 }];
  const c = SQ.classify(P);
  assert.equal(c.best.k, 'a'); assert.equal(c.stable.k, 'b'); assert.equal(c.risky.k, 'a'); assert.equal(c.balanced.k, 'b');
});
test('sequence: الخطط تنبني من الحلّال وتنشال المكررة', async () => {
  const fake = (o) => ({ total: o.force0 && o.force0.length ? 60 : o.maxHits === 0 ? 58 : 59, hold: 50, holdFt: 3, gain: 0, hits: 0, ftEnd: 1, bankEnd: 0.5, gws: [10],
    steps: [{ gw: 10, tr: o.force0 ?? (o.maxHits === 0 ? [[1, 3]] : [[1, 3]]), hit: 0, squad: [3, 2] }] });
  const r = await SQ.buildPlans({ solve: fake, firstMove: [[1, 4]], xpOf: () => 4, availOf: () => 1 });
  assert.equal(r.plans[0].k, 'hold');
  assert.equal(r.plans.filter((p) => JSON.stringify(p.steps.map((s) => s.tr)) === '[[[1,3]]]').length, 1); // nohit و hit نفس الخطة
  assert.equal(r.cls.best.k, 'now');
});

/* ---------- (5) سلوك المدرب ---------- */
const MB = await import('../js/intel/manager.js');
function mgrHist(n, f) {
  const current = [], events = [];
  for (let g = 1; g <= n; g++) { const o = f(g); current.push({ event: g, points: o.pts, event_transfers: o.tr, event_transfers_cost: o.cost || 0, overall_rank: o.rank || 1e6 }); events.push({ id: g, avg: 50, cap: 99 }); }
  return { hist: { current, chips: [] }, events };
}
test('manager: يتعلم إنه ياخذ ضربة بعد الجولات السيئة', () => {
  // جولة سيئة كل جولتين، وبعدها ضربة دائماً
  const { hist, events } = mgrHist(16, (g) => ({ pts: g % 2 ? 35 : 60, tr: g % 2 ? 1 : 2, cost: g % 2 ? 0 : 4 }));
  const rows = MB.behaviourRows({ hist, events, picks: {} });
  const M = MB.fit(rows);
  assert.ok(M.hitBad.p > 0.7, JSON.stringify(M.hitBad)); assert.ok(M.trOk.p < 0.3 === false);
  assert.ok(MB.predict(M, { bad: true }).hit > MB.predict(M, { bad: false }).hit);
});
test('manager: عينة صغيرة تبقى قريبة من القيمة العامة', () => {
  const { hist, events } = mgrHist(3, () => ({ pts: 50, tr: 0 }));
  const M = MB.fit(MB.behaviourRows({ hist, events, picks: {} }));
  assert.ok(M.tr.p > 0.4); // جولتين بدون انتقال ما تخلي الاحتمال صفر
});
test('manager: الاختبار التاريخي بدون تسرب ويقارن بخط أساس', () => {
  const { hist, events } = mgrHist(20, (g) => ({ pts: g % 3 === 0 ? 30 : 60, tr: g % 3 === 1 ? 1 : 0 }));
  const bt = MB.backtest(MB.behaviourRows({ hist, events, picks: {} }));
  assert.ok(bt.n >= 10); assert.equal(typeof bt.useful, 'boolean'); assert.ok(bt.model != null && bt.base != null);
});
test('manager: كابتن الأغلبية', () => {
  const { hist, events } = mgrHist(8, () => ({ pts: 50, tr: 1 }));
  const picks = Object.fromEntries([2, 3, 4, 5, 6, 7, 8].map((g) => [g, { p: [[99, 2, 1, 1]] }]));
  assert.ok(MB.fit(MB.behaviourRows({ hist, events, picks })).tpl.p > 0.8);
});

/* ---------- (10) الفرص بين المدربين ---------- */
const CR = await import('../js/intel/cross.js');
test('cross: فرصة النخبة لازم تنفع للمدرب نفسه (ميزانية، نادي، توقع)', () => {
  const pl = { 1: { id: 1, pos: 'MID', team: 1, price: 6 }, 2: { id: 2, pos: 'MID', team: 2, price: 5 }, 10: { id: 10, pos: 'MID', team: 3, price: 7, own: 10, st: 'a', min: 900, x: 30 }, 11: { id: 11, pos: 'MID', team: 4, price: 15, own: 8, st: 'a', min: 900, x: 40 }, 12: { id: 12, pos: 'MID', team: 5, price: 6, own: 5, st: 'a', min: 900, x: 10 } };
  pl[1].x = 20; pl[2].x = 15;
  const ctx = { plan: { squad: [1, 2], bank: 1.5 }, PM: (id) => pl[id], sell10: (id) => Math.round(pl[id].price * 10), xpN: (p) => p.x, players: [pl[10], pl[11], pl[12]], avail: () => 1 };
  const elite = { own: [{ id: 10, o: 45 }, { id: 11, o: 50 }, { id: 12, o: 40 }] }, prev = { own: [{ id: 10, o: 30 }] };
  const r = CR.opportunities(elite, prev, ctx);
  assert.equal(r.edge.length, 1); assert.equal(r.edge[0].p.id, 10); // 11 غالي، 12 توقعه أقل
  assert.equal(r.edge[0].fit.out.id, 1); // بيع 1 (6م) + بنك 1.5 = 7.5 ≥ 7، بيع 2 ما يكفي
  assert.equal(r.rising[0].d, 15);
});

/* ---------- (8) اكتشاف التحيز ---------- */
const BI = await import('../js/intel/bias.js');
const MEM = await import('../js/memory.js');
function evalsWith(nGw, popOver) {
  // كل جولة: 60 لاعب، 15 منهم شعبيين؛ المحرك يبالغ بالشعبيين بـ popOver نقطة
  const E = [];
  for (let g = 1; g <= nGw; g++) {
    const preds = {}, act = {};
    for (let i = 1; i <= 60; i++) { const pop = i <= 15, a = ((i * 7 + g * 3) % 9); preds[i] = [a + (pop ? popOver : 0) + ((i + g) % 3 - 1) * 0.5, 1, 4, 4, 1, pop ? 40 : 5, 6, 3, 2, 0.4]; act[i] = [a, 90]; }
    E.push({ gw: g, seg: MEM.segStats(preds, act), hauls: MEM.haulStats(preds, act) });
  }
  return E;
}
test('bias: يكشف مبالغة بتوقع اللاعبين الشعبيين', () => {
  const r = BI.detectBias(evalsWith(8, 1.5));
  const f = r.flags.find((x) => x.seg === 'popular');
  assert.ok(f, JSON.stringify(r)); assert.equal(f.dir, 'over'); assert.ok(f.d > 1);
  assert.ok(f.proposal && f.proposal.m < 1 && f.proposal.passed); // التعديل ينجح على الجولات الأحدث
});
test('bias: ما يطلع انحياز إذا ما موجود', () => {
  assert.equal(BI.detectBias(evalsWith(8, 0)).flags.length, 0);
});
test('bias: جولتين بس = بدري', () => {
  assert.equal(BI.detectBias(evalsWith(2, 3)).enough, false);
});
test('bias: تكرار نفس الكابتن والبديل قريب', () => {
  const recs = {}; for (let g = 1; g <= 5; g++) recs[g] = { cap: { id: 7, v: 6 }, capAlts: [{ id: 7, v: 6 }, { id: 8, v: 5.9 }] };
  assert.equal(BI.captainRepeat(recs).n, 5);
  recs[3].capAlts[1].v = 4; assert.equal(BI.captainRepeat(recs), null);
});

/* ---------- (15) التعلم من النجاح ---------- */
const PO = await import('../js/intel/positive.js');
test('positive: نمط نجاح حقيقي ينكشف، والعشوائي لا', () => {
  const E = [];
  for (let g = 1; g <= 6; g++) {
    const preds = {}, act = {};
    for (let i = 1; i <= 80; i++) { const easy = i <= 25; preds[i] = [4, 1, 4, 4, 1, 10, 6, easy ? 2 : 3, 2, 0.4]; act[i] = [easy ? (i % 2 ? 9 : 3) : (i % 8 ? 2 : 9), 90]; }
    E.push({ gw: g, hauls: MEM.haulStats(preds, act) });
  }
  const r = PO.successPatterns(E);
  assert.equal(r.list[0].k, 'easyFix'); assert.ok(r.list[0].lift > 2);
  assert.ok(!r.list.find((x) => x.k === 'popular'));
});
test('positive: نجاح بتحليل صحيح مقابل حظ', () => {
  MEM._reset(); LSD.clear();
  const preds = { 1: [7, 1, 5, 5, 1], 2: [6, 1, 5, 5, 1], 3: [2, 1, 2, 2, 1], 4: [1.5, 1, 2, 2, 1], 5: [1, 1, 2, 2, 1], 6: [1, 1, 2, 2, 1], 7: [1, 1, 2, 2, 1] };
  MEM.record({ entryId: 50, gw: 10, deadline: '2099-01-01', now: 1 }, { cap: { id: 1, v: 7 }, capAlts: [], preds });
  const act = { 1: [12, 90], 3: [11, 90], 7: [13, 90] };
  const picks = [1, 2, 3, 4, 5, 6, 7].map((id, i) => [id, 1, i + 1, 0]);
  const ev = MEM.evaluateGW({ entryId: 50, gw: 10, act, picks, transfers: [], under: { 1: { xg: 0.6, xa: 0.3 }, 3: { xg: 0.05, xa: 0.1 }, 7: { xg: 0.7, xa: 0.2 } } });
  const v = Object.fromEntries(ev.wins.map((w) => [w.id, w.verdict]));
  assert.equal(v[1], 'skill'); assert.equal(v[3], 'luck'); assert.equal(v[7], 'mixed');
  const w = PO.wins([ev]); assert.equal(w.surprise[0].id, 7); // ما جان متوقع بس أداؤه يسند
});
