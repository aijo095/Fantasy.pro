/* =========================================================
   ملعب التجارب: ملعب فارغ تبني بيه فريق من 15 لاعب (2 حراس، 5 مدافعين، 5 وسط، 3 مهاجمين).
   الميزانية = بنكك + قيمة بيع فريقك الحالي، وكل لاعب تختاره ينخصم سعره من البنك.
   لما يكمل الفريق: أفضل تشكيلة وكابتن، المتوقع ومقارنته بفريقك، والملاحظات،
   وتكدر تعتمده كخطتك للجولة الجاية.
========================================================= */
import { ST, PM, tName, savePlan } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, r1, toast, openSheet, closeSheet, sheetHead } from '../ui.js';
import { pShirt, playerRow } from './common.js';
import { xp, avail, bestXI, validXI, counts, fixturesFor } from '../engine.js';
import { sellPrice10 } from '../solver.js';
import { basePlan } from '../app.js';

const LINES = `<svg class="lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width=".45"><rect x="4" y="3" width="92" height="134" rx="1.5"/><line x1="4" y1="70" x2="96" y2="70"/><ellipse cx="50" cy="70" rx="12" ry="8.6"/><rect x="26" y="3" width="48" height="18"/><rect x="38" y="3" width="24" height="7"/><path d="M41 21 Q50 27 59 21"/><rect x="26" y="119" width="48" height="18"/><rect x="38" y="130" width="24" height="7"/><path d="M41 119 Q50 113 59 119"/></g><circle cx="50" cy="70" r=".9" fill="#fff"/></svg>`;
const SLOTS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const POSN = () => ({ GK: tt('حارس', 'GK'), DEF: tt('مدافع', 'DEF'), MID: tt('وسط', 'MID'), FWD: tt('مهاجم', 'FWD') });
let SB = null, Q = '', SORT = 'xp', SWAP = null, PICK = null;
const key = () => `fp_sb2_${ST.profile?.teamId || 0}`;
const save = () => { try { localStorage.setItem(key(), JSON.stringify(SB)); } catch {} };
const price10 = (id) => Math.round(PM(id).price * 10);
const m1 = (v10) => (v10 / 10).toFixed(1);
const xp5 = (id) => { let s = 0; for (let g = ST.G.next; g < ST.G.next + 5 && g <= ST.G.lastGW; g++) s += xp(PM(id), g); return s; };

function baseInfo() {
  const P = basePlan(); if (!P) return null;
  const sell = P.squad.reduce((a, id) => a + sellPrice10(id), 0), bank10 = Math.round(P.bank * 10);
  return { squad: [...P.squad], xi: [...P.xi], cap: P.cap, ft: P.ft, bank10, budget10: bank10 + sell };
}
const blank = () => Object.fromEntries(Object.entries(SLOTS).map(([k, n]) => [k, Array(n).fill(null)]));
function empty() { const b = baseInfo(); if (!b) return null; return { base: b, slots: blank(), xi: null, bench: null, cap: null, vc: null, chip: '', view: 'squad' }; }
function ensure() {
  if (SB) return SB;
  let s = null; try { s = JSON.parse(localStorage.getItem(key()) || 'null'); } catch {}
  SB = s?.slots && Object.values(s.slots).flat().every((id) => id == null || PM(id)) ? s : empty();
  if (SB) { const b = baseInfo(); if (b) SB.base = b; } // البنك وأسعار البيع دائماً محدّثة
  return SB;
}
const picked = () => Object.values(SB.slots).flat().filter(Boolean);
const cost10 = (id) => (SB.base.squad.includes(id) ? sellPrice10(id) : price10(id));
const left10 = () => SB.base.budget10 - picked().reduce((a, id) => a + cost10(id), 0);
const full = () => picked().length === 15;
const clubs = () => picked().reduce((m, id) => ((m[PM(id).team] = (m[PM(id).team] || 0) + 1), m), {});
function lineup() {
  if (!full()) return null;
  const sq = picked();
  if (!SB.xi || SB.xi.length !== 11 || !SB.xi.every((id) => sq.includes(id)) || !validXI(SB.xi)) { const b = bestXI(sq, ST.G.next); Object.assign(SB, { xi: b.xi, bench: b.bench, cap: b.cap, vc: b.vc }); save(); }
  return SB;
}
const proj = (xi, cap, g) => xi.reduce((a, id) => a + xp(PM(id), g) * (id === cap ? 2 : 1), 0);

