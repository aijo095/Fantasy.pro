/* =========================================================
   مقترح التشكيلات — للوايلد كارد والفري هيت
   يبني 5 تشكيلات كاملة (15 لاعب) من مسارات تحليل مختلفة ضمن ميزانيتك،
   مخصصة لأسلوب كل مدرب (المخاطرة، التشكيل المفضل، النجوم، الولاء
   للاعبيه)، وكل ضغطة تطلع مجموعة جديدة. وبعدها تشكيلة رابعة
   تجمع أفضل لاعبين منهن، وقائمة لاعبين ممكن يتألقون.
========================================================= */
import { ST, PM, tShort, tName } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, r1, fmt } from '../ui.js';
import { pShirt, playerRow } from './common.js';
import { xp, avgFdr, avail, dgwBgw } from '../engine.js';
import { coachReady, ensureCoach, sustain, ARCH, coachHistory } from '../coach.js';
import { sellPrice10 } from '../solver.js';
import { adj as lrAdj, brain } from '../learn.js';

const POS = ['GK', 'DEF', 'MID', 'FWD'], NEED = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
let MODE = 'wc', SEED = 0, RES = null, SEL = 0, BUSY = false, PREV = null;

/* ---------- أدوات ---------- */
const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const budgetOf = () => { const P = ST.plan; if (!P) return 0; return r1(P.squad.reduce((a, id) => a + sellPrice10(id), 0) / 10 + (P.bank || 0)); };
const LINES = `<svg class="lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width=".45"><rect x="4" y="3" width="92" height="134" rx="1.5"/><line x1="4" y1="70" x2="96" y2="70"/><ellipse cx="50" cy="70" rx="12" ry="8.6"/><rect x="26" y="3" width="48" height="18"/><rect x="38" y="3" width="24" height="7"/><rect x="26" y="119" width="48" height="18"/><rect x="38" y="130" width="24" height="7"/></g></svg>`;

/** أسلوب المدرب من تحليل تاريخه (أو متوازن إذا بعده ما انحسب) */
function styleOf() {
  const C = coachReady(); const T = C?.T || {}, S = C?.S || {};
  const risk = T.risk ?? 45, patience = T.patience ?? 50;
  return { ready: !!C, arch: C?.arch || 'balanced', risk, favF: S.favF || null, prem: S.prem ?? 2, H: patience >= 65 ? 7 : 6 };
}
const entrySeed = () => { const id = +(ST.E?.entry?.id || 1); return (id * 2654435761) >>> 0; };

/* =========================================================
   مسارات التحليل — كل لاعب ينقيّم بخمس طرق مختلفة (كلها بوحدة نقاط):
   proj: المتوقع على الجولات الجاية (المباريات + الدقائق)
   qual: مستواه الحقيقي على طول الموسم (نقاط/مباراة + أرقامه لكل 90)
   brk : مرشح للتألق — أرقامه الحقيقية (xG/xA) أعلى من نقاطه، أو صار يلعب أساسي
   fix : الجدول — يكبر قيمته إذا مبارياته الجاية سهلة
   mom : الفورمة الحالية — نقاطه بآخر الجولات
   كل اقتراح يخلط المسارات بنسب مختلفة، وأسلوب المدرب يغيّر النسب
========================================================= */
let BASE = { k: '', m: null };
function baseValues(mode, gws) {
  const k = mode + gws.join(',') + '|' + ST.G.finished + '|' + (coachReady() ? 1 : 0) + '|' + brain().nEval + brain().formK;
  if (BASE.k === k) return BASE.m;
  const m = new Map(), fin = Math.max(1, ST.G.finished), hist = coachHistory();
  const PF = { GK: 0, DEF: 6, MID: 5, FWD: 4 }, CSF = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
  let W = 0; gws.forEach((g, i) => (W += Math.pow(0.93, i)));
  for (const p of ST.G.players) {
    if (p.st === 'u' || p.st === 'n') continue;
    if (p.min <= 0 && !ST.plan?.squad.includes(p.id)) continue;
    const n90 = p.min / 90, startR = p.starts != null ? p.starts / fin : Math.min(1, p.min / (90 * fin));
    const under = n90 >= 2 ? ((p.xg || 0) * PF[p.pos] + (p.xa || 0) * 3) / n90 + 2 + CSF[p.pos] * (p.cs || 0) / Math.max(1, n90) : 0;
    const a = avail(p, gws[0]);
    let proj = 0; gws.forEach((g, i) => (proj += Math.pow(0.93, i) * xp(p, g)));
    proj = lrAdj(p, proj); // تصحيح من تعلّم المدرب (معامل المراكز ووزن الفورمة)
    if (mode === 'wc') proj *= sustain(p).k;
    if (proj <= 0) continue;
    const qual = (0.55 * p.ppg + 0.45 * Math.max(p.ppg * 0.7, under)) * Math.min(1, 0.35 + startR) * W * a;
    const rec = hist.hasPts ? hist.recent(p.id, 4) : null;
    const recAvg = rec ? rec.reduce((x, y) => x + y, 0) / rec.length : p.form;
    // مرشح للتألق: الفرق بين أرقامه الحقيقية ونقاطه + زيادة دقائقه بالجولات الأخيرة
    const gap = Math.max(0, under - p.ppg);
    const minsUp = rec && rec.length >= 3 ? Math.max(0, (rec.slice(0, 2).filter((x) => x >= 2).length - rec.slice(2).filter((x) => x >= 2).length) * 0.35) : 0;
    const brk = (p.ppg + gap * 0.9 + minsUp) * W * a * Math.min(1, 0.45 + startR);
    const ease = 3 - avgFdr(p.team, gws[0], gws.length); // موجب = جدول سهل
    const fix = proj * (1 + ease * 0.22);
    const mom = Math.max(0, recAvg) * W * a * Math.min(1, 0.4 + startR);
    m.set(p.id, { proj, qual, brk, fix, mom, gap, ease, recAvg, minsUp });
  }
  BASE = { k, m }; return m;
}

