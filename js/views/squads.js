/* =========================================================
   مقترح التشكيلات — للوايلد كارد والفري هيت
   يبني 3 تشكيلات كاملة (15 لاعب) ضمن ميزانيتك وقواعد اللعبة،
   مخصصة لأسلوب كل مدرب (المخاطرة، التشكيل المفضل، النجوم، الولاء
   للاعبيه)، وكل ضغطة تطلع مجموعة جديدة. وبعدها تشكيلة رابعة
   تجمع أفضل لاعبين من الثلاث.
========================================================= */
import { ST, PM, tShort } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, r1, fmt } from '../ui.js';
import { pShirt } from './common.js';
import { xp } from '../engine.js';
import { coachReady, ensureCoach, sustain, ARCH, coachHistory } from '../coach.js';
import { sellPrice10 } from '../solver.js';

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

/** القيمة الأساسية — تنحسب مرة وحدة لأنها ثقيلة.
   الوايلد كارد: مستوى اللاعب على المدى الطويل (نقاط/مباراة + أرقامه الحقيقية لكل 90 + ضمان الدقائق)
   ويا المتوقع على الجولات الجاية بوزن أعلى للقريبة.
   الفري هيت: الجولة الجاية بس — المباراة نفسها، الفورمة الحالية، وإمكانية الانفجار */
let BASE = { k: '', m: null };
function baseValues(mode, gws) {
  const k = mode + gws.join(',') + '|' + ST.G.finished + '|' + (coachReady() ? 1 : 0);
  if (BASE.k === k) return BASE.m;
  const m = new Map(), fin = Math.max(1, ST.G.finished), hist = coachHistory();
  const PF = { GK: 0, DEF: 6, MID: 5, FWD: 4 }, CSF = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
  for (const p of ST.G.players) {
    if (p.st === 'u' || p.st === 'n') continue;
    if (p.min <= 0 && !ST.plan?.squad.includes(p.id)) continue;
    const n90 = p.min / 90, startR = p.starts != null ? p.starts / fin : Math.min(1, p.min / (90 * fin));
    const under = n90 >= 2 ? ((p.xg || 0) * PF[p.pos] + (p.xa || 0) * 3) / n90 + 2 + CSF[p.pos] * (p.cs || 0) / Math.max(1, n90) : 0;
    const quality = (0.55 * p.ppg + 0.45 * Math.max(p.ppg * 0.7, under)) * Math.min(1, 0.35 + startR);
    let v;
    if (mode === 'wc') {
      let hz = 0, W = 0; gws.forEach((g, i) => { const w = Math.pow(0.93, i); hz += w * xp(p, g); W += w; });
      v = 0.62 * hz * sustain(p).k + 0.38 * quality * W;
    } else {
      const g = gws[0], x = xp(p, g);
      const rec = hist.hasPts ? hist.recent(p.id, 3) : null, recAvg = rec ? rec.reduce((a, y) => a + y, 0) / rec.length : p.form;
      const hot = Math.max(-1.2, Math.min(2.2, (recAvg - p.ppg) * 0.35)); // فورمة حالية فوق مستواه
      const boom = n90 >= 2 ? Math.min(1.6, ((p.xgi || 0) / n90) * 1.6) : 0; // إمكانية الانفجار
      v = x <= 0 ? 0 : x + hot * (x / 4) + boom * (x / 5);
    }
    if (v > 0) m.set(p.id, v);
  }
  BASE = { k, m }; return m;
}

