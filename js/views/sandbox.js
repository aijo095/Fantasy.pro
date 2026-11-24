/* =========================================================
   ملعب التجارب: تختار أي تشكيلة (15 لاعب بالأساسي والدكة)
   والتطبيق يحللها: المتوقع للجولة الجاية ولعدة جولات، الفرق عن فريقك،
   البنك بأسعار البيع الحقيقية، الانتقالات والخصم، تحذيرات، واقتراحات ترقية.
   وإذا عجبتك تعتمدها كخطتك للجولة الجاية بصفحة فريقي.
========================================================= */
import { ST, PM, tShort, tName, savePlan } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, r1, toast, openSheet, closeSheet, sheetHead } from '../ui.js';
import { pShirt } from './common.js';
import { xp, avail, bestXI, validXI, counts, fixturesFor } from '../engine.js';
import { sellPrice10 } from '../solver.js';
import { basePlan } from '../app.js';

const LINES = `<svg class="lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width=".45"><rect x="4" y="3" width="92" height="134" rx="1.5"/><line x1="4" y1="70" x2="96" y2="70"/><ellipse cx="50" cy="70" rx="12" ry="8.6"/><rect x="26" y="3" width="48" height="18"/><rect x="38" y="3" width="24" height="7"/><path d="M41 21 Q50 27 59 21"/><rect x="26" y="119" width="48" height="18"/><rect x="38" y="130" width="24" height="7"/><path d="M41 119 Q50 113 59 119"/></g><circle cx="50" cy="70" r=".9" fill="#fff"/></svg>`;
const LIMIT = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
let SB = null, H = 1, LBL = 'xp', Q = '', SORT = 'xp';
const key = () => `fp_sb_${ST.profile?.teamId || 0}_${ST.G.next}`;
const save = () => { try { localStorage.setItem(key(), JSON.stringify(SB)); } catch {} };
const gws = () => { const g0 = ST.G.next, out = []; for (let g = g0; g < g0 + H && g <= ST.G.lastGW; g++) out.push(g); return out; };
const xpH = (id, list = gws()) => list.reduce((a, g) => a + xp(PM(id), g), 0);
const price10 = (id) => Math.round(PM(id).price * 10);
const fmtM = (v10) => (v10 / 10).toFixed(1);

function fresh() {
  const P = basePlan(); if (!P) return null;
  return { base: { squad: [...P.squad], xi: [...P.xi], bench: [...P.bench], cap: P.cap, vc: P.vc, bank10: Math.round(P.bank * 10), ft: P.ft }, squad: [...P.squad], xi: [...P.xi], bench: [...P.bench], cap: P.cap, vc: P.vc, chip: '' };
}
function ensure() {
  if (SB && SB.gw === ST.G.next) return SB;
  let s = null; try { s = JSON.parse(localStorage.getItem(key()) || 'null'); } catch {}
  SB = s && s.squad?.length === 15 && s.squad.every((id) => PM(id)) ? s : fresh();
  if (SB) SB.gw = ST.G.next;
  return SB;
}

/* ---------- الحسابات ---------- */
function money(S = SB) {
  const base = new Set(S.base.squad), now = new Set(S.squad);
  const outs = S.base.squad.filter((id) => !now.has(id)), ins = S.squad.filter((id) => !base.has(id));
  const bank10 = S.base.bank10 + outs.reduce((a, id) => a + sellPrice10(id), 0) - ins.reduce((a, id) => a + price10(id), 0);
  const free = S.chip === 'wc' || S.chip === 'fh';
  const tr = ins.length, hit = free ? 0 : Math.max(0, tr - (S.base.ft || 0)) * 4;
  const value10 = S.squad.reduce((a, id) => a + (base.has(id) ? sellPrice10(id) : price10(id)), 0);
  return { outs, ins, bank10, tr, hit, value10, free };
}
function projGW(xi, cap, g, bench = [], bb = false) {
  let s = 0; xi.forEach((id) => { let v = xp(PM(id), g); if (id === cap) v *= 2; s += v; });
  if (bb) bench.forEach((id) => (s += xp(PM(id), g)));
  return s;
}
const clubCount = (sq) => sq.reduce((m, id) => ((m[PM(id).team] = (m[PM(id).team] || 0) + 1), m), {});
// نقرن كل لاعب طلع بلاعب دخل بنفس المركز (للعرض والخطة)
function pairs(m) {
  const ins = [...m.ins], out = [];
  m.outs.forEach((o) => { const i = ins.findIndex((x) => PM(x).pos === PM(o).pos); if (i >= 0) out.push({ out: o, in: ins.splice(i, 1)[0] }); });
  return out;
}