/* ---------- الواجهة ---------- */
function slotHTML(pos, i, id) {
  if (!id) return `<button class="pl sb-e" onclick="sbAdd('${pos}',${i})" aria-label="${tt('أضف', 'Add')} ${POSN()[pos]}"><div class="sh">${I('i-plus', 'i')}</div><div class="nm">${POSN()[pos]}</div></button>`;
  const p = PM(id), a = avail(p);
  return `<div class="pl" role="button" tabindex="0" onclick="sbSlot('${pos}',${i})" aria-label="${esc(p.name)}">${a < 1 || p.st === 's' ? `<span class="rk inj ${a === 0 || p.st === 's' ? 'r2' : 'r1'}">${a > 0 && a < 1 ? Math.round(a * 100) : '!'}</span>` : ''}<div class="sh">${pShirt(p)}</div><div class="nm">${esc(p.name)}</div><div class="lb">${p.price.toFixed(1)}</div></div>`;
}
function lineCard(id) {
  const p = PM(id), sel = SWAP === id, can = SWAP && SWAP !== id && canSwap(SWAP, id);
  return `<div class="pl${sel ? ' sel' : ''}${SWAP && !sel ? (can ? ' can' : ' dim') : ''}${SB.cap === id ? ' capt' : ''}" role="button" tabindex="0" onclick="sbLine(${id})" aria-label="${esc(p.name)}">${SB.cap === id ? '<span class="cb">C</span>' : SB.vc === id ? '<span class="cb v">V</span>' : ''}<div class="sh">${pShirt(p)}</div><div class="nm">${esc(p.name)}</div><div class="lb">${r1(xp(p))}</div></div>`;
}
function canSwap(a, b) { const inA = SB.xi.includes(a), inB = SB.xi.includes(b); if (inA === inB) return false; const x = inA ? a : b, y = inA ? b : a; return validXI(SB.xi.map((id) => (id === x ? y : id))); }

