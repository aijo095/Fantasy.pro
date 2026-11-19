/* قاعدة بيانات اللاعبين + سوق الانتقالات + المقارنة */
import { ST, PM, tName, tShort } from '../store.js';
import { t, tt } from '../i18n.js';
import { esc, I, fmt, r1, LS, posTag, toast, spark, barChart, openSheet, closeSheet, crest } from '../ui.js';
import { xp, xpN, avgFdr, avail, canBuy, suggestions } from '../engine.js';
import { parseQuery } from '../ai.js';
import * as LR from '../learn.js';
import { playerRow, pShirt, fdrChips, playerSummary, stTag } from './common.js';

const F = { q: '', pos: 'ALL', team: 'ALL', max: 16, sort: 'total', quick: 'all', page: 1 };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SORTS = () => [['total', tt('مجموع النقاط', 'Total points')], ['form', t('form')], ['ppg', tt('نقطة/مباراة', 'PPG')], ['xp', tt('المتوقع 3ج', 'xP 3GW')], ['price', t('price')], ['own', t('own')], ['xgi', 'xG+xA'], ['value', tt('نقطة/مليون', 'Pts/£m')], ['min', t('minutes')], ['fix', tt('أسهل جدول', 'Easiest fixtures')], ['trend', tt('الأكثر شراءً', 'Most bought')], ['cc', tt('تغيّر السعر', 'Price change')]];
const QUICK = () => [['all', t('all')], ['rising', tt('صاعدين بالمستوى', 'In form')], ['diff', tt('أقل امتلاكاً', 'Differentials')], ['fix', tt('أفضل جدول', 'Best fixtures')], ['price', tt('تغيّر الأسعار', 'Price changes')], ['watch', '⭐ ' + t('watchlist')]];
const sortFn = { total: (p) => p.total, form: (p) => p.form, ppg: (p) => p.ppg, xp: (p) => xpN(p, ST.G.next, 3), price: (p) => p.price, own: (p) => p.own, xgi: (p) => p.xgi, value: (p) => p.total / p.price, min: (p) => p.min, fix: (p) => -avgFdr(p.team, ST.G.next, 5), trend: (p) => p.tin - p.tout, cc: (p) => Math.abs(p.cc) * 100 + p.cc };
function filtered() {
  const q = /[\u0600-\u06FF]/.test(F.q) ? '' : norm(F.q); const PQ = /[\u0600-\u06FF]/.test(F.q) ? parseQuery(F.q) : null; const arIds = PQ ? new Set((PQ.players || []).map((p) => p.id)) : null;
  let L = ST.G.players.filter((p) => (F.pos === 'ALL' || p.pos === F.pos) && (F.team === 'ALL' || p.team === +F.team) && p.price <= F.max && (!arIds || arIds.has(p.id) || (PQ.club?.id === p.team)) && (!q || norm(p.name + ' ' + p.full + ' ' + tName(p.team) + ' ' + tShort(p.team)).includes(q)));
  if (F.quick === 'rising') L = L.filter((p) => p.form >= Math.max(4, p.ppg * 1.25) && p.min > 90);
  if (F.quick === 'diff') L = L.filter((p) => p.own < 5 && p.form >= 3.5);
  if (F.quick === 'fix') L = L.filter((p) => avgFdr(p.team, ST.G.next, 5) <= 2.8 && avail(p) > 0.5);
  if (F.quick === 'price') L = L.filter((p) => p.cc !== 0);
  if (F.quick === 'watch') L = L.filter((p) => ST.watch.has(p.id));
  const key = F.quick === 'fix' && F.sort === 'total' ? 'fix' : F.quick === 'price' && F.sort === 'total' ? 'cc' : F.sort;
  return L.sort((a, b) => sortFn[key](b) - sortFn[key](a));
}
export function vPlayers() {
  if (window.__clubFilter) { F.team = String(window.__clubFilter); F.quick = 'all'; F.q = ''; window.__clubFilter = null; }
  const L = filtered(), shown = L.slice(0, F.page * 40), teams = Object.values(ST.G.teams).sort((a, b) => tName(a.id).localeCompare(tName(b.id), 'ar'));
  return `<div class="searchbox"><span class="sicon">${I('i-search')}</span><input id="pq" type="search" placeholder="${tt('ابحث عن لاعب أو نادي…', 'Search player or club…')}" value="${esc(F.q)}" autocomplete="off"></div>
   <div class="seg" style="margin:10px 0 6px">${QUICK().map((x) => `<button class="${F.quick === x[0] ? 'on' : ''}" onclick="pf('quick','${x[0]}')">${x[1]}</button>`).join('')}</div>
   <div class="seg" style="margin-bottom:6px">${['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((p) => `<button class="${F.pos === p ? 'on' : ''}" onclick="pf('pos','${p}')">${p === 'ALL' ? t('all') : t(p.toLowerCase())}</button>`).join('')}</div>
   <div class="grid g3" style="margin-bottom:8px"><select id="pt" class="sel">${`<option value="ALL">${tt('كل الأندية', 'All clubs')}</option>` + teams.map((x) => `<option value="${x.id}" ${+F.team === x.id ? 'selected' : ''}>${tName(x.id)}</option>`).join('')}</select>
    <select id="pm" class="sel">${[16, 12, 10, 8, 7, 6.5, 6, 5.5, 5, 4.5].map((v) => `<option value="${v}" ${F.max == v ? 'selected' : ''}>${t('maxPrice')} ${v}م</option>`).join('')}</select>
    <select id="ps" class="sel">${SORTS().map((s) => `<option value="${s[0]}" ${F.sort === s[0] ? 'selected' : ''}>${t('sortBy')}: ${s[1]}</option>`).join('')}</select></div>
   <div id="plRes"><div class="mut" style="font-size:12px;margin:2px 2px 8px">${fmt(L.length)} ${tt('لاعب', 'players')}</div>
   ${shown.map((p) => playerRow(p, `<div class="col">${spark([p.ppg, p.form, xp(p)].map(Number))}<small>${F.sort === 'price' || F.sort === 'cc' ? p.price.toFixed(1) + 'م' : F.sort === 'own' ? p.own + '%' : F.sort === 'xgi' ? p.xgi.toFixed(1) : F.sort === 'form' ? p.form : F.sort === 'xp' ? xpN(p, ST.G.next, 3) : F.sort === 'fix' ? avgFdr(p.team, ST.G.next, 5).toFixed(1) : F.sort === 'min' ? fmt(p.min) : F.sort === 'trend' ? '+' + fmt(Math.round((p.tin - p.tout) / 1000)) + 'k' : p.total + ' ' + t('points')}</small></div><button class="icon-btn star ${ST.watch.has(p.id) ? 'on' : ''}" onclick="event.stopPropagation();toggleWatch(${p.id})">${I('i-star')}</button>`)).join('') || `<div class="empty">${I('i-search', 'i', 'width:40px;height:40px')}<b>${tt('ما في نتائج', 'No results')}</b></div>`}
   ${L.length > shown.length ? `<button class="btn btn-g btn-b" onclick="pf('page',${F.page + 1})">${tt('عرض المزيد', 'Show more')} (${L.length - shown.length})</button>` : ''}</div>`;
}
export function afterPlayers() {
  const q = document.getElementById('pq'); let tm;
  q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { F.q = q.value; F.page = 1; const tmp = document.createElement('div'); tmp.innerHTML = vPlayers(); const n = tmp.querySelector('#plRes'), o = document.getElementById('plRes'); if (n && o) o.innerHTML = n.innerHTML; }, 120); };
  document.getElementById('pt').onchange = (e) => window.pf('team', e.target.value);
  document.getElementById('pm').onchange = (e) => window.pf('max', +e.target.value);
  document.getElementById('ps').onchange = (e) => window.pf('sort', e.target.value);
}
window.pf = (k, v) => { F[k] = v; if (k !== 'page') F.page = 1; window.render(); };

