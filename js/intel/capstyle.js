/* =========================================================
   شجرة ذكاء الكابتن — لكل مدرب كابتن على مقاس أسلوبه
   1) نقرا تاريخ كبتنته: يمشي ويا الأغلبية لو يختلف، أي مركز يكبتن، بملعبه لو برة،
      نجوم غاليين لو لا، يطارد اللي جاب نقاط الجولة اللي فاتت لو لا
   2) نتعلم من النتائج: لما اختلف عن كابتن الأغلبية، ربح لو خسر؟
   3) نحسب وضع ترتيبه: صدارة تنحمى، لو ترتيب يحتاج مغامرة
   4) نختار من الخيارات القريبة بالتوقع فقط (ما نضحي بالنقاط من أجل الأسلوب)
   5) بعد كل جولة نقارن اختيارنا المفصّل بأعلى توقع، ونقوّي أو نضعّف الميل (capK)
   كل شي محلي من بيانات FPL الحقيقية للمدرب نفسه.
========================================================= */
import { ST, PM } from '../store.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const POSS = ['GK', 'DEF', 'MID', 'FWD'];

/** بصمة الكبتنة من سجل المدرب الحقيقي */
export function capProfile(c, gws) {
  const G = ST.G, pts = (g, id) => c.pts[g]?.[id]?.[0];
  const P = { n: 0, tpl: 0, diff: 0, pop: 0, home: 0, homeN: 0, prem: 0, chase: 0, chaseN: 0, pos: { GK: 0, DEF: 0, MID: 0, FWD: 0 }, divSum: 0, divN: 0 };
  gws.forEach((g) => {
    const pk = c.picks[g]; if (!pk) return; const capId = pk.p.find((x) => x[3] === 1)?.[0]; const p = PM(capId); if (!p) return;
    if (pk.chip === 'bboost' || pk.chip === 'freehit') { /* الكبتنة بالأوراق الخاصة تبقى كبتنة حقيقية */ }
    P.n++; P.pos[p.pos]++;
    const ev = G.events.find((e) => e.id === g);
    if (ev?.cap && ev.cap === capId) P.tpl++;
    else if (ev?.cap) { const a = pts(g, capId), b = pts(g, ev.cap); if (a != null && b != null) { P.divSum += a - b; P.divN++; } }
    if (p.own < 15) P.diff++; else if (p.own >= 35) P.pop++;
    if (p.price >= 10) P.prem++;
    const f = G.fxList.find((x) => x.ev === g && (x.h === p.team || x.a === p.team));
    if (f) { P.homeN++; if (f.h === p.team) P.home++; }
    const prev = pts(g - 1, capId); if (prev != null) { P.chaseN++; if (prev >= 10) P.chase++; }
  });
  const n = Math.max(1, P.n);
  return {
    n: P.n, tplRate: P.tpl / n, diffRate: P.diff / n, popRate: P.pop / n, premRate: P.prem / n,
    homeRate: P.homeN >= 3 ? P.home / P.homeN : null, chaseRate: P.chaseN >= 3 ? P.chase / P.chaseN : null,
    posShare: Object.fromEntries(POSS.map((k) => [k, (P.pos[k] + 0.5) / (n + 2)])),
    divAvg: P.divN ? P.divSum / P.divN : null, divN: P.divN,
  };
}

