/* =========================================================
   محرك القرارات المتسلسلة — Sequential Strategy Engine (القدرة 9)
   بدل ما نقيّم انتقال هالجولة لوحده، نقارن خطط كاملة على 5 جولات بنفس الحلّال (Beam search):
   - احتفظ بالفريق بدون تغيير (المرجع)
   - الانتقال المقترح هسه، وبعدين أفضل تكملة
   - احتفظ هالجولة واجمع الانتقال، وبعدين أفضل تكملة
   - أفضل خطة بدون أي ضربة
   - أفضل خطة مسموح بيها ضربة وحدة
   لكل خطة: النقاط المتوقعة، الضربات، الانتقالات المجانية والبنك بالنهاية، ومقدار عدم اليقين
   (من احتمالية مشاركة اللاعبين وتذبذب النقاط الطبيعي). بعدين نحدد: الأعلى توقعاً، الأكثر استقراراً،
   الأكثر توازناً، والأعلى مخاطرة.
   الحساب ثقيل نسبياً فينحسب مرة وحدة لكل خطة/بيانات، ومقسّم على دفعات حتى ما يعلّق التطبيق.
========================================================= */
const r1 = (n) => Math.round(n * 10) / 10;

/** عدم اليقين لخطة: لكل جولة أفضل 11 بالفريق — تباين بواسون تقريبي + تباين المشاركة */
export function planSd(steps, xpOf, availOf) {
  let v = 0;
  for (const s of steps) {
    const sq = s.squad || []; const xs = sq.map((id) => ({ x: xpOf(id, s.gw), a: availOf(id, s.gw) })).sort((a, b) => b.x - a.x).slice(0, 11);
    xs.forEach(({ x, a }) => { v += x + (a > 0 && a < 1 ? (1 - a) / a : 0) * x * x * 0.5; });
  }
  return r1(Math.sqrt(v));
}

/** يصنّف الخطط: أعلى توقع، أكثر استقرار، أكثر توازن، أعلى مخاطرة */
export function classify(plans, ftValue = 1.2) {
  const ok = plans.filter(Boolean); if (!ok.length) return {};
  const score = (p) => p.total + p.ftEnd * ftValue;
  const by = (f) => [...ok].sort((a, b) => f(b) - f(a))[0];
  return {
    best: by(score),
    stable: by((p) => -p.sd + score(p) * 0.001),
    balanced: by((p) => score(p) - 0.5 * p.sd),
    risky: ok.length > 1 ? by((p) => p.sd - score(p) * 0.001) : null,
  };
}

/**
 * يحسب الخطط (async، دفعات) — solve من solver.js
 * @param o {solve, firstMove:[[out,in]]|null, xpOf, availOf, H}
 */
export async function buildPlans(o) {
  const H = o.H || 5, yieldUI = () => new Promise((r) => setTimeout(r, 0));
  const defs = [
    ['now', { force0: o.firstMove || null, maxHits: 1 }],
    ['roll', { force0: [], maxHits: 1 }],
    ['nohit', { maxHits: 0 }],
    ['hit', { maxHits: 1 }],
  ];
  const out = []; let hold = null, holdFt = null;
  for (const [k, opt] of defs) {
    if (k === 'now' && !o.firstMove) continue;
    await yieldUI();
    let r = null; try { r = o.solve({ H, beam: 8, ...opt }); } catch {}
    if (!r) continue;
    hold = r.hold; holdFt = r.holdFt;
    out.push({ k, total: r.total, gain: r.gain, hits: r.hits, ftEnd: r.ftEnd, bankEnd: r.bankEnd, steps: r.steps, gws: r.gws, sd: planSd(r.steps, o.xpOf, o.availOf) });
  }
  if (hold != null) out.unshift({ k: 'hold', total: hold, gain: 0, hits: 0, ftEnd: holdFt, bankEnd: null, steps: [], gws: [], sd: null });
  // نشيل الخطط المكررة (نفس الخطوات)
  const seen = new Set(), uniq = out.filter((p) => { const key = JSON.stringify(p.steps.map((s) => s.tr)); if (seen.has(key) && p.k !== 'hold') return false; seen.add(key); return true; });
  return { plans: uniq, cls: classify(uniq.filter((p) => p.k !== 'hold' && p.sd != null)) };
}

/** وصف مختصر لخطة: "الجولة 11: A → B · الجولة 12: احتفظ" */
export function describe(p, name) {
  if (!p.steps.length) return null;
  return p.steps.map((s) => (s.tr.length ? `${s.gw}: ${s.tr.map(([o, n]) => `${name(o)} → ${name(n)}`).join(' + ')}${s.hit ? ` (−${s.hit})` : ''}` : `${s.gw}: —`)).join(' · ');
}