/* ---------- سوق الانتقالات ---------- */
/* ---------- المقارنة ---------- */
// ألوان اللاعبين (تحقق منها بمدقق الألوان: مميزة لعمى الألوان ومريحة على الخلفية الغامقة)
const CC = ['#14A874', '#3E86D6', '#C9821F'];
const GP = { GK: 6, DEF: 6, MID: 5, FWD: 4 }, CSP = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
// منحنى ناعم يمر بكل النقاط (Catmull-Rom → Bézier)
function smooth(pts, closed) {
  const n = pts.length; if (n < 2) return '';
  const P = (k) => pts[closed ? (k + n) % n : Math.max(0, Math.min(n - 1, k))];
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2), t = 0.18;
    d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)},${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + (closed ? 'Z' : '');
}
/** مؤشرات المقارنة حسب المركز: كل مركز يُقاس باللي فعلاً يجيب نقاطه
 *  (الحارس ما ينقاس بالصناعة، والمدافع ينقاس بالشباك النظيفة والمساهمات الدفاعية) */
function axes(ps) {
  const G = ST.G, fin = Math.max(1, G.finished), p90 = (v, p) => (p.min > 0 ? (v / p.min) * 90 : 0), st = (p) => Math.max(1, p.starts ?? Math.round(p.min / 90));
  const X = {
    att: ['att', tt('الهجوم', 'Attack'), (p) => p90(p.xg, p)],
    gls: ['gls', tt('الأهداف', 'Goals'), (p) => p.gls || 0],
    cre: ['cre', tt('الصناعة', 'Creativity'), (p) => p90(p.xa, p)],
    xgi: ['xgi', tt('التهديد الهجومي', 'Attacking threat'), (p) => p90(p.xg + p.xa, p)],
    sav: ['sav', tt('التصديات', 'Saves'), (p) => p90(p.saves || 0, p)],
    cs: ['cs', tt('الشباك النظيفة', 'Clean sheets'), (p) => (p.cs || 0) / st(p)],
    dc: ['dc', tt('المساهمات الدفاعية', 'Def. contribution'), (p) => p.dc90 || 0],
    bon: ['bon', tt('البونص', 'Bonus'), (p) => (p.bonus || 0) / st(p)],
    frm: ['frm', tt('الفورم', 'Form'), (p) => p.form],
    // ضمان الدقائق مقياس مطلق مو ترتيب: اللاعب الأساسي بكل الجولات = 100 مهما كان عدد الأساسيين بمركزه
    min: ['min', tt('ضمان الدقائق', 'Nailed'), Object.assign((p) => Math.min(100, Math.round(100 * Math.max((p.starts ?? 0) / fin, p.min / (fin * 90)))), { abs: true })],
    fix: ['fix', tt('الجدول', 'Fixtures'), (p) => 5 - avgFdr(p.team, G.next, 5)],
    val: ['val', tt('القيمة', 'Value'), (p) => p.total / p.price],
  };
  const pos = ps && ps.length && ps.every((p) => p.pos === ps[0].pos) ? ps[0].pos : 'MIX';
  const K = { GK: ['sav', 'cs', 'frm', 'min', 'fix', 'val'], DEF: ['cs', 'dc', 'gls', 'xgi', 'frm', 'min', 'fix', 'val'], MID: ['gls', 'att', 'cre', 'dc', 'frm', 'min', 'fix', 'val'], FWD: ['gls', 'att', 'cre', 'frm', 'min', 'fix', 'val'], MIX: ['gls', 'xgi', 'bon', 'frm', 'min', 'fix', 'val'] }[pos];
  return K.map((k) => X[k]);
}
/** المتوقع المصحَّح بتعلّم المدرب (نفس العقل اللي يستخدمه المدرب الذكي ومقترح التشكيلات) */
function xpS(p, n = 5) { const G = ST.G; let s = 0; for (let g = G.next; g < G.next + n && g <= G.lastGW; g++) s += LR.xpL(p, g); return r1(s); }
function pctl(p, f) {
  const pool = ST.G.players.filter((x) => x.pos === p.pos && x.min >= 270);
  if (pool.length < 5) return 50;
  if (f.abs) return Math.max(0, Math.min(100, Math.round(f(p))));
  // ترتيب منصف للتعادلات: اللاعبين المتساويين ياخذون نفس المرتبة (وسط مجموعتهم) بدل ما يُحسبون أقل
  const v = f(p); let below = 0, eq = 0; for (const x of pool) { const y = f(x); if (y < v) below++; else if (y === v) eq++; }
  return Math.round(((below + eq / 2) / pool.length) * 100);
}
/** سلّم المؤشرات (Dumbbell): كل محور سطر بمسطرة 0–100، نقطة لكل لاعب، والشريط بيناتهم يبين حجم الفرق ومنو متقدم */
function ladder(ps, A) {
  return `<div class="ld" role="img" aria-label="${tt('مقارنة المؤشرات بالترتيب المئوي', 'Percentile comparison')}">${A.map(([, l, f]) => {
    const vs = ps.map((p) => pctl(p, f)), mx = Math.max(...vs), mn = Math.min(...vs), lead = vs.filter((v) => v === mx).length === 1 ? vs.indexOf(mx) : -1;
    return `<div class="ld-r"><span class="ld-l">${l}</span><div class="ld-t"><i class="ld-q" style="inset-inline-start:25%"></i><i class="ld-q" style="inset-inline-start:50%"></i><i class="ld-q" style="inset-inline-start:75%"></i>
      <i class="ld-g" style="inset-inline-start:${mn}%;width:${Math.max(0, mx - mn)}%;${lead >= 0 ? `background:linear-gradient(${document.documentElement.dir !== 'ltr' ? 'to left' : 'to right'},transparent,${CC[lead]}55)` : ''}"></i>
      ${vs.map((v, i) => `<i class="ld-d${i === lead ? ' on' : ''}" style="inset-inline-start:${v}%;--c:${CC[i]};--z:${i === lead ? 3 : 2}" title="${esc(ps[i].name)} · ${l}: ${v}"></i>`).join('')}</div>
      <b class="ld-v num" style="color:${lead >= 0 ? CC[lead] : 'var(--mut)'}">${mx}</b></div>`; }).join('')}
    <div class="ld-ax"><span></span><div><b>0</b><b>25</b><b>50</b><b>75</b><b>100</b></div><span></span></div></div>`;
}
/** مصادر نقاط اللاعب. ويا سجل مبارياته (h) الحساب دقيق مباراة بمباراة، وبدونه تقريبي من أرقام الموسم */
function sources(p, h) {
  const gk = p.pos === 'GK', dfn = gk || p.pos === 'DEF', T = { DEF: 10, MID: 12, FWD: 12 }[p.pos];
  let app = 0, dc = 0, gcD = 0, sv, g, a, cs, b, psv, ded;
  if (h && h.length) {
    const S = (k) => h.reduce((x, r) => x + (r[k] || 0), 0);
    h.forEach((r) => { const m = r.minutes || 0; app += m >= 60 ? 2 : m > 0 ? 1 : 0; if (T && (r.defensive_contribution || 0) >= T) dc += 2; if (dfn && m > 0) gcD += Math.floor((r.goals_conceded || 0) / 2); });
    g = S('goals_scored') * GP[p.pos]; a = S('assists') * 3; cs = S('clean_sheets') * CSP[p.pos]; b = S('bonus');
    sv = gk ? h.reduce((x, r) => x + Math.floor((r.saves || 0) / 3), 0) : 0; psv = S('penalties_saved') * 5;
    ded = S('yellow_cards') + S('red_cards') * 3 + S('own_goals') * 2 + S('penalties_missed') * 2 + gcD;
  } else {
    g = p.gls * GP[p.pos]; a = p.ast * 3; cs = p.cs * CSP[p.pos]; b = p.bonus || 0; sv = gk ? Math.floor((p.saves || 0) / 3) : 0; psv = (p.ps || 0) * 5;
    ded = (p.yc || 0) + (p.rc || 0) * 3 + (p.og || 0) * 2 + (p.pm || 0) * 2 + (dfn ? Math.floor((p.gc || 0) / 2) : 0);
    // الباقي = مشاركة + مساهمات دفاعية (تقدير لحد ما يوصل سجل المباريات)
    const rest = Math.max(0, p.total - g - a - cs - b - sv - psv + ded), est = Math.min(rest, (p.starts ?? Math.round(p.min / 90)) * 2);
    app = est; dc = rest - est;
  }
  const pos = [[tt('أهداف', 'Goals'), g], [tt('صناعة', 'Assists'), a], [tt('شباك نظيفة', 'Clean sheets'), cs], [tt('بونص', 'Bonus'), b], [tt('تصديات', 'Saves'), sv], [tt('صد ركلة جزاء', 'Pen saves'), psv], [tt('مشاركة', 'Appearances'), app], [tt('مساهمات دفاعية', 'Def. contributions'), dc]].filter((x) => x[1] > 0);
  return { pos, ded, exact: !!(h && h.length) };
}
/** تركيبة النقاط: شريط واحد 100% مقسّم حسب المصدر، وتحته القائمة بالأرقام */
function donut(p, i, h) {
  const { pos: L, ded, exact } = sources(p, h), tot = L.reduce((x, y) => x + y[1], 0) || 1;
  const op = [1, 0.78, 0.6, 0.46, 0.36, 0.28, 0.22, 0.17];
  return `<div class="cb"><div class="cb-top"><b class="num">${p.total}</b><small>${tt('نقطة', 'pts')}</small></div>
    <div class="cb-bar">${L.map(([l, v], k) => `<i style="flex:${v};background:${CC[i]};opacity:${op[k] || .17}" title="${l}: ${v}"></i>`).join('')}</div>
    <ul>${L.map(([l, v], k) => `<li><i style="background:${CC[i]};opacity:${op[k] || .17}"></i><span>${l}</span><b class="num">${v}</b><em class="num">${Math.round((v / tot) * 100)}%</em></li>`).join('')}${ded > 0 ? `<li class="ded"><i></i><span>${tt('خصومات', 'Deductions')}</span><b class="num">−${ded}</b><em></em></li>` : ''}</ul>
    ${exact ? '' : `<small class="cmp-dn-n">${tt('تقريبي — يتحدث بعد تحميل سجل المباريات', 'Approximate until match log loads')}</small>`}</div>`;
}
export function vCompare() {
  const ids = LS.get('fp_cmp', []).filter((id) => PM(id));
  const userMode = LS.get('fp_cmp_user', false); // المستخدم اختار بنفسه: ما نضيف أي لاعب تلقائي
  if (!userMode && ids.length < 2 && ST.plan) { const c = ST.plan.cap; if (!ids.includes(c)) ids.unshift(c); const alt = ST.G.players.filter((p) => p.pos === PM(ids[0]).pos && p.id !== ids[0]).sort((a, b) => b.total - a.total)[0]; if (ids.length < 2 && alt) ids.push(alt.id); }
  if (!userMode && LS.get('fp_cmp', []).filter((id) => PM(id)).length < ids.length) LS.set('fp_cmp', ids.slice(0, 3)); // نحفظ الاختيار التلقائي حتى المنتقي يعرف منو معروض
  const ps = ids.slice(0, 3).map(PM), G = ST.G, A = axes(ps.length >= 2 ? ps : null);
  if (ps.length < 2) return `<button class="cmp-add" onclick="cmpPick()"><span class="sicon">${I('i-plus')}</span><span>${tt('أضف لاعب للمقارنة', 'Add a player to compare')}</span><small>${tt('بحث · نادي · اقتراحات', 'Search · club · picks')}</small></button>${ps.length ? `<div class="cmp-heads" style="grid-template-columns:1fr"><div class="cmp-h" style="--c:${CC[0]}"><div class="cmp-sh">${pShirt(ps[0])}</div><b>${esc(ps[0].name)}</b><small>${tt('اختار لاعب ثاني حتى تبدي المقارنة', 'Pick one more player to compare')}</small></div></div>` : `<div class="pk-empty" style="margin-top:12px">${tt('اختار لاعبين أو ثلاثة حتى تقارن بينهم', 'Pick 2–3 players to compare')}</div>`}`;
  const fin = Math.max(1, G.finished), per90 = (p, v) => (p.min > 0 ? r1((v / p.min) * 90) : 0);
  const score = (p) => Math.round(A.reduce((s, [, , f]) => s + pctl(p, f), 0) / A.length);
  const XS = new Map(ps.map((p) => [p, xpS(p)])), xmax = Math.max(...XS.values(), 0.1);
  // الحكم النهائي: 55% مؤشرات الموسم + 45% المتوقع الذكي (المصحَّح بالتعلّم) — والجاهزية تنقص منه
  const judge = (p) => (0.55 * score(p) + 0.45 * (XS.get(p) / xmax) * 100) * (0.5 + 0.5 * avail(p));
  const ranked = [...ps].sort((a, b) => judge(b) - judge(a)), best = ranked[0], bi = ps.indexOf(best);
  const ring = (v, i) => `<div class="sg" style="--c:${CC[i]}"><b class="num">${v}<small>/100</small></b><div class="sg-b">${Array.from({ length: 10 }, (_, k) => `<i class="${v >= (k + 1) * 10 ? 'f' : v > k * 10 ? 'h' : ''}" style="--k:${k}"></i>`).join('')}</div></div>`;
  const head = `<div class="cmp-heads" style="grid-template-columns:repeat(${ps.length},1fr)">${ps.map((p, i) => `<div class="cmp-h${p === best ? ' top' : ''}" style="--c:${CC[i]}" onclick="openPlayer(${p.id})"><button class="cmp-x" onclick="event.stopPropagation();rmCompare(${p.id})" aria-label="${tt('شيل', 'Remove')}">${I('i-x', 'i')}</button>
     <div class="cmp-sh">${pShirt(p)}</div><b>${esc(p.name)}</b><small><bdi>${tShort(p.team)}</bdi> · ${t(p.pos.toLowerCase())}</small>
     <div class="cmp-meta"><span class="num">£${p.price.toFixed(1)}</span><span class="num">${p.own}%</span></div>${ring(score(p), i)}<small class="cmp-sc">${tt('التقييم العام', 'Overall')}</small>${avail(p) < 1 ? `<span class="cmp-warn">${p.st === 'i' || avail(p) === 0 ? tt('غير جاهز', 'Unavailable') : tt(`مشاركة ${Math.round(avail(p) * 100)}%`, `${Math.round(avail(p) * 100)}% to play`)}</span>` : ''}</div>`).join('')}</div>`;
  const legend = `<div class="cmp-leg">${ps.map((p, i) => `<span><i style="background:${CC[i]}"></i>${esc(p.name)}</span>`).join('')}</div>`;
  // صفوف المقارنة بأشرطة مشتركة المقياس
  const allGK = ps.every((p) => p.pos === 'GK');
  const GROUPS = [
    [tt('النقاط', 'Points'), [[tt('المجموع', 'Total'), (p) => p.total, 1], [tt('نقطة/مباراة', 'PPG'), (p) => p.ppg, 1], [tt('الفورم', 'Form'), (p) => p.form, 1], [tt('المتوقع 5 جولات', 'xP 5 GWs'), (p) => XS.get(p), 1], [tt('البونص', 'Bonus'), (p) => p.bonus || 0, 1]]],
    allGK ? [tt('أرقام الحارس', 'Goalkeeping'), [[tt('تصديات/90', 'Saves/90'), (p) => per90(p, p.saves || 0), 1], [tt('شباك نظيفة', 'Clean sheets'), (p) => p.cs || 0, 1], [tt('أهداف مستقبلة/90', 'Conceded/90'), (p) => per90(p, p.gc || 0), -1], [tt('صد ركلة جزاء', 'Pen saves'), (p) => p.ps || 0, 1]]] :
    [tt('الأرقام الحقيقية لكل 90 دقيقة', 'Underlying per 90'), [['xG', (p) => per90(p, p.xg), 1], ['xA', (p) => per90(p, p.xa), 1], [tt('أهداف', 'Goals'), (p) => per90(p, p.gls), 1], [tt('صناعة', 'Assists'), (p) => per90(p, p.ast), 1], [tt('مساهمات دفاعية', 'Def. contrib.'), (p) => r1(p.dc90 || 0), 1]]],
    [tt('الدقائق والقيمة', 'Minutes & value'), [[tt('الدقائق', 'Minutes'), (p) => p.min, 1, fmt], [tt('أساسي', 'Starts'), (p) => p.starts ?? 0, 1, (v) => `${v}/${fin}`], [tt('نقطة لكل مليون', 'Pts per £m'), (p) => r1(p.total / p.price), 1], [tt('السعر', 'Price'), (p) => p.price, -1, (v) => '£' + v.toFixed(1)], [tt('الملكية', 'Owned'), (p) => p.own, 0, (v) => v + '%']]],
  ];
  const rows = GROUPS.map(([g, M]) => `<div class="cmp-grp"><div class="cmp-gt">${g}</div>${M.map(([l, f, dir, fm]) => {
    const vals = ps.map((p) => +f(p) || 0), mx = Math.max(...vals.map(Math.abs), 1e-9), bv = dir === 1 ? Math.max(...vals) : dir === -1 ? Math.min(...vals) : null, tie = vals.filter((v) => v === bv).length === vals.length;
    return `<div class="cmp-r"><span class="cmp-l">${l}</span>${vals.map((v, i) => { const w = dir === -1 ? (Math.min(...vals) / Math.max(v, 1e-9)) * 100 : (Math.abs(v) / mx) * 100, win = bv != null && v === bv && !tie;
      return `<div class="cmp-b${win ? ' win' : ''}"><div class="cmp-bt"><i style="width:${Math.max(3, w).toFixed(0)}%;background:${CC[i]}"></i></div><b class="num">${fm ? fm(v) : v}${win ? `<svg class="i cmp-ck" viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>` : ''}</b></div>`; }).join('')}</div>`; }).join('')}</div>`).join('');
  // أسباب التوصية: نذكر بس المحاور اللي الفرق بيها حقيقي (8 مراتب+ وقيمة فعلية مو صفر)
  const others = ps.filter((x) => x !== best), MIN_D = 8;
  const gap = (a, f, rest) => pctl(a, f) - Math.max(...rest.map((x) => pctl(x, f)));
  const real = (f) => ps.some((x) => (+f(x) || 0) > 0);
  const lead = A.filter(([, , f]) => real(f)).map(([, l, f]) => ({ l, d: gap(best, f, others) })).filter((x) => x.d >= MIN_D).sort((a, b) => b.d - a.d).slice(0, 2);
  const runner = ranked[1], rlead = A.filter(([, , f]) => real(f)).map(([, l, f]) => ({ l, d: gap(runner, f, ps.filter((x) => x !== runner)) })).filter((x) => x.d >= MIN_D).sort((a, b) => b.d - a.d).slice(0, 1);
  const xb = XS.get(best), xr = XS.get(runner), dx = r1(xb - xr), BR = LR.brain(), learned = (BR.nEval || 0) > 0 || BR.boot;
  const why = lead.length ? tt(`يتفوق بـ${lead.map((x) => x.l).join(' و')}`, `Leads on ${lead.map((x) => x.l).join(' & ')}`) : dx > 0.4 ? tt('المؤشرات متقاربة — الفرق بالتوقع', 'Similar profiles — expected points decide') : tt('متقاربين جداً', 'Very close call');
  const verdictTxt = `${why} · ${tt(`متوقع ${xb} نقطة بـ5 جولات`, `${xb} xP over 5 GWs`)}${dx > 0 ? tt(` · <bdi>+${dx}</bdi> عن <bdi>${esc(runner.name)}</bdi>`, ` · +${dx} vs ${esc(runner.name)}`) : ''}${avail(best) < 1 ? tt(' — بس انتبه لجاهزيته', ' — check availability') : ''}`;
  const verdictSub = `${rlead.length ? tt(`<bdi>${esc(runner.name)}</bdi> أفضل بـ${rlead[0].l}`, `${esc(runner.name)} is better on ${rlead[0].l}`) : ''}${rlead.length && learned ? ' · ' : ''}${learned ? tt('التوقع معدّل حسب تعلّم المدرب من الجولات السابقة', 'xP adjusted by the coach\'s learning') : ''}`;
  const nx = ps.map((p, i) => `<div class="cmp-fx"><span style="--c:${CC[i]}">${esc(p.name)}</span><div>${fdrChips(p.team, G.next, 5)}</div></div>`).join('');
  return `<button class="cmp-add" onclick="cmpPick()"><span class="sicon">${I('i-plus')}</span><span>${ps.length >= 3 ? tt('بدّل لاعب أو أضف (لحد 3)', 'Swap or add a player (max 3)') : tt('أضف لاعب للمقارنة', 'Add a player to compare')}</span><small>${tt('بحث · نادي · اقتراحات', 'Search · club · picks')}</small></button>
   ${head}
   <div class="card cmp-verdict" style="--c:${CC[bi]}"><span class="ms ms-opp"></span><div><small>${tt('التوصية', 'Verdict')}</small><b>${esc(best.name)}</b><p>${verdictTxt}</p>${verdictSub ? `<small class="cmp-vs">${verdictSub}</small>` : ''}</div></div>
   <div class="sec"><h2>${I('i-target')}${tt('بصمة اللاعب', 'Player profile')}</h2></div>
   <div class="card cmp-rd">${legend}${ladder(ps, A)}<p class="cmp-note">${tt('كل سطر = ترتيب اللاعب بين لاعبين نفس مركزه (100 = الأفضل)، والرقم = المتقدم بلونه. ضمان الدقائق = نسبة مشاركته أساسي', 'Each row = percentile vs same-position players')}</p></div>
   <div class="sec"><h2>${I('i-chart')}${tt('آخر 6 جولات', 'Last 6 GWs')}</h2></div>
   <div class="card" id="cmpLine"><div class="aiload"><i></i><i></i><i></i></div></div>
   <div class="sec"><h2>${I('i-swords')}${tt('وجهاً لوجه', 'Head to head')}</h2></div>
   <div class="card cmp-h2h">${legend}${rows}</div>
   <div class="sec"><h2>${I('i-star')}${tt('من وين تجي نقاطه', 'Where the points come from')}</h2></div>
   <div class="cmp-dns" style="grid-template-columns:repeat(${ps.length},1fr)">${ps.map((p, i) => `<div class="card"><b class="cmp-dnt"><i style="background:${CC[i]}"></i>${esc(p.name)}</b><div id="dn_${p.id}">${donut(p, i)}</div></div>`).join('')}</div>
   <div class="sec"><h2>${I('i-season')}${tt('المباريات الجاية', 'Next fixtures')}</h2></div>
   <div class="card">${nx}</div>`;
}
/** آخر 6 جولات: أعمدة متجاورة لكل جولة، والعمود الأعلى بالجولة عليه رقمه */
function lineChart(series) {
  const gws = [...new Set(series.flatMap((s) => s.h.map((r) => r.round)))].sort((a, b) => a - b).slice(-6);
  if (!gws.length) return `<p class="mut" style="font-size:12.5px">${tt('ماكو بيانات كافية', 'Not enough data')}</p>`;
  const val = (s, g) => s.h.filter((x) => x.round === g).reduce((a, x) => a + (x.total_points || 0), 0);
  const mx = Math.max(4, ...series.flatMap((s) => gws.map((g) => val(s, g)))), top = Math.ceil(mx / 4) * 4;
  return `<div class="gc" role="img" aria-label="${tt('نقاط آخر الجولات', 'Recent GW points')}"><div class="gc-y"><b class="num">${top}</b><b class="num">${top / 2}</b><b class="num">0</b></div><div class="gc-p">${gws.map((g) => { const vs = series.map((s) => val(s, g)), m = Math.max(...vs);
    return `<div class="gc-g"><div class="gc-cols">${vs.map((v, i) => `<i style="height:${Math.max(2, (Math.max(0, v) / top) * 100)}%;background:${series[i].c}" title="${esc(series[i].n)} · GW${g}: ${v}">${v === m && v > 0 ? `<b class="num">${v}</b>` : ''}</i>`).join('')}</div><small class="num">${g}</small></div>`; }).join('')}</div></div>`;
}
export function afterCompare() {
  const box = document.getElementById('cmpLine'); if (!box || box.dataset.done) return;
  const ids = [...document.querySelectorAll('.cmp-h')].map((el) => +el.getAttribute('onclick').match(/\d+/)[0]);
  Promise.all(ids.map((id, i) => playerSummary(id).then((d) => ({ n: PM(id).name, c: CC[i], h: d.history || [] })).catch(() => ({ n: PM(id).name, c: CC[i], h: [] })))).then((S) => {
    const b = document.getElementById('cmpLine'); if (!b) return; b.dataset.done = 1;
    ids.forEach((id, i) => { const e = document.getElementById('dn_' + id); if (e && S[i].h.length) e.innerHTML = donut(PM(id), i, S[i].h); });
    b.innerHTML = lineChart(S) + `<div class="cmp-leg">${S.map((s) => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join('')}</div>`;
  });
}
/* ---------- منتقي لاعب المقارنة: بحث مرن + تصفح حسب النادي + اقتراحات ذكية ---------- */
const PK = { q: '', team: 0, pos: 'ALL' };
// تطبيع: يشيل الحركات والرموز، ويقبل جزء من الاسم أو أي كلمة منه (مثلاً "hala" تلكه Haaland و"odeg" تلكه Ødegaard)
const fold = (x) => norm(x).replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/[^a-z0-9؀-ۿ ]/g, ' ');
// مسافة تحرير (مع تبديل حرفين متجاورين) — تسامح ويا الأخطاء الإملائية
function dl(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }
  return d[m][n]; }