/** نسب المسارات حسب نوع الاقتراح + أسلوب المدرب */
function mixFor(kind, st, mode) {
  const M = {
    bal: { proj: 0.4, qual: 0.3, brk: 0.1, fix: 0.1, mom: 0.1 },
    fix: { proj: 0.45, qual: 0.15, brk: 0.05, fix: 0.35, mom: 0 },
    brk: { proj: 0.3, qual: 0.1, brk: 0.4, fix: 0.05, mom: 0.15 },
    mom: { proj: 0.45, qual: 0.05, brk: 0.1, fix: 0.05, mom: 0.35 },
  }[kind] || {};
  const w = { ...M };
  if (mode === 'fh') { w.qual *= 0.4; w.proj += 0.15; } // الفري هيت: الجولة نفسها أهم من الموسم
  const a = st.arch;
  if (a === 'chaser') { w.mom *= 0.5; w.qual *= 1.25; } // اللي يطارد التألق نحميه بالأرقام الحقيقية
  if (a === 'maverick') { w.brk *= 1.3; }
  if (a === 'template') { w.qual *= 1.2; w.brk *= 0.8; }
  if (a === 'strategist') { w.fix *= 1.3; }
  if (a === 'gambler') { w.mom *= 1.1; w.proj *= 1.05; }
  const t = Object.values(w).reduce((x, y) => x + y, 0); Object.keys(w).forEach((k) => (w[k] /= t));
  return w;
}

/** قيمة اللاعب لهالمدرب: مزيج المسارات × بصمته (المخاطرة، ولاءه، صفقاته، وتنويع خاص بيه) */
function valueMap(mode, st, opt) {
  const G = ST.G, g0 = G.next, gws = []; const H = mode === 'fh' ? 1 : st.H;
  for (let g = g0; g < g0 + H && g <= G.lastGW; g++) gws.push(g);
  const mine = new Set(ST.plan?.squad || []), hist = coachHistory();
  const lastGW = G.finished || 0, soldRecent = new Set((ST.E.transfers || []).filter((t) => t.event >= lastGW - 2).map((t) => t.element_out));
  const boughtRecent = new Set((ST.E.transfers || []).filter((t) => t.event >= lastGW - 4).map((t) => t.element_in));
  const mgr = rng(entrySeed()), tap = rng(entrySeed() ^ (opt.seed * 2246822519));
  const riskB = Math.max(-1, Math.min(1, (st.risk - 50) / 50 + (opt.diff || 0))); // -1 (آمن) .. +1 (جريء)
  const w = mixFor(opt.kind || 'bal', st, mode);
  const V = new Map(), base = baseValues(mode, gws);
  const ids = [...base.keys()].sort((a, b) => a - b), mgrNoise = new Map(); ids.forEach((id) => mgrNoise.set(id, mgr()));
  for (const id of ids) {
    const b = base.get(id), p = PM(id);
    const v = w.proj * b.proj + w.qual * b.qual + w.brk * b.brk + w.fix * b.fix + w.mom * b.mom;
    let m = 1;
    m *= 1 + (mgrNoise.get(id) - 0.5) * (mode === 'fh' ? 0.12 : 0.14); // بصمة ثابتة لكل مدرب
    const rk = mode === 'fh' ? 0.2 : 0.15;
    if (p.own < 10) m *= 1 + rk * riskB; else if (p.own > 30) m *= 1 - rk * 0.8 * riskB;
    if (mode === 'wc') {
      if (mine.has(id)) m *= 1.10;
      else if ((hist.owned.get(id) || 0) >= 2) m *= 1.04;
      if (boughtRecent.has(id) && mine.has(id)) m *= 1.03;
      if (soldRecent.has(id)) m *= 0.9;
    } else if (mine.has(id)) m *= 1.02;
    if (opt.prem === 'stars' && p.price >= 10) m *= 1.07;
    if (opt.prem === 'spread' && p.price >= 10) m *= 0.92;
    if (opt.avoid?.has(id)) m *= 1 - opt.avoidW;
    if (opt.old?.has(id)) m *= 0.95; // اقتراحات الجولة الماضية — نعطي فرصة لأفكار جديدة
    if (opt.boost?.has(id)) m *= opt.boost.get(id);
    m *= 1 + (tap() - 0.5) * 0.07;
    if (v > 0) V.set(id, v * m);
  }
  return { V, gws };
}

