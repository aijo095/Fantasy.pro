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
import { coachReady, ensureCoach, sustain, ARCH } from '../coach.js';
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
  return {
    ready: !!C, arch: C?.arch || 'balanced',
    risk, // 0..100 — أعلى = يحب لاعبين قليلين الملكية
    favF: S.favF || null, // التشكيل اللي يلعب بيه أغلب الجولات
    prem: S.prem ?? 2, // عدد النجوم (سعر 10+) بفريقه
    H: patience >= 65 ? 6 : 5, // الصبور نخطط له مدى أطول
  };
}

/** قيمة اللاعب لهالمدرب: المتوقع على مدى الخطة × تعديلات أسلوبه */
function valueMap(mode, st, opt) {
  const G = ST.G, g0 = G.next, gws = []; const H = mode === 'fh' ? 1 : st.H;
  for (let g = g0; g < g0 + H && g <= G.lastGW; g++) gws.push(g);
  const mine = new Set(ST.plan?.squad || []), rnd = rng(opt.seed * 97 + 13);
  const riskB = (st.risk - 50) / 50; // -1 (آمن) .. +1 (جريء)
  const V = new Map(), base = baseValues(mode, gws, mine);
  for (const [id, v] of base) {
    const p = PM(id);
    let m = 1;
    // المخاطرة: الجريء ياخذ دفعة للاعب قليل الملكية، والآمن للاعب اللي الكل عنده
    if (p.own < 10) m *= 1 + 0.09 * riskB; else if (p.own > 30) m *= 1 - 0.07 * riskB;
    // الولاء: نفضّل لاعبينك عند التقارب حتى الاقتراح يبقى قريب من فريقك
    if (mine.has(p.id)) m *= mode === 'wc' ? 1.05 : 1.025;
    // هيكل النجوم حسب نوع الاقتراح
    if (opt.prem === 'stars' && p.price >= 10) m *= 1.07;
    if (opt.prem === 'spread' && p.price >= 10) m *= 0.92;
    // تجنّب لاعبين اقتراح سابق (حتى تطلع اقتراحات مختلفة)
    if (opt.avoid?.has(p.id)) m *= 1 - opt.avoidW;
    // تنويع بسيط لكل ضغطة
    m *= 1 + (rnd() - 0.5) * 0.08;
    V.set(p.id, v * m);
  }
  return { V, gws };
}

/** القيمة الأساسية (المتوقع × الاستدامة) — تنحسب مرة وحدة لأنها ثقيلة */
let BASE = { k: '', m: null };
function baseValues(mode, gws, mine) {
  const k = mode + gws.join(',') + '|' + ST.G.finished + '|' + (coachReady() ? 1 : 0);
  if (BASE.k === k) return BASE.m;
  const m = new Map();
  for (const p of ST.G.players) {
    if (p.st === 'u' || p.st === 'n') continue;
    if (p.min <= 0 && !mine.has(p.id)) continue;
    let v = gws.reduce((a, g) => a + xp(p, g), 0);
    if (mode === 'wc') v *= sustain(p).k; // نحكم على اللاعب من أرقامه الحقيقية مو جولة وحدة
    if (v > 0) m.set(p.id, v);
  }
  BASE = { k, m }; return m;
}
/** أفضل 11 + الكابتن من قيم معيّنة (مع تفضيل تشكيل المدرب إذا قريب) */
function xiOf(sq, V, favF) {
  const by = {}; POS.forEach((k) => (by[k] = sq.filter((id) => PM(id).pos === k).sort((a, b) => (V.get(b) || 0) - (V.get(a) || 0))));
  const forms = []; for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) { const f = 10 - d - m; if (f >= 1 && f <= 3) forms.push([d, m, f]); }
  let best = null;
  for (const [d, m, f] of forms) {
    if (by.DEF.length < d || by.MID.length < m || by.FWD.length < f) continue;
    const xi = [by.GK[0], ...by.DEF.slice(0, d), ...by.MID.slice(0, m), ...by.FWD.slice(0, f)];
    let s = xi.reduce((a, id) => a + (V.get(id) || 0), 0);
    if (favF && `${d}-${m}-${f}` === favF) s += 0.35; // تشكيلك المفضل إذا الفرق صغير
    if (!best || s > best.s) best = { s, xi, f: `${d}-${m}-${f}` };
  }
  const bench = [by.GK[1], ...sq.filter((id) => PM(id).pos !== 'GK' && !best.xi.includes(id)).sort((a, b) => (V.get(b) || 0) - (V.get(a) || 0))];
  const cap = [...best.xi].sort((a, b) => (V.get(b) || 0) - (V.get(a) || 0));
  return { xi: best.xi, bench, f: best.f, cap: cap[0], vc: cap[1] };
}