/* ---------- الواجهة ---------- */
function label(p) {
  if (LBL === 'price') return `<div class="lb">${p.price.toFixed(1)}</div>`;
  if (LBL === 'next') { const f = fixturesFor(p.team, ST.G.next); return `<div class="lb sb-fx">${f.length ? f.map((x) => `<i class="f${x.fdr}">${esc(tShort(x.opp))}${x.home ? '' : ''}</i>`).join('') : '—'}</div>`; }
  const v = r1(xpH(p.id)); return `<div class="lb" style="background:${v >= 6 * H ? '#34D399' : v >= 4 * H ? '#A7F3D0' : '#F1F5F9'}">${v}</div>`;
}
function card(id, i, inXI) {
  const p = PM(id), base = SB.base.squad.includes(id), a = avail(p), sel = SB.sel === id;
  let cls = 'pl'; if (!base) cls += ' new'; if (sel) cls += ' sel'; if (SB.cap === id) cls += ' capt';
  if (SB.swap && SB.swap !== id) cls += canSwap(SB.swap, id) ? ' can' : ' dim';
  const badge = a < 1 || p.st === 's' ? `<span class="rk inj ${a === 0 || p.st === 's' ? 'r2' : 'r1'}">${a > 0 && a < 1 ? Math.round(a * 100) : '!'}</span>` : '';
  return `<div class="${cls}" data-pid="${id}" style="--d:${i * 30}ms" onclick="sbTap(${id})" role="button" tabindex="0" aria-label="${esc(p.name)}">${SB.cap === id ? '<span class="cb">C</span>' : SB.vc === id ? '<span class="cb v">V</span>' : ''}${badge}<div class="sh">${pShirt(p)}</div><div class="nm">${esc(p.name)}</div>${label(p)}</div>`;
}
function canSwap(a, b) {
  const inA = SB.xi.includes(a), inB = SB.xi.includes(b);
  if (inA === inB) return false;
  const x = inA ? a : b, y = inA ? b : a;
  return validXI(SB.xi.map((id) => (id === x ? y : id)));
}