/** لاعبين ممكن يتألقون: أرقامهم الحقيقية تسبق نقاطهم، أو دقائقهم صاعدة، أو جدولهم سهل — مرتبين على مقاس المدرب */
function breakouts(mode, st, n = 6) {
  const G = ST.G, H = mode === 'fh' ? 1 : st.H, gws = []; for (let g = G.next; g < G.next + H && g <= G.lastGW; g++) gws.push(g);
  const base = baseValues(mode, gws), mine = new Set(ST.plan?.squad || []), mgr = rng(entrySeed() ^ 0x9e3779b9);
  const L = [];
  for (const [id, b] of base) {
    const p = PM(id); if (mine.has(id) || p.min < 270) continue;
    const why = [];
    if (b.gap >= 0.8) why.push(tt('أرقامه أعلى من نقاطه', 'Underlying > points'));
    if (b.minsUp > 0) why.push(tt('دقائقه صاعدة', 'Minutes rising'));
    if (b.ease >= 0.5) why.push(tt('جدول سهل جاي', 'Easy fixtures'));
    if (b.recAvg >= p.ppg + 1.5) why.push(tt('متألق هالفترة', 'In form'));
    if (!why.length) continue;
    const sc = (b.brk + b.fix * 0.3) / Math.max(4, p.price) * (1 + (p.own < 10 ? 0.15 * Math.max(0, (st.risk - 40) / 60) : 0)) * (0.92 + mgr() * 0.16);
    L.push({ p, why, sc });
  }
  // توزيع على المراكز: وسط وهجوم أكثر (هم اللي ينفجرون)
  const Q = { MID: 2, FWD: 2, DEF: 1, GK: 1 }, out = [];
  for (const k of ['MID', 'FWD', 'DEF', 'GK']) out.push(...L.filter((x) => x.p.pos === k).sort((a, b) => b.sc - a.sc).slice(0, Q[k]));
  return out.slice(0, n);
}

const FORMS = []; for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) { const f = 10 - d - m; if (f >= 1 && f <= 3) FORMS.push(`${d}-${m}-${f}`); }
/** أفضل 11 + الكابتن (تشكيل محدد أو الأفضل) */
function xiOf(sq, V, favF, force) {
  const by = {}; POS.forEach((k) => (by[k] = sq.filter((id) => PM(id).pos === k).sort((a, b) => (V.get(b) || 0) - (V.get(a) || 0))));
  let best = null;
  for (const fs of force ? [force] : FORMS) {
    const [d, m, f] = fs.split('-').map(Number);
    if (by.DEF.length < d || by.MID.length < m || by.FWD.length < f) continue;
    const xi = [by.GK[0], ...by.DEF.slice(0, d), ...by.MID.slice(0, m), ...by.FWD.slice(0, f)];
    let s = xi.reduce((a, id) => a + (V.get(id) || 0), 0);
    if (!force && favF && fs === favF) s += 0.3;
    if (!best || s > best.s) best = { s, xi, f: fs };
  }
  const bench = [by.GK[1], ...sq.filter((id) => PM(id).pos !== 'GK' && !best.xi.includes(id)).sort((a, b) => (V.get(b) || 0) - (V.get(a) || 0))];
  const cap = [...best.xi].sort((a, b) => (V.get(b) || 0) - (V.get(a) || 0));
  return { xi: best.xi, bench, f: best.f, cap: cap[0], vc: cap[1] };
}

function objective(sq, V, mode, favF, force) {
  const b = xiOf(sq, V, favF, force), v = (id) => V.get(id) || 0;
  const benchW = mode === 'fh' ? 0.05 : 0.14;
  return b.xi.reduce((a, id) => a + v(id), 0) + v(b.cap) + benchW * b.bench.reduce((a, id) => a + v(id), 0);
}