function objective(sq, V, mode, favF) {
  const b = xiOf(sq, V, favF), v = (id) => V.get(id) || 0;
  const benchW = mode === 'fh' ? 0.06 : 0.16;
  return b.xi.reduce((a, id) => a + v(id), 0) + v(b.cap) + benchW * b.bench.reduce((a, id) => a + v(id), 0);
}

/** يبني تشكيلة 15 لاعب: بداية رخيصة صالحة ثم تحسين بالتبديلات */
function build(V, budget, mode, favF, pool, start) {
  const T0 = performance.now(), LIMIT = pool ? 900 : 1600;
  const ids = pool ? [...pool].filter((id) => V.has(id)) : [...V.keys()];
  const cand = {}; POS.forEach((k) => {
    const L = ids.filter((id) => PM(id).pos === k);
    const top = [...L].sort((a, b) => V.get(b) - V.get(a)).slice(0, pool ? 99 : 34);
    const cheap = [...L].sort((a, b) => PM(a).price - PM(b).price || V.get(b) - V.get(a)).slice(0, pool ? 99 : 8);
    cand[k] = [...new Set([...top, ...cheap])];
  });
  const clubOk = (sq) => { const c = {}; for (const id of sq) { const t = PM(id).team; if ((c[t] = (c[t] || 0) + 1) > 3) return false; } return true; };
  const cost = (sq) => sq.reduce((a, id) => a + PM(id).price, 0);
  // بداية: الأرخص بكل مركز مع احترام حد النادي
  let sq = []; for (const k of POS) { for (const id of [...cand[k]].sort((a, b) => PM(a).price - PM(b).price)) { if (sq.filter((x) => PM(x).pos === k).length >= NEED[k]) break; if (clubOk([...sq, id])) sq.push(id); } }
  if (start && start.length === 15) sq = [...start];
  if (sq.length !== 15 || cost(sq) > budget + 1e-9) return null;
  let score = objective(sq, V, mode, favF);
  for (let it = 0; it < 90 && performance.now() - T0 < LIMIT; it++) {
    let best = null; const bank = budget - cost(sq);
    for (const o of sq) { const po = PM(o);
      for (const n of cand[po.pos]) { if (sq.includes(n)) continue; const pn = PM(n); if (pn.price - po.price > bank + 1e-9) continue;
        const s2 = sq.map((x) => (x === o ? n : x)); if (!clubOk(s2)) continue;
        const sc = objective(s2, V, mode, favF); if (sc > score + 0.01 && (!best || sc > best.sc)) best = { s2, sc }; } }
    if (!best) {
      // تبديل ثنائي: نبيع اثنين ونشتري اثنين (يفتح ميزانية لنجم)
      let b2 = null; const xi = xiOf(sq, V, favF).xi;
      const outs = sq.filter((id) => !xi.includes(id) || V.get(id) < 4).slice(0, 8);
      for (let i = 0; i < sq.length && !b2 && performance.now() - T0 < LIMIT; i++) for (let j = i + 1; j < sq.length; j++) {
        const a = sq[i], b = sq[j]; if (!outs.includes(a) && !outs.includes(b)) continue;
        for (const na of cand[PM(a).pos].slice(0, 14)) { if (sq.includes(na)) continue;
          for (const nb of cand[PM(b).pos].slice(0, 14)) { if (nb === na || sq.includes(nb)) continue;
            const s2 = sq.map((x) => (x === a ? na : x === b ? nb : x)); if (cost(s2) > budget + 1e-9 || !clubOk(s2)) continue;
            const sc = objective(s2, V, mode, favF); if (sc > score + 0.05 && (!b2 || sc > b2.sc)) b2 = { s2, sc }; } } }
      if (!b2) break; sq = b2.s2; score = b2.sc; continue;
    }
    sq = best.s2; score = best.sc;
  }
  return sq;
}