export function vSandbox() {
  if (!ST.G?.next) return `<div class="empty">${tt('الموسم خلص', 'Season over')}</div>`;
  if (!ensure()) return `<div class="empty">${tt('اربط فريقك أول حتى نبدي', 'Link your team first')}</div>`;
  const m = money(), list = gws(), g0 = ST.G.next;
  const rows = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => SB.xi.filter((id) => PM(id).pos === pos));
  const f = (() => { const c = counts(SB.xi); return `${c.DEF}-${c.MID}-${c.FWD}`; })();
  let k = 0;
  // المقارنة بفريقك الحالي
  const mine = list.map((g) => projGW(SB.xi, SB.cap, g, SB.bench, false)), theirs = list.map((g) => projGW(SB.base.xi, SB.base.cap, g));
  const sumM = mine.reduce((a, b) => a + b, 0) - m.hit, sumT = theirs.reduce((a, b) => a + b, 0), diff = sumM - sumT;
  const over = m.bank10 < 0, clubs = clubCount(SB.squad), clubBad = Object.entries(clubs).filter(([, n]) => n > 3);
  const changed = m.tr || SB.xi.join() !== SB.base.xi.join() || SB.cap !== SB.base.cap;
  return `<div class="page-h"><h1>${tt('ملعب التجارب', 'Squad sandbox')}</h1><p>${tt('جرّب أي تشكيلة: اختار لاعبينك والتطبيق يحللها بالأسعار والبنك الحقيقي', 'Build any squad and get it analysed with real prices and bank')}</p></div>
  <section class="sb-kpi">
    <div class="sb-k main"><small>${tt(H === 1 ? `متوقع الجولة ${g0}` : `متوقع ${H} جولات`, H === 1 ? `GW${g0} projection` : `${H} GW projection`)}</small><b class="num">${r1(sumM)}</b><span class="sb-d ${diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : ''}">${changed ? `${diff > 0 ? '+' : ''}${r1(diff)} ${tt('عن فريقك الحالي', 'vs your team')}` : tt('هذا فريقك الحالي', 'Your current team')}</span></div>
    <div class="sb-k ${over ? 'bad' : ''}"><small>${tt('البنك', 'Bank')}</small><b class="num">${fmtM(m.bank10)}</b><span>${over ? tt('الميزانية ما تكفي', 'Over budget') : tt('بأسعار البيع الحقيقية', 'real sell prices')}</span></div>
    <div class="sb-k"><small>${tt('الانتقالات', 'Transfers')}</small><b class="num">${m.tr}</b><span>${m.free ? tt('بدون خصم (ورقة)', 'free (chip)') : m.hit ? tt(`خصم −${m.hit}`, `hit −${m.hit}`) : tt(`مجانية من ${SB.base.ft}`, `${SB.base.ft} free`)}</span></div>
    <div class="sb-k"><small>${tt('قيمة الفريق', 'Squad value')}</small><b class="num">${fmtM(m.value10 + Math.max(0, m.bank10))}</b><span>${tt(`التشكيل ${f}`, `Formation ${f}`)}</span></div>
  </section>
  <div class="sb-bar">
    <div class="seg sb-h" role="tablist">${[[1, tt('الجولة الجاية', 'Next GW')], [3, tt('3 جولات', '3 GWs')], [5, tt('5 جولات', '5 GWs')]].map(([n, l]) => `<button role="tab" aria-selected="${H === n}" class="${H === n ? 'on' : ''}" onclick="sbH(${n})">${l}</button>`).join('')}</div>
    <div class="seg sb-l">${[['xp', tt('المتوقع', 'xP')], ['price', tt('السعر', 'Price')], ['next', tt('الخصم', 'Opp')]].map(([v, l]) => `<button class="${LBL === v ? 'on' : ''}" onclick="sbL('${v}')">${l}</button>`).join('')}</div>
  </div>
  ${SB.swap ? `<div class="banner"><span>${I('i-swap', 'i')} ${tt('اختار اللاعب اللي يتبادل وية', 'Pick who to swap with')} <b>${esc(PM(SB.swap).name)}</b></span><button class="btn btn-g btn-sm" onclick="sbCancel()">${tt('إلغاء', 'Cancel')}</button></div>` : ''}
  <div class="pitch">${LINES}${rows.map((r) => `<div class="prow">${r.map((id) => card(id, k++, true)).join('')}</div>`).join('')}</div>
  <div class="benchbox"><div class="t"><span>${I('i-bench', 'i')} ${tt('الدكة', 'Bench')} <span class="mut" style="font-size:12px">· ${r1(SB.bench.reduce((a, id) => a + xpH(id), 0))} ${tt('متوقع', 'xP')}</span></span></div>
    <div class="prow" dir="ltr">${SB.bench.map((id, i) => `<div class="slot"><small>${i === 0 ? tt('حارس', 'GK') : i}</small>${card(id, 11 + i, false)}</div>`).join('')}</div></div>
  <div class="sb-tools">
    <button class="btn btn-g btn-sm" onclick="sbBest()">${I('i-sparkle', 'i')}${tt('أفضل تشكيلة وكابتن', 'Best XI & captain')}</button>
    <button class="btn btn-g btn-sm" onclick="sbReset()">${I('i-reset', 'i')}${tt('رجّع فريقي', 'Reset to my team')}</button>
    <div class="seg sb-chip">${[['', tt('بدون ورقة', 'No chip')], ['wc', tt('وايلد كارد', 'Wildcard')], ['fh', tt('فري هت', 'Free Hit')]].map(([c, l]) => `<button class="${SB.chip === c ? 'on' : ''}" onclick="sbChip('${c}')">${l}</button>`).join('')}</div>
  </div>
  ${analysisHTML(m, list, mine, theirs, clubBad, over)}
  <div class="sb-apply">
    <button class="btn btn-p btn-b" ${over || clubBad.length || !changed ? 'disabled' : ''} onclick="sbApply()">${I('i-check', 'i')}${tt('اعتمدها خطتي للجولة الجاية', 'Use as my plan for next GW')}</button>
    <p class="mut">${over ? tt('الميزانية ما تكفي، بدّل لاعب أرخص أول.', 'Over budget — swap in someone cheaper first.') : clubBad.length ? tt('أكثر من 3 لاعبين من نفس النادي.', 'More than 3 from one club.') : tt('تنحفظ بصفحة فريقي كخطة، وتنفّذ الانتقالات بنفسك بتطبيق الفانتازي.', 'Saved as your plan in My Team; make the transfers in the FPL app.')}</p>
  </div>`;
}

