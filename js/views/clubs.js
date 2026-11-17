/* ============================================================
 * النوادي: جدول ترتيب كل الأندية من نتائج الجولات المنتهية،
 * وصفحة لكل نادي: كل نتائجه، كل مبارياته الجاية، وكل لاعبيه
 * مرتبين بالنقاط من الأفضل للأسوأ. بيانات حقيقية فقط من FPL.
 * ============================================================ */
import { ST, tShort, tName } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, crest, scoreHTML, fmtTime } from '../ui.js';
import { pShirt } from './common.js';

let SEL = null, TAB = 'res', POS = 'ALL';

/** جدول الترتيب محسوب من المباريات المنتهية */
function table() {
  const G = ST.G, T = {};
  Object.keys(G.teams).forEach((id) => { T[id] = { id: +id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }; });
  G.fxList.filter((f) => f.fin && f.hs != null).sort((a, b) => (a.ev || 0) - (b.ev || 0) || String(a.ko).localeCompare(String(b.ko))).forEach((f) => {
    const H = T[f.h], A = T[f.a]; if (!H || !A) return;
    H.p++; A.p++; H.gf += f.hs; H.ga += f.as; A.gf += f.as; A.ga += f.hs;
    if (f.hs > f.as) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); }
    else if (f.hs < f.as) { A.w++; H.l++; A.pts += 3; H.form.push('L'); A.form.push('W'); }
    else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); }
  });
  return Object.values(T).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || tName(a.id).localeCompare(tName(b.id)));
}
const RL = () => ({ W: tt('فوز', 'W'), D: tt('تعادل', 'D'), L: tt('خسارة', 'L') });
const fchip = (r) => `<i class="cl-f ${r}">${tt({ W: 'ف', D: 'ت', L: 'خ' }[r], r)}</i>`;

function listHTML(R) {
  return `<div class="sec"><h2>${I('i-list', 'i')}${tt('ترتيب الأندية', 'League table')}</h2></div>
  <div class="card cl-tb">
    <div class="cl-hd"><span>#</span><span>${tt('النادي', 'Club')}</span><span>${tt('لعب', 'P')}</span><span>${tt('الفرق', 'GD')}</span><span>${tt('نقاط', 'Pts')}</span></div>
    ${R.map((x, i) => `<button class="cl-r" onclick="clubOpen(${x.id})"><span class="num cl-n">${i + 1}</span><span class="cl-c">${crest(G_short(x.id), 24)}<b>${esc(tName(x.id))}</b><span class="cl-fm">${x.form.slice(-5).reverse().map(fchip).join('')}</span></span><span class="num">${x.p}</span><span class="num" dir="ltr">${x.gf - x.ga > 0 ? '+' : ''}${x.gf - x.ga}</span><b class="num">${x.pts}</b></button>`).join('')}
  </div>`;
}
const G_short = (id) => tShort(id);