export function vSandbox() {
  if (!ST.G?.next) return `<div class="empty">${tt('الموسم خلص', 'Season over')}</div>`;
  if (!ensure()) return `<div class="empty">${tt('اربط فريقك أول حتى نبدي', 'Link your team first')}</div>`;
  const n = picked().length, left = left10(), over = left < 0, F = full();
  const cnt = (pos) => SB.slots[pos].filter(Boolean).length;
  const top = `<section class="team-hero sb-hero">
    <div class="sb-hl"><small>${tt('المتبقي بالبنك', 'Money left')}</small><b class="num${over ? ' down' : ''}">${m1(left)}</b><span>${tt(`من ميزانية ${m1(SB.base.budget10)}`, `of ${m1(SB.base.budget10)}`)}</span></div>
    <div class="tstrip"><div><small>${tt('اللاعبين', 'Players')}</small><b class="num">${n}/15</b></div><div><small>${POSN().GK}</small><b class="num">${cnt('GK')}/2</b></div><div><small>${tt('دفاع', 'DEF')}</small><b class="num">${cnt('DEF')}/5</b></div><div><small>${POSN().MID}</small><b class="num">${cnt('MID')}/5</b></div><div><small>${tt('هجوم', 'FWD')}</small><b class="num">${cnt('FWD')}/3</b></div></div>
    <div class="sb-prog" aria-hidden="true"><i style="transform:scaleX(${(n / 15).toFixed(3)})"></i></div>
  </section>`;
  const tabs = F ? `<div class="seg sb-tabs">${[['squad', tt('الفريق', 'Squad')], ['xi', tt('التشكيلة والتحليل', 'Lineup & analysis')]].map(([v, l]) => `<button class="${SB.view === v ? 'on' : ''}" onclick="sbView('${v}')">${l}</button>`).join('')}</div>` : '';
  const body = F && SB.view === 'xi' ? xiHTML() : squadHTML();
  return `<div class="page-h"><h1>${tt('ملعب التجارب', 'Squad sandbox')}</h1><p>${tt('ابني فريقك من الصفر بميزانيتك الحقيقية، والتطبيق يحلله', 'Build a squad from scratch with your real budget')}</p></div>${top}${tabs}${body}`;
}
function squadHTML() {
  const n = picked().length;
  return `<div class="pitch sb-pitch">${LINES}${['GK', 'DEF', 'MID', 'FWD'].map((pos) => `<div class="prow">${SB.slots[pos].map((id, i) => slotHTML(pos, i, id)).join('')}</div>`).join('')}</div>
  <div class="sb-act">
    ${n ? `<button class="btn btn-g btn-sm" onclick="sbClear()">${I('i-trash', 'i')}${tt('فرّغ الملعب', 'Clear')}</button>` : ''}
    <button class="btn btn-g btn-sm" onclick="sbMine()">${I('i-pitch', 'i')}${tt('عبّيه بفريقي الحالي', 'Fill with my team')}</button>
  </div>
  ${full() ? `<button class="btn btn-p btn-b sb-go" onclick="sbView('xi')">${I('i-chart', 'i')}${tt('شوف التشكيلة والتحليل', 'See lineup & analysis')}</button>` : `<p class="mut sb-tip">${tt(`اضغط على أي مكان فارغ واختار لاعب. باقي ${15 - n} لاعب.`, `Tap an empty spot to pick a player. ${15 - n} to go.`)}</p>`}`;
}
function xiHTML() {
  lineup();
  const g0 = ST.G.next, gws = []; for (let g = g0; g < g0 + 5 && g <= ST.G.lastGW; g++) gws.push(g);
  const rows = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => SB.xi.filter((id) => PM(id).pos === pos)), c = counts(SB.xi);
  const tr = picked().filter((id) => !SB.base.squad.includes(id)).length, free = SB.chip === 'wc' || SB.chip === 'fh', hit = free ? 0 : Math.max(0, tr - SB.base.ft) * 4;
  // المقارنة عادلة: فريقك الحالي بأفضل تشكيلة وكابتن إله، مقابل تشكيلتك هنا
  const best = (sq, g) => { const b = bestXI(sq, g); return proj(b.xi, b.cap, g); };
  const now = proj(SB.xi, SB.cap, g0) - hit, mine = best(SB.base.squad, g0);
  const now5 = gws.reduce((a, g) => a + best(picked(), g), 0) - hit, mine5 = gws.reduce((a, g) => a + best(SB.base.squad, g), 0);
  const d1 = now - mine, d5 = now5 - mine5, over = left10() < 0, notes = notesOf(g0);
  const dd = (d) => `<em class="num ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}" dir="ltr">${d > 0 ? '+' : ''}${r1(d)}</em>`;
  return `<div class="pitch">${LINES}${rows.map((r) => `<div class="prow">${r.map(lineCard).join('')}</div>`).join('')}</div>
  <div class="benchbox"><div class="t"><span>${I('i-bench', 'i')} ${tt('الدكة', 'Bench')}</span><span class="mut" style="font-size:12px">${tt('التشكيل', 'Formation')} <bdi dir="ltr">${c.DEF}-${c.MID}-${c.FWD}</bdi></span></div><div class="prow" dir="ltr">${SB.bench.map(lineCard).join('')}</div></div>
  <p class="sb-tip mut">${SWAP ? tt('اختار اللاعب اللي يتبادل وياه، أو اضغط عليه مرة ثانية للإلغاء.', 'Pick who to swap with, or tap again to cancel.') : tt('رتّبناها أفضل تشكيلة. اضغط على لاعب حتى تبدّله مع الدكة أو تخليه كابتن.', 'Best XI picked. Tap a player to swap or captain.')}</p>
  <div class="card sb-sum">
    <div class="sb-row"><span>${tt(`متوقع الجولة ${g0}`, `GW${g0} projection`)}</span><b class="num">${r1(now)}</b>${dd(d1)}</div>
    <div class="sb-row"><span>${tt(`متوقع ${gws.length} جولات`, `${gws.length} GW projection`)}</span><b class="num">${r1(now5)}</b>${dd(d5)}</div>
    <div class="sb-row"><span>${tt('الانتقالات عن فريقك', 'Transfers vs your team')}</span><b class="num">${tr}</b><em class="${hit ? 'down' : ''}">${free ? tt('بدون خصم', 'no hit') : hit ? `−${hit}` : tt('مجانية', 'free')}</em></div>
    <p class="sb-foot">${tt('الرقم الملوّن هو الفرق عن فريقك الحالي، والمتوقع محسوب بعد الخصم.', 'Coloured figure = difference vs your current team, after hits.')}</p>
    <div class="seg sb-chip">${[['', tt('بدون ورقة', 'No chip')], ['wc', tt('وايلد كارد', 'Wildcard')], ['fh', tt('فري هت', 'Free Hit')]].map(([k, l]) => `<button class="${SB.chip === k ? 'on' : ''}" onclick="sbChip('${k}')">${l}</button>`).join('')}</div>
  </div>
  ${notes.length ? `<div class="sec"><h2>${I('i-info', 'i')}${tt('ملاحظات', 'Notes')}</h2></div><div class="list sb-notes">${notes.map((x) => `<div class="row"><div class="info"><b class="${x.t === 'b' ? 'down' : x.t === 'g' ? 'up' : ''}">${esc(x.h)}</b><span>${esc(x.d)}</span></div></div>`).join('')}</div>` : ''}
  <button class="btn btn-p btn-b sb-go" ${over ? 'disabled' : ''} onclick="sbApply()">${I('i-check', 'i')}${tt('اعتمدها خطتي للجولة الجاية', 'Use as my plan for next GW')}</button>
  <p class="mut sb-tip">${over ? tt('البنك بالسالب، بدّل لاعب بأرخص منه أول.', 'Over budget — swap someone cheaper first.') : tt('تنحفظ بصفحة فريقي، والانتقالات تسويها بتطبيق الفانتازي.', 'Saved to My Team; make the transfers in the FPL app.')}</p>`;
}
function notesOf(g0) {
  const N = [];
  SB.xi.forEach((id) => { const p = PM(id), a = avail(p); if (a < 0.75) N.push({ t: 'b', h: tt(`${p.name}: ${a === 0 ? 'غايب' : `جاهزيته ${Math.round(a * 100)}%`}`, `${p.name}: ${a === 0 ? 'out' : Math.round(a * 100) + '%'}`), d: p.news || tt('الأفضل يقعد بالدكة', 'Better on the bench') }); });
  const bl = SB.xi.filter((id) => !fixturesFor(PM(id).team, g0).length); if (bl.length) N.push({ t: 'b', h: tt(`${bl.length} أساسيين ما يلعبون الجولة ${g0}`, `${bl.length} starters blank`), d: bl.map((id) => PM(id).name).join('، ') });
  const dbl = picked().filter((id) => fixturesFor(PM(id).team, g0).length > 1); if (dbl.length) N.push({ t: 'g', h: tt(`${dbl.length} لاعبين عندهم مباراتين`, `${dbl.length} players double`), d: dbl.map((id) => PM(id).name).join('، ') });
  const left = left10(); if (left >= 15) N.push({ t: 'n', h: tt(`باقي ${m1(left)} بالبنك`, `${m1(left)} unspent`), d: tt('تكدر ترقّي لاعب بالأساسي.', 'Room to upgrade a starter.') });
  const top = [...SB.xi].sort((a, b) => xp5(b) - xp5(a))[0]; if (top && top !== SB.cap) N.push({ t: 'n', h: tt(`${PM(top).name} أعلى متوقع للخمس جولات الجاية`, `${PM(top).name} has the best 5-GW outlook`), d: tt(`الكابتن ${PM(SB.cap).name} هو الأعلى للجولة الجاية.`, 'Captain is best for next GW.') });
  return N;
}

