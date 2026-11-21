/* مكونات مشتركة بين الأقسام */
import { ST, tShort, tName, PM, savePlan } from '../store.js';
import { t, tt } from '../i18n.js';
import { esc, I, shirt, crest, posTag, fdr, spark, toast, openSheet, closeSheet, sheetHead, fmt, r1, RATE_TXT, LS, scoreHTML, fxMin } from '../ui.js';
import { xp, xpN, fixturesFor, avail, avgFdr, canBuy } from '../engine.js';
import * as FPL from '../fpl.js';
import * as AU from '../auth.js';

export const pShirt = (p, cls = '') => shirt(tShort(p.team), p.pos, cls);
export const fxLabel = (team, gw = ST.G.next) => { const f = fixturesFor(team, gw); return f.length ? f.map((x) => `${tShort(x.opp)} (${x.home ? t('home_s') : t('away_s')})`).join(' + ') : tt('لا مباراة', 'No match'); };
export const fdrChips = (team, from, n) => Array.from({ length: n }, (_, i) => from + i).filter((g) => g <= ST.G.lastGW).map((g) => { const f = fixturesFor(team, g); return f.length ? f.map((x) => `<span class="rate f${x.fdr}" title="GW${g}">${tShort(x.opp)}${x.home ? '' : '*'}</span>`).join('') : '<span class="rate" style="background:#1f2944;color:#94A3B8">—</span>'; }).join(' ');
export const stTag = (p) => { const a = avail(p); if (p.st === 's') return `<span class="tag red" style="font-size:10px">${tt('موقوف', 'Susp.')}</span>`; return a === 1 ? '' : `<span class="tag ${a === 0 ? 'red' : 'amber'}" style="font-size:10px">${a === 0 ? tt('غائب', 'Out') : Math.round(a * 100) + '%'}</span>`; };
export function playerRow(p, right = '', click = `openPlayer(${p.id})`) {
  const mine = ST.plan?.squad.includes(p.id);
  return `<div class="row tap" onclick="${click}"><div class="mini">${pShirt(p)}</div><div class="info"><b>${posTag(p.pos)} ${esc(p.name)} ${stTag(p)} ${mine ? `<span class="tag lime" style="font-size:10px">${tt('بفريقك', 'Yours')}</span>` : ''}${ST.watch.has(p.id) ? I('i-star', 'i', 'width:13px;height:13px;color:#34D399;fill:#34D399;fill-opacity:1;vertical-align:middle') : ''}</b><span>${tName(p.team)} · <bdi>${p.price.toFixed(1)}م</bdi> · ${fxLabel(p.team)}</span></div>${right}</div>`;
}
export const RISK_NOTE = (p) => (p.news ? `<div class="note" style="border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.07)">${I('i-alert', 'i', 'color:#F59E0B')}<span>${esc(p.news)}</span></div>` : '');