function analysisHTML(m, list, mine, theirs, clubBad, over) {
  const W = [], S = [];
  const g0 = ST.G.next;
  // تحذيرات
  SB.xi.forEach((id) => { const p = PM(id), a = avail(p); if (a < 0.75) W.push({ t: 'b', h: tt(`${p.name} ${a === 0 ? 'غايب' : `جاهزيته ${Math.round(a * 100)}%`}`, `${p.name} ${a === 0 ? 'out' : `${Math.round(a * 100)}% fit`}`), d: p.news || tt('حطه بالدكة أو بدّله', 'Bench or replace him') }); });
  const blanks = SB.xi.filter((id) => !fixturesFor(PM(id).team, g0).length); if (blanks.length) W.push({ t: 'b', h: tt(`${blanks.length} من أساسيينك ما يلعبون الجولة ${g0}`, `${blanks.length} starters blank`), d: blanks.map((id) => PM(id).name).join('، ') });
  if (over) W.push({ t: 'b', h: tt(`الميزانية ناقصة ${fmtM(-m.bank10)}`, `Short by ${fmtM(-m.bank10)}`), d: tt('اختار لاعب أرخص بأي مركز.', 'Choose a cheaper player somewhere.') });
  clubBad.forEach(([t, n]) => W.push({ t: 'b', h: tt(`${n} لاعبين من ${tName(+t)}`, `${n} from ${tName(+t)}`), d: tt('الفانتازي يسمح بـ 3 بس من نفس النادي.', 'Max 3 per club.') }));
  const bx = bestXI(SB.squad, g0), bestP = projGW(bx.xi, bx.cap, g0), curP = projGW(SB.xi, SB.cap, g0);
  if (bestP - curP >= 0.5) S.push({ h: tt(`+${r1(bestP - curP)} نقطة بترتيب أحسن`, `+${r1(bestP - curP)} with a better XI`), d: tt(`الكابتن الأنسب: ${PM(bx.cap).name}`, `Best captain: ${PM(bx.cap).name}`), act: 'sbBest()', btn: tt('رتّبها', 'Apply') });
  const gk2 = SB.bench[0]; if (gk2 && PM(gk2).price >= 4.6 && !m.free) S.push({ h: tt(`حارس الدكة غالي (${PM(gk2).price.toFixed(1)})`, 'Pricey backup keeper'), d: tt('حارس 4.0 يفتح لك فلوس لمركز ثاني.', 'A 4.0 keeper frees funds.') });
  if (m.bank10 >= 15) S.push({ h: tt(`عندك ${fmtM(m.bank10)} بالبنك ما مستعملة`, `${fmtM(m.bank10)} unused in the bank`), d: tt('شوف اقتراحات الترقية تحت.', 'See upgrades below.') });
  // اقتراحات ترقية ضمن الميزانية وحد الأندية
  const ups = upgrades(m).slice(0, 3);
  // الانتقالات
  const P = pairs(m);
  const trHTML = P.length ? `<div class="sb-sec"><h3>${I('i-swap', 'i')}${tt('انتقالاتك', 'Your transfers')}</h3>${P.map((x) => { const gn = xpH(x.in) - xpH(x.out); const d10 = price10(x.in) - sellPrice10(x.out); return `<div class="sb-tr"><span class="o"><s>${esc(PM(x.out).name)}</s><small>${tt('بيع', 'Sell')} ${fmtM(sellPrice10(x.out))}</small></span>${I('i-arrow', 'i')}<span class="n"><b>${esc(PM(x.in).name)}</b><small>${tt('شراء', 'Buy')} ${fmtM(price10(x.in))}</small></span><span class="g ${gn >= 0 ? 'up' : 'down'}" dir="ltr">${gn >= 0 ? '+' : ''}${r1(gn)}<small>${d10 > 0 ? `−${fmtM(d10)}` : `+${fmtM(-d10)}`}</small></span></div>`; }).join('')}
    ${m.hit ? `<p class="sb-note ${P.reduce((a, x) => a + xpH(x.in) - xpH(x.out), 0) > m.hit ? 'up' : 'down'}">${P.reduce((a, x) => a + xpH(x.in) - xpH(x.out), 0) > m.hit ? tt(`الخصم −${m.hit} يستاهل على مدى ${H === 1 ? 'الجولة' : `${H} جولات`}`, `The −${m.hit} hit pays off`) : tt(`الخصم −${m.hit} أكبر من الربح المتوقع${H === 1 ? '، جرّب تشوف 3 أو 5 جولات' : ''}`, `The −${m.hit} hit isn't covered`)}</p>` : ''}</div>` : '';
  // مقارنة الجولات
  const mx = Math.max(1, ...mine, ...theirs);
  const chart = list.length > 1 ? `<div class="sb-sec"><h3>${I('i-chart', 'i')}${tt('جولة بجولة', 'By gameweek')}</h3><div class="sb-gw">${list.map((g, i) => `<div class="c"><div class="bars"><i class="t" style="--h:${(theirs[i] / mx).toFixed(3)}"></i><i class="m" style="--h:${(mine[i] / mx).toFixed(3)}"></i></div><b class="num">${r1(mine[i])}</b><small>${tt(`ج${g}`, `GW${g}`)}</small></div>`).join('')}</div><div class="sb-lg"><span><i class="m"></i>${tt('التجربة', 'Sandbox')}</span><span><i class="t"></i>${tt('فريقك الحالي', 'Current team')}</span></div></div>` : '';
  return `${W.length ? `<div class="sb-sec"><h3>${I('i-alert', 'i')}${tt('انتبه', 'Watch out')}</h3>${W.map((x) => `<div class="sb-w b"><b>${esc(x.h)}</b><span>${esc(x.d)}</span></div>`).join('')}</div>` : ''}
  ${trHTML}${chart}
  ${S.length || ups.length ? `<div class="sb-sec"><h3>${I('i-sparkle', 'i')}${tt('اقتراحات', 'Suggestions')}</h3>${S.map((x) => `<div class="sb-w"><b>${esc(x.h)}</b><span>${esc(x.d)}</span>${x.act ? `<button class="btn btn-g btn-sm" onclick="${x.act}">${x.btn}</button>` : ''}</div>`).join('')}
    ${ups.map((u) => `<div class="sb-w g"><b>${tt(`بدّل ${PM(u.out).name} بـ ${PM(u.in).name}`, `${PM(u.out).name} → ${PM(u.in).name}`)}</b><span>${tt(`+${r1(u.gain)} متوقع ${H === 1 ? 'بالجولة' : `بـ ${H} جولات`}، ويبقى بالبنك ${fmtM(u.bank)}`, `+${r1(u.gain)} xP, bank after ${fmtM(u.bank)}`)}</span><button class="btn btn-g btn-sm" onclick="sbDo(${u.out},${u.in})">${tt('جرّبها', 'Try it')}</button></div>`).join('')}</div>` : ''}`;
}
function upgrades(m) {
  const own = new Set(SB.squad), clubs = clubCount(SB.squad), list = gws(), out = [];
  const cand = ST.G.players.filter((p) => !own.has(p.id) && p.min > 0 && avail(p) >= 0.75).map((p) => ({ p, v: xpH(p.id, list) })).sort((a, b) => b.v - a.v).slice(0, 160);
  SB.squad.forEach((id) => {
    const o = PM(id), sell = SB.base.squad.includes(id) ? sellPrice10(id) : price10(id), ov = xpH(id, list);
    const best = cand.find(({ p, v }) => p.pos === o.pos && v - ov >= 0.8 && m.bank10 + sell - price10(p.id) >= 0 && ((clubs[p.team] || 0) - (o.team === p.team ? 1 : 0)) < 3);
    if (best) out.push({ out: id, in: best.p.id, gain: best.v - ov, bank: m.bank10 + sell - price10(best.p.id), xi: SB.xi.includes(id) });
  });
  return out.sort((a, b) => (b.xi - a.xi) || (b.gain - a.gain));
}