/* ---------- الاختيار ---------- */
function listHTML(pos, rep) {
  const own = new Set(picked()), cl = clubs(), q = Q.trim().toLowerCase(), base = left10() + (rep ? cost10(rep) : 0);
  let ps = ST.G.players.filter((p) => p.pos === pos && !own.has(p.id) && p.st !== 'u' && (!q || `${p.name} ${p.full || ''} ${tName(p.team)}`.toLowerCase().includes(q)));
  const v = (p) => (SORT === 'price' ? -p.price : SORT === 'pts' ? p.total : xp5(p.id));
  ps = ps.sort((a, b) => v(b) - v(a)).slice(0, 50);
  return ps.map((p) => {
    const after = base - cost10(p.id), clubOk = ((cl[p.team] || 0) - (rep && PM(rep).team === p.team ? 1 : 0)) < 3, ok = after >= 0 && clubOk;
    const right = `<div class="sb-r"><b class="num">${p.price.toFixed(1)}</b><small class="${ok ? '' : 'down'}">${!clubOk ? tt('3 من ناديه', '3 from club') : ok ? tt(`يبقى ${m1(after)}`, `${m1(after)} left`) : tt(`ينقصك ${m1(-after)}`, `short ${m1(-after)}`)}</small></div>`;
    return `<div class="sb-it${ok ? '' : ' off'}">${playerRow(p, right, ok ? `sbPut(${p.id})` : `sbNo(${clubOk ? 1 : 0})`)}</div>`;
  }).join('') || `<p class="mut" style="text-align:center;padding:16px">${tt('ماكو نتائج', 'No results')}</p>`;
}
function openPick(pos, i) {
  PICK = { pos, i, rep: SB.slots[pos][i] }; Q = '';
  const budget = left10() + (PICK.rep ? cost10(PICK.rep) : 0);
  openSheet(`${sheetHead(I('i-plus'), PICK.rep ? tt(`بدل ${esc(PM(PICK.rep).name)}`, `Replace ${esc(PM(PICK.rep).name)}`) : tt(`اختار ${POSN()[pos]}`, `Pick a ${POSN()[pos]}`), tt(`المتبقي بالبنك ${m1(budget)}`, `Money left ${m1(budget)}`))}
    <input class="inp sb-q" placeholder="${tt('دوّر باسم اللاعب أو النادي', 'Search player or club')}" oninput="sbQ(this.value)">
    <div class="seg sb-sort">${[['xp', tt('الأعلى متوقع', 'Top xP')], ['pts', tt('الأكثر نقاط', 'Most points')], ['price', tt('الأرخص', 'Cheapest')]].map(([s, l]) => `<button class="${SORT === s ? 'on' : ''}" data-s="${s}" onclick="sbSort('${s}')">${l}</button>`).join('')}</div>
    <div class="list" id="sbList">${listHTML(pos, PICK.rep)}</div>`);
}
const redraw = () => { const el = document.getElementById('sbList'); if (el && PICK) el.innerHTML = listHTML(PICK.pos, PICK.rep); document.querySelectorAll('.sb-sort button').forEach((b) => b.classList.toggle('on', b.dataset.s === SORT)); };
function put(id) {
  if (!PICK) return;
  SB.slots[PICK.pos][PICK.i] = id; SB.xi = null; save(); closeSheet();
  toast(tt(`✓ ${PM(id).name} · باقي بالبنك ${m1(left10())}`, `✓ ${PM(id).name} · ${m1(left10())} left`)); PICK = null; window.render();
}
function slotMenu(pos, i) {
  const id = SB.slots[pos][i], p = PM(id);
  openSheet(`${sheetHead(`<div style="width:46px;height:46px">${pShirt(p)}</div>`, esc(p.name), `${tName(p.team)} · ${p.price.toFixed(1)}`, 'var(--glass2)', '')}
    <div class="sb-menu">
      <button class="btn btn-p btn-b" onclick="closeSheet();sbAdd('${pos}',${i})">${I('i-swap', 'i')}${tt('بدّله بلاعب ثاني', 'Replace')}</button>
      <button class="btn btn-g btn-b" onclick="sbDel('${pos}',${i})">${I('i-trash', 'i')}${tt(`شيله ويرجع ${m1(cost10(id))} للبنك`, `Remove (+${m1(cost10(id))})`)}</button>
      <button class="btn btn-g btn-b" onclick="closeSheet();openPlayer(${id})">${I('i-info', 'i')}${tt('تفاصيل اللاعب', 'Player details')}</button>
    </div>`);
}
function lineTap(id) {
  if (SWAP) {
    if (SWAP === id) SWAP = null;
    else if (canSwap(SWAP, id)) { const inA = SB.xi.includes(SWAP), x = inA ? SWAP : id, y = inA ? id : SWAP; SB.xi = SB.xi.map((k) => (k === x ? y : k)); SB.bench = SB.bench.map((k) => (k === y ? x : k)); if (SB.cap === x) SB.cap = y; if (SB.vc === x) SB.vc = y; SWAP = null; save(); }
    else toast(tt('التشكيلة تصير غلط', 'Invalid formation'));
    return window.render();
  }
  const p = PM(id), inXI = SB.xi.includes(id);
  openSheet(`${sheetHead(`<div style="width:46px;height:46px">${pShirt(p)}</div>`, esc(p.name), `${tt('متوقع الجولة', 'xP')} ${r1(xp(p))}`, 'var(--glass2)', '')}
    <div class="sb-menu">
      <button class="btn btn-g btn-b" onclick="closeSheet();sbSwap(${id})">${I('i-bench', 'i')}${inXI ? tt('بدّله مع لاعب بالدكة', 'Swap with bench') : tt('دخّله للأساسي', 'Bring into XI')}</button>
      ${inXI ? `<div class="sb-two"><button class="btn btn-g" ${SB.cap === id ? 'disabled' : ''} onclick="sbCap(${id},'c')">${I('i-crown', 'i')}${tt('كابتن', 'Captain')}</button><button class="btn btn-g" ${SB.vc === id ? 'disabled' : ''} onclick="sbCap(${id},'v')">${tt('نائب', 'Vice')}</button></div>` : ''}
    </div>`);
}
function apply() {
  if (!full() || left10() < 0) return; lineup();
  const P = basePlan(); if (!P) return;
  const sq = picked(), ins = sq.filter((id) => !P.squad.includes(id)), outs = P.squad.filter((id) => !sq.includes(id)), free = SB.chip === 'wc' || SB.chip === 'fh';
  let ft = P.ft; const pool = [...ins];
  P.transfers = outs.map((o) => { const k = pool.findIndex((x) => PM(x).pos === PM(o).pos); const n = pool.splice(Math.max(0, k), 1)[0]; let cost = 0; if (!free) { if (ft > 0) ft--; else cost = 4; } return { out: o, in: n, cost }; });
  Object.assign(P, { squad: sq, xi: [...SB.xi], bench: [...SB.bench], cap: SB.cap, vc: SB.vc, bank: left10() / 10, ft, chip: SB.chip === 'wc' ? 'wildcard' : SB.chip === 'fh' ? 'freehit' : '' });
  ST.plan = P; savePlan(); toast(tt('✓ صارت خطتك للجولة الجاية بصفحة فريقي', '✓ Saved as your plan'));
}