/** الميول المشتقة: كل رقم مبني على سلوك المدرب + نتائجه + وضع ترتيبه */
export function capTilts(prof, arch, capK = 1) {
  const G = ST.G, H = ST.E?.hist?.current || [], rank = H.length ? H[H.length - 1].overall_rank : null, left = (G.lastGW || 38) - (G.finished || 0);
  // ميل الملكية: موجب = يحمي ترتيبه ويا الأغلبية، سالب = يختلف ويغامر
  let own = (prof.tplRate - 0.45) * 1.6 + (prof.popRate - prof.diffRate) * 0.6;
  if (prof.divN >= 2) own -= clamp(prof.divAvg / 6, -0.5, 0.5); // إذا الاختلاف ربّحه نشجعه، وإذا خسّره نرجعه للأمان
  if (arch === 'template') own += 0.3; else if (arch === 'maverick') own -= 0.3; else if (arch === 'gambler') own -= 0.15;
  if (rank && rank <= 100000) own += 0.25;                  // صدارة: نحميها
  else if (rank && rank >= 1500000 && left >= 8) own -= 0.2; // ترتيب بعيد ووقت باقي: يستاهل مغامرة محسوبة
  own = clamp(own, -1, 1);
  const conf = clamp(prof.n / 6, 0, 1) * clamp(capK, 0.3, 1.5);
  return {
    own, conf, rank,
    ceil: 0.12 + 0.22 * Math.max(0, -own) + (arch === 'gambler' ? 0.08 : 0),
    riskAv: clamp(1 + 0.35 * own + (arch === 'strategist' ? 0.15 : 0) - (arch === 'gambler' ? 0.2 : 0), 0.6, 1.6),
    home: prof.homeRate == null ? 0 : (prof.homeRate - 0.5) * 2,
    prem: prof.premRate - 0.5,
    chase: prof.chaseRate == null ? 0 : prof.chaseRate,
    margin: 0.9 + 0.55 * Math.max(0, -own),
  };
}

/** اختيار الكابتن المفصّل من القائمة (كلها بنفس التوقع المصحّح بالتعلم) */
export function pickCaptain(capL, prof, T, gw, lastPts) {
  if (!capL.length) return null;
  const G = ST.G, top = capL[0];
  const isHome = (p) => { const f = G.fxList.find((x) => x.ev === gw && (x.h === p.team || x.a === p.team)); return f ? f.h === p.team : null; };
  const pool = capL.filter((x) => x.v >= top.v - T.margin && x.risk <= Math.max(45, top.risk + 10));
  const score = (x) => {
    const p = x.p, ownS = clamp((x.own - 20) / 30, -1, 1), h = isHome(p);
    let u = x.v - (T.riskAv * x.risk) / 100 * 1.2;
    u += T.conf * T.ceil * (x.ceil - x.v) * 0.5;
    u += T.conf * T.own * ownS * 0.6;
    u += T.conf * ((prof.posShare[p.pos] || 0.25) - 0.33) * 0.9;
    if (h != null) u += T.conf * T.home * (h ? 1 : -1) * 0.4;
    u += T.conf * T.prem * (p.price >= 10 ? 1 : -1) * 0.3;
    if (T.chase > 0.4 && (lastPts?.(p.id) ?? 0) >= 10 && x.risk < 30) u += T.conf * 0.25; // يحب يكبتن الفورم، بس بدون فقاعات
    return u;
  };
  const ranked = pool.map((x) => ({ x, u: score(x) })).sort((a, b) => b.u - a.u || b.x.v - a.x.v);
  const pick = ranked[0].x;
  let why = 'top';
  if (pick !== top) why = T.own > 0.15 && pick.own > top.own ? 'safe' : T.own < -0.15 && pick.own < top.own ? 'diff' : pick.risk < top.risk ? 'nailed' : 'fit';
  return { pick, why, top };
}

/** نص قصير يفسّر ليش هذا الكابتن إلك بالذات (يطلع بس إذا يختلف عن أعلى توقع) */
export function capWhyText(why, tt) {
  return {
    safe: tt('على أسلوبك: كابتن مضمون يحمي ترتيبك', 'Your style: a safe captain that protects rank'),
    diff: tt('على أسلوبك: كابتن مختلف عن الأغلبية بسقف عالي', 'Your style: a high-ceiling differential captain'),
    nailed: tt('على أسلوبك: دقائقه أضمن بفرق توقع بسيط', 'Your style: safer minutes for a tiny xP cost'),
    fit: tt('على أسلوبك: يناسب طريقة كبتنتك بالجولات السابقة', 'Your style: fits how you have captained'),
  }[why] || '';
}