/** يبني تشكيلة 15 لاعب: يبدأ من فريقك (أو بداية رخيصة) ويحسّن بالتبديلات الفردية والثنائية */
function build(V, budget, mode, favF, o = {}) {
  const { pool, start, force } = o;
  const T0 = performance.now(), LIMIT = pool ? 700 : 1500;
  const ids = pool ? [...pool].filter((id) => V.has(id)) : [...V.keys()];
  const cand = {}; POS.forEach((k) => {
    const L = ids.filter((id) => PM(id).pos === k);
    const top = [...L].sort((a, b) => V.get(b) - V.get(a)).slice(0, pool ? 99 : 30);
    const cheap = [...L].sort((a, b) => PM(a).price - PM(b).price || V.get(b) - V.get(a)).slice(0, pool ? 99 : 6);
    cand[k] = [...new Set([...top, ...cheap])].sort((a, b) => V.get(b) - V.get(a));
  });
  const clubOk = (sq) => { const c = {}; for (const id of sq) { const t = PM(id).team; if ((c[t] = (c[t] || 0) + 1) > 3) return false; } return true; };
  const cost = (sq) => sq.reduce((a, id) => a + PM(id).price, 0);
  const valid = (sq) => sq && sq.length === 15 && POS.every((k) => sq.filter((x) => PM(x).pos === k).length === NEED[k]) && clubOk(sq) && cost(sq) <= budget + 1e-9;
  let sq = null;
  if (valid(start)) sq = [...start];
  else { sq = []; for (const k of POS) { for (const id of [...cand[k]].sort((a, b) => PM(a).price - PM(b).price)) { if (sq.filter((x) => PM(x).pos === k).length >= NEED[k]) break; if (clubOk([...sq, id])) sq.push(id); } } }
  if (!valid(sq)) return null;
  const obj = (x) => objective(x, V, mode, favF, force);
  let score = obj(sq);
  for (let it = 0; it < 120 && performance.now() - T0 < LIMIT; it++) {
    let best = null; const bank = budget - cost(sq);
    for (const out of sq) { const po = PM(out);
      for (const n of cand[po.pos]) { if (sq.includes(n)) continue; if (PM(n).price - po.price > bank + 1e-9) continue;
        const s2 = sq.map((x) => (x === out ? n : x)); if (!clubOk(s2)) continue;
        const sc = obj(s2); if (sc > score + 0.01 && (!best || sc > best.sc)) best = { s2, sc }; } }
    if (best) { sq = best.s2; score = best.sc; continue; }
    // تبديل ثنائي: يفتح ميزانية لنجم (مثلاً تنزل لاعبين متوسطين وتجيب نجم + لاعب رخيص)
    let b2 = null;
    for (let a = 0; a < 15 && performance.now() - T0 < LIMIT; a++) for (let b = a + 1; b < 15; b++) {
      const x1 = sq[a], x2 = sq[b], c1 = cand[PM(x1).pos].slice(0, 12), c2 = cand[PM(x2).pos].slice(0, 12);
      const free = bank + PM(x1).price + PM(x2).price;
      for (const n1 of c1) { if (sq.includes(n1)) continue;
        for (const n2 of [...c2, ...cand[PM(x2).pos].slice(-6)]) { if (n2 === n1 || sq.includes(n2)) continue; if (PM(n1).price + PM(n2).price > free + 1e-9) continue;
          const s2 = sq.map((x) => (x === x1 ? n1 : x === x2 ? n2 : x)); if (!clubOk(s2)) continue;
          const sc = obj(s2); if (sc > score + 0.05 && (!b2 || sc > b2.sc)) b2 = { s2, sc }; } } }
    if (!b2) break; sq = b2.s2; score = b2.sc;
  }
  return sq;
}