/** الإجابة النهائية: 3 اقتراحات + الأفضل منهم */
function generate() {
  const st = styleOf(), budget = budgetOf(), mode = MODE, seed = ++SEED;
  const pure = valueMap(mode, st, { seed: 0 }); // للعرض: المتوقع الحقيقي بدون تنويع
  const mk = (opt, label, why) => { const { V } = valueMap(mode, st, opt); const sq = build(V, budget, mode, st.favF); if (!sq) return null; return { sq, label, why, ...summary(sq, pure.V, st.favF, budget) }; };
  // كل ضغطة جديدة: نبدّل شوية لاعبين عن الاقتراح السابق حتى تطلع خيارات جديدة
  const prevA = PREV && PREV.mode === mode ? PREV.a : null;
  const A = mk(prevA ? { seed, avoid: prevA, avoidW: 0.07 } : { seed }, tt('الأعلى متوقع لأسلوبك', 'Top projected for you'), tt('أعلى نقاط متوقعة، مع لمسة أسلوبك', 'Highest projection with your style'));
  if (!A) return null;
  const aXI = new Set(A.xi);
  let B = null; for (const w of [0.16, 0.24, 0.34]) { B = mk({ seed: seed + 1, avoid: new Set([...aXI, ...(prevA || [])]), avoidW: w }, tt('البديلة', 'The alternative'), tt('نص التشكيلة تقريباً مختلف — خيارات ثانية بنفس القوة', 'About half different, similar strength')); if (B && B.sq.filter((id) => !A.sq.includes(id)).length >= 4) break; }
  const starsHeavy = st.prem >= 3;
  const C = mk({ seed: seed + 2, avoid: aXI, avoidW: 0.08, prem: starsHeavy ? 'spread' : 'stars' }, starsHeavy ? tt('التوزيع المتوازن', 'Balanced spread') : tt('هيكل النجوم', 'Star-heavy'),
    starsHeavy ? tt('بدل التركيز على النجوم، فلوس موزعة على لاعبين أكثر', 'Money spread across more players instead of stars') : tt('نجوم أكثر بالأمام ودكة أرخص', 'More stars up front, cheaper bench'));
  const L = [A, B, C].filter(Boolean);
  const poolU = new Set(L.flatMap((x) => x.sq));
  const start = [...L].sort((x, y) => objective(y.sq, pure.V, mode, st.favF) - objective(x.sq, pure.V, mode, st.favF))[0].sq;
  let best = build(pure.V, budget, mode, st.favF, poolU, start);
  if (best && objective(best, pure.V, mode, st.favF) < objective(start, pure.V, mode, st.favF)) best = start;
  const BEST = best ? { sq: best, label: tt('الأفضل من الثلاث', 'Best of the three'), why: tt('جمعنا أقوى اللاعبين من الاقتراحات الثلاثة بتشكيلة وحدة ضمن ميزانيتك', 'The strongest players from all three, in one squad within budget'), best: true, ...summary(best, pure.V, st.favF, budget) } : null;
  PREV = { mode, a: new Set(A.xi) };
  return { st, budget, mode, gws: pure.gws, list: BEST ? [...L, BEST] : L };
}
function summary(sq, V, favF, budget) {
  const b = xiOf(sq, V, favF), cost = r1(sq.reduce((a, id) => a + PM(id).price, 0));
  const xpT = r1(b.xi.reduce((a, id) => a + (V.get(id) || 0), 0) + (V.get(b.cap) || 0));
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
  PV.clear(); const { V } = valueMap(RES.mode, RES.st, { seed: 0 }); R.sq.forEach((id) => PV.set(id, V.get(id) || 0));
  const tabs = `<div class="sq-tabs">${RES.list.map((x, i) => `<button class="${i === SEL ? 'on' : ''}${x.best ? ' best' : ''}" onclick="sqSel(${i})"><b>${x.best ? '★' : String.fromCharCode(65 + i)}</b><span>${esc(x.label)}</span><small class="num">${x.xpT} xP</small></button>`).join('')}</div>`;
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
  setTimeout(() => { try { RES = generate(); SEL = 0; window.__sq = RES; } catch (e) { console.error(e); RES = null; } BUSY = false; window.render(); }, 30);
};