/* ---------- صفحة اللاعب الكاملة ---------- */
const sumCache = new Map();
export async function playerSummary(id) { if (sumCache.has(id)) return sumCache.get(id); const d = await FPL.loadPlayerSummary(id); sumCache.set(id, d); return d; }
export function openPlayer(id) {
  const p = PM(id), G = ST.G; if (!p) return;
  const mine = ST.plan?.squad.includes(id), inXI = ST.plan?.xi.includes(id), ov = ST.overrides?.[id];
  const nexts = Array.from({ length: 6 }, (_, i) => G.next + i).filter((g) => g <= G.lastGW);
  const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  openSheet(`${sheetHead(`<div style="width:46px;height:46px">${pShirt(p)}</div>`, esc(p.full || p.name), `${t(({ GK: 'gk', DEF: 'def', MID: 'mid', FWD: 'fwd' })[p.pos])} · ${tName(p.team)}`, 'var(--glass2)', '')}
   <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${stTag(p) || `<span class="tag lime">${tt('جاهز', 'Available')}</span>`}<span class="tag"><bdi>${p.price.toFixed(1)}م</bdi> ${p.cc > 0 ? '<span class="up">▲</span>' : p.cc < 0 ? '<span class="down">▼</span>' : ''}</span><span class="tag">${t('own')} ${p.own}%</span>${p.pen ? `<span class="tag sp-tag ${p.pen === 1 ? 'one' : ''}">🎯 ${tt('الجزاء', 'Pens')} ${p.pen}</span>` : ''}${p.cor ? `<span class="tag sp-tag ${p.cor === 1 ? 'one' : ''}">🚩 ${tt('الركنيات', 'Corners')} ${p.cor}</span>` : ''}${p.dfk ? `<span class="tag sp-tag ${p.dfk === 1 ? 'one' : ''}">⚡ ${tt('الفاولات', 'FKs')} ${p.dfk}</span>` : ''}${mine ? `<span class="tag lime">${tt('بفريقك', 'In your team')}</span>` : ''}</div>
   ${RISK_NOTE(p)}${window.__EMBED?.isEst(id) ? `<div class="note" style="border-color:rgba(96,165,250,.35)">${I('i-alert', 'i', 'color:#60A5FA')}<span>${tt('الاسم والنادي والسعر والإصابة حقيقية؛ باقي الإحصاءات تقديرية بنسخة المحادثة.', 'Name, club, price and injury are real; other stats are estimates in this in-chat version.')}</span></div>` : ''}${ov?.note ? `<div class="note">${I('i-msg', 'i', 'color:#60A5FA')}<span><b>${tt('ملاحظة الإدارة', 'Admin note')}:</b> ${esc(ov.note)}</span></div>` : ''}
   <div class="kv" style="grid-template-columns:repeat(4,1fr)">${stat(p.total, t('total'))}${stat(p.form, t('form'))}${stat(p.ppg, tt('نقطة/مباراة', 'PPG'))}${stat(xp(p), tt('متوقع ج', 'xP GW') + G.next)}
    ${stat(p.gls, t('goals'))}${stat(p.ast, t('assists'))}${stat(p.xg.toFixed(1), 'xG')}${stat(p.xa.toFixed(1), 'xA')}
    ${stat(fmt(p.min), t('minutes'))}${stat(p.starts ?? '—', t('starts'))}${stat(p.cs, t('cs'))}${stat(p.bonus, t('bonus'))}
    ${stat(p.yc, t('yc'))}${stat(p.rc, t('rc'))}${stat(p.ict.toFixed(1), 'ICT')}${stat(r1(p.total / p.price), tt('نقطة/مليون', 'Pts/£m'))}</div>
   <div class="sec" style="margin:10px 2px 6px"><h2 style="font-size:15px">${I('i-chart')}${tt('نقاطه بكل جولة', 'Points per GW')}</h2><span class="mut" style="font-size:11.5px" id="psLast5"></span></div>
   <div id="psHist"><div class="aiload"><i></i><i></i><i></i><span>${t('loading')}</span></div></div>
   <div id="psIntel"></div>
   <div class="sec" style="margin:12px 2px 6px"><h2 style="font-size:15px">${I('i-cal')}${tt('المباريات القادمة', 'Upcoming fixtures')}</h2></div>
   <div class="nx5">${nexts.map((g) => { const f = fixturesFor(p.team, g); return f.length ? f.map((x) => `<button><small>GW${g}</small>${crest(tShort(x.opp), 30)}<b>${tShort(x.opp)}</b><span class="rate f${x.fdr}">${x.home ? t('home_s') : t('away_s')}</span></button>`).join('') : `<button><small>GW${g}</small><b>—</b></button>`; }).join('')}</div>
   <p class="mut" style="font-size:11px;margin-top:6px">${tt('الفرص الكبيرة والتسديدات ما ينشرها الفانتازي الرسمي، فنعرض مؤشر التهديد (Threat) بدالها:', 'Big chances and shots are not published by FPL; Threat index shown instead:')} <b>${p.threat.toFixed(0)}</b></p>
   <div class="acts">${mine ? `${inXI ? `<button class="btn btn-g" onclick="setCap(${id})">${I('i-star')}${t('captain')}</button><button class="btn btn-g" onclick="setVC(${id})">${I('i-star')}${t('vice')}</button>` : ''}<button class="btn btn-g" onclick="startSwap(${id})">${I('i-swap')}${tt('تبديل', 'Swap')}</button><button class="btn btn-g" onclick="sellFlow(${id})">${I('i-coin')}${tt('بيع/استبدال', 'Sell')}</button>`
    : `<button class="btn btn-p" onclick="buyFlow(${id})">${I('i-plus')}${tt('شراء بالخطة', 'Buy (plan)')}</button>`}
    <button class="btn btn-g" onclick="toggleWatch(${id})">${I('i-star')}${ST.watch.has(id) ? tt('إزالة من المراقبة', 'Unwatch') : t('watchlist')}</button><button class="btn btn-g" onclick="addCompare(${id})">${I('i-chart')}${t('compare')}</button></div>`);
  playerSummary(id).then((d) => {
    const el = document.getElementById('psHist'); if (!el) return;
    const h = d.history || []; if (!h.length) { el.innerHTML = `<p class="mut">${t('noData')}</p>`; return; }
    const vals = h.map((r) => r.total_points), mx = Math.max(...vals, 1), last5 = vals.slice(-5);
    document.getElementById('psLast5').textContent = tt(`آخر 5: ${last5.reduce((a, b) => a + b, 0)} نقطة`, `Last 5: ${last5.reduce((a, b) => a + b, 0)} pts`);
    el.innerHTML = `<div class="pbars">${h.map((r) => `<button class="${mine ? 'own' : ''}" onclick="gwDetail(${id},${r.round})"><b>${r.total_points}</b><i style="height:${Math.max(4, r.total_points / mx * 100)}%;background:${r.total_points >= 8 ? '#10B981' : r.total_points >= 4 ? '#34D399' : r.total_points >= 1 ? '#FB7185' : '#EF4444'}"></i><span>${r.round}</span></button>`).join('')}</div>`;
    try { playerIntel(p, h, mine); } catch (e) { /* البطاقة الذكية إضافة، ما توقف الأساسي */ }
  }).catch((e) => { const el = document.getElementById('psHist'); if (el) el.innerHTML = `<p class="mut">${esc(e.message)}</p>`; });
}
export function gwDetail(id, gw) {
  const p = PM(id), d = sumCache.get(id); const r = d?.history?.find((x) => x.round === gw); if (!r) return;
  const SC = ST.scoring || {}; const gp = { GK: SC.goalGK ?? 10, DEF: SC.goalDEF ?? 6, MID: SC.goalMID ?? 5, FWD: SC.goalFWD ?? 4 }[p.pos];
  const parts = []; if (r.minutes) parts.push(r.minutes >= 60 ? tt('لعب 60+ دقيقة (+2)', '60+ mins (+2)') : tt('لعب أقل من 60 (+1)', '<60 mins (+1)'));
  if (r.goals_scored) parts.push(`${r.goals_scored} ${t('goals')} (+${r.goals_scored * gp})`); if (r.assists) parts.push(`${r.assists} ${t('assists')} (+${r.assists * 3})`);
  if (r.clean_sheets && (p.pos === 'GK' || p.pos === 'DEF')) parts.push(`${t('cs')} (+4)`); if (r.clean_sheets && p.pos === 'MID') parts.push(`${t('cs')} (+1)`);
  if (r.bonus) parts.push(`${t('bonus')} (+${r.bonus})`); if (r.yellow_cards) parts.push(`${t('yc')} (−1)`); if (r.red_cards) parts.push(`${t('rc')} (−3)`);
  openSheet(`${sheetHead(`<div style="width:46px;height:46px">${pShirt(p)}</div>`, `${esc(p.name)} · GW${gw}`, `${tt('ضد', 'vs')} ${tName(r.opponent_team)} (${r.was_home ? t('home_s') : t('away_s')})`, 'var(--glass2)', '')}
   <div style="text-align:center;margin:8px 0"><div class="pbig" style="width:86px;height:86px;font-size:38px;margin:auto;background:${r.total_points >= 8 ? '#10B981' : r.total_points >= 4 ? '#34D399' : '#EF4444'};color:#0B1222">${r.total_points}</div></div>
   <div class="kv" style="grid-template-columns:repeat(5,1fr)"><div><b>${r.minutes}′</b><span>${t('minutes')}</span></div><div><b>${r.goals_scored}</b><span>${t('goals')}</span></div><div><b>${r.assists}</b><span>${t('assists')}</span></div><div><b>${r.clean_sheets ? '✓' : '✗'}</b><span>${t('cs')}</span></div><div><b>${r.bonus}</b><span>${t('bonus')}</span></div></div>
   <div class="note">${I('i-sparkle', 'i', 'color:#60A5FA')}<span>${parts.join('، ') || tt('ما لعب', 'Did not play')}</span></div><button class="btn btn-g btn-b" style="margin-top:10px" onclick="openPlayer(${id})">${t('back')}</button>`);
}
export async function toggleWatch(id) {
  ST.watch.has(id) ? ST.watch.delete(id) : ST.watch.add(id);
  LS.set(`fp_watch_${ST.profile.teamId}`, [...ST.watch]);
  AU.saveProfile(ST.user.uid, { watchlist: [...ST.watch] }).catch(() => {});
  import('../push.js').then((m) => m.syncPush()).catch(() => {}); // حتى السيرفر يعرف القائمة الجديدة ويبعث تنبيهاتها
  toast(ST.watch.has(id) ? tt('أضيف لقائمة المراقبة ⭐', 'Added to watchlist ⭐') : tt('أزيل من المراقبة', 'Removed'));
  if (document.querySelector('.sheet')) openPlayer(id); window.render();
}
/* ---------- أفعال الخطة ---------- */
export function setCap(id) { const P = ST.plan; if (!P.xi.includes(id)) return toast(tt('الكابتن لازم يكون أساسي', 'Captain must start')); if (P.vc === id) P.vc = P.cap; P.cap = id; savePlan(); closeSheet(); window.render(); toast(PM(id).name + ' ©'); }
export function setVC(id) { const P = ST.plan; if (!P.xi.includes(id)) return toast(tt('النائب لازم يكون أساسي', 'Vice must start')); if (P.cap === id) P.cap = P.vc; P.vc = id; savePlan(); closeSheet(); window.render(); toast(PM(id).name + ' (V)'); }
export function buyFlow(inId) {
  const n = PM(inId), opts = ST.plan.squad.filter((x) => PM(x).pos === n.pos);
  openSheet(`${sheetHead(I('i-swap'), tt('منو تبيع مقابل ', 'Sell who for ') + esc(n.name) + '؟')}${opts.map((x) => { const o = PM(x), e = canBuy(ST.plan, x, inId), g = r1(xpN(n, ST.G.next, 3) - xpN(o, ST.G.next, 3)); return playerRow(o, `<div class="col">${e ? `<small style="color:#EF4444">${e}</small>` : `<span class="tag ${g >= 0 ? 'lime' : 'red'}">${g > 0 ? '+' : ''}${g}</span>`}</div>`, e ? '' : `confirmT(${x},${inId})`); }).join('')}<p class="mut" style="font-size:11.5px">${tt('الرقم = فرق النقاط المتوقعة لـ 3 جولات', 'Number = xP difference over 3 GWs')}</p>`);
}
export function confirmT(outId, inId) {
  const P = ST.plan, o = PM(outId), n = PM(inId), free = P.chip === 'wildcard' || P.chip === 'freehit', cost = free || P.ft > 0 ? 0 : 4;
  openSheet(`${sheetHead(I('i-swap'), tt('تأكيد الانتقال', 'Confirm transfer'), tt('خطة — نفّذه بالتطبيق الرسمي', 'Plan — execute in the official app'))}
   <div class="fx-card card"><div class="tm"><div style="width:48px;height:48px">${pShirt(o)}</div><span class="down">${esc(o.name)}</span><small class="mut"><bdi>${o.price.toFixed(1)}م</bdi></small></div><div class="mid">${I('i-swap', 'i', 'width:28px;height:28px;color:#34D399')}</div><div class="tm"><div style="width:48px;height:48px">${pShirt(n)}</div><span class="up">${esc(n.name)}</span><small class="mut"><bdi>${n.price.toFixed(1)}م</bdi></small></div></div>
   <div class="kv"><div><b><bdi>${r1(P.bank + o.price - n.price).toFixed(1)}م</bdi></b><span>${t('bank')}</span></div><div><b class="${cost ? 'down' : ''}">${cost ? '−4' : '0'}</b><span>${tt('خصم', 'Hit')}</span></div><div><b class="up">${r1(xpN(n, ST.G.next, 3) - xpN(o, ST.G.next, 3))}</b><span>${tt('مكسب متوقع (3ج)', 'xP gain (3GW)')}</span></div></div>
   <button class="btn btn-p btn-b" onclick="doTransfer(${outId},${inId})">${tt('أضف للخطة', 'Add to plan')}</button>`);
}
export function doTransfer(outId, inId) {
  const P = ST.plan, e = canBuy(P, outId, inId); if (e) return toast(e);
  const o = PM(outId), n = PM(inId), free = P.chip === 'wildcard' || P.chip === 'freehit';
  let cost = 0; if (!free) { if (P.ft > 0) P.ft--; else cost = 4; }
  P.bank = r1(P.bank + o.price - n.price);
  const rep = (a) => a.map((x) => (x === outId ? inId : x)); P.squad = rep(P.squad); P.xi = rep(P.xi); P.bench = rep(P.bench);
  if (P.cap === outId) P.cap = inId; if (P.vc === outId) P.vc = inId;
  P.transfers.push({ out: outId, in: inId, cost }); savePlan(); closeSheet(); toast(`✓ ${o.name} → ${n.name}${cost ? ' (−4)' : ''}`); window.render();
}
export function addCompare(id) { const c = LS.get('fp_cmp', []); if (!c.includes(id)) c.push(id); LS.set('fp_cmp', c.slice(-3)); closeSheet(); window.go('compare'); }
Object.assign(window, { openPlayer, gwDetail, toggleWatch, setCap, setVC, buyFlow, confirmT, doTransfer, addCompare });