Object.assign(window, {
  sbAdd: openPick, sbSlot: slotMenu, sbPut: put, sbLine: lineTap, sbApply: apply,
  sbNo: (c) => toast(c ? tt('البنك ما يكفي لهذا اللاعب', 'Not enough money') : tt('عندك 3 لاعبين من ناديه', '3 already from his club')),
  sbDel: (pos, i) => { SB.slots[pos][i] = null; SB.xi = null; save(); closeSheet(); window.render(); },
  sbQ: (v) => { Q = v; redraw(); }, sbSort: (s) => { SORT = s; redraw(); },
  sbView: (v) => { SB.view = v; SWAP = null; save(); window.render(); scrollTo(0, 0); },
  sbSwap: (id) => { SWAP = id; window.render(); },
  sbCap: (id, k) => { if (k === 'c') { if (SB.vc === id) SB.vc = SB.cap; SB.cap = id; } else { if (SB.cap === id) SB.cap = SB.vc; SB.vc = id; } save(); closeSheet(); window.render(); },
  sbChip: (c) => { SB.chip = c; save(); window.render(); },
  sbClear: () => { Object.assign(SB, { slots: blank(), xi: null, view: 'squad' }); save(); window.render(); },
  sbMine: () => { const slots = blank(); SB.base.squad.forEach((id) => { const a = slots[PM(id).pos]; const i = a.indexOf(null); if (i >= 0) a[i] = id; }); Object.assign(SB, { slots, xi: null }); save(); window.render(); },
});