function clubHTML(R) {
  const G = ST.G, tid = SEL, row = R.find((x) => x.id === tid), rank = R.indexOf(row) + 1;
  const all = G.fxList.filter((f) => f.h === tid || f.a === tid);
  const past = all.filter((f) => f.fin && f.hs != null).sort((a, b) => (b.ev || 0) - (a.ev || 0));
  const next = all.filter((f) => !f.fin).sort((a, b) => (a.ev || 999) - (b.ev || 999) || String(a.ko).localeCompare(String(b.ko)));
  const mine = new Set(ST.plan?.squad || []);
  const res = (f) => { const h = f.h === tid, gf = h ? f.hs : f.as, ga = h ? f.as : f.hs; return gf > ga ? 'W' : gf < ga ? 'L' : 'D'; };
  const tabs = [['res', tt(`النتائج (${past.length})`, `Results (${past.length})`)], ['next', tt(`الجاية (${next.length})`, `Upcoming (${next.length})`)], ['pl', tt('اللاعبين', 'Players')]];
  let body = '';
  if (TAB === 'res') body = past.length ? `<div class="card cl-ls">${past.map((f) => { const r = res(f); return `<button class="cl-m tap" onclick="openMatchC(${f.id},${f.ev})"><span class="cl-gw num">${f.ev}</span><div class="cl-sc"><span class="${f.h === tid ? 'me' : ''}">${esc(tName(f.h))}</span>${scoreHTML(f.hs, f.as, 'num')}<span class="${f.a === tid ? 'me' : ''}">${esc(tName(f.a))}</span></div><i class="cl-f ${r} w">${RL()[r]}</i></button>`; }).join('')}</div>` : `<p class="mut cl-e">${tt('ما لعب أي مباراة بعد', 'No matches played yet')}</p>`;
  if (TAB === 'next') body = next.length ? `<div class="card cl-ls">${next.map((f) => { const h = f.h === tid, opp = h ? f.a : f.h, d = h ? f.hd : f.ad; return `<${f.ev ? `button class="cl-m tap" onclick="openMatchC(${f.id},${f.ev})"` : 'div class="cl-m"'}><span class="cl-gw num">${f.ev || '—'}</span><div class="cl-op">${crest(tShort(opp), 22)}<b>${esc(tName(opp))}</b><small>${h ? tt('بملعبه', 'Home') : tt('خارج ملعبه', 'Away')}</small></div><div class="cl-kd"><span class="rate f${d}">${d}</span><small>${f.ko ? fmtTime(f.ko) : tt('موعد غير محدد', 'TBC')}</small></div></${f.ev ? 'button' : 'div'}>`; }).join('')}</div>` : `<p class="mut cl-e">${tt('ماكو مباريات جاية', 'No upcoming matches')}</p>`;
  if (TAB === 'pl') {
    const ps = G.players.filter((p) => p.team === tid && (POS === 'ALL' || p.pos === POS)).sort((a, b) => b.total - a.total || b.min - a.min);
    const seg = ['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((k) => `<button class="${POS === k ? 'on' : ''}" onclick="clubPos('${k}')">${k === 'ALL' ? tt('الكل', 'All') : { GK: tt('حراس', 'GK'), DEF: tt('دفاع', 'DEF'), MID: tt('وسط', 'MID'), FWD: tt('هجوم', 'FWD') }[k]}</button>`).join('');
    body = `<div class="cl-seg sm">${seg}</div><div class="card cl-ls">${ps.map((p, i) => `<button class="cl-p" onclick="openPlayer(${p.id})"><span class="num cl-n">${i + 1}</span><span class="mini">${pShirt(p)}</span><span class="cl-pi"><b>${esc(p.name)}${mine.has(p.id) ? `<em class="tag lime">${tt('بفريقك', 'Yours')}</em>` : ''}</b><small><span class="pos ${p.pos}">${p.pos}</span><bdi>£${p.price.toFixed(1)}</bdi> · <bdi>${p.own}%</bdi> · ${tt(`${p.min} دقيقة`, `${p.min}'`)}</small></span><b class="num cl-pt">${p.total}<small>${tt('نقطة', 'pts')}</small></b></button>`).join('') || `<p class="mut cl-e">—</p>`}</div>`;
  }
  return `<div class="cl-top"><button class="cl-back" onclick="clubOpen(null)" aria-label="${tt('رجوع', 'Back')}">${I('i-back', 'i')}<span>${tt('رجوع', 'Back')}</span></button><span class="cl-crumb">${tt('النوادي', 'Clubs')} / <b>${esc(tName(tid))}</b></span></div>
  <div class="card cl-hero">${crest(tShort(tid), 52)}<div><b>${esc(tName(tid))}</b><small>${tt(`المركز ${rank}`, `Position ${rank}`)} · ${tt(`${row.pts} نقطة`, `${row.pts} pts`)}</small></div></div>
  <div class="cl-kv"><div><b class="num">${row.w}</b><small>${tt('فوز', 'Won')}</small></div><div><b class="num">${row.d}</b><small>${tt('تعادل', 'Drawn')}</small></div><div><b class="num">${row.l}</b><small>${tt('خسارة', 'Lost')}</small></div><div><b class="num">${row.gf}</b><small>${tt('سجّل', 'Scored')}</small></div><div><b class="num">${row.ga}</b><small>${tt('استقبل', 'Conceded')}</small></div></div>
  <div class="cl-seg">${tabs.map(([k, l]) => `<button class="${TAB === k ? 'on' : ''}" onclick="clubTab('${k}')">${l}</button>`).join('')}</div>${body}`;
}

export function vClubs() {
  if (!ST.G?.fxList) return '';
  const R = table();
  if (SEL != null && !ST.G.teams[SEL]) SEL = null;
  return `<div class="cl">${SEL == null ? listHTML(R) : clubHTML(R)}</div>`;
}
Object.assign(window, {
  clubOpen: (id) => { const opening = id != null && SEL == null; SEL = id; TAB = 'res'; POS = 'ALL'; if (opening) { try { history.pushState({ v: 'clubs', c: id }, '', '#clubs'); } catch {} } window.render(); window.scrollTo(0, 0); },
  clubTab: (k) => { TAB = k; window.render(); },
  clubPos: (k) => { POS = k; window.render(); },
});

/* رجوع الجهاز/الإيماءة/زر الرجوع العلوي: من صفحة النادي يرجع لقائمة الأندية */
const prevHook = window.__backHook;
window.__backHook = () => { if (ST.view === 'clubs' && SEL != null) { SEL = null; window.render(); window.scrollTo(0, 0); return true; } return prevHook ? prevHook() : false; };
