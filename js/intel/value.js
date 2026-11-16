/* =========================================================
   محرك القيمة المخفية للاعب — Hidden Player Value Engine (القدرة 7)
   القيمة مو من النقاط السابقة بس:
   - الإنتاج الأساسي لكل 90 (xG وxA بنقاط المركز، الشباك النظيفة، البونص، المساهمات الدفاعية)
   - "انكماش" نحو معدل المركز حسب الدقائق: لاعب لعب 200 دقيقة ما يكدر يتصدر بسبب عينة صغيرة
   - احتمالية المشاركة، ضمان الدور، المباريات الجاية (المدى القصير 3 جولات والمتوسط 6)
   - القيمة مقابل السعر مقارنة بنفس المركز، واتجاه السعر من بيانات الفانتازي الرسمية إذا متوفرة
========================================================= */
const POSG = { GK: 6, DEF: 6, MID: 5, FWD: 4 }, POSCS = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
const DCP = { DEF: 10, MID: 12, FWD: 12 }; // عتبة المساهمات الدفاعية للنقطتين (قوانين 2025+)
const PRIOR90 = 5; // وزن معدل المركز = 5 مباريات كاملة (450 دقيقة)
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;

/** الإنتاج الأساسي الخام لكل 90 دقيقة (بدون نقاط الظهور) */
export function raw90(p) {
  const n90 = (p.min || 0) / 90; if (n90 < 1) return null;
  const att = ((p.xg || 0) * POSG[p.pos] + (p.xa || 0) * 3) / n90;
  const starts = p.starts ?? Math.round((p.min || 0) / 85);
  const cs = starts ? ((p.cs || 0) / starts) * POSCS[p.pos] : 0;
  const bonus = (p.bonus || 0) / n90;
  const dc = DCP[p.pos] && p.dc90 ? Math.min(1, p.dc90 / DCP[p.pos]) * 2 * 0.6 : 0; // تقريب: نسبة الوصول للعتبة
  const saves = p.pos === 'GK' ? (p.saves || 0) / n90 / 3 : 0;
  return att + cs + bonus + dc + saves;
}
/** معدلات المراكز (من لاعبين لعبوا 450 دقيقة أو أكثر) */
export function posMeans(players) {
  const acc = {};
  players.forEach((p) => { if ((p.min || 0) < 450) return; const v = raw90(p); if (v == null) return; const a = (acc[p.pos] = acc[p.pos] || { s: 0, n: 0 }); a.s += v; a.n++; });
  return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, a.n ? a.s / a.n : 2]));
}
/** الإنتاج لكل 90 بعد الانكماش نحو معدل المركز */
export function shrunk90(p, PMn) {
  const n90 = (p.min || 0) / 90, v = raw90(p), m = PMn[p.pos] ?? 2;
  return v == null ? m : (n90 * v + PRIOR90 * m) / (n90 + PRIOR90);
}

/**
 * @param p اللاعب، ctx {G, xp(p,g), avail(p,g), PMn, startShare(p)}
 * @returns {short, med, under, ppgGap, perM, conf, priceDir}
 */
export function valueOf(p, ctx) {
  const { G, xp } = ctx, g0 = G.next;
  let short = 0, med = 0;
  for (let g = g0; g < g0 + 6 && g <= G.lastGW; g++) { const v = xp(p, g); med += v; if (g < g0 + 3) short += v; }
  const share = ctx.startShare ? ctx.startShare(p) : Math.min(1, (p.min || 0) / (90 * Math.max(1, G.finished)));
  const under = (2 * Math.min(1, share * 1.05) + shrunk90(p, ctx.PMn) * share); // نقاط متوقعة بالمباراة من الأداء الأساسي
  const ppgGap = r2(under - (p.ppg || 0)); // موجب = نقاطه أقل من أدائه الحقيقي (ممكن ترتفع)
  const n90 = (p.min || 0) / 90, conf = n90 >= 8 ? 'high' : n90 >= 4 ? 'mid' : 'low';
  let priceDir = null;
  if (p.pcp != null) priceDir = p.pcp >= 85 ? 'up' : p.pcp <= -85 ? 'down' : 'flat';
  return { short: r1(short), med: r1(med), under: r1(under), ppgGap, perM: r2(med / Math.max(3.8, p.price)), conf, priceDir };
}

/** ترتيب القيمة: نقارن القيمة مقابل السعر بمعدل نفس المركز ونعطي علامة "مخفية" للي ما ينعكس بسعره أو نقاطه */
export function hiddenGems(players, ctx, { exclude = new Set(), maxOwn = 15, limit = 5 } = {}) {
  const byPos = {};
  const rows = players.filter((p) => p.st !== 'u' && (p.min || 0) >= 360 && !exclude.has(p.id) && ctx.avail(p, ctx.G.next) >= 0.75).map((p) => ({ p, v: valueOf(p, ctx) }));
  rows.forEach((r) => (byPos[r.p.pos] = byPos[r.p.pos] || []).push(r.v.perM));
  const med = Object.fromEntries(Object.entries(byPos).map(([k, a]) => { const s = [...a].sort((x, y) => x - y); return [k, s[Math.floor(s.length / 2)] || 1]; }));
  return rows
    .map((r) => ({ ...r, idx: r2(r.v.perM / (med[r.p.pos] || 1)) }))
    .filter((r) => r.p.own <= maxOwn && r.v.conf !== 'low' && r.idx >= 1.2 && r.v.ppgGap >= 0.3)
    .sort((a, b) => b.idx + b.v.ppgGap / 4 - (a.idx + a.v.ppgGap / 4))
    .slice(0, limit);
}
/** لاعب سعره/شعبيته أعلى من قيمته: أداؤه الأساسي أقل بوضوح من نقاطه */
export function overvalued(players, ctx, { minOwn = 15 } = {}) {
  return players.filter((p) => p.own >= minOwn && (p.min || 0) >= 450).map((p) => ({ p, v: valueOf(p, ctx) })).filter((r) => r.v.ppgGap <= -1 && r.v.conf !== 'low').sort((a, b) => a.v.ppgGap - b.v.ppgGap);
}