/** قيمة اللاعب لهالمدرب: الأساس × بصمته (المخاطرة، ولاءه، صفقاته، وتنويع خاص بيه) */
function valueMap(mode, st, opt) {
  const G = ST.G, g0 = G.next, gws = []; const H = mode === 'fh' ? 1 : st.H;
  for (let g = g0; g < g0 + H && g <= G.lastGW; g++) gws.push(g);
  const mine = new Set(ST.plan?.squad || []), hist = coachHistory();
  const lastGW = G.finished || 0, soldRecent = new Set((ST.E.transfers || []).filter((t) => t.event >= lastGW - 2).map((t) => t.element_out));
  const boughtRecent = new Set((ST.E.transfers || []).filter((t) => t.event >= lastGW - 4).map((t) => t.element_in));
  const mgr = rng(entrySeed()), mgrNoise = new Map(), tap = rng(entrySeed() ^ (opt.seed * 2246822519));
  const riskB = (st.risk - 50) / 50; // -1 (آمن) .. +1 (جريء)
  const V = new Map(), base = baseValues(mode, gws);
  const ids = [...base.keys()].sort((a, b) => a - b); ids.forEach((id) => mgrNoise.set(id, mgr()));
  for (const id of ids) {
    const v = base.get(id), p = PM(id);
    let m = 1;
    // بصمة ثابتة لكل مدرب: نفس اللاعب ياخذ وزن مختلف عند كل مدرب
    m *= 1 + (mgrNoise.get(id) - 0.5) * (mode === 'fh' ? 0.12 : 0.14);
    // المخاطرة
    const rk = mode === 'fh' ? 0.2 : 0.15;
    if (p.own < 10) m *= 1 + rk * riskB; else if (p.own > 30) m *= 1 - rk * 0.8 * riskB;
    if (mode === 'wc') {
      if (mine.has(id)) m *= 1.10; // لاعبينك الحاليين
      else if ((hist.owned.get(id) || 0) >= 2) m *= 1.04; // لاعب امتلكته قبل وتعرفه
      if (boughtRecent.has(id) && mine.has(id)) m *= 1.03; // صفقتك الأخيرة — خطة بدأتها
      if (soldRecent.has(id)) m *= 0.9; // بعته قريب — ما نرجعه إلا إذا يستاهل فعلاً
    } else if (mine.has(id)) m *= 1.02;
    if (opt.prem === 'stars' && p.price >= 10) m *= 1.07;
    if (opt.prem === 'spread' && p.price >= 10) m *= 0.92;
    if (opt.avoid?.has(id)) m *= 1 - opt.avoidW;
    m *= 1 + (tap() - 0.5) * 0.07; // تنويع لكل ضغطة
    V.set(id, v * m);
  }
  return { V, gws };
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

/** الإجابة النهائية: 3 اقتراحات بتشكيلات مختلفة + الأفضل منهم */
function generate() {
  const T0 = performance.now();
  const st = styleOf(), budget = budgetOf(), mode = MODE, seed = ++SEED, own = ST.plan?.squad || [];
  const pure = valueMap(mode, st, { seed: 0 });
  // الرقم المعروض = النقاط المتوقعة الحقيقية (مو قيمة الترتيب الداخلية)
  const DISP = new Map(); [...pure.V.keys()].forEach((id) => DISP.set(id, pure.gws.reduce((a, g) => a + xp(PM(id), g), 0)));
  const prevA = PREV && PREV.mode === mode ? PREV.a : null;
  const mk = (opt, force, label, why) => { const { V } = valueMap(mode, st, opt); const sq = build(V, budget, mode, st.favF, { start: own, force }); if (!sq) return null; return { sq, label, why, ...summary(sq, DISP, st.favF, budget, force || xiOf(sq, V, st.favF).f) }; };
  const fh = mode === 'fh';
  const A = mk(prevA ? { seed, avoid: prevA, avoidW: 0.07 } : { seed }, null, fh ? tt('الأقوى للجولة', 'Strongest this GW') : tt('الأفضل لك', 'Best for you'),
    fh ? tt('أعلى متوقع للجولة الجاية حسب المباريات والفورمة الحالية', 'Highest projection for the next GW') : tt('مستوى اللاعبين على المدى البعيد + الجدول الجاي، على مقاس أسلوبك وفريقك', 'Long-term level + fixtures, fitted to your style and squad'));
  if (!A) return null;
  // تشكيلات مختلفة للاقتراحين الثانيين
  const order = [st.favF, '4-4-2', '3-4-3', '4-3-3', '3-5-2', '5-3-2', '4-5-1', '5-4-1'].filter(Boolean);
  const fs = []; for (const f of order) if (f !== A.f && !fs.includes(f)) fs.push(f);
  const aXI = new Set(A.xi);
  let B = null; for (const w of [0.15, 0.24, 0.34]) { B = mk({ seed: seed + 1, avoid: new Set([...aXI, ...(prevA || [])]), avoidW: w }, fs[0], tt('البديلة', 'The alternative'), tt('نص التشكيلة تقريباً مختلف وبرسم ثاني — خيارات بنفس القوة', 'About half different with another shape')); if (B && B.sq.filter((id) => !A.sq.includes(id)).length >= 4) break; }
  const starsHeavy = st.prem >= 3;
  const C = fh
    ? mk({ seed: seed + 2, avoid: aXI, avoidW: 0.1 }, fs[1], tt('المفاجآت', 'Differentials'), tt('لاعبين قليلين الملكية بمباريات حلوة — تكسب بيهم نقاط على الأغلبية', 'Low-owned players with good fixtures'))
    : mk({ seed: seed + 2, avoid: aXI, avoidW: 0.08, prem: starsHeavy ? 'spread' : 'stars' }, fs[1], starsHeavy ? tt('التوزيع المتوازن', 'Balanced spread') : tt('هيكل النجوم', 'Star-heavy'),
      starsHeavy ? tt('بدل التركيز على النجوم، فلوس موزعة على لاعبين أكثر', 'Money spread across more players') : tt('نجوم أكثر بالأمام ودكة أرخص', 'More stars, cheaper bench'));
  const L = [A, B, C].filter(Boolean);
  const poolU = new Set(L.flatMap((x) => x.sq));
  const start = [...L].sort((x, y) => objective(y.sq, pure.V, mode, st.favF) - objective(x.sq, pure.V, mode, st.favF))[0].sq;
  // التقييم المشترك: مستوى اللاعب + نقاطه المتوقعة
  const VB = new Map(); pure.V.forEach((v, id) => VB.set(id, (v + (DISP.get(id) || 0)) / 2));
  const built = build(VB, budget, mode, st.favF, { pool: poolU, start });
  let best = [built, ...L.map((x) => x.sq)].filter(Boolean).sort((a, b) => objective(b, VB, mode, st.favF) - objective(a, VB, mode, st.favF))[0];
  const BEST = { sq: best, label: tt('الأفضل من الثلاث', 'Best of the three'), why: tt('جمعنا أقوى اللاعبين من الاقتراحات الثلاثة بتشكيلة وحدة ضمن ميزانيتك، وبأفضل رسم', 'Strongest players from all three in one squad, best shape'), best: true, ...summary(best, DISP, st.favF, budget, xiOf(best, pure.V, st.favF).f) };
  const topL = [...L].sort((a, b) => b.xpT - a.xpT)[0];
  if (BEST.xpT < topL.xpT - 0.05) Object.assign(BEST, summary(topL.sq, DISP, st.favF, budget, topL.f), { sq: topL.sq });
  PREV = { mode, a: new Set(A.xi) };
  window.__sqMs = Math.round(performance.now() - T0);
  return { st, budget, mode, gws: pure.gws, list: [...L, BEST] };
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
  <div class="benchbox"><div class="t">${tt('الدكة', 'Bench')}</div><div class="prow" dir="ltr">${R.bench.map((id, i) => `<div class="slot"><small>${i === 0 ? 'GK' : i}</small>${card(id, 11 + i)}</div>`).join('')}</div></div>`;
}
const PV = new Map();
function valueFor(id) { return PV.get(id) ?? 0; }

export function vSquads() {
  const st = styleOf(); if (!st.ready) ensureCoach().then(() => { if (ST.view === 'squads') window.render(); });
  const G = ST.G, b = budgetOf();
  const chips = (ST.E.hist?.chips || []).map((c) => c.name);
  const head = `<div class="sec" style="margin-top:4px"><div><h2 style="font-size:20px">${tt('مقترح التشكيلات', 'Squad Lab')}</h2><p class="mut" style="margin:4px 0 0;font-size:12.5px">${tt('تشكيلات كاملة للوايلد كارد والفري هيت، مبنية على أسلوبك', 'Full squads for Wildcard & Free Hit, built on your style')}</p></div></div>`;
  const seg = `<div class="tabs2" style="margin-top:6px"><button class="${MODE === 'wc' ? 'on' : ''}" onclick="sqMode('wc')">${I('i-sparkle')}${tt('وايلد كارد', 'Wildcard')} <small style="opacity:.7">${tt(`${st.H} جولات`, `${st.H} GWs`)}</small></button><button class="${MODE === 'fh' ? 'on' : ''}" onclick="sqMode('fh')">${I('i-bolt')}${tt('فري هيت', 'Free Hit')} <small style="opacity:.7">GW${G.next}</small></button></div>`;
  const arch = ARCH()[st.arch] || ARCH().balanced;
  const who = `<div class="card" style="display:flex;gap:12px;align-items:center"><div class="pbig" style="background:rgba(139,124,255,.14);color:#C4B5FD;width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none">${I('i-user')}</div><div style="flex:1;min-width:0"><b style="font-size:14px">${st.ready ? arch[0] : tt('نحلل أسلوبك…', 'Analysing your style…')}</b><div class="mut" style="font-size:12px;line-height:1.6;margin-top:2px">${st.ready ? [st.favF ? tt(`تشكيلك المفضل ${st.favF}`, `Fav formation ${st.favF}`) : '', st.risk >= 60 ? tt('تحب الخيارات المختلفة', 'You like differentials') : st.risk <= 32 ? tt('تفضّل الخيارات الآمنة', 'You prefer safe picks') : tt('توازن بين الآمن والمختلف', 'Safe/differential balance')].filter(Boolean).join(' · ') : tt('الاقتراحات راح تتخصص أكثر بعد التحليل', 'Suggestions get more personal after analysis')}</div></div><div style="text-align:center"><small class="mut" style="font-size:11px">${tt('الميزانية', 'Budget')}</small><b class="num" style="display:block;font-size:17px">£${b.toFixed(1)}</b></div></div>`;
  const used = MODE === 'wc' ? chips.includes('wildcard') : chips.includes('freehit');
  const note = used ? `<div class="note" style="margin-top:8px">${tt('ملاحظة: استخدمت هالورقة بالنص الأول — الاقتراح يفيدك للنص الثاني أو للتخطيط', 'Note: chip already used this half — useful for planning')}</div>` : '';
  const btn = `<button class="btn btn-p" style="width:100%;margin-top:12px" onclick="sqGo()" ${BUSY ? 'disabled' : ''}>${I('i-sparkle')}${BUSY ? tt('نبني التشكيلات…', 'Building…') : RES ? tt('اقترح 3 تشكيلات جديدة', 'Suggest 3 new squads') : tt('اقترح 3 تشكيلات', 'Suggest 3 squads')}</button>`;
  if (!RES || RES.mode !== MODE) return head + seg + who + note + btn + `<div class="card mut" style="margin-top:12px;font-size:13px;line-height:1.8;text-align:center">${tt('كل ضغطة تطلع 3 تشكيلات مختلفة (مو شرط كلها تتغير)، ورابعة تجمع أفضل لاعبين منهن', 'Each tap gives 3 different squads plus a 4th combining the best of them')}</div>`;
  const R = RES.list[SEL] || RES.list[0];
  PV.clear(); R.sq.forEach((id) => PV.set(id, RES.gws.reduce((a, g) => a + xp(PM(id), g), 0)));
  const tabs = `<div class="sq-tabs">${RES.list.map((x, i) => `<button class="${i === SEL ? 'on' : ''}${x.best ? ' best' : ''}" onclick="sqSel(${i})"><b>${x.best ? '★' : String.fromCharCode(65 + i)}</b><span>${esc(x.label)}</span><small class="num">${x.f} · ${x.xpT}</small></button>`).join('')}</div>`;
  const prev = SEL > 0 && !R.best ? RES.list[0] : null;
  const diffA = prev ? R.sq.filter((id) => !prev.sq.includes(id)).length : null;
  const stats = `<div class="sq-stats"><div><small>${tt('المتوقع', 'Projected')}</small><b class="num">${R.xpT}</b><em>${RES.mode === 'fh' ? 'GW' + G.next : tt(`${RES.gws.length} جولات`, `${RES.gws.length} GWs`)}</em></div><div><small>${tt('التشكيل', 'Formation')}</small><b class="num">${R.f}</b></div><div><small>${tt('الكلفة', 'Cost')}</small><b class="num">£${R.cost.toFixed(1)}</b><em>${tt('يبقى', 'Bank')} <bdi dir="ltr">£${R.bank.toFixed(1)}</bdi></em></div><div><small>${tt('من فريقك', 'Kept')}</small><b class="num">${R.keep}/15</b>${diffA != null ? `<em>${tt(`${diffA} مختلفين عن A`, `${diffA} differ from A`)}</em>` : ''}</div></div>`;
  return head + seg + who + note + btn + tabs + `<div class="card" style="margin-top:10px"><b style="font-size:14.5px">${esc(R.label)}</b><div class="mut" style="font-size:12.5px;margin-top:3px;line-height:1.6">${esc(R.why)}</div>${stats}</div>` + pitch(R) +
    `<p class="mut" style="font-size:11.5px;text-align:center;margin-top:10px;line-height:1.7">${tt('الرقم تحت كل لاعب = نقاطه المتوقعة', 'Number under each player = projected points')}${RES.mode === 'wc' ? tt(` لـ ${RES.gws.length} جولات`, ` over ${RES.gws.length} GWs`) : ''} · ${tt('اللاعب المميز ما موجود بفريقك', 'Highlighted = not in your team')}</p>`;
}

window.sqMode = (m) => { MODE = m; SEL = 0; window.render(); };
window.sqSel = (i) => { SEL = i; window.render(); };
window.sqGo = () => {
  if (BUSY) return; BUSY = true; window.render();
  setTimeout(() => { try { RES = generate(); SEL = 0; window.__sq = RES; } catch (e) { console.error(e); window.__sqErr = String(e.stack || e); RES = null; } BUSY = false; window.render(); }, 30);
};
