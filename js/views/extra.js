/* =========================================================
   ثلاث أقسام إضافية:
   1) elite   — فريقك مقابل أفضل 10,000 (ملكية المتصدرين)
   2) watch   — قائمة المراقبة (سعر، إصابة، مباريات، متوقع)
   3) planner — خطة انتقالات لأربع جولات
========================================================= */
import { ST, PM, tShort } from '../store.js';
import { tt, t } from '../i18n.js';
import { esc, I, fmt, toast, openSheet, closeSheet, sheetHead, LS } from '../ui.js';
import { xp, xpN, bestXI, fixturesFor, r1 } from '../engine.js';
import { pricePredict, PRICE_LABEL } from '../predict.js';
import { pShirt, playerRow, stTag } from './common.js';
import { tip } from '../tips.js';

const fxNext = (p, n = 3) => { const out = []; for (let g = ST.G.next; g < ST.G.next + n && g <= (ST.G.lastGW || 38); g++) { const f = fixturesFor(p.team, g); out.push(f.length ? f.map((x) => `<i class="fxc f${x.fdr}">${tShort(x.opp)}${x.home ? '' : '<small>@</small>'}</i>`).join('') : '<i class="fxc blank">—</i>'); } return out.join(''); };

/* ---------------------------------------------------------
   1) فريقك مقابل أفضل 10,000
--------------------------------------------------------- */
let EL = { gw: 0, d: null, busy: false };
async function loadElite() {
  if (EL.busy) return; EL.busy = true;
  const cur = ST.G.cur;
  for (const g of [cur, cur - 1]) {
    if (g < 1) continue;
    try { const r = await fetch(`/data/captains/gw${g}.json`, { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (d?.own?.length) { EL = { gw: g, d, busy: false }; break; } } } catch {}
  }
  if (!EL.d) EL = { gw: cur, d: { none: true }, busy: false };
  if (ST.view === 'elite') window.render();
}
export function vElite() {
  const hero = (sub) => `<section class="hero"><div class="mut" style="font-size:12.5px">${tt('فريقك مقابل أفضل 10,000 مدرب بالعالم', 'Your team vs the top 10k')}</div>${sub}</section>`;
  if (!EL.d) { loadElite(); return hero('') + `<div class="card aiload" style="margin-top:12px"><i></i><i></i><i></i><span>${t('loading')}</span></div>`; }
  if (EL.d.none) return hero('') + `<div class="empty" style="margin-top:12px;padding:22px;text-align:center">${tt('بيانات ملكية أفضل 10,000 تنحسب بعد كل ديدلاين (تاخذ حوالي ساعة). ارجع بعد شوية.', 'Top-10k ownership is computed after each deadline (about an hour). Check back soon.')}</div>`;
  const d = EL.d, own = Object.fromEntries(d.own.map((x) => [x.id, x]));
  const mineIds = (ST.E.picks?.picks || []).map((x) => x.element), mine = new Set(ST.plan?.squad?.length ? ST.plan.squad : mineIds);
  const tpl = d.own.slice().sort((a, b) => b.o - a.o).slice(0, 15), tplSum = tpl.reduce((a, x) => a + x.o, 0);
  const sim = Math.round(([...mine].reduce((a, id) => a + Math.min(own[id]?.o || 0, 100), 0) / Math.max(1, tplSum)) * 100);
  const miss = d.own.filter((x) => !mine.has(x.id) && x.o >= 12 && PM(x.id)).sort((a, b) => b.o - a.o).slice(0, 10);
  const diff = [...mine].map((id) => ({ id, o: own[id]?.o || 0, s: own[id]?.s || 0 })).filter((x) => x.o < 10 && PM(x.id)).sort((a, b) => a.o - b.o);
  const shared = [...mine].map((id) => ({ id, o: own[id]?.o || 0, s: own[id]?.s || 0 })).filter((x) => x.o >= 10 && PM(x.id)).sort((a, b) => b.o - a.o);
  const row = (x, cls) => { const p = PM(x.id); return `<div class="row tap" onclick="openPlayer(${p.id})"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)} ${stTag(p)}</b><span><bdi>${tShort(p.team)}</bdi> · <bdi>${p.price.toFixed(1)}م</bdi> · ${tt('متوقع', 'xP')} ${xp(p)}</span></div><div class="el-own ${cls}"><b class="num">${x.o}%</b><div><i style="width:${Math.min(100, x.o)}%"></i></div><small>${tt('يبدأ بيه', 'start')} ${x.s}%</small></div></div>`; };
  const sec = (ic, title, sub, list, cls, empty) => `<div class="sec"><h2>${I(ic)}${title}</h2><span class="mut" style="font-size:12px">${list.length}</span></div><p class="el-sub">${sub}</p>${list.length ? `<div class="list">${list.map((x) => row(x, cls)).join('')}</div>` : `<div class="card mut" style="font-size:13px">${empty}</div>`}`;
  return hero(`<div class="flex" style="gap:10px;align-items:baseline;margin-top:4px"><span class="big-num count" style="font-size:46px;line-height:1.05">${sim}</span><span class="mut" style="font-size:13px">% ${tt('تشابه ويا تشكيلة المتصدرين', 'similar to the elite template')}</span></div>
     <div class="kpis" style="margin-top:12px"><div><small>${tt('ناقصك منهم', 'You lack')}</small><b class="num">${miss.length}</b></div><div><small>${tt('مميزين عندك', 'Differentials')}</small><b class="num">${diff.length}</b></div><div><small>${tt('الجولة', 'GW')}</small><b class="num">${EL.gw}</b></div></div>`)
    + sec('i-alert', tt('عند المتصدرين وما عندك', 'They own, you don’t'), tt('إذا سجّلوا تنزل بالترتيب — أعلى ملكية أول', 'If these haul, you drop'), miss, 'bad', tt('ما ناقصك أحد من المهمين', 'You have all the key players'))
    + sec('i-sparkle', tt('مميزين عندك', 'Your differentials'), tt('قليل من المتصدرين عندهم — إذا سجّلوا تصعد', 'Few elites own these — hauls lift you'), diff, 'good', tt('فريقك كله من لاعبين المتصدرين', 'No differentials'))
    + sec('i-users', tt('مشتركين وياهم', 'Shared with the elite'), tt('نقاطهم ما تغيّر ترتيبك هواي', 'Their points barely move your rank'), shared, 'mid', '—')
    + `<p class="mut" style="font-size:11.5px;margin:12px 4px">${tt(`عيّنة: ${fmt(d.sample)} مدرب من أفضل 10,000 بالترتيب العام · الجولة ${EL.gw}`, `Sample: ${fmt(d.sample)} of the top 10k · GW${EL.gw}`)}</p>`;
}

/* ---------------------------------------------------------
   2) قائمة المراقبة
--------------------------------------------------------- */
let wq = '';
export function vWatch() {
  const ids = [...ST.watch].filter((id) => PM(id));
  const card = (p) => { const pr = pricePredict(p), ps = pr.state, pc = ps.includes('rise') ? 'good' : ps.includes('fall') ? 'bad' : 'mid';
    return `<div class="card wt-card"><div class="wt-top" onclick="openPlayer(${p.id})"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)} ${stTag(p)}</b><span><bdi>${tShort(p.team)}</bdi> · ${t({ GK: 'gk', DEF: 'def', MID: 'mid', FWD: 'fwd' }[p.pos]) || p.pos}</span></div><button class="icon-btn" onclick="event.stopPropagation();toggleWatch(${p.id});render()" aria-label="remove">${I('i-x')}</button></div>
      <div class="wt-grid"><div><small>${tt('السعر', 'Price')}</small><b class="num">${p.price.toFixed(1)}</b></div><div><small>${tt('المتوقع', 'xP')}</small><b class="num">${xp(p)}</b></div><div><small>${tt('3 جولات', '3 GWs')}</small><b class="num">${xpN(p, ST.G.next, 3)}</b></div><div><small>${tt('الفورم', 'Form')}</small><b class="num">${p.form}</b></div><div><small>${tt('الملكية', 'Own')}</small><b class="num">${p.own}%</b></div></div>
      <div class="wt-foot"><span class="wt-pr ${pc}">${ps === 'stable' ? tt('سعره ثابت', 'Price stable') : PRICE_LABEL(ps, tt)}${pr.prog ? ` · <span dir="ltr">${pr.prog}%</span>` : ''}</span><span class="wt-fx">${fxNext(p)}</span></div>
      ${p.news ? `<p class="wt-news">${esc(p.news)}</p>` : ''}</div>`; };
  const q = wq.trim().toLowerCase();
  const found = q.length >= 2 ? ST.G.players.filter((p) => p.st !== 'u' && !ST.watch.has(p.id) && (p.name.toLowerCase().includes(q) || (p.full || '').toLowerCase().includes(q))).sort((a, b) => b.own - a.own).slice(0, 6) : [];
  return `<section class="hero"><div class="mut" style="font-size:12.5px">${tt('قائمة المراقبة', 'Watchlist')}</div><div class="flex" style="gap:10px;align-items:baseline;margin-top:4px"><span class="big-num" style="font-size:42px;line-height:1.05">${ids.length}</span><span class="mut" style="font-size:13px">${tt('لاعب تراقبه', 'players watched')}</span></div>
    <p class="mut" style="font-size:12px;line-height:1.7;margin-top:8px">${tt('يوصلك إشعار إذا سعر واحد منهم راح يتغيّر، أو تصاب، أو رجع جاهز، أو نزل عنه خبر — إذا الإشعارات مفعّلة.', 'You get a push when a price is about to change, an injury or return happens, or news drops.')}</p></section>
   <div class="searchbox" style="margin-top:12px">${I('i-search')}<input id="wtQ" placeholder="${tt('ضيف لاعب للمراقبة…', 'Add a player…')}" value="${esc(wq)}" oninput="wtSearch(this.value)"></div>
   <div id="wtFound">${found.length ? `<div class="list" style="margin-top:8px">${found.map((p) => playerRow(p, `<button class="btn btn-p btn-sm" onclick="event.stopPropagation();wtAdd(${p.id})">${tt('راقب', 'Watch')}</button>`)).join('')}</div>` : ''}</div>
   ${ids.length ? `<div class="wt-list">${ids.map((id) => card(PM(id))).join('')}</div>` : `<div class="empty" style="margin-top:14px;padding:22px;text-align:center">${tt('القائمة فارغة. دوّر على لاعب فوك، أو اضغط ⭐ بصفحة أي لاعب.', 'Empty. Search above or tap ⭐ on any player page.')}</div>`}`;
}
Object.assign(window, {
  wtSearch: (v) => { wq = v; clearTimeout(window.__wtT); window.__wtT = setTimeout(() => { window.render(); const i = document.getElementById('wtQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); },
  wtAdd: (id) => { wq = ''; const i = document.getElementById('wtQ'); if (i) i.value = ''; window.toggleWatch(id); window.render(); },
});

/* ---------------------------------------------------------
   3) خطة الانتقالات لعدة جولات
--------------------------------------------------------- */
const pk = () => `fp_mplan_${ST.profile?.teamId}`;
let MP = null, mgw = 0;
const H = 4;
function mpLoad() {
  if (MP && MP.team === ST.profile.teamId && MP.from === ST.G.next) return;
  const s = ST.profile?.mplan || LS.get(pk());
  MP = s && s.team === ST.profile.teamId && s.from === ST.G.next ? s : { team: ST.profile.teamId, from: ST.G.next, moves: {} };
  mgw = ST.G.next;
}
function mpSave() { LS.set(pk(), MP); window.__saveProfile?.({ mplan: MP }); }
const gwsOf = () => { const out = []; for (let g = ST.G.next; g < ST.G.next + H && g <= (ST.G.lastGW || 38); g++) out.push(g); return out; };
const cnt = (squad, team) => squad.filter((id) => PM(id).team === team).length;
/** يمشي على الجولات ويحسب الفريق والبنك والانتقالات المجانية والمتوقع لكل جولة */
function simulate(withMoves = true) {
  const base = window.__basePlan?.(); if (!base) return null;
  let squad = [...base.squad], bank = base.bank, ft = Math.max(0, Math.min(5, base.ft ?? 1));
  const out = [];
  gwsOf().forEach((g, k) => {
    if (k > 0) ft = Math.min(5, ft + 1);
    const mv = withMoves ? (MP.moves[g] || []).filter((m) => squad.includes(m.out) && !squad.includes(m.in) && PM(m.in) && PM(m.out)) : [];
    mv.forEach((m) => { squad = squad.map((id) => (id === m.out ? m.in : id)); bank = r1(bank + PM(m.out).price - PM(m.in).price); });
    const used = mv.length, hit = Math.max(0, used - ft) * 4, ftStart = ft; ft = Math.max(0, ft - used);
    const b = bestXI(squad, g), pts = r1(b.xi.reduce((a, id) => a + xp(PM(id), g) * (id === b.cap ? 2 : 1), 0));
    out.push({ g, squad: [...squad], bank, ftStart, used, hit, xi: b.xi, bench: b.bench, cap: b.cap, pts, net: r1(pts - hit), mv });
  });
  return out;
}
/* سيناريوهات المحاكاة: تحفظ الخطة الحالية بأرقامها، وتقارنها بغيرها، وترجعها أو تحذفها. ما تنفذ أي انتقال رسمي */
const sk = () => `fp_mscen_${ST.profile?.teamId}`;
const scenList = () => (LS.get(sk()) || []).filter((x) => x.from === ST.G.next);
function scenHTML(tot, gain, n, hitsAll) {
  const L = scenList(), same = (x) => JSON.stringify(x.moves) === JSON.stringify(MP.moves), best = L.length ? Math.max(...L.map((x) => x.tot)) : null;
  return `${tip('scen', tt('جديد: احفظ خطتك كسيناريو، جرّب غيرها، وقارن النقاط المتوقعة بيناتهم.', 'New: save and compare scenarios.'))}<div class="card sc"><div class="sc-h"><b>${tt('مقارنة السيناريوهات', 'Compare scenarios')}</b>${n && !L.some(same) ? `<button class="btn btn-p btn-sm" onclick="mpScenSave()">${I('i-plus', 'i', 'width:14px;height:14px')}${tt('احفظ هالسيناريو', 'Save this')}</button>` : ''}</div>
    ${L.length ? `<div class="sc-l">${L.map((x, i) => `<div class="sc-r ${same(x) ? 'on' : ''}"><div class="sc-i"><b>${esc(x.name)}${x.tot === best && L.length > 1 ? `<em>${tt('الأعلى', 'Top')}</em>` : ''}</b><small>${tt(`${x.n} انتقال`, `${x.n} moves`)}${x.hits ? ` · <bdi>−${x.hits}</bdi>` : ''} · ${tt('الربح', 'gain')} <bdi>${x.gain >= 0 ? '+' : ''}${x.gain}</bdi></small></div><b class="num sc-t">${x.tot}</b><button class="sc-a" onclick="mpScenLoad(${i})" aria-label="${tt('افتح', 'Load')}">${I('i-history', 'i')}</button><button class="sc-a" onclick="mpScenDel(${i})" aria-label="${tt('احذف', 'Delete')}">${I('i-trash', 'i')}</button></div>`).join('')}</div>
      <p class="sc-n">${tt(`الحالي: ${tot} نقطة متوقعة`, `Current: ${tot} xP`)}</p>` : `<p class="sc-n">${n ? tt('احفظ خطتك الحالية، جرّب غيرها، وقارن بينهم هنا.', 'Save this plan, try another and compare here.') : tt('سوّ انتقال بالخطة حتى تكدر تحفظه كسيناريو.', 'Add a move to save it as a scenario.')}</p>`}</div>`;
}

export function vPlanner() {
  mpLoad();
  const S = simulate(true), B = simulate(false);
  if (!S) return `<div class="empty">${t('noData')}</div>`;
  const tot = r1(S.reduce((a, x) => a + x.net, 0)), base = r1(B.reduce((a, x) => a + x.net, 0)), gain = r1(tot - base), hitsAll = S.reduce((a, x) => a + x.hit, 0), nMoves = S.reduce((a, x) => a + x.used, 0);
  if (!S.some((x) => x.g === mgw)) mgw = S[0].g;
  const cur = S.find((x) => x.g === mgw), prev = S[S.indexOf(cur) - 1];
  const strip = `<div class="mp-gws">${S.map((x) => `<button class="${x.g === mgw ? 'on' : ''}" onclick="mpGW(${x.g})"><small>${t('gw')} ${x.g}</small><b class="num">${x.net}</b><em class="${x.used ? (x.hit ? 'bad' : 'good') : ''}">${x.used ? `${x.used} ${tt('انتقال', 'mv')}${x.hit ? ` −${x.hit}` : ''}` : tt('بلا انتقال', 'no move')}</em></button>`).join('')}</div>`;
  const moves = cur.mv.map((m, i) => { const o = PM(m.out), n = PM(m.in), d = r1(xp(n, cur.g) - xp(o, cur.g)); return `<div class="mp-mv"><div class="mp-p out"><div class="mini">${pShirt(o)}</div><div><b>${esc(o.name)}</b><small><bdi>${o.price.toFixed(1)}م</bdi> · ${xp(o, cur.g)}</small></div></div><span class="mp-ar">${I('i-swap')}</span><div class="mp-p in"><div class="mini">${pShirt(n)}</div><div><b>${esc(n.name)}</b><small><bdi>${n.price.toFixed(1)}م</bdi> · ${xp(n, cur.g)}</small></div></div><em class="${d >= 0 ? 'good' : 'bad'}" dir="ltr">${d >= 0 ? '+' : ''}${d}</em><button class="icon-btn" onclick="mpDel(${cur.g},${i})" aria-label="remove">${I('i-x')}</button></div>`; }).join('');
  const xiList = cur.xi.map((id) => PM(id)).sort((a, b) => xp(b, cur.g) - xp(a, cur.g)).slice(0, 5).map((p) => `<span class="mp-chip ${p.id === cur.cap ? 'cap' : ''}">${esc(p.name)} <b class="num">${xp(p, cur.g)}</b>${p.id === cur.cap ? ' ©' : ''}</span>`).join('');
  return `<section class="hero"><div class="mut" style="font-size:12.5px">${tt(`خطة الانتقالات · ${S.length} جولات`, `Transfer plan · ${S.length} GWs`)}</div>
     <div class="flex" style="gap:10px;align-items:baseline;flex-wrap:wrap;margin-top:4px"><span class="big-num count" style="font-size:46px;line-height:1.05">${tot}</span><span class="mut" style="font-size:13px">${tt('نقطة متوقعة', 'projected pts')}</span>${nMoves ? `<span class="ss-diff ${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '▲ +' : '▼ '}${gain} ${tt('عن بلا انتقالات', 'vs no moves')}</span>` : ''}</div>
     <div class="kpis" style="margin-top:12px"><div><small>${tt('الانتقالات', 'Moves')}</small><b class="num">${nMoves}</b></div><div><small>${tt('الخصومات', 'Hits')}</small><b class="num ${hitsAll ? 'down' : ''}">${hitsAll ? '−' + hitsAll : 0}</b></div><div><small>${tt('البنك بالنهاية', 'Bank after')}</small><b class="num">${S[S.length - 1].bank.toFixed(1)}</b></div></div></section>
   ${strip}
   <div class="card mp-card"><div class="mp-head"><div><b>${t('gw')} ${cur.g}</b><small>${tt('انتقالات مجانية', 'Free transfers')}: <b class="num">${cur.ftStart}</b> · ${tt('البنك', 'Bank')}: <b class="num">${(prev ? prev.bank : (window.__basePlan?.().bank ?? 0)).toFixed(1)}</b></small></div><button class="btn btn-p btn-sm" onclick="mpAdd(${cur.g})">${I('i-swap', 'i', 'width:15px;height:15px')}${tt('أضف انتقال', 'Add move')}</button></div>
     ${moves || `<p class="mp-empty">${tt('ماكو انتقالات بهاي الجولة — تتدوّر انتقالاتك المجانية للجولة الجاية (الحد 5).', 'No moves — your free transfer rolls over (max 5).')}</p>`}
     <div class="mp-xi"><small>${tt('أفضل تشكيلة متوقعة', 'Best XI')} · ${tt('المتوقع', 'xP')} <b class="num">${cur.pts}</b>${cur.hit ? ` · ${tt('بعد الخصم', 'net')} <b class="num">${cur.net}</b>` : ''}</small><div>${xiList}</div></div></div>
   <div class="flex" style="gap:8px;margin-top:10px"><button class="btn btn-g" style="flex:1" onclick="mpAuto()">${I('i-sparkle', 'i', 'width:15px;height:15px')}${tt('اقترح خطة', 'Suggest a plan')}</button>${nMoves ? `<button class="btn btn-g" onclick="mpClear()">${tt('مسح', 'Clear')}</button>` : ''}</div>
   ${scenHTML(tot, gain, nMoves, hitsAll)}
   <p class="mut" style="font-size:11.5px;line-height:1.7;margin:12px 4px">${tt('الأسعار الحالية، والانتقالات المجانية تقديرية من سجلك. الخطة تنحفظ بحسابك وتبدي من جديد بعد كل ديدلاين. هذا مخطط للتجربة وما يغيّر فريقك بالفانتازي.', 'Uses current prices; free transfers are estimated. Saved to your account, resets each deadline. Planning only — it does not change your FPL team.')}</p>`;
}
function stateBefore(g) { const S = simulate(true); const i = S.findIndex((x) => x.g === g); const base = window.__basePlan(); return i > 0 ? { squad: S[i - 1].squad, bank: S[i - 1].bank } : { squad: base.squad, bank: base.bank }; }
function stateAt(g) { const S = simulate(true); const x = S.find((y) => y.g === g); return { squad: x.squad, bank: x.bank }; }
function pickOut(g) {
  const st = stateAt(g);
  const rows = st.squad.map((id) => PM(id)).sort((a, b) => xpN(a, g, 3) - xpN(b, g, 3)).map((p) => playerRow(p, `<div class="col num" style="font-size:14px">${xpN(p, g, 3)}<small>${tt('3 جولات', '3 GWs')}</small></div>`, `mpOut(${g},${p.id})`)).join('');
  openSheet(`${sheetHead(I('i-swap'), tt(`الجولة ${g}: منو يطلع؟`, `GW${g}: who goes out?`))}<p class="mut" style="font-size:12px;margin:2px 2px 10px">${tt('مرتبين من الأضعف متوقعاً بالجولات الثلاث الجاية', 'Sorted by weakest 3-GW projection')}</p><div class="list">${rows}</div>`);
}
function candidates(g, outId) {
  const st = stateAt(g), o = PM(outId), budget = r1(st.bank + o.price), rest = st.squad.filter((id) => id !== outId);
  return ST.G.players.filter((p) => p.pos === o.pos && p.st !== 'u' && !st.squad.includes(p.id) && p.price <= budget + 1e-9 && cnt(rest, p.team) < 3)
    .map((p) => ({ p, v: xpN(p, g, 3) })).sort((a, b) => b.v - a.v);
}
function pickIn(g, outId, q = '') {
  const o = PM(outId), all = candidates(g, outId), ql = q.trim().toLowerCase();
  const list = (ql ? all.filter((x) => x.p.name.toLowerCase().includes(ql) || (x.p.full || '').toLowerCase().includes(ql)) : all).slice(0, 25);
  const base = xpN(o, g, 3);
  const html = `${sheetHead(I('i-swap'), tt(`بدل ${o.name}`, `Replace ${o.name}`))}<div class="searchbox" style="margin-bottom:10px">${I('i-search')}<input id="mpQ" placeholder="${tt('دوّر على لاعب…', 'Search…')}" value="${esc(q)}" oninput="mpQ(${g},${outId},this.value)"></div>
    <div class="list" id="mpList">${list.length ? list.map((x) => { const d = r1(x.v - base); return playerRow(x.p, `<div class="col num" style="font-size:14px;color:${d >= 0 ? 'var(--acc)' : 'var(--bad)'}" dir="ltr">${d >= 0 ? '+' : ''}${d}<small style="color:var(--mut)">${tt('3 جولات', '3 GWs')}</small></div>`, `mpIn(${g},${outId},${x.p.id})`); }).join('') : `<div class="row mut">${tt('ماكو بديل ضمن الميزانية وحد 3 لاعبين من النادي', 'No valid replacement in budget')}</div>`}</div>`;
  if (document.getElementById('mpList') && document.getElementById('mpQ')) { const tmp = document.createElement('div'); tmp.innerHTML = html; document.getElementById('mpList').innerHTML = tmp.querySelector('#mpList').innerHTML; }
  else openSheet(html);
}
Object.assign(window, {
  mpGW: (g) => { mgw = g; window.render(); },
  mpAdd: (g) => pickOut(g),
  mpOut: (g, id) => pickIn(g, id),
  mpQ: (g, o, v) => { clearTimeout(window.__mpT); window.__mpT = setTimeout(() => pickIn(g, o, v), 200); },
  mpIn: (g, o, n) => { (MP.moves[g] = MP.moves[g] || []).push({ out: o, in: n }); mpSave(); closeSheet(true); window.render(); toast(tt('انضاف الانتقال للخطة', 'Move added')); },
  mpDel: (g, i) => { const S = simulate(true).find((x) => x.g === g); const m = S?.mv[i]; if (m) MP.moves[g] = (MP.moves[g] || []).filter((x) => !(x.out === m.out && x.in === m.in)); mpSave(); window.render(); },
  mpClear: () => { MP.moves = {}; mpSave(); window.render(); },
  /* اقتراح: بكل جولة أفضل انتقال واحد مجاني حسب متوقع الجولات الباقية (إذا يزيد نقطة ونص أو أكثر) */
  mpScenSave: () => { const S = simulate(true), B = simulate(false); if (!S) return; const L = LS.get(sk()) || [], cur = L.filter((x) => x.from === ST.G.next);
    const tot = r1(S.reduce((a, x) => a + x.net, 0)), base = r1(B.reduce((a, x) => a + x.net, 0));
    cur.push({ name: tt(`سيناريو ${cur.length + 1}`, `Scenario ${cur.length + 1}`), from: ST.G.next, moves: JSON.parse(JSON.stringify(MP.moves)), tot, gain: r1(tot - base), n: S.reduce((a, x) => a + x.used, 0), hits: S.reduce((a, x) => a + x.hit, 0), t: Date.now() });
    LS.set(sk(), cur.slice(-5)); toast(tt('انحفظ السيناريو', 'Scenario saved')); window.render(); },
  mpScenLoad: (i) => { const x = scenList()[i]; if (!x) return; MP.moves = JSON.parse(JSON.stringify(x.moves)); mpSave(); window.render(); toast(tt(`رجّعت ${x.name}`, `Loaded ${x.name}`)); },
  mpScenDel: (i) => { const L = scenList(); L.splice(i, 1); LS.set(sk(), L); window.render(); },
  mpAuto: () => {
    MP.moves = {};
    gwsOf().forEach((g, k, arr) => {
      const S = simulate(true).find((x) => x.g === g); if (!S || S.ftStart < 1) return;
      const left = arr.length - k; let best = null;
      S.squad.forEach((id) => { const o = PM(id), ov = xpN(o, g, left); const c = candidates(g, id)[0]; if (!c) return; const cv = xpN(c.p, g, left), d = cv - ov; if (!best || d > best.d) best = { out: id, in: c.p.id, d }; });
      if (best && best.d >= 1.5) MP.moves[g] = [{ out: best.out, in: best.in }];
    });
    mpSave(); window.render(); toast(Object.keys(MP.moves).length ? tt('هاي أفضل خطة بلا خصومات', 'Best no-hit plan') : tt('فريقك زين — ماكو انتقال يستاهل', 'No move worth making'));
  },
});