/* ---------- صفحة النادي: نتائجه، مبارياته الجاية، أفضل لاعبيه ---------- */
window.openClub = (tid) => {
  const G = ST.G, tm = G.teams[tid]; if (!tm) return;
  const all = G.fxList.filter((f) => f.h === tid || f.a === tid).sort((a, b) => (a.ev || 99) - (b.ev || 99));
  const past = all.filter((f) => f.fin).slice(-6).reverse(), next = all.filter((f) => !f.fin).slice(0, 6);
  const res = (f) => { const home = f.h === tid, gf = home ? f.hs : f.as, ga = home ? f.as : f.hs; return gf > ga ? ['W', 'var(--good)'] : gf < ga ? ['L', 'var(--bad)'] : ['D', 'var(--mut)']; };
  const form = past.map((f) => { const [r, c] = res(f); return `<span class="rate" style="background:${c};color:#0A0D14">${r}</span>`; }).join(' ');
  const players = G.players.filter((p) => p.team === tid).sort((a, b) => b.total - a.total).slice(0, 8);
  const mine = new Set(ST.plan?.squad || []);
  openSheet(`${sheetHead(crest(tm.short, 44), tName(tid), `${tt('الفورم', 'Form')}: ${form || '—'}`)}
   <div class="sec" style="margin-top:4px"><h2 style="font-size:14px">${I('i-cal', 'i', 'width:16px;height:16px')}${tt('المباريات الجاية', 'Next fixtures')}</h2></div>
   <div class="nx5">${next.map((f) => { const home = f.h === tid, opp = home ? f.a : f.h, d = home ? f.hd : f.ad; return `<button><small>GW${f.ev}</small><span class="rate f${d}">${tShort(opp)}</span><small>${home ? t('home_s') : t('away_s')}</small></button>`; }).join('') || '<p class="mut">—</p>'}</div>
   <div class="sec"><h2 style="font-size:14px">${I('i-history', 'i', 'width:16px;height:16px')}${tt('آخر النتائج', 'Recent results')}</h2></div>
   <div class="list">${past.map((f) => { const [r, c] = res(f); return `<div class="row"><span class="rate" style="background:${c};color:#0A0D14">${tt({ W: 'فوز', L: 'خسارة', D: 'تعادل' }[r], r)}</span><div class="info"><b style="font-size:13px">${tName(f.h)} ${scoreHTML(f.hs, f.as, 'num')} ${tName(f.a)}</b><span>GW${f.ev}</span></div></div>`; }).join('') || '<p class="mut" style="padding:10px">—</p>'}</div>
   <div class="sec"><h2 style="font-size:14px">${I('i-users', 'i', 'width:16px;height:16px')}${tt('أفضل اللاعبين', 'Top players')}</h2></div>
   <div class="list">${players.map((p) => `<div class="row tap" onclick="openPlayer(${p.id})"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)} ${mine.has(p.id) ? `<span class="tag lime">${tt('بفريقك', 'Yours')}</span>` : ''}</b><span><span class="pos ${p.pos}">${p.pos}</span><bdi>${p.price.toFixed(1)}م</bdi> · ${p.own}%</span></div><div class="col">${p.total}<small>${tt('نقطة', 'pts')}</small></div></div>`).join('')}</div>
   <button class="btn btn-g btn-b" style="margin-top:12px" onclick="closeSheet();go('clubs');clubOpen(${tid})">${tt('صفحة النادي الكاملة', 'Full club page')}</button>`);
};

