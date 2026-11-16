/* =========================================================
   ذاكرة وتعلّم المدرب الذكي — لكل مدرب بشكل مستقل
   1) قبل كل جولة: نحفظ توقعاتنا (نقاط اللاعبين) وتوصياتنا (الكابتن، الانتقال)
   2) بعد ما تخلص الجولة: نقارن التوقع بالنتيجة الفعلية، ونعرف التوصية صحت لو لا،
      والمدرب نفّذها لو لا
   3) نعدّل الأوزان فعلياً (معامل لكل مركز + وزن الفورمة) بتنعيم تدريجي
   4) أول مرة: نتعلم من تاريخ الجولات المخزّن (كل جولة نتوقعها بس من الجولات
      اللي قبلها — بدون أي بيانات مستقبلية)
   كل شي محلي على جهاز المدرب، بدون أي خدمة خارجية.
========================================================= */
import { ST, PM } from './store.js';
import { xp } from './engine.js';
import * as FPL from './fpl.js';
import { flag, ENGINE_VER } from './flags.js';
import { gateStep, learnCand, segForward, versionCheck } from './intel/regress.js';
import { SEGS } from './memory.js';

const KEY = () => `fp_brain_v1_${ST.E?.entry?.id}`;
const POS = ['GK', 'DEF', 'MID', 'FWD'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const blank = () => ({ v: 1, posK: { GK: 1, DEF: 1, MID: 1, FWD: 1 }, formK: 1, nEval: 0, snaps: {}, evals: [], boot: false, err: null, cand: null, watch: null, gate: [], seg: {}, segLog: [] });
let B = null, BKEY = '';
function load() { const k = KEY(); if (B && BKEY === k) return B; try { B = JSON.parse(localStorage.getItem(k) || 'null') || blank(); } catch { B = blank(); } BKEY = k; return B; }
function save() { try { const keep = Object.keys(B.snaps).map(Number).sort((a, b) => b - a).slice(0, 6); Object.keys(B.snaps).forEach((g) => { if (!keep.includes(+g)) delete B.snaps[g]; }); B.evals = B.evals.slice(-12); if (B.gate) B.gate = B.gate.slice(-30); if (B.segLog) B.segLog = B.segLog.slice(-20); localStorage.setItem(BKEY, JSON.stringify(B)); } catch {} }

/** إشارة الفورمة: قد إيش فورمته الحالية أعلى من مستواه (تستخدم لتصحيح المبالغة) */
export const formSig = (p) => clamp(((p.form || 0) - (p.ppg || 0)) / 3, -1, 1);
/** التوقع المصحَّح بالتعلّم — يستخدمه المدرب الذكي ومقترح التشكيلات */
// معاملات التحيز اللي تنطبق من بيانات اللاعب نفسه (بدون سياق المباراة)
const STATIC_SEGS = ['popular', 'unpopular', 'premium', 'budget', 'hotForm', 'coldForm', 'lowQuality'];
const segRow = (p) => { const n90 = (p.min || 0) / 90; return [0, 1, p.ppg, p.form, 1, p.own, p.price, null, null, n90 >= 3 && p.pos !== 'GK' ? (p.xgi || 0) / n90 : null]; };
function segMult(b, p) {
  const S = b.seg || {}; const ks = Object.keys(S); if (!ks.length) return 1;
  const row = segRow(p); let m = 1; ks.forEach((k) => { if (SEGS[k]?.(row)) m *= S[k]; }); return Math.max(0.75, Math.min(1.25, m));
}
export function adj(p, v) {
  const b = load(); if (!p) return v;
  const fk = 1 + (b.formK - 1) * Math.max(0, formSig(p)); // يأثر بس على اللاعبين اللي فورمتهم فوق مستواهم
  return v * (b.posK[p.pos] || 1) * fk * segMult(b, p);
}
export const xpL = (p, g) => adj(p, xp(p, g));
export function brain() { return load(); }

/** حفظ توقعات وتوصيات الجولة الجاية (يتحدث لحد ما تبدي الجولة) */
export function snapshot(rec) {
  const G = ST.G, gw = G?.next, ev = G?.events.find((e) => e.id === gw); if (!gw || !ST.E?.entry?.id) return;
  if (ev && ev.deadline && new Date(ev.deadline) < new Date()) return; // بعد الديدلاين ما نغيّر التوقع (حتى التقييم يبقى نزيه)
  const b = load(); const ids = new Set(ST.plan?.squad || []);
  [...G.players].filter((p) => p.st !== 'u').sort((a, c) => xp(c, gw) - xp(a, gw)).slice(0, 90).forEach((p) => ids.add(p.id));
  const P = {}; ids.forEach((id) => { const p = PM(id); if (p) P[id] = [xp(p, gw), +formSig(p).toFixed(2)]; });
  b.snaps[gw] = { t: Date.now(), P, rec: rec || b.snaps[gw]?.rec || null };
  save();
}

/** بعد انتهاء الجولات: قارن التوقع بالنتيجة وعدّل الأوزان */
export async function evaluate(cache) {
  const cachePts = cache?.pts;
  const b = load(), G = ST.G; if (!G) return b;
  const due = Object.keys(b.snaps).map(Number).filter((g) => g <= G.finished && !b.evals.find((e) => e.gw === g));
  for (const g of due) {
    let act = cachePts?.[g];
    if (!act) { try { const l = await FPL.loadLive(g); act = {}; l.elements.forEach((e) => (act[e.id] = [e.stats.total_points, e.stats.minutes])); } catch { continue; } }
    learnFrom(b, g, b.snaps[g].P, act, b.snaps[g].rec, cache?.picks?.[g]?.p);
  }
  save(); return b;
}

function learnFrom(b, g, P, act, rec, P2) {
  const sp = {}, sa = {}; POS.forEach((k) => ((sp[k] = 0), (sa[k] = 0)));
  let fP = 0, fA = 0, err = 0, n = 0, hit = 0;
  for (const [id, [pred, fs]] of Object.entries(P)) {
    const p = PM(+id); if (!p) continue; const a = act[id]?.[0] ?? 0;
    sp[p.pos] += pred; sa[p.pos] += a; err += Math.abs(a - pred); n++;
    if (Math.abs(a - pred) <= 2) hit++;
    if (fs >= 0.4) { fP += pred; fA += a; } // لاعبين توقعناهم عاليين بسبب فورمتهم
  }
  const before = { posK: { ...b.posK }, formK: b.formK }, r = 0.25; // سرعة التعلم
  if (flag('regressGuard')) {
    // حماية من التراجع: التعديل الجديد "مرشّح" ويتقيّم للأمام على جولات ما تعلّم منها قبل ما ينعتمد
    const st = { active: { posK: { ...b.posK }, formK: b.formK }, cand: b.cand, watch: b.watch };
    const log = gateStep(st, P, act, (id) => PM(id)?.pos, g);
    learnCand(st, { sp, sa, fP, fA }, r);
    b.posK = st.active.posK; b.formK = st.active.formK; b.cand = st.cand; b.watch = st.watch;
    (b.gate = b.gate || []).push(...log.map((x) => ({ ...x, ver: ENGINE_VER })));
  } else {
    POS.forEach((k) => { if (sp[k] >= 8) b.posK[k] = clamp(b.posK[k] * (1 - r) + clamp(sa[k] / sp[k], 0.6, 1.4) * r * b.posK[k], 0.82, 1.18); });
    if (fP >= 6) b.formK = clamp(b.formK * (1 - r) + clamp(fA / fP, 0.5, 1.5) * r * b.formK, 0.7, 1.25);
  }
  const e = { gw: g, mae: n ? +(err / n).toFixed(2) : null, acc: n ? Math.round((hit / n) * 100) : null, before, after: { posK: { ...b.posK }, formK: +b.formK.toFixed(3) } };
  // التوصيات: الكابتن والانتقال — صحّت لو لا، والمدرب نفّذها لو لا
  if (rec?.cap) {
    const capA = act[rec.cap]?.[0] ?? 0;
    const xi = P2 ? P2.filter((x) => x[2] <= 11).map((x) => act[x[0]]?.[0] ?? 0) : [];
    const best = xi.length ? Math.max(...xi) : null, mineCap = P2?.find((x) => x[3] === 1)?.[0];
    e.cap = { id: rec.cap, pts: capA, best, followed: mineCap ? mineCap === rec.cap : null, good: best != null ? capA >= best - 2 : null };
  }
  if (rec?.tr?.in) { const done = (ST.E.transfers || []).some((t) => t.event === g && t.element_in === rec.tr.in); e.tr = { in: rec.tr.in, out: rec.tr.out, gain: (act[rec.tr.in]?.[0] ?? 0) - (act[rec.tr.out]?.[0] ?? 0), done }; }
  b.evals.push(e); b.nEval++;
}

/** أول تشغيل: تعلم من التاريخ المخزّن. لكل جولة نتوقع من الجولات اللي قبلها بس */
export function bootstrap(cache) {
  const b = load(); if (b.boot || !cache?.pts) return b;
  const gws = Object.keys(cache.pts).map(Number).sort((a, c) => a - c); if (gws.length < 5) return b;
  const ids = new Set(); Object.values(cache.picks || {}).forEach((P) => (P.p || []).forEach((x) => ids.add(x[0])));
  let sF = 0, sL = 0, sB = 0, n = 0; // أخطاء: الفورمة وحدها، المعدل الطويل، والمزيج
  const pts = (g, id) => cache.pts[g]?.[id]?.[0] ?? 0;
  for (let i = 4; i < gws.length; i++) {
    const g = gws[i], prev = gws.slice(0, i);
    for (const id of ids) {
      const form = prev.slice(-3).reduce((a, x) => a + pts(x, id), 0) / 3, long = prev.reduce((a, x) => a + pts(x, id), 0) / prev.length;
      if (form === 0 && long === 0) continue;
      const a = pts(g, id); sF += Math.abs(a - form); sL += Math.abs(a - long); sB += Math.abs(a - (0.35 * form + 0.65 * long)); n++;
    }
  }
  if (n >= 30) {
    // إذا الفورمة وحدها تخطي أكثر من المعدل الطويل لهذا المدرب، نقلل وزنها
    const ratio = sF / Math.max(1e-6, sL); b.formK = clamp(1 - (ratio - 1) * 0.6, 0.75, 1.15);
    b.err = { form: +(sF / n).toFixed(2), long: +(sL / n).toFixed(2), blend: +(sB / n).toFixed(2), n };
  }
  b.boot = true; save(); return b;
}

/** (8)+(14) معاملات التحيز: المقترح اللي نجح باختباره الزمني يتقيّم للأمام، وبعدها يتعتمد أو ينرفض */
export function gateSegments(evals, proposals) {
  if (!flag('regressGuard')) return [];
  const b = load(), out = [];
  b.segLog = b.segLog || [];
  for (const pr of proposals || []) {
    if (!pr.passed || !STATIC_SEGS.includes(pr.seg)) continue;
    if (b.segLog.some((x) => x.seg === pr.seg && x.m === pr.m && x.gwAt === pr.gwAt && x.type !== 'testing')) continue;
    const f = segForward(pr, evals);
    if (f.status === 'adopt') { b.seg = { ...(b.seg || {}), [pr.seg]: pr.m }; b.segLog.push({ type: 'adopt', seg: pr.seg, m: pr.m, gwAt: pr.gwAt, rel: f.rel, g: f.g, ver: ENGINE_VER }); out.push(pr.seg); }
    else if (f.status === 'reject') b.segLog.push({ type: 'reject', seg: pr.seg, m: pr.m, gwAt: pr.gwAt, rel: f.rel, g: f.g, ver: ENGINE_VER });
  }
  save(); return out;
}
/** (14) تراجع إصدار الكود: إذا الإصدار الحالي أسوأ من السابق بوضوح، نطفي القدرة اللي تغيّر التوقعات بهذا الإصدار */
export function versionGuard(byVer) {
  if (!flag('regressGuard')) return null;
  const v = versionCheck(byVer, ENGINE_VER), b = load();
  b.ver = v;
  if (v.status === 'regressed') {
    try { const cur = JSON.parse(localStorage.getItem('fp_flags_auto') || 'null'); if (cur?.ver !== ENGINE_VER) { localStorage.setItem('fp_flags_auto', JSON.stringify({ ver: ENGINE_VER, off: ['changeDetector'], why: v })); (b.gate = b.gate || []).push({ type: 'version_rollback', ver: ENGINE_VER, prev: v.prev, skill: v.skill, cap: v.cap }); } } catch {}
  }
  save(); return v;
}
/** رجوع يدوي لآخر إعداد معتمد قبل التعديل الأخير */
export function rollbackLast() {
  const b = load(), last = [...(b.gate || [])].reverse().find((x) => x.type === 'adopt');
  if (!last) return false;
  b.posK = { ...last.from.posK }; b.formK = last.from.formK; b.cand = null; b.watch = null; b.gate.push({ type: 'manual_rollback', to: last.from, ver: ENGINE_VER }); save(); return true;
}

/** ملخص للعرض: دقة التوقعات، آخر توصيات ونتيجتها، وشنو تعلّم */
export function summary() {
  const b = load(), E = b.evals; const last = E[E.length - 1];
  const capE = E.filter((e) => e.cap && e.cap.good != null), capRate = capE.length ? Math.round((capE.filter((e) => e.cap.good).length / capE.length) * 100) : null;
  const acc = E.length ? Math.round(E.reduce((a, e) => a + (e.acc || 0), 0) / E.length) : null;
  const notes = [];
  if (b.formK < 0.95) notes.push(['form-', Math.round((1 - b.formK) * 100)]);
  if (b.formK > 1.05) notes.push(['form+', Math.round((b.formK - 1) * 100)]);
  POS.forEach((k) => { if (b.posK[k] < 0.95) notes.push(['pos-', k, Math.round((1 - b.posK[k]) * 100)]); if (b.posK[k] > 1.05) notes.push(['pos+', k, Math.round((b.posK[k] - 1) * 100)]); });
  return { n: b.nEval, acc, capRate, last, notes, err: b.err, formK: b.formK, posK: b.posK, gate: (b.gate || []).slice(-3), cand: b.cand ? { g: b.cand.g } : null, seg: b.seg || {}, segLog: (b.segLog || []).slice(-3), ver: b.ver || null };
}