function matchScore(p, q) {
  if (!q) return 1;
  const name = fold(p.name), words = [...new Set([...name.split(' '), ...fold(p.full || '').split(' ')])].filter(Boolean);
  const sh = tShort(p.team).toLowerCase(), club = fold(tName(p.team));
  if (q === sh || (q.length >= 4 && club.startsWith(q))) return 7; // اسم النادي: كل لاعبينه
  if (name.startsWith(q)) return 6; if (words.some((w) => w.startsWith(q))) return 5;
  if (q.length >= 3 && words.some((w) => dl(w.slice(0, q.length), q) <= (q.length >= 6 ? 2 : 1))) return 4; // تقريبي
  if (q.length >= 3 && (name.includes(q) || words.some((w) => w.includes(q)))) return 3;
  return club.includes(q) && q.length >= 3 ? 2 : 0;
}
function pickList() {
  const G = ST.G, cur = LS.get('fp_cmp', []).filter((id) => PM(id));
  const raw = PK.q.trim(), ar = /[؀-ۿ]/.test(raw);
  let arIds = null, arClub = null; if (ar && raw.length >= 2) { const PQ = parseQuery(raw); arIds = new Set((PQ.players || []).map((p) => p.id)); arClub = PQ.club?.id || null; }
  const q = ar ? '' : fold(raw).trim();
  let L = G.players.filter((p) => (PK.pos === 'ALL' || p.pos === PK.pos) && (!PK.team || p.team === PK.team));
  if (raw) L = L.map((p) => ({ p, s: ar ? (arIds?.has(p.id) ? 6 : arClub === p.team ? 3 : 0) : matchScore(p, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.p.total - a.p.total).map((x) => x.p);
  else L = L.sort((a, b) => (PK.team ? ['GK', 'DEF', 'MID', 'FWD'].indexOf(a.pos) - ['GK', 'DEF', 'MID', 'FWD'].indexOf(b.pos) : 0) || b.total - a.total);
  return { L: L.slice(0, PK.team ? 40 : 30), cur };
}
function pickRow(p, cur) {
  const on = cur.includes(p.id);
  return `<button class="pk-row${on ? ' on' : ''}" onclick="cmpAdd(${p.id})"><span class="mini">${pShirt(p)}</span><span class="pk-i"><b>${esc(p.name)}</b><small><bdi>${tShort(p.team)}</bdi> · ${t(p.pos.toLowerCase())} · <bdi>£${p.price.toFixed(1)}</bdi> · ${p.total} ${tt('نقطة', 'pts')}</small></span><span class="pk-ck">${on ? I('i-check', 'i') : I('i-plus', 'i')}</span></button>`;
}
function pickSuggest(cur) {
  const G = ST.G, base = PM(cur[0]); const out = [];
  if (base) { const sim = G.players.filter((p) => p.pos === base.pos && p.id !== base.id && !cur.includes(p.id) && Math.abs(p.price - base.price) <= 1 && p.min > 180).sort((a, b) => xpN(b, G.next, 5) - xpN(a, G.next, 5)).slice(0, 4); if (sim.length) out.push([tt(`بدائل لـ ${base.name} (نفس المركز والسعر)`, `Alternatives to ${base.name}`), sim]); }
  const mine = (ST.plan?.squad || []).map(PM).filter((p) => p && !cur.includes(p.id)).sort((a, b) => b.total - a.total).slice(0, 6); if (mine.length) out.push([tt('لاعبين فريقك', 'Your squad'), mine]);
  const hot = G.players.filter((p) => !cur.includes(p.id) && p.min > 180).sort((a, b) => b.tin - a.tin).slice(0, 4); out.push([tt('الأكثر شراء هالجولة', 'Most bought this GW'), hot]);
  return out.map(([t2, L]) => `<div class="pk-sec">${t2}</div>${L.map((p) => pickRow(p, cur)).join('')}`).join('');
}
function pickBody() {
  const { L, cur } = pickList(), teams = Object.values(ST.G.teams).sort((a, b) => tShort(a.id).localeCompare(tShort(b.id)));
  const browsing = PK.q || PK.team || PK.pos !== 'ALL';
  const sel = cur.length ? `<div class="pk-sel">${cur.map((id) => `<span>${esc(PM(id).name)}<button onclick="cmpAdd(${id})" aria-label="x">${I('i-x', 'i')}</button></span>`).join('')}<small>${cur.length}/3</small></div>` : '';
  return `${sel}<div class="pk-clubs">${teams.map((tm) => `<button class="${PK.team === tm.id ? 'on' : ''}" onclick="pkSet('team',${PK.team === tm.id ? 0 : tm.id})">${crest(tShort(tm.id), 26)}<small>${tShort(tm.id)}</small></button>`).join('')}</div>
   <div class="seg pk-pos">${['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((x) => `<button class="${PK.pos === x ? 'on' : ''}" onclick="pkSet('pos','${x}')">${x === 'ALL' ? t('all') : t(x.toLowerCase())}</button>`).join('')}</div>
   <div id="pkRes">${browsing ? (L.length ? `<div class="pk-sec">${PK.team ? tName(PK.team) : tt(`${L.length} نتيجة`, `${L.length} results`)}</div>${L.map((p) => pickRow(p, cur)).join('')}` : `<div class="pk-empty">${tt('ما لكينا لاعب — جرب جزء من الاسم أو اختار النادي من فوك', 'No match — try part of the name or pick a club')}</div>`) : pickSuggest(cur)}</div>`;
}
function pickRefresh() { const b = document.getElementById('pkBody'); if (b) b.innerHTML = pickBody(); }
window.cmpPick = () => {
  PK.q = ''; PK.team = 0; PK.pos = 'ALL';
  // كل بحث جديد يبدي مقارنة جديدة: ما نبقي اللاعبين القدامى
  if (!PK.keep) { LS.set('fp_cmp', []); LS.set('fp_cmp_user', true); window.render(); }
  PK.keep = false;
  openSheet(`<div class="pk"><div class="pk-top"><b>${tt('اختار لاعب للمقارنة', 'Pick a player')}</b><button class="icon-btn" onclick="closeSheet()">${I('i-x', 'i')}</button></div>
    <div class="searchbox"><span class="sicon">${I('i-search')}</span><input id="pkq" type="search" placeholder="${tt('اكتب جزء من الاسم أو النادي (عربي أو إنكليزي)', 'Type part of a name or club')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    <div id="pkBody">${pickBody()}</div></div>`, () => {
    const q = document.getElementById('pkq'); let tm;
    q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { PK.q = q.value; pickRefresh(); }, 120); };
  });
};
window.pkSet = (k, v) => { PK[k] = v; pickRefresh(); };
window.cmpAdd = (id) => {
  let c = LS.get('fp_cmp', []).filter((x) => PM(x));
  if (c.includes(id)) c = c.filter((x) => x !== id);
  else { if (c.length >= 3) { c = c.slice(1); toast(tt('بدّلنا أقدم لاعب (الحد 3)', 'Replaced the oldest (max 3)')); } c.push(id); }
  LS.set('fp_cmp', c); pickRefresh(); window.render();
};
window.rmCompare = (id) => { LS.set('fp_cmp', LS.get('fp_cmp', []).filter((x) => x !== id)); window.render(); };