/* =========================================================
   محرك الخطط الذكي — يقرا وضع الجولة ويطلع خطط تتغير كل جولة:
   تكديس فريق جدوله سهل، خطة الدبل/البلانك، النجمين، حركة السوق،
   الجدار الدفاعي، المرشحين للتألق، الفورمة، الجدول، المفاجآت.
   كل خطة تنقيّم حسب قوتها هالجولة + ميول المدرب، ونختار أقوى 4 مع "الأفضل لك".
========================================================= */
function gwsOf(mode, st) { const G = ST.G, H = mode === 'fh' ? 1 : st.H, out = []; for (let g = G.next; g < G.next + H && g <= G.lastGW; g++) out.push(g); return out; }
function strategies(mode, st) {
  const G = ST.G, gws = gwsOf(mode, st), base = baseValues(mode, gws), fh = mode === 'fh';
  const rnd = rng(entrySeed() ^ (G.next * 40503)); // ترتيب يختلف كل جولة ولكل مدرب
  const aff = { stack: 1, dgw: 1, stars: 1, market: 1, wall: 1, brk: 1, form: 1, fix: 1, diff: 1 };
  if (st.arch === 'maverick') { aff.brk = 1.35; aff.diff = 1.35; aff.market = 0.85; }
  if (st.arch === 'template') { aff.stars = 1.3; aff.market = 1.25; aff.diff = 0.7; }
  if (st.arch === 'strategist') { aff.fix = 1.3; aff.dgw = 1.35; aff.stack = 1.2; }
  if (st.arch === 'chaser') { aff.form = 0.75; aff.brk = 1.2; }
  if (st.arch === 'gambler') { aff.form = 1.25; aff.diff = 1.2; }
  if (st.risk >= 60) aff.diff *= 1.2; if (st.risk <= 32) aff.diff *= 0.75;
  const L = [];
  const byTeam = {}; for (const [id, b] of base) { const t = PM(id).team; (byTeam[t] = byTeam[t] || []).push([id, b]); }
  // 1) تكديس فريق: جدول سهل + هجوم قوي
  const teamSc = Object.keys(byTeam).map(Number).map((t) => { const top = byTeam[t].map((x) => x[1].proj).sort((a, b) => b - a).slice(0, 3); const ease = 3 - avgFdr(t, gws[0], gws.length); return { t, sc: top.reduce((a, b) => a + b, 0) * (1 + ease * 0.3), ease }; }).sort((a, b) => b.sc - a.sc);
  const T = teamSc[Math.floor(rnd() * 2)]; // واحد من أقوى فريقين — حتى ما يتكرر نفس الفريق للكل
  if (T) L.push({ id: 'stack', sc: 0.9 + T.ease * 0.25, label: tt(`تكديس ${tName(T.t)}`, `${tName(T.t)} triple-up`), why: fh ? tt(`مباراة ${tName(T.t)} هالجولة من الأسهل وهجومه قوي — نخلي 3 لاعبين منه`, 'Easy match + strong attack: 3 players') : tt(`جدول ${tName(T.t)} الجاي من الأسهل وهجومه قوي — 3 لاعبين منه يشيلون الفريق`, 'Kind fixtures + strong attack: 3 players'), ins: tt(`${tName(T.t)}: جدول سهل جاي`, `${tName(T.t)}: easy run`), opt: { kind: 'fix', boost: new Map(byTeam[T.t].map(([id]) => [id, 1.24])) } });
  // 2) الدبل / البلانك
  const dg = dgwBgw(gws[0], gws[gws.length - 1]); const dbl = dg.flatMap((x) => x.dbl), blk = dg.find((x) => x.blank.length >= 4);
  if (dbl.length) { const set = new Set(dbl); L.push({ id: 'dgw', sc: 1.4 + dbl.length * 0.05, label: tt('خطة الدبل', 'Double GW plan'), why: tt(`فرق تلعب مباراتين: ${[...set].slice(0, 4).map(tShort).join('، ')} — لاعبينهم ياخذون أولوية`, 'Teams with doubles get priority'), ins: tt(`جولة دبل: ${[...set].slice(0, 3).map(tShort).join('، ')}`, 'Double GW ahead'), opt: { kind: 'bal', boost: new Map([...base.keys()].filter((id) => set.has(PM(id).team)).map((id) => [id, 1.15])) } }); }
  if (blk && !fh) { const bs = new Set(blk.blank); L.push({ id: 'blank', sc: 1.1, label: tt('تفادي البلانك', 'Blank-proof'), why: tt(`الجولة ${blk.gw} بيها فرق ما تلعب — نقلل لاعبينهم`, 'Fewer players from blanking teams'), ins: tt(`بلانك بالجولة ${blk.gw}`, `Blank in GW${blk.gw}`), opt: { kind: 'bal', boost: new Map([...base.keys()].filter((id) => bs.has(PM(id).team)).map((id) => [id, 0.85])) } }); }
  // 3) النجمين
  const prem = [...base].filter(([id]) => PM(id).price >= 9.5).sort((a, b) => (b[1].proj + b[1].mom * 0.3) - (a[1].proj + a[1].mom * 0.3)).slice(0, 3);
  if (prem.length >= 2) { const pk = rnd() < 0.5 ? [prem[0], prem[1]] : [prem[0], prem[2] || prem[1]]; L.push({ id: 'stars', sc: 1.0, label: tt(`النجمين: ${PM(pk[0][0]).name} و${PM(pk[1][0]).name}`, `Stars: ${PM(pk[0][0]).name} & ${PM(pk[1][0]).name}`), why: tt('نبني حول أقوى نجمين هالفترة ونوفر بباقي المراكز', 'Built around the two strongest premiums'), ins: tt(`${PM(pk[0][0]).name} بأقوى فترة`, `${PM(pk[0][0]).name} in top form`), opt: { kind: 'bal', boost: new Map(pk.map(([id]) => [id, 1.7])) } }); }
  // 4) حركة السوق
  const mk = [...base].filter(([id]) => PM(id).tin > 0).sort((a, b) => (PM(b[0]).tin - PM(b[0]).tout) - (PM(a[0]).tin - PM(a[0]).tout)).slice(0, 14);
  if (mk.length >= 6 && PM(mk[0][0]).tin > 1000) L.push({ id: 'market', sc: 0.85, label: tt('حركة السوق', 'Market movers'), why: tt('اللاعبين اللي المدربين يشترونهم هالجولة — تلحكهم قبل ما يرتفع سعرهم', 'Most-bought players before price rises'), ins: tt(`الأكثر شراء: ${PM(mk[0][0]).name}`, `Most bought: ${PM(mk[0][0]).name}`), opt: { kind: 'mom', boost: new Map(mk.map(([id]) => [id, 1.13])) } });
  // 5) الجدار الدفاعي
  const defT = Object.keys(byTeam).map(Number).map((t) => ({ t, e: 3 - avgFdr(t, gws[0], gws.length), gc: byTeam[t].filter(([id]) => PM(id).pos === 'GK').reduce((a, [id]) => Math.max(a, PM(id).cs || 0), 0) })).sort((a, b) => (b.e + b.gc * 0.15) - (a.e + a.gc * 0.15)).slice(0, 3);
  if (defT.length) { const ds = new Set(defT.map((x) => x.t)); L.push({ id: 'wall', sc: 0.8 + defT[0].e * 0.3, force: rnd() < 0.5 ? '5-3-2' : '5-4-1', label: tt('الجدار الدفاعي', 'Defensive wall'), why: tt(`خمس مدافعين من فرق تحافظ على شباكها وجدولها سهل: ${defT.map((x) => tShort(x.t)).join('، ')}`, '5 defenders from clean-sheet teams'), ins: tt(`شباك نظيفة متوقعة: ${tShort(defT[0].t)}`, `Clean sheets: ${tShort(defT[0].t)}`), opt: { kind: 'fix', boost: new Map([...base.keys()].filter((id) => ds.has(PM(id).team) && (PM(id).pos === 'DEF' || PM(id).pos === 'GK')).map((id) => [id, 1.2])) } }); }
  // 6) مسارات التحليل
  L.push({ id: 'brk', sc: 0.95, label: fh ? tt('الأرقام الحقيقية', 'Underlying') : tt('مرشحين للتألق', 'Breakouts'), why: tt('لاعبين أرقامهم الحقيقية أعلى من نقاطهم أو دقائقهم صاعدة', 'Underlying numbers ahead of points'), opt: { kind: 'brk', diff: 0.2 } });
  L.push({ id: 'form', sc: fh ? 1.05 : 0.8, label: tt('المتألقين هسه', 'In form'), why: tt('لاعبين بفورمة عالية بآخر الجولات', 'Hot players right now'), opt: { kind: 'mom' } });
  L.push({ id: 'fix', sc: 0.9, label: fh ? tt('المباراة الأسهل', 'Easiest match') : tt('مسار الجدول', 'Fixtures path'), why: tt('لاعبين مبارياتهم الجاية سهلة ومتوقعهم عالي', 'Kindest fixtures'), opt: { kind: 'fix' } });
  L.push({ id: 'diff', sc: 0.75, label: tt('المفاجآت', 'Differentials'), why: tt('لاعبين قليلين الملكية — تكسب بيهم على الأغلبية', 'Low-owned players'), opt: { kind: 'bal', diff: 0.6 } });
  L.forEach((x) => (x.sc = x.sc * (aff[x.id] || 1) * (0.85 + rnd() * 0.3)));
  return L.sort((a, b) => b.sc - a.sc);
}

