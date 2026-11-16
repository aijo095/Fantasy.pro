/* =========================================================
   اختبار مقاومة التوصيات — Recommendation Stress Testing (القدرة 11)
   قبل اعتماد التشكيلة أو الانتقال نختبرها تحت سيناريوهات واقعية، مع التبديل التلقائي الحقيقي للفانتازي
   (الحارس بالحارس، والبدلاء بالترتيب بشرط تبقى التشكيلة قانونية، والنائب ياخذ شارة الكابتن):
   - غياب أهم لاعب أساسي            - غياب الكابتن
   - الكابتن يلعب وما يسجل           - لاعبين الدوران يلعبون 30 دقيقة بس
   - خبر قبل الديدلاين: كل المشكوكين ما يلعبون
   - المباريات أصعب بدرجة (توقعات أقل بـ15%)
   الاحتمالات الوحيدة اللي نستخدمها هي احتمالات المشاركة الرسمية (المتوقع المرجّح)؛
   باقي السيناريوهات "حساسية" — نقيس الأثر بدون ما نخترع احتمال حدوثها.
========================================================= */
const r1 = (n) => Math.round(n * 10) / 10;
const LIM = { GK: [1, 1], DEF: [3, 5], MID: [2, 5], FWD: [1, 3] };

/** نقاط تشكيلة بعد التبديل التلقائي. pts(id)=نقاط اللاعب إذا لعب، plays(id)=يلعب؟ */
export function scorePlan(plan, posOf, pts, plays, mult = 2) {
  const xi = [...plan.xi], used = new Set();
  const cnt = (ids) => { const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 }; ids.forEach((id) => c[posOf(id)]++); return c; };
  const out = xi.filter((id) => !plays(id));
  for (const o of out) {
    const po = posOf(o);
    const cands = po === 'GK' ? [plan.bench[0]] : plan.bench.slice(1);
    for (const b of cands) {
      if (b == null || used.has(b) || !plays(b)) continue;
      if ((po === 'GK') !== (posOf(b) === 'GK')) continue;
      const c = cnt(xi.map((x) => (x === o ? b : x))); // التشكيلة الجديدة (11 خانة) لازم تبقى قانونية
      if (c.GK !== 1 || c.DEF < LIM.DEF[0] || c.MID < LIM.MID[0] || c.FWD < LIM.FWD[0]) continue;
      xi[xi.indexOf(o)] = b; used.add(b); break;
    }
  }
  const capId = plays(plan.cap) ? plan.cap : plays(plan.vc) ? plan.vc : null;
  let s = 0; xi.forEach((id) => { if (plays(id)) s += pts(id) * (id === capId ? mult : 1); });
  return r1(s);
}

/**
 * @param plan {xi, bench, cap, vc}, ctx {posOf, xp(id), avail(id), start(id), mult}
 * @returns {base, weighted, sc:{k:pts}, worst, worstK, spread}
 */
export function stress(plan, ctx) {
  const { posOf, xp, avail } = ctx, mult = ctx.mult || 2;
  const cond = (id) => { const a = avail(id); return a > 0 ? xp(id) / a : 0; }; // نقاطه إذا لعب
  const all = () => true;
  const base = scorePlan(plan, posOf, xp, (id) => avail(id) > 0, mult);
  // المتوقع المرجّح باحتمالات المشاركة: كل مشكوك (يلعب/ما يلعب) — حد أقصى 6 مشكوكين حتى يبقى الحساب خفيف
  const doubt = [...plan.xi, ...plan.bench].filter((id) => { const a = avail(id); return a > 0 && a < 1; }).slice(0, 6);
  let weighted = 0;
  for (let m = 0; m < 1 << doubt.length; m++) {
    let pr = 1; const off = new Set();
    doubt.forEach((id, i) => { const a = avail(id); if (m & (1 << i)) { off.add(id); pr *= 1 - a; } else pr *= a; });
    weighted += pr * scorePlan(plan, posOf, cond, (id) => avail(id) > 0 && !off.has(id), mult);
  }
  const starters = plan.xi.filter((id) => avail(id) > 0).sort((a, b) => xp(b) - xp(a));
  const key = starters.find((id) => id !== plan.cap) ?? starters[0];
  const sc = {
    keyOut: scorePlan(plan, posOf, xp, (id) => avail(id) > 0 && id !== key, mult),
    capOut: scorePlan(plan, posOf, xp, (id) => avail(id) > 0 && id !== plan.cap, mult),
    capBlank: scorePlan(plan, posOf, (id) => (id === plan.cap ? 2 : xp(id)), (id) => avail(id) > 0, mult),
    shortMin: scorePlan(plan, posOf, (id) => ((ctx.start?.(id) ?? 1) < 0.8 ? Math.max(1, xp(id) * 0.35) : xp(id)), (id) => avail(id) > 0, mult),
    doubtOut: scorePlan(plan, posOf, xp, (id) => avail(id) >= 1, mult),
    tough: scorePlan(plan, posOf, (id) => xp(id) * 0.85, (id) => avail(id) > 0, mult),
  };
  const worstK = Object.keys(sc).sort((a, b) => sc[a] - sc[b])[0];
  return { base, weighted: r1(weighted), sc, worst: sc[worstK], worstK, spread: r1(base - sc[worstK]), key };
}

/** يقارن خطط ويحدد: الأعلى توقعاً، الأكثر استقراراً، الأكثر توازناً، الأعلى مخاطرة */
export function compare(rows) {
  const R = rows.filter((r) => r && r.s); if (!R.length) return null;
  const by = (f) => [...R].sort((a, b) => f(b) - f(a))[0];
  return {
    best: by((r) => r.s.weighted), stable: by((r) => r.s.worst), balanced: by((r) => r.s.weighted - 0.5 * r.s.spread),
    risky: R.length > 1 ? by((r) => r.s.spread) : null, rows: R,
  };
}

/** يطبّق انتقال على تشكيلة: اللاعب الجديد ياخذ مكان اللي طلع (أساسي أو دكة) */
export function withTransfer(plan, out, inn) {
  const rep = (a) => a.map((x) => (x === out ? inn : x));
  return { ...plan, xi: rep(plan.xi), bench: rep(plan.bench), cap: plan.cap === out ? inn : plan.cap, vc: plan.vc === out ? inn : plan.vc };
}