/* ---------- الأوامر ---------- */
function tap(id) {
  if (SB.swap) { if (SB.swap === id) SB.swap = null; else if (canSwap(SB.swap, id)) { doSwap(SB.swap, id); SB.swap = null; } else toast(tt('ما يصير، التشكيلة تصير غلط', 'Invalid formation')); save(); return window.render(); }
  const p = PM(id), inXI = SB.xi.includes(id);
  openSheet(`${sheetHead(`<div style="width:46px;height:46px">${pShirt(p)}</div>`, esc(p.name), `${tName(p.team)} · ${p.price.toFixed(1)} · ${tt('متوقع', 'xP')} ${r1(xpH(id))}`, 'var(--glass2)', '')}
    <div class="sb-acts">
      <button class="btn btn-p btn-b" onclick="sbPick(${id})">${I('i-swap', 'i')}${tt('بدّله بلاعب ثاني', 'Replace him')}</button>
      <button class="btn btn-g btn-b" onclick="sbSwapStart(${id})">${I('i-bench', 'i')}${inXI ? tt('نزّله للدكة', 'Move to bench') : tt('صعّده للأساسي', 'Move to XI')}</button>
      ${inXI ? `<div class="sb-two"><button class="btn btn-g" onclick="sbCap(${id},'c')" ${SB.cap === id ? 'disabled' : ''}>${I('i-crown', 'i')}${tt('كابتن', 'Captain')}</button><button class="btn btn-g" onclick="sbCap(${id},'v')" ${SB.vc === id ? 'disabled' : ''}>${tt('نائب', 'Vice')}</button></div>` : ''}
      <button class="btn btn-g btn-b" onclick="closeSheet();openPlayer(${id})">${I('i-info', 'i')}${tt('تفاصيل اللاعب', 'Player details')}</button>
    </div>`);
}
function doSwap(a, b) {
  const inA = SB.xi.includes(a), x = inA ? a : b, y = inA ? b : a;
  SB.xi = SB.xi.map((id) => (id === x ? y : id)); SB.bench = SB.bench.map((id) => (id === y ? x : id));
  if (SB.cap === x) SB.cap = y; if (SB.vc === x) SB.vc = y;
}
function pickList(outId) {
  const o = PM(outId), m = money(), own = new Set(SB.squad), clubs = clubCount(SB.squad), list = gws();
  const sell = SB.base.squad.includes(outId) ? sellPrice10(outId) : price10(outId), budget = m.bank10 + sell;
  const q = Q.trim().toLowerCase();
  let ps = ST.G.players.filter((p) => p.pos === o.pos && !own.has(p.id) && (!q || (p.name + ' ' + (p.full || '') + ' ' + tName(p.team)).toLowerCase().includes(q)));
  const v = (p) => (SORT === 'price' ? -p.price : SORT === 'form' ? p.form || 0 : xpH(p.id, list));
  ps = ps.map((p) => ({ p, x: xpH(p.id, list) })).sort((a, b) => v(b.p) - v(a.p)).slice(0, 60);
  return `<div class="sb-pick">${ps.map(({ p, x }) => { const ok = price10(p.id) <= budget, club = ((clubs[p.team] || 0) - (o.team === p.team ? 1 : 0)) < 3, a = avail(p); const dis = !ok || !club;
    return `<button class="sb-pr${dis ? ' dis' : ''}" ${dis ? 'disabled' : ''} onclick="sbDo(${outId},${p.id})"><span class="mini">${pShirt(p)}</span><span class="i"><b>${esc(p.name)}${a < 1 ? ` <em class="inj">${a === 0 ? '!' : Math.round(a * 100) + '%'}</em>` : ''}</b><small>${esc(tName(p.team))} · ${!club ? tt('3 من ناديه', '3 from club') : !ok ? tt(`ينقصك ${fmtM(price10(p.id) - budget)}`, `short ${fmtM(price10(p.id) - budget)}`) : tt(`يبقى ${fmtM(budget - price10(p.id))}`, `leaves ${fmtM(budget - price10(p.id))}`)}</small></span><span class="v"><b class="num">${r1(x)}</b><small class="num">${p.price.toFixed(1)}</small></span></button>`; }).join('') || `<p class="mut" style="text-align:center">${tt('ماكو نتائج', 'No results')}</p>`}</div>`;
}
function pick(outId) {
  Q = ''; const o = PM(outId);
  const draw = () => `${sheetHead(I('i-swap'), tt(`بدل ${esc(o.name)}`, `Replace ${esc(o.name)}`), tt(`البيع ${fmtM(SB.base.squad.includes(outId) ? sellPrice10(outId) : price10(outId))} + البنك ${fmtM(money().bank10)}`, 'Sell price + bank'))}
    <input class="inp sb-q" placeholder="${tt('دوّر باسم اللاعب أو النادي', 'Search player or club')}" oninput="sbQ(this.value,${outId})" value="${esc(Q)}">
    <div class="seg sb-sort">${[['xp', tt('الأعلى متوقع', 'Top xP')], ['form', tt('الفورمة', 'Form')], ['price', tt('الأرخص', 'Cheapest')]].map(([s, l]) => `<button class="${SORT === s ? 'on' : ''}" onclick="sbSort('${s}',${outId})">${l}</button>`).join('')}</div>
    <div id="sbPickL">${pickList(outId)}</div>`;
  openSheet(draw());
  window.__sbDraw = () => { const el = document.getElementById('sbPickL'); if (el) el.innerHTML = pickList(outId); document.querySelectorAll('.sb-sort button').forEach((b, i) => b.classList.toggle('on', ['xp', 'form', 'price'][i] === SORT)); };
}
function doIt(outId, inId) {
  const rep = (a) => a.map((x) => (x === outId ? inId : x));
  SB.squad = rep(SB.squad); SB.xi = rep(SB.xi); SB.bench = rep(SB.bench);
  if (SB.cap === outId) SB.cap = inId; if (SB.vc === outId) SB.vc = inId;
  save(); closeSheet(); toast(`✓ ${PM(outId).name} → ${PM(inId).name}`); window.render();
}
function apply() {
  const m = money(); if (m.bank10 < 0) return toast(tt('الميزانية ما تكفي', 'Over budget'));
  const P = basePlan(); if (!P) return;
  let ft = P.ft; const free = m.free;
  P.transfers = pairs(m).map((x) => { let cost = 0; if (!free) { if (ft > 0) ft--; else cost = 4; } return { out: x.out, in: x.in, cost }; });
  Object.assign(P, { squad: [...SB.squad], xi: [...SB.xi], bench: [...SB.bench], cap: SB.cap, vc: SB.vc, bank: m.bank10 / 10, ft, chip: SB.chip === 'wc' ? 'wildcard' : SB.chip === 'fh' ? 'freehit' : '' });
  ST.plan = P; savePlan();
  toast(tt('✓ صارت خطتك للجولة الجاية بصفحة فريقي', '✓ Saved as your plan in My Team'));
}

Object.assign(window, {
  sbTap: tap, sbPick: (id) => pick(id), sbDo: doIt, sbApply: apply,
  sbQ: (v) => { Q = v; window.__sbDraw?.(); }, sbSort: (s) => { SORT = s; window.__sbDraw?.(); },
  sbSwapStart: (id) => { SB.swap = id; closeSheet(); window.render(); }, sbCancel: () => { SB.swap = null; window.render(); },
  sbCap: (id, k) => { if (k === 'c') { if (SB.vc === id) SB.vc = SB.cap; SB.cap = id; } else { if (SB.cap === id) SB.cap = SB.vc; SB.vc = id; } save(); closeSheet(); window.render(); },
  sbBest: () => { const b = bestXI(SB.squad, ST.G.next); Object.assign(SB, { xi: b.xi, bench: b.bench, cap: b.cap, vc: b.vc }); save(); window.render(); },
  sbReset: () => { SB = fresh(); SB.gw = ST.G.next; save(); window.render(); },
  sbChip: (c) => { SB.chip = c; save(); window.render(); }, sbH: (n) => { H = n; window.render(); }, sbL: (v) => { LBL = v; window.render(); },
});