/** الإجابة النهائية: "الأفضل لك" + أقوى 4 خطط هالجولة + الأفضل من الكل */
function generate() {
  const T0 = performance.now();
  const st = styleOf(), budget = budgetOf(), mode = MODE, seed = ++SEED, own = ST.plan?.squad || [];
  const pure = valueMap(mode, st, { seed: 0 });
  const DISP = new Map(); [...pure.V.keys()].forEach((id) => DISP.set(id, pure.gws.reduce((a, g) => a + xp(PM(id), g), 0)));
  // ذاكرة: اقتراحات الجولة الماضية (حتى تطلع أفكار جديدة كل جولة)
  const hk = `fp_sqh_${ST.E?.entry?.id}_${mode}`; let H0 = null; try { H0 = JSON.parse(localStorage.getItem(hk) || 'null'); } catch {}
  const old = H0 && H0.gw < ST.G.next ? new Set(H0.ids) : null;
  const prevA = PREV && PREV.mode === mode ? PREV.a : null;
  const mk = (opt, force, label, why, extra = {}) => { const { V } = valueMap(mode, st, { old, ...opt }); const sq = build(V, budget, mode, st.favF, { start: own, force }); if (!sq) return null; return { sq, label, why, ...extra, ...summary(sq, DISP, st.favF, budget, force || xiOf(sq, V, st.favF).f) }; };
  const fh = mode === 'fh';
  const A = mk(prevA ? { seed, avoid: prevA, avoidW: 0.07, kind: 'bal' } : { seed, kind: 'bal' }, null, fh ? tt('الأقوى للجولة', 'Strongest this GW') : tt('الأفضل لك', 'Best for you'),
    tt('كل المسارات سوية: المستوى، الجدول، الأرقام الحقيقية والفورمة — على مقاس أسلوبك وفريقك', 'All paths combined, fitted to you'));
  if (!A) return null;
  // الخطط: نبدّل بين الخطط القوية مع كل ضغطة حتى تطلع أفكار ثانية
  const S = strategies(mode, st); const rot = (seed - 1) % 3;
  const pick = [...S.slice(rot), ...S.slice(0, rot)].filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).slice(0, 4);
  const order = [st.favF, '4-4-2', '3-4-3', '4-3-3', '3-5-2', '5-3-2', '4-5-1', '5-4-1'].filter(Boolean);
  const used = new Set([A.f]); let avoid = new Set([...A.xi, ...(prevA || [])]); const L = [A];
  pick.forEach((P, k) => {
    let f = P.force; if (!f || used.has(f)) f = order.find((x) => !used.has(x)) || null; used.add(f);
    const R = mk({ seed: seed + 11 + k, avoid, avoidW: 0.12, ...P.opt }, f, P.label, P.why, { sid: P.id });
    if (R) { L.push(R); R.xi.forEach((id) => avoid.add(id)); }
  });
  const poolU = new Set(L.flatMap((x) => x.sq));
  const VB = new Map(); pure.V.forEach((v, id) => VB.set(id, (v + (DISP.get(id) || 0)) / 2));
  const start = [...L].sort((x, y) => objective(y.sq, VB, mode, st.favF) - objective(x.sq, VB, mode, st.favF))[0].sq;
  const built = build(VB, budget, mode, st.favF, { pool: poolU, start });
  let best = [built, ...L.map((x) => x.sq)].filter(Boolean).sort((a, b) => objective(b, VB, mode, st.favF) - objective(a, VB, mode, st.favF))[0];
  const BEST = { sq: best, label: tt('الأفضل من الكل', 'Best of all'), why: tt('جمعنا أقوى اللاعبين من كل الخطط بتشكيلة وحدة ضمن ميزانيتك، وبأفضل رسم', 'Strongest players from all plans in one squad'), best: true, ...summary(best, DISP, st.favF, budget, xiOf(best, pure.V, st.favF).f) };
  const topL = [...L].sort((a, b) => b.xpT - a.xpT)[0];
  if (BEST.xpT < topL.xpT - 0.05) Object.assign(BEST, summary(topL.sq, DISP, st.favF, budget, topL.f), { sq: topL.sq });
  const list = [...L, BEST];
  if (old) list.forEach((x) => (x.fresh = x.sq.filter((id) => !old.has(id)).length));
  // نحفظ اقتراحات هالجولة (حتى الجولة الجاية تطلع أفكار جديدة)
  try { const prevIds = H0 && H0.gw === ST.G.next ? H0.ids : []; localStorage.setItem(hk, JSON.stringify({ gw: ST.G.next, ids: [...new Set([...prevIds, ...A.sq, ...BEST.sq])].slice(-60) })); } catch {}
  PREV = { mode, a: new Set(A.xi) };
  window.__sqMs = Math.round(performance.now() - T0);
  return { st, budget, mode, gws: pure.gws, list };
}
function summary(sq, D, favF, budget, f) {
  const b = xiOf(sq, D, favF, f), cost = r1(sq.reduce((a, id) => a + PM(id).price, 0));
  const xpT = r1(b.xi.reduce((a, id) => a + (D.get(id) || 0), 0) + (D.get(b.cap) || 0));
  const mine = new Set(ST.plan?.squad || []), keep = sq.filter((id) => mine.has(id)).length;
  return { ...b, cost, bank: r1(budget - cost), xpT, keep };
}

