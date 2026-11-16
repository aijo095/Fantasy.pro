/* =========================================================
   نظام الإنذار المبكر لتراجع المحرك — AI Performance Regression Guard (القدرة 14)
   أي تعديل على المحرك (أوزان التعلم، معاملات التحيز، أو إصدار كود جديد) ما ينعتمد إلا بعد ما يثبت فائدته
   على جولات جديدة ما تعلّم منها (اختبار للأمام بدون تسرب):
   - التعديل "مرشّح" ويتقيّم جنب الإعداد الحالي على كل جولة جديدة تخلص
   - يتعتمد إذا حسّن الخطأ 1% أو أكثر على جولتين أو أكثر؛ ينرفض إذا ما حسّن بعد 4 جولات أو صار أسوأ
   - بعد الاعتماد نراقبه: إذا صار أسوأ من الإعداد السابق على 3 جولات، نرجع للسابق تلقائياً
   - نحتفظ بسجل كل تعديل وسببه ونتيجته، وبأفضل إعداد معروف للرجوع إليه
   - جولة وحدة سيئة أبداً ما تكفي للحكم
========================================================= */
const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** توقع معدّل بإعداد معين (نفس معادلة learn.adj) */
export function adjWith(cfg, pos, pred, fs, segM = 1) {
  return pred * (cfg.posK?.[pos] ?? 1) * (1 + ((cfg.formK ?? 1) - 1) * Math.max(0, fs || 0)) * segM;
}
/** مجموع الخطأ المطلق وعدد اللاعبين لإعداد على جولة */
export function errCfg(P, act, cfg, posOf) {
  let e = 0, n = 0;
  for (const [id, [pred, fs]] of Object.entries(P || {})) { const pos = posOf(+id); if (!pos) continue; e += Math.abs((act[id]?.[0] ?? 0) - adjWith(cfg, pos, pred, fs)); n++; }
  return { e, n };
}

/**
 * خطوة الحماية لجولة منتهية جديدة (قبل التعلم منها):
 * يقيّم المرشح ضد الحالي، ويراقب التعديل المعتمد مؤخراً ضد السابق. يرجّع القرار والسجل.
 * st = {active:{posK,formK}, cand:{posK,formK,sa,sc,n,g}|null, watch:{prev,sa,sp,g}|null}
 */
export function gateStep(st, P, act, posOf, gw) {
  const log = [];
  if (st.watch) {
    // مراقبة بعد الاعتماد: الحالي ضد السابق على الجولات الجديدة
    const a = errCfg(P, act, st.active, posOf), p = errCfg(P, act, st.watch.prev, posOf);
    st.watch.sa += a.e; st.watch.sp += p.e; st.watch.g++;
    const rel = st.watch.sp ? st.watch.sa / st.watch.sp : 1;
    if (st.watch.g >= 3 && rel > 1.01) { log.push({ gw, type: 'rollback', rel: r3(rel), g: st.watch.g, to: st.watch.prev, from: pick(st.active) }); st.active = st.watch.prev; st.watch = null; }
    else if (st.watch.g >= 6) st.watch = null; // ثبت — نوقف المراقبة
  }
  if (st.cand) {
    const a = errCfg(P, act, st.active, posOf), c = errCfg(P, act, st.cand, posOf);
    st.cand.sa += a.e; st.cand.sc += c.e; st.cand.n += a.n; st.cand.g++;
    const rel = st.cand.sa ? st.cand.sc / st.cand.sa : 1;
    if (st.cand.g >= 2 && rel <= 0.99) {
      log.push({ gw, type: 'adopt', rel: r3(rel), g: st.cand.g, from: pick(st.active), to: pick(st.cand) });
      st.watch = { prev: pick(st.active), sa: 0, sp: 0, g: 0, at: gw };
      st.active = pick(st.cand); st.cand = null;
    } else if ((st.cand.g >= 2 && rel >= 1.0) || st.cand.g >= 4) {
      log.push({ gw, type: 'reject', rel: r3(rel), g: st.cand.g, cand: pick(st.cand) });
      st.cand = null;
    }
  }
  return log;
}
const pick = (c) => ({ posK: { ...c.posK }, formK: c.formK });

/** تعلم مرشح جديد (بنفس قاعدة التعلم القديمة) — يبدأ من المرشح الحالي أو من الإعداد المعتمد */
export function learnCand(st, sums, r = 0.25) {
  const base = st.cand || { ...pick(st.active), sa: 0, sc: 0, n: 0, g: 0 };
  const posK = { ...base.posK };
  Object.keys(posK).forEach((k) => { const sp = sums.sp[k], sa = sums.sa[k]; if (sp >= 8) posK[k] = clamp(posK[k] * (1 - r) + clamp(sa / sp, 0.6, 1.4) * r * posK[k], 0.82, 1.18); });
  let formK = base.formK; if (sums.fP >= 6) formK = clamp(formK * (1 - r) + clamp(sums.fA / sums.fP, 0.5, 1.5) * r * formK, 0.7, 1.25);
  const moved = Object.keys(posK).some((k) => Math.abs(posK[k] - st.active.posK[k]) > 0.005) || Math.abs(formK - st.active.formK) > 0.005;
  st.cand = moved ? { ...base, posK, formK: +formK.toFixed(3) } : st.cand;
  return !!st.cand;
}

/* ---------- معاملات التحيز (من المرحلة 2): نفس الفكرة على مجاميع ذاكرة القرارات ---------- */
const mse = (x, m) => (x[0] ? (m * m * x[3] - 2 * m * x[5] + x[4]) / x[0] : 0);
/** تقييم مقترح للأمام: الجولات اللي بعد إنشائه بس */
export function segForward(prop, evals) {
  const F = (evals || []).filter((e) => e.gw > prop.gwAt && e.seg?.[prop.seg]);
  const A = [0, 0, 0, 0, 0, 0]; F.forEach((e) => e.seg[prop.seg].forEach((v, i) => (A[i] += v)));
  if (F.length < 2 || A[0] < 15) return { status: 'testing', g: F.length };
  const before = mse(A, 1), after = mse(A, prop.m), rel = before ? after / before : 1;
  return { status: rel <= 0.99 ? 'adopt' : F.length >= 4 || rel >= 1 ? 'reject' : 'testing', g: F.length, rel: r3(rel) };
}

/* ---------- تراجع إصدار الكود: الإصدار الحالي ضد السابق ---------- */
export function versionCheck(byVer, cur) {
  const V = byVer?.[cur]; const prevKey = Object.keys(byVer || {}).filter((k) => k !== cur && byVer[k].n >= 3).sort((a, b) => byVer[b].last - byVer[a].last)[0];
  if (!V || V.n < 4 || !prevKey) return { status: 'insufficient', n: V?.n || 0 };
  const P = byVer[prevKey], m = (x) => x.mae / x.n, sk = (x) => (x.mae - x.ppg) / x.n; // سالب = أفضل من خط الأساس
  const capR = (x) => (x.capN ? x.capGood / x.capN : null);
  const worseSkill = sk(V) - sk(P) >= 0.15, worseCap = capR(V) != null && capR(P) != null && V.capN >= 4 && capR(V) - capR(P) <= -0.25;
  return { status: worseSkill || worseCap ? 'regressed' : 'ok', prev: prevKey, mae: [r3(m(P)), r3(m(V))], skill: [r3(sk(P)), r3(sk(V))], cap: [capR(P), capR(V)], worseSkill, worseCap };
}
