/* =========================================================
   كاشف الفرص بين المدربين — Cross-Manager Opportunity Discovery (القدرة 10)
   المصدر: ملكية وكبتنة أفضل 10,000 مدرب (بيانات عامة مجمّعة يحسبها التطبيق بعد كل ديدلاين)
   مقارنة بملكية كل المدربين. ما نعرض بيانات أي مدرب بشكل فردي.
   - لاعبين أفضل المدربين يمتلكونهم أكثر بكثير من الأغلبية (ميزة النخبة)
   - لاعبين النخبة اشتروهم مؤخراً (تغير الملكية بين جولتين)
   - لاعبين تجاهلهم الكل رغم أرقامهم
   ما ننسخ أبداً: كل فرصة لازم تنفع لهذا المدرب بالذات — يكدر يشتريها بميزانيته بدل لاعب
   بنفس المركز، ما تكسر حد النادي، والمحرك نفسه يتوقع إنها تزيد نقاطه. ونشرح سبب نجاحها من أرقامها.
========================================================= */
const r1 = (n) => Math.round(n * 10) / 10;

/** أفضل طريقة يدخل بيها اللاعب لفريق هذا المدرب (بدل لاعب بنفس المركز) أو null */
export function fitFor(p, ctx) {
  const { plan, PM, sell10, xpN } = ctx;
  if (plan.squad.includes(p.id)) return null;
  const club = {}; plan.squad.forEach((id) => { const t = PM(id)?.team; club[t] = (club[t] || 0) + 1; });
  let best = null;
  for (const id of plan.squad) {
    const o = PM(id); if (!o || o.pos !== p.pos) continue;
    if (Math.round(plan.bank * 10) + sell10(id) < Math.round(p.price * 10)) continue;
    if ((club[p.team] || 0) - (o.team === p.team ? 1 : 0) >= 3) continue;
    const g = r1(xpN(p) - xpN(o));
    if (!best || g > best.g) best = { out: o, g };
  }
  return best && best.g > 0 ? best : null;
}

/**
 * @param elite {own:[{id,o,s}]} لآخر جولة، elitePrev لجولة قبلها (اختياري)
 * @returns {edge:[...], rising:[...], ignored:[...]}
 */
export function opportunities(elite, elitePrev, ctx) {
  if (!elite?.own?.length) return { edge: [], rising: [], ignored: [], none: true };
  const E = Object.fromEntries(elite.own.map((x) => [x.id, x])), EP = elitePrev?.own ? Object.fromEntries(elitePrev.own.map((x) => [x.id, x])) : null;
  const P = ctx.players.filter((p) => p.st !== 'u' && ctx.avail(p) >= 0.75);
  const edge = [], rising = [], ignored = [];
  for (const p of P) {
    const eo = E[p.id]?.o ?? 0;
    const fit = () => fitFor(p, ctx);
    if (eo >= 25 && eo - p.own >= 15) { const f = fit(); if (f) edge.push({ p, eo, own: p.own, fit: f }); }
    if (EP) { const d = eo - (EP[p.id]?.o ?? 0); if (d >= 5 && eo >= 10) { const f = fit(); if (f) rising.push({ p, eo, d: r1(d), fit: f }); } }
    if (eo < 3 && p.own < 3 && (p.min || 0) >= 450) { const f = fit(); if (f && f.g >= 2) ignored.push({ p, eo, own: p.own, fit: f }); }
  }
  const by = (a) => a.sort((x, y) => y.fit.g - x.fit.g).slice(0, 3);
  return { edge: by(edge), rising: by(rising), ignored: by(ignored) };
}

/** كابتن النخبة مقارنة بكابتن المحرك */
export function eliteCaptain(elite) {
  const top = [...(elite?.players || [])].sort((a, b) => b.pct - a.pct)[0];
  return top ? { id: top.id, pct: top.pct } : null;
}