/* ---------- الواجهة ---------- */
function pitch(R) {
  const rows = POS.map((k) => R.xi.filter((id) => PM(id).pos === k));
  const card = (id, i) => { const p = PM(id), v = r1(RES.list[SEL] ? valueFor(id) : 0), mine = ST.plan?.squad.includes(id);
    return `<div class="pl${mine ? '' : ' new'}" style="--d:${i * 30}ms" onclick="openPlayer(${id})">${R.cap === id ? '<span class="cb">C</span>' : R.vc === id ? '<span class="cb v">V</span>' : ''}<div class="sh">${pShirt(p)}</div><div class="nm">${esc(p.name)}</div><div class="lb" style="background:${v >= (RES.mode === 'fh' ? 6 : 25) ? '#34D399' : v >= (RES.mode === 'fh' ? 4 : 18) ? '#A7F3D0' : '#F1F5F9'}">${v}</div></div>`; };
  let k = 0;
  return `<div class="pitch" style="margin-top:12px">${LINES}${rows.map((r) => `<div class="prow">${r.map((id) => card(id, k++)).join('')}</div>`).join('')}</div>
  <div class="benchbox"><div class="t">${tt('الدكة', 'Bench')}</div><div class="prow" dir="ltr">${R.bench.map((id, i) => `<div class="slot"><small>${i === 0 ? tt('حارس', 'GK') : i}</small>${card(id, 11 + i)}</div>`).join('')}</div></div>`;
}
const PV = new Map();
function valueFor(id) { return PV.get(id) ?? 0; }