/* ---------- تفاصيل اللاعب بجولة معيّنة (مباراته فقط) ---------- */
/* أيقونات خطّية موحّدة لأحداث اللاعب (بدل الإيموجي) */
const SV = (d, extra = '') => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICO = {
  minutes: SV('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M10 2h4"/>'),
  goals_scored: SV('<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.2 2.3-1.2 3.8h-4l-1.2-3.8Z"/><path d="M12 7.5V3.2M15.2 9.8l4-1.3M14 13.6l2.5 3.6M10 13.6l-2.5 3.6M8.8 9.8l-4-1.3"/>'),
  assists: SV('<path d="M4 18c3-6 8-9 14-10"/><path d="m14 5 4 3-3 4"/><circle cx="4.5" cy="18.5" r="1.5"/>'),
  clean_sheets: SV('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>'),
  goals_conceded: SV('<path d="M3 6h18v12H3z"/><path d="M3 10h18M3 14h18M9 6v12M15 6v12" opacity=".5"/>'),
  own_goals: SV('<circle cx="12" cy="12" r="9"/><path d="M15 9H9.5a2.5 2.5 0 0 0 0 5H14"/><path d="m11 7-2 2 2 2"/>'),
  penalties_saved: SV('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 9V4.5a1.5 1.5 0 0 1 3 0V9M13 9V5.5a1.5 1.5 0 0 1 3 0V11M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4 15a1.6 1.6 0 0 1 2.6-1.8L7 14"/>'),
  saves: SV('<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 9V4.5a1.5 1.5 0 0 1 3 0V9M13 9V5.5a1.5 1.5 0 0 1 3 0V11M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4 15a1.6 1.6 0 0 1 2.6-1.8L7 14"/>'),
  penalties_missed: SV('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
  yellow_cards: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="3.5" width="10" height="17" rx="2" fill="#FACC15"/></svg>',
  red_cards: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="3.5" width="10" height="17" rx="2" fill="#EF4444"/></svg>',
  bonus: SV('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>'),
  defensive_contribution: SV('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z"/>'),
  tot: SV('<path d="M17 5H7l6 7-6 7h10"/>'),
};
const EXPL = () => ({ minutes: tt('الدقائق', 'Minutes'), goals_scored: tt('أهداف', 'Goals'), assists: tt('صناعة', 'Assists'), clean_sheets: tt('شباك نظيفة', 'Clean sheet'), goals_conceded: tt('أهداف مستقبلة', 'Goals conceded'), own_goals: tt('هدف عكسي', 'Own goal'), penalties_saved: tt('صد جزاء', 'Penalty saved'), penalties_missed: tt('إضاعة جزاء', 'Penalty missed'), yellow_cards: tt('بطاقة صفراء', 'Yellow card'), red_cards: tt('بطاقة حمراء', 'Red card'), saves: tt('تصديات', 'Saves'), bonus: tt('بونص', 'Bonus'), defensive_contribution: tt('مساهمات دفاعية', 'Defensive contribution') });
function dcBlock(p, s) {
  const T = { DEF: 10, MID: 12, FWD: 12 }[p.pos]; if (!T || s.defensive_contribution == null || !s.minutes) return '';
  const v = s.defensive_contribution, ok = v >= T;
  return `<div class="dc-gw ${ok ? 'ok' : ''}"><div class="flex between" style="margin-bottom:6px"><span style="font-size:13px">${I('i-shield', 'i', 'width:15px;height:15px;vertical-align:-3px')} ${tt('المساهمات الدفاعية', 'Defensive contributions')}</span><b><span class="num" dir="ltr">${v}/${T}</span>${ok ? ' · <span class="up">+2</span>' : ''}</b></div><div class="dc-bar"><i style="width:${Math.min(100, (v / T) * 100)}%"></i></div></div>`;
}
window.playerGW = async (id, gw, mult = 1) => {
  const p = PM(id); if (!p) return;
  openSheet(`${sheetHead(`<div style="width:46px;height:46px">${pShirt(p)}</div>`, esc(p.name), `${t('gw')} ${gw} · ${tName(p.team)}`)}<div id="pgw" class="aiload"><i></i><i></i><i></i><span>${t('loading')}</span></div>`);
  let el;
  try {
    if (ST.liveRaw && ST.liveRawGW === gw) el = ST.liveRaw.find((e) => e.id === id);
    else { const l = await FPL.loadLive(gw); el = l.elements.find((e) => e.id === id); }
  } catch (e) { const b = document.getElementById('pgw'); if (b) b.outerHTML = `<p class="mut">${esc(e.message)}</p>`; return; }
  const box = document.getElementById('pgw'); if (!box) return;
  const s = el?.stats || {}, fxs = (ST.G.fx[gw] || []).filter((f) => f.h === p.team || f.a === p.team);
  const { provisionalBonus } = await import('../live-engine.js');
  const pb = s.bonus ? 0 : (provisionalBonus(gw)[id] || 0);
  const total = (s.total_points || 0) + pb, shown = total * Math.max(1, mult);
  const match = (f) => { const home = f.h === p.team, opp = home ? f.a : f.h; const st = f.fin ? tt('انتهت', 'FT') : f.started ? `<span class="livebadge">${fxMin(f)}</span>` : (f.ko ? new Date(f.ko).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'ar-IQ', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
    return `<div class="pgw-match" onclick="closeSheet();setTimeout(()=>openMatchC&&openMatchC(${f.id},${gw}),200)"><div class="flex" style="gap:6px">${crest(tShort(f.h), 26)}<b>${tShort(f.h)}</b></div><div style="text-align:center">${f.started ? `${scoreHTML(f.hs, f.as, 'score', 'font-size:20px;font-weight:700')}` : '<b class="mut">VS</b>'}<div style="font-size:11.5px" class="mut">${st}</div></div><div class="flex" style="gap:6px;justify-content:flex-end"><b>${tShort(f.a)}</b>${crest(tShort(f.a), 26)}</div></div>`; };
  const rows = []; (el?.explain || []).forEach((x) => (x.stats || []).forEach((r) => { if (r.identifier === 'bps') return; const ex = rows.find((y) => y.k === r.identifier); if (ex) { ex.v += r.value; ex.p += r.points; } else rows.push({ k: r.identifier, v: r.value, p: r.points }); }));
  if (!rows.length && (s.minutes || 0) > 0) Object.keys(EXPL()).forEach((k) => { if (k !== 'bonus' && +s[k]) rows.push({ k, v: s[k], p: null }); });
  if (!rows.some((r) => r.k === 'bonus') && s.bonus) rows.push({ k: 'bonus', v: s.bonus, p: s.bonus });
  if (pb) rows.push({ k: 'bonus', v: pb, p: pb, prov: true });
  const X = EXPL();
  const extra = [['xG', s.expected_goals], ['xA', s.expected_assists], ['BPS', s.bps], ['ICT', s.ict_index], [tt('تأثير', 'Influence'), s.influence], [tt('صناعة الفرص', 'Creativity'), s.creativity], [tt('تهديد', 'Threat'), s.threat], [tt('دفاعية', 'Def. contrib.'), s.defensive_contribution], [tt('استرجاع', 'Recoveries'), s.recoveries], [tt('تدخلات', 'Tackles'), s.tackles]].filter(([, v]) => v != null && v !== '' && +v !== 0);
  box.outerHTML = `${fxs.length ? fxs.map(match).join('') : `<div class="note">${I('i-info', 'i', 'color:var(--info)')}<span>${tt('فريقه ما عنده مباراة بهالجولة', 'No fixture this gameweek')}</span></div>`}
   <div class="pgw-hero ${shown >= 10 ? 't3' : shown >= 6 ? 't2' : shown > 0 ? 't1' : 't0'}">
     <div class="pgw-orb"><svg class="pgw-ring" viewBox="0 0 100 100" width="96" height="96"><circle cx="50" cy="50" r="45" class="trk"/><circle cx="50" cy="50" r="45" class="arc" pathLength="100" style="--p:${Math.min(100, shown * 6)}"/></svg><div class="in"><b class="big-num count">${shown}</b><span>${tt('نقطة', 'pts')}</span></div>${mult > 1 ? `<em class="cap">${mult === 3 ? '×3' : '×2'}</em>` : ''}</div>
     <div class="pgw-tiles">
       <div class="${s.minutes ? 'on' : ''} k-min">${ICO.minutes}<b class="num">${s.minutes || 0}′</b><small>${tt('دقائق', 'Minutes')}</small></div>
       <div class="${s.goals_scored ? 'on' : ''} k-goal">${ICO.goals_scored}<b class="num">${s.goals_scored || 0}</b><small>${tt('أهداف', 'Goals')}</small></div>
       <div class="${s.assists ? 'on' : ''} k-ast">${ICO.assists}<b class="num">${s.assists || 0}</b><small>${tt('صناعة', 'Assists')}</small></div>
       <div class="${(s.bonus || pb) ? 'on' : ''} k-bon">${ICO.bonus}<b class="num">${s.bonus || pb || 0}</b><small>${tt('بونص', 'Bonus')}</small></div>
     </div>
   </div>
   ${dcBlock(p, s)}
   ${rows.length ? `<div class="sec" style="margin-top:12px"><h2 style="font-size:14px">${I('i-list', 'i', 'width:16px;height:16px')}${tt('تفصيل النقاط', 'Points breakdown')}</h2></div><div class="list pgw-bd">${rows.map((r, k) => `<div class="row" style="--k:${k}"><span class="bd-e ${r.k}">${ICO[r.k] || ICO.tot}</span><div class="info"><b style="font-size:13.5px">${X[r.k] || r.k}${r.prov ? ` <span class="tag cyan">${tt('مباشر من الفانتازي', 'live FPL')}</span>` : ''}</b><span>${r.k === 'minutes' ? r.v + '′' : '×' + r.v}</span></div><div class="bd-p ${r.p > 0 ? 'up' : r.p < 0 ? 'down' : 'z'}">${r.p == null ? '' : (r.p > 0 ? '+' : '') + r.p}</div></div>`).join('')}<div class="row bd-tot" style="--k:${rows.length}"><span class="bd-e tot">${ICO.tot}</span><div class="info"><b>${tt('المجموع', 'Total')}</b>${mult > 1 ? `<span>×${mult} = ${shown}</span>` : ''}</div><div class="bd-p tot num">${total}</div></div></div>` : `<p class="mut" style="margin-top:10px">${tt('ما لعب أو مباراته ما بدت بعد', 'Has not played yet')}</p>`}
   ${extra.length ? `<div class="sec"><h2 style="font-size:14px">${I('i-activity', 'i', 'width:16px;height:16px')}${tt('أرقامه بالمباراة', 'Match stats')}</h2></div><div class="pgw-grid">${extra.map(([l, v]) => `<div><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
   <button class="btn btn-g btn-b" style="margin-top:14px" onclick="closeSheet();setTimeout(()=>openPlayer(${id}),200)">${I('i-user', 'i', 'width:16px;height:16px')}${tt('صفحة اللاعب الكاملة', 'Full player page')}</button>`;
  import('../motion.js').then((m) => { const b = document.querySelector('#sheetRoot .sh-body'); if (b) { m.countAll(b, true); m.decorate(b, true); } }).catch(() => {});
};

/* =========================================================
   بطاقة اللاعب الذكية: السعر عبر الجولات، مقارنة بمتوسط مركزه،
   مستوى المخاطرة وأسبابه، وقراراتك ويا اللاعب — كلها من بيانات FPL الحقيقية
========================================================= */
function playerIntel(p, h, mine) {
  const host = document.getElementById('psIntel'); if (!host) return;
  const G = ST.G;
  // السعر: من قيمة اللاعب بكل جولة بسجله الرسمي
  const vals = h.map((r) => (r.value || 0) / 10).filter(Boolean), v0 = vals[0], v1 = p.price, dv = v0 ? r1(v1 - v0) : 0;
  const spk = (() => { if (vals.length < 2) return ''; const mn = Math.min(...vals, v1), mx = Math.max(...vals, v1), W = 120, H = 30, xs = (i) => (i / (vals.length - 1)) * W, ys = (v) => H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6);
    return `<svg viewBox="0 0 ${W} ${H}" class="pi-spk"><polyline fill="none" stroke="${dv >= 0 ? 'var(--acc)' : 'var(--bad)'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${vals.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')}"/></svg>`; })();
  // مقارنة بمتوسط المركز (لاعبين لعبوا 270 دقيقة أو أكثر)
  const pool = G.players.filter((x) => x.pos === p.pos && x.min >= 270), avgPpg = pool.length ? r1(pool.reduce((a, x) => a + x.ppg, 0) / pool.length) : null;
  const better = pool.length ? Math.round((pool.filter((x) => x.ppg < p.ppg).length / pool.length) * 100) : null;
  // المخاطرة: أسباب حقيقية فقط
  const why = [], av = avail(p), share = G.finished ? (p.min / (90 * G.finished)) : 1, fd = avgFdr(p.team, G.next, 3);
  if (av < 1) why.push(tt(`جاهزيته ${Math.round(av * 100)}% حسب الحالة الرسمية`, `${Math.round(av * 100)}% availability (official)`));
  if (share < 0.7 && G.finished >= 3) why.push(tt(`يلعب ${Math.round(share * 100)}% من الدقائق الممكنة`, `Plays ${Math.round(share * 100)}% of minutes`));
  if (fd >= 3.6) why.push(tt('المباريات الثلاث الجاية صعبة', 'Tough next 3 fixtures'));
  if (p.cc < 0 || dv <= -0.2) why.push(tt('سعره دا ينزل', 'Price falling'));
  const lvl = why.length >= 2 || av < 0.5 ? ['high', tt('عالية', 'High')] : why.length === 1 ? ['mid', tt('متوسطة', 'Medium')] : ['low', tt('منخفضة', 'Low')];
  host.innerHTML = `<div class="pi">
    <div class="pi-row"><div class="pi-k"><small>${tt('السعر من أول الموسم', 'Price since GW1')}</small><b class="num"><bdi>${v1.toFixed(1)}م</bdi> <em class="${dv > 0 ? 'up' : dv < 0 ? 'down' : ''}"><bdi>${dv > 0 ? '+' : ''}${dv.toFixed(1)}</bdi></em></b></div>${spk}</div>
    ${avgPpg != null ? `<div class="pi-row"><div class="pi-k"><small>${tt('مقابل متوسط مركزه', 'Vs position average')}</small><b class="num"><bdi>${p.ppg}</bdi> <span class="mut">${tt('نقطة/مباراة مقابل', 'pts/match vs')} <bdi>${avgPpg}</bdi></span></b></div><div class="pi-bar"><i style="width:${better}%"></i><span class="num">${tt(`أفضل من ${better}%`, `Beats ${better}%`)}</span></div></div>` : ''}
    <div class="pi-row col"><div class="pi-k"><small>${tt('المخاطرة', 'Risk')}</small><b class="pi-lv ${lvl[0]}">${lvl[1]}</b></div>${why.length ? `<ul class="pi-why">${why.map((w) => `<li>${w}</li>`).join('')}</ul>` : `<p class="pi-ok">${tt('ماكو مؤشر خطر واضح بالبيانات الحالية', 'No clear risk signals in current data')}</p>`}</div>
    <div class="pi-row col" id="psDec"></div></div>`;
  import('../coach.js').then((CO) => {
    const el = document.getElementById('psDec'); if (!el || !CO.playerDecisions) return; const d = CO.playerDecisions(p.id);
    if (!d.has) { el.remove(); return; }
    const parts = [];
    if (d.bought.length) parts.push(tt(`اشتريته بالجولة ${d.bought.join('، ')}`, `Bought GW ${d.bought.join(', ')}`));
    if (d.sold.length) parts.push(tt(`بعته بالجولة ${d.sold.join('، ')}`, `Sold GW ${d.sold.join(', ')}`));
    if (d.owned) parts.push(tt(`عندك ${d.owned} جولة، أساسي ${d.xiN} وجابلك ${d.ptsOwned} نقطة`, `Owned ${d.owned} GWs, started ${d.xiN}, ${d.ptsOwned} pts`));
    if (d.capN) parts.push(tt(`كبتنته ${d.capN} مرة وجاب ${d.capPts} نقطة`, `Captained ${d.capN}× for ${d.capPts} pts`));
    el.innerHTML = parts.length ? `<div class="pi-k"><small>${tt('قراراتك ويا هذا اللاعب', 'Your decisions')}</small></div><ul class="pi-why dec">${parts.map((w) => `<li>${w}</li>`).join('')}</ul>` : `<div class="pi-k"><small>${tt('قراراتك ويا هذا اللاعب', 'Your decisions')}</small></div><p class="pi-ok">${tt('ما سبق اشتريته أو لعبته', 'Never owned')}</p>`;
  }).catch(() => {});
}