export function vSquads() {
  const st = styleOf(); if (!st.ready) ensureCoach().then(() => { if (ST.view === 'squads') window.render(); });
  const G = ST.G, b = budgetOf();
  const chips = (ST.E.hist?.chips || []).map((c) => c.name);
  const head = `<div class="sec" style="margin-top:4px"><div><h2 style="font-size:20px">${tt('مقترح التشكيلات', 'Squad Lab')}</h2><p class="mut" style="margin:4px 0 0;font-size:12.5px">${tt('تشكيلات كاملة للوايلد كارد والفري هيت، مبنية على أسلوبك', 'Full squads for Wildcard & Free Hit, built on your style')}</p></div></div>`;
  const seg = `<div class="tabs2" style="margin-top:6px"><button class="${MODE === 'wc' ? 'on' : ''}" onclick="sqMode('wc')">${I('i-reset')}${tt('وايلد كارد', 'Wildcard')} <small style="opacity:.7">${tt(`${st.H} جولات`, `${st.H} GWs`)}</small></button><button class="${MODE === 'fh' ? 'on' : ''}" onclick="sqMode('fh')">${I('i-bolt')}${tt('فري هيت', 'Free Hit')} <small style="opacity:.7">GW${G.next}</small></button></div>`;
  const arch = ARCH()[st.arch] || ARCH().balanced;
  const who = `<div class="card" style="display:flex;gap:12px;align-items:center"><div class="pbig" style="background:rgba(139,124,255,.14);color:#C4B5FD;width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none">${I('i-user')}</div><div style="flex:1;min-width:0"><b style="font-size:14px">${st.ready ? arch[0] : tt('نحلل أسلوبك…', 'Analysing your style…')}</b><div class="mut" style="font-size:12px;line-height:1.6;margin-top:2px">${st.ready ? [st.favF ? tt(`تشكيلك المفضل ${st.favF}`, `Fav formation ${st.favF}`) : '', st.risk >= 60 ? tt('تحب الخيارات المختلفة', 'You like differentials') : st.risk <= 32 ? tt('تفضّل الخيارات الآمنة', 'You prefer safe picks') : tt('توازن بين الآمن والمختلف', 'Safe/differential balance')].filter(Boolean).join(' · ') : tt('الاقتراحات راح تتخصص أكثر بعد التحليل', 'Suggestions get more personal after analysis')}</div></div><div style="text-align:center"><small class="mut" style="font-size:11px">${tt('الميزانية', 'Budget')}</small><b class="num" style="display:block;font-size:17px">£${b.toFixed(1)}</b></div></div>`;
  const ideas = (() => { try { return strategies(MODE, st).filter((x) => x.ins).slice(0, 4); } catch { return []; } })();
  const ideasHTML = ideas.length ? `<div class="sq-ideas"><div class="t">${I('i-sparkle')}${tt(`أفكار الجولة ${G.next}`, `GW${G.next} ideas`)}<small>${tt('تتحدث كل جولة', 'Updated every GW')}</small></div>${ideas.map((x) => `<div class="i"><b>${esc(x.ins)}</b><span>${esc(x.label)}</span></div>`).join('')}</div>` : '';
  const used = MODE === 'wc' ? chips.includes('wildcard') : chips.includes('freehit');
  const note = used ? `<div class="note" style="margin-top:8px">${tt('ملاحظة: استخدمت هالورقة بالنص الأول — الاقتراح يفيدك للنص الثاني أو للتخطيط', 'Note: chip already used this half — useful for planning')}</div>` : '';
  const btn = `<button class="btn btn-p" style="width:100%;margin-top:12px" onclick="sqGo()" ${BUSY ? 'disabled' : ''}>${I('i-sparkle')}${BUSY ? tt('نبني التشكيلات…', 'Building…') : RES ? tt('اقترح تشكيلات جديدة', 'Suggest new squads') : tt('اقترح خطط الجولة', 'Suggest GW plans')}</button>`;
  if (!RES || RES.mode !== MODE) return head + seg + who + ideasHTML + note + btn + `<div class="card mut" style="margin-top:12px;font-size:13px;line-height:1.8;text-align:center">${tt('النظام يقرا وضع الجولة (الجدول، الدبل والبلانك، حركة السوق، النجوم، الفورمة) ويطلع خطط تتغير كل جولة وكل ضغطة — 5 خطط برسوم مختلفة وسادسة تجمع الأفضل منهن', 'The engine reads the GW and builds plans that change every GW and tap')}</div>`;
  const R = RES.list[SEL] || RES.list[0];
  PV.clear(); R.sq.forEach((id) => PV.set(id, RES.gws.reduce((a, g) => a + xp(PM(id), g), 0)));
  const tabs = `<div class="sq-tabs">${RES.list.map((x, i) => `<button class="${i === SEL ? 'on' : ''}${x.best ? ' best' : ''}" onclick="sqSel(${i})"><b>${x.best ? '★' : String.fromCharCode(65 + i)}</b><span>${esc(x.label)}</span><small class="num">${x.f} · ${x.xpT}</small></button>`).join('')}</div>`;
  const prev = SEL > 0 && !R.best ? RES.list[0] : null;
  const diffA = prev ? R.sq.filter((id) => !prev.sq.includes(id)).length : null;
  const stats = `<div class="sq-stats"><div><small>${tt('المتوقع', 'Projected')}</small><b class="num">${R.xpT}</b><em>${RES.mode === 'fh' ? tt(`الجولة ${G.next}`, 'GW' + G.next) : tt(`${RES.gws.length} جولات`, `${RES.gws.length} GWs`)}</em></div><div><small>${tt('التشكيل', 'Formation')}</small><b class="num">${R.f}</b></div><div><small>${tt('الكلفة', 'Cost')}</small><b class="num">£${R.cost.toFixed(1)}</b><em>${tt('يبقى', 'Bank')} <bdi dir="ltr">£${R.bank.toFixed(1)}</bdi></em></div><div><small>${tt('من فريقك', 'Kept')}</small><b class="num">${R.keep}/15</b>${R.fresh != null ? `<em>${tt(`${R.fresh} جدد عن الجولة الماضية`, `${R.fresh} new vs last GW`)}</em>` : diffA != null ? `<em>${tt(`${diffA} مختلفين عن A`, `${diffA} differ from A`)}</em>` : ''}</div></div>`;
  return head + seg + who + ideasHTML + note + btn + tabs + `<div class="card" style="margin-top:10px"><b style="font-size:14.5px">${esc(R.label)}</b><div class="mut" style="font-size:12.5px;margin-top:3px;line-height:1.6">${esc(R.why)}</div>${stats}</div>` + pitch(R) +
    breakoutHTML() + `<p class="mut" style="font-size:11.5px;text-align:center;margin-top:10px;line-height:1.7">${tt('الرقم تحت كل لاعب = نقاطه المتوقعة', 'Number under each player = projected points')}${RES.mode === 'wc' ? tt(` لـ ${RES.gws.length} جولات`, ` over ${RES.gws.length} GWs`) : ''} · ${tt('اللاعب المميز ما موجود بفريقك', 'Highlighted = not in your team')}</p>`;
}

function breakoutHTML() {
  const L = breakouts(RES.mode, RES.st, 6); if (!L.length) return '';
  return `<div class="sec" style="margin-top:20px"><h2>${I('i-fire')}${RES.mode === 'fh' ? tt('ممكن يتألقون هالجولة', 'Could haul this GW') : tt('لاعبين ممكن يتألقون', 'Potential breakouts')}</h2></div><div class="list">${L.map(({ p, why }) => playerRow(p, `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">${why.slice(0, 2).map((w) => `<span class="tag" style="font-size:10px;white-space:nowrap">${w}</span>`).join('')}</div>`)).join('')}</div>`;
}
window.sqMode = (m) => { MODE = m; SEL = 0; window.render(); };
window.sqSel = (i) => { SEL = i; window.render(); };
window.sqGo = () => {
  if (BUSY) return; BUSY = true; window.render();
  setTimeout(() => { try { RES = generate(); SEL = 0; window.__sq = RES; } catch (e) { console.error(e); window.__sqErr = String(e.stack || e); RES = null; } BUSY = false; window.render(); }, 30);
};
