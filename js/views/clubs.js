/* ============================================================
 * النوادي: جدول ترتيب كل الأندية من نتائج الجولات المنتهية،
 * وصفحة لكل نادي: كل نتائجه، كل مبارياته الجاية، وكل لاعبيه
 * مرتبين بالنقاط من الأفضل للأسوأ. بيانات حقيقية فقط من FPL.
 * ============================================================ */
import { ST, tShort, tName } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, crest, scoreHTML, fmtTime } from '../ui.js';
import { pShirt } from './common.js';
import { load as ciLoad, analyse, memory, progress as ciProg, goalsW, gamesW } from '../club-intel.js';

let SEL = null, TAB = 'res', POS = 'ALL', LISTY = 0, ZM = 'A', SAVED = null, ZSEL = null, TSEL = null, FILT = 'all', OPEN = new Set(['att', 'def', 'zone']);

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
  const tabs = [['res', tt(`النتائج (${past.length})`, `Results (${past.length})`)], ['next', tt(`الجاية (${next.length})`, `Upcoming (${next.length})`)], ['ai', tt('التحليل الذكي', 'Smart analysis')], ['pl', tt('اللاعبين', 'Players')]];
  let body = TAB === 'ai' ? aiHTML(tid) : '';
  if (TAB === 'res') body = past.length ? `<div class="card cl-ls">${past.map((f) => { const r = res(f); return `<button class="cl-m tap" onclick="openMatchC(${f.id},${f.ev})"><span class="cl-gw num">${f.ev}</span><div class="cl-sc"><span class="${f.h === tid ? 'me' : ''}">${esc(tName(f.h))}</span>${scoreHTML(f.hs, f.as, 'num')}<span class="${f.a === tid ? 'me' : ''}">${esc(tName(f.a))}</span></div><i class="cl-f ${r} w">${RL()[r]}</i></button>`; }).join('')}</div>` : `<p class="mut cl-e">${tt('ما لعب أي مباراة بعد', 'No matches played yet')}</p>`;
  if (TAB === 'next') body = next.length ? `<div class="card cl-ls">${next.map((f) => { const h = f.h === tid, opp = h ? f.a : f.h, d = h ? f.hd : f.ad; return `<${f.ev ? `button class="cl-m tap" onclick="openMatchC(${f.id},${f.ev})"` : 'div class="cl-m"'}><span class="cl-gw num">${f.ev || '—'}</span><div class="cl-op">${crest(tShort(opp), 22)}<b>${esc(tName(opp))}</b><small>${h ? tt('بملعبه', 'Home') : tt('خارج ملعبه', 'Away')}</small></div><div class="cl-kd"><span class="rate f${d}">${d}</span><small>${f.ko ? fmtTime(f.ko) : tt('موعد غير محدد', 'TBC')}</small></div></${f.ev ? 'button' : 'div'}>`; }).join('')}</div>` : `<p class="mut cl-e">${tt('ماكو مباريات جاية', 'No upcoming matches')}</p>`;
  if (TAB === 'pl') {
    const ps = G.players.filter((p) => p.team === tid && (POS === 'ALL' || p.pos === POS)).sort((a, b) => b.total - a.total || b.min - a.min);
    const seg = ['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((k) => `<button class="${POS === k ? 'on' : ''}" onclick="clubPos('${k}')">${k === 'ALL' ? tt('الكل', 'All') : { GK: tt('حراس', 'GK'), DEF: tt('دفاع', 'DEF'), MID: tt('وسط', 'MID'), FWD: tt('هجوم', 'FWD') }[k]}</button>`).join('');
    body = `<div class="cl-seg sm">${seg}</div><div class="card cl-ls">${ps.map((p, i) => `<button class="cl-p" onclick="openPlayer(${p.id})"><span class="num cl-n">${i + 1}</span><span class="mini">${pShirt(p)}</span><span class="cl-pi"><b>${esc(p.name)}${mine.has(p.id) ? `<em class="tag lime">${tt('بفريقك', 'Yours')}</em>` : ''}</b><small><span class="pos ${p.pos}">${p.pos}</span><bdi>£${p.price.toFixed(1)}</bdi> · <bdi>${p.own}%</bdi> · ${tt(`${p.min} دقيقة`, `${p.min}'`)}</small></span><b class="num cl-pt">${p.total}<small>${tt('نقطة', 'pts')}</small></b></button>`).join('') || `<p class="mut cl-e">—</p>`}</div>`;
  }
  return `<div class="cl-top"><button class="cl-back" onclick="clubBack()" aria-label="${tt('رجوع', 'Back')}">${I('i-back', 'i')}<span>${tt('رجوع', 'Back')}</span></button><span class="cl-crumb">${tt('النوادي', 'Clubs')} / <b>${esc(tName(tid))}</b></span></div>
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
  clubOpen: (id) => {
    if (id == null) return closeClub();
    const opening = SEL == null; if (opening) LISTY = window.scrollY;
    SEL = id; TAB = 'res'; POS = 'ALL'; SAVED = null; ZSEL = null; TSEL = null; FILT = 'all'; OPEN = new Set(['att', 'def', 'zone']);
    if (opening) { try { history.pushState({ v: 'clubs', c: id }, '', '#clubs'); } catch {} }
    paint(); window.scrollTo(0, 0);
  },
  // زر الرجوع يمر بنفس طريق سحبة الآيفون (history.back) حتى يبقى السجل مرتب
  clubBack: () => { if (history.state && history.state.c != null) history.back(); else closeClub(); },
  clubTab: (k) => { TAB = k; window.render(); },
  clubPos: (k) => { POS = k; window.render(); },
  clubZM: (k) => { ZM = k; ZSEL = null; window.render(); },
  clubZS: (k) => { ZSEL = ZSEL === k ? null : k; window.render(); },
  clubTS: (k) => { TSEL = TSEL === k ? null : k; window.render(); },
  clubFI: (k) => { FILT = k; window.render(); },
  clubBO: (k, o) => { if (o) OPEN.add(k); else OPEN.delete(k); },
});

/* ============ التحليل الذكي: الشجرة ============ */
const BR = () => [
  ['att', 'i-goal', tt('الهجوم', 'Attack')], ['def', 'i-shield', tt('الدفاع', 'Defence')], ['zone', 'i-matrix', tt('المناطق', 'Zones')],
  ['time', 'i-clock', tt('التوقيت', 'Timing')], ['set', 'i-target', tt('الكرات الثابتة', 'Set pieces')], ['style', 'i-activity', tt('الأسلوب', 'Style')],
  ['mind', 'i-trophy', tt('النتائج والشخصية', 'Results & mentality')], ['disc', 'i-alert', tt('الانضباط', 'Discipline')],
  ['fpl', 'i-pitch', tt('اللاعبين والفانتازي', 'Players & FPL')], ['next', 'i-cal', tt('الجاي', 'Coming up')],
];
const TONE = { g: 'i-up', b: 'i-down', n: 'i-info' };
function track(R) {
  if (!R || R.max === R.min) return '';
  const x = (v) => ((v - R.min) / (R.max - R.min)) * 100;
  return `<div class="ci-trw"><div class="ci-tr" dir="ltr" aria-hidden="true"><i class="ci-tr-avg" style="left:${x(R.avg).toFixed(1)}%"></i><i class="ci-tr-me" style="left:${x(R.v).toFixed(1)}%"></i></div><div class="ci-tr-l"><span>${tt('ترتيبه', 'Rank')} <bdi dir="ltr" class="num">${R.r}/${R.n}</bdi></span><span>${tt('الخط: معدل الدوري', 'Line: league average')}</span></div></div>`;
}
// الأرقام داخل النص تنعزل (حتى «60%» ما تنقلب) وتنبرز، وكل سطر بمكانه
const fmtT = (t) => esc(t).replace(/(\d+(?:\.\d+)?%?|\d+–\d+)/g, '<bdi dir="ltr" class="ci-d">$1</bdi>').split('\n').map((l) => `<span>${l}</span>`).join('');
function item(x, fresh, rich = true) {
  const num = x.big != null ? `<div class="ci-num"><b dir="ltr" class="num">${esc(String(x.big))}</b><small>${esc(x.unit || '')}</small></div>` : '';
  return `<article class="ci-it t-${x.tone}${num ? ' has-n' : ''}"${x.pid ? ` role="button" tabindex="0" onclick="openPlayer(${x.pid})"` : ''}>
    <div class="ci-ib"><header class="ci-ih"><span class="ci-tn">${I(TONE[x.tone] || 'i-info', 'i')}</span><h3>${esc(x.title)}</h3>${fresh ? `<em class="ci-new">${tt('جديد', 'New')}</em>` : ''}</header>${x.text ? `<p>${fmtT(x.text)}</p>` : ''}</div>${num}${rich ? track(x.R) : ''}</article>`;
}
function zoneMap(A) {
  const Z = ZM === 'F' ? A.zF : A.zA, c = Z.cell, g = (k) => c[k] || 0;
  const NM = { six: tt('داخل الست ياردات', 'Six-yard box'), bl: tt('يسار الصندوق', 'Left of the box'), bc: tt('وسط الصندوق', 'Centre of the box'), br: tt('يمين الصندوق', 'Right of the box'), ol: tt('من بعيد، يسار', 'Long range, left'), oc: tt('من بعيد، وسط', 'Long range, centre'), or: tt('من بعيد، يمين', 'Long range, right'), pc: tt('ركلات جزاء', 'Penalties') };
  const cells = [
    ['six', g('sl') + g('sc') + g('sr') + g('s?'), 110, 0, 80, 26], ['bl', g('bl'), 60, 26, 60, 64], ['bc', g('bc') + g('b?'), 120, 26, 60, 64], ['br', g('br'), 180, 26, 60, 64],
    ['ol', g('ol'), 0, 90, 100, 90], ['oc', g('oc') + g('o?'), 100, 90, 100, 90], ['or', g('or'), 200, 90, 100, 90],
  ];
  const pen = g('pc'), tot = cells.reduce((a, x) => a + x[1], 0) + pen, mx = Math.max(1, ...cells.map((x) => x[1]));
  const col = ZM === 'F' ? 'var(--ci-for)' : 'var(--ci-ag)';
  const sel = ZSEL && (ZSEL === 'pc' ? ['pc', pen] : cells.find((x) => x[0] === ZSEL));
  const cap = sel ? `<b>${NM[sel[0]]}</b><span><bdi dir="ltr" class="num">${sel[1]}</bdi> ${tt('من', 'of')} <bdi dir="ltr" class="num">${tot}</bdi> · <bdi dir="ltr" class="num">${tot ? Math.round((sel[1] / tot) * 100) : 0}%</bdi></span>` : `<span>${tt('اضغط على أي منطقة حتى تشوف تفاصيلها', 'Tap a zone for details')}</span>`;
  return `<section class="ci-viz"><header class="ci-vh"><h4>${ZM === 'F' ? tt('من وين يسجّل', 'Where he scores from') : tt('من وين تدخل عليه الأهداف', 'Where he concedes from')}</h4><div class="ci-tg" role="tablist"><button role="tab" aria-selected="${ZM === 'A'}" class="${ZM === 'A' ? 'on a' : ''}" onclick="clubZM('A')">${tt('استقبل', 'Conceded')}</button><button role="tab" aria-selected="${ZM === 'F'}" class="${ZM === 'F' ? 'on f' : ''}" onclick="clubZM('F')">${tt('سجّل', 'Scored')}</button></div></header>
  <svg class="ci-pitch" viewBox="-2 -12 304 196" dir="ltr" role="img" aria-label="${tt('خريطة الأهداف', 'Goal map')}">
    <rect x="0" y="0" width="300" height="180" rx="8" class="pf"/><path d="M60 0V90H240V0M110 0V26H190V0M120 90A30 30 0 0 0 180 90" class="pl"/><path d="M128 0V-8H172V0" class="pg"/><circle cx="150" cy="62" r="2" class="pd"/>
    ${cells.map(([k, v, x, y, w, h], i) => `<g class="zc${ZSEL === k ? ' sel' : ''}" role="button" tabindex="0" onclick="clubZS('${k}')" style="--i:${i}"><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="${v ? col : 'rgba(255,255,255,.02)'}" fill-opacity="${v ? (0.22 + (v / mx) * 0.7).toFixed(2) : 1}"/>${v ? `<text x="${x + w / 2}" y="${y + h / 2 + 6}">${v}</text>` : ''}</g>`).join('')}
    ${pen ? `<g class="zc pen${ZSEL === 'pc' ? ' sel' : ''}" role="button" tabindex="0" onclick="clubZS('pc')"><circle cx="150" cy="62" r="11" fill="${col}"/><text x="150" y="66.5" class="pk">${pen}</text></g>` : ''}
  </svg>
  <div class="ci-pl"><span>${tt('يسار المهاجم', "Attacker's left")}</span><span>${tt('يمين المهاجم', "Attacker's right")}</span></div>
  <div class="ci-cap" aria-live="polite">${cap}</div></section>`;
}
function timeChart(A) {
  const mx = Math.max(1, ...A.tbF, ...A.tbA), W = 300, cw = W / 6, H = 66, L = ['1–15', '16–30', '31–45', '46–60', '61–75', '76–90'];
  const bar = (v, i, up) => { const h = Math.max(v ? 6 : 0, (v / mx) * (H - 14)), x = i * cw + cw * 0.2, w = cw * 0.6; return v ? `<path style="--i:${i}" d="${up ? `M${x} ${H}V${H - h + 4}q0 -4 4 -4h${w - 8}q4 0 4 4V${H}Z` : `M${x} ${H + 2}V${H + 2 + h - 4}q0 4 4 4h${w - 8}q4 0 4 -4V${H + 2}Z`}" class="${up ? 'f' : 'a'}"/><text x="${x + w / 2}" y="${up ? H - h - 5 : H + h + 15}" class="v">${v}</text>` : ''; };
  const s = TSEL != null ? TSEL : null;
  const cap = s != null ? `<b>${tt(`بين الدقيقة ${L[s].replace('–', ' و')}`, `Minutes ${L[s]}`)}</b><span>${tt('سجّل', 'Scored')} <bdi dir="ltr" class="num">${A.tbF[s]}</bdi> · ${tt('استقبل', 'Conceded')} <bdi dir="ltr" class="num">${A.tbA[s]}</bdi></span>` : `<span>${tt('اضغط على أي فترة حتى تشوف أرقامها', 'Tap a period for its numbers')}</span>`;
  return `<section class="ci-viz"><header class="ci-vh"><h4>${tt('الأهداف حسب الدقائق', 'Goals by minute')}</h4><span class="ci-lg"><i class="f"></i>${tt('سجّل', 'Scored')}<i class="a"></i>${tt('استقبل', 'Conceded')}</span></header>
  <svg class="ci-time" viewBox="0 -6 ${W} ${H * 2 + 26}" dir="ltr" role="img" aria-label="${tt('الأهداف حسب الدقائق', 'Goals by minute')}">
    <rect x="${W / 2}" y="-6" width="${W / 2}" height="${H * 2 + 8}" class="h2bg"/>
    ${s != null ? `<rect x="${s * cw + 2}" y="-6" width="${cw - 4}" height="${H * 2 + 8}" rx="8" class="hl"/>` : ''}
    <line x1="0" x2="${W}" y1="${H + 1}" y2="${H + 1}" class="base"/>${A.tbF.map((v, i) => bar(v, i, true)).join('')}${A.tbA.map((v, i) => bar(v, i, false)).join('')}
    ${L.map((l, i) => `<text x="${i * cw + cw / 2}" y="${H * 2 + 18}" class="ax${s === i ? ' on' : ''}">${l}</text><rect x="${i * cw}" y="-6" width="${cw}" height="${H * 2 + 28}" class="hit" role="button" tabindex="0" onclick="clubTS(${i})"/>`).join('')}
  </svg>
  <div class="ci-halves"><span>${tt('الشوط الأول', '1st half')}</span><span>${tt('الشوط الثاني', '2nd half')}</span></div>
  <div class="ci-cap" aria-live="polite">${cap}</div></section>`;
}
function butterfly(title, rows) {
  const mx = Math.max(1, ...rows.flatMap((r) => [r[1], r[2]]));
  return `<section class="ci-viz"><header class="ci-vh"><h4>${title}</h4><span class="ci-lg"><i class="f"></i>${tt('سجّل', 'Scored')}<i class="a"></i>${tt('استقبل', 'Conceded')}</span></header><div class="ci-bf">${rows.filter((r) => r[1] || r[2]).map(([l, f, a], i) => `<div class="ci-bfr" style="--i:${i}"><span class="n f num">${f}</span><span class="b f"><i style="--w:${(f / mx).toFixed(3)}"></i></span><span class="l">${l}</span><span class="b a"><i style="--w:${(a / mx).toFixed(3)}"></i></span><span class="n a num">${a}</span></div>`).join('')}</div></section>`;
}
function nextViz(gws, tid) {
  const G = ST.G;
  return `<div class="ci-nx">${gws.map((g) => { const fs = (G.fx[g] || []).filter((f) => f.h === tid || f.a === tid); return `<div class="ci-nxg"><small>${tt(`ج${g}`, `GW${g}`)}</small>${fs.length ? fs.map((f) => { const h = f.h === tid, o = h ? f.a : f.h, d = h ? f.hd : f.ad; return `<span class="rate f${d}">${esc(tShort(o))}<em>${h ? tt('د', 'H') : tt('خ', 'A')}</em></span>`; }).join('') : `<span class="ci-bl">—</span>`}</div>`; }).join('')}</div>`;
}
function aiHTML(tid) {
  ciLoad(tid, () => { if (ST.view === 'clubs' && SEL === tid && TAB === 'ai') window.render(); });
  const R = analyse(tid), A = R.A, M = memory(tid, R);
  if (!A.p) return `<p class="mut cl-e">${tt('ما لعب أي مباراة بعد، فماكو بيانات نحللها', 'No matches played yet')}</p>`;
  const all = Object.entries(R.branches).flatMap(([br, xs]) => xs.filter((x) => !x.always).map((x) => ({ ...x, br })));
  const score = (x) => x.w / (1 + 0.3 * (M.seen[x.id] || 0)) + (M.freshIds.has(x.id) ? 0.45 : 0);
  const top = [...all].sort((a, b) => score(b) - score(a)).slice(0, 4);
  if (SAVED !== tid) { SAVED = tid; M.save(top.map((x) => x.id)); }
  const chg = M.changes.filter((c) => !c.ref);
  const cov = ciProg.total ? Math.round((ciProg.done / ciProg.total) * 100) : 100;
  const loading = ciProg.running && cov < 100;
  const howRows = (k) => { const F = A.howF, Ag = A.howA; return [[tt('قدم يمنى', 'Right foot'), F.r || 0, Ag.r || 0], [tt('قدم يسرى', 'Left foot'), F.l || 0, Ag.l || 0], [tt('رأسية', 'Header'), F.h || 0, Ag.h || 0], [tt('جزاء', 'Penalty'), F.p || 0, Ag.p || 0], [tt('عكسية', 'Own goal'), F.og || 0, Ag.og || 0], [tt('غيرها', 'Other'), F.o || 0, Ag.o || 0]]; };
  const astRows = () => { const F = A.astF, Ag = A.astA; return [[tt('عرضية', 'Cross'), F.c || 0, Ag.c || 0], [tt('بينية', 'Through ball'), F.t || 0, Ag.t || 0], [tt('ركنية', 'Corner'), F.k || 0, Ag.k || 0], [tt('ضربة حرة', 'Free kick'), F.f || 0, Ag.f || 0], [tt('مرتدة', 'Counter'), F.x || 0, Ag.x || 0], [tt('تمريرة', 'Pass'), (F.a || 0) + (F.hp || 0), (Ag.a || 0) + (Ag.hp || 0)], [tt('فردية', 'Solo'), F['-'] || 0, Ag['-'] || 0]]; };
  const vizFor = (br) => {
    if (A.ne < 3) return '';
    if (br === 'zone') return zoneMap(A);
    if (br === 'time') return timeChart(A);
    if (br === 'att') return butterfly(tt('شلون تدخل الأهداف', 'How goals go in'), howRows());
    if (br === 'set') return butterfly(tt('من وين جت الأهداف', 'Goal sources'), astRows());
    return '';
  };
  const br = BR().map(([id, ic, name]) => {
    let xs = R.branches[id].filter((x) => !x.always && (FILT === 'all' || x.tone === FILT)).sort((a, b) => b.w - a.w);
    if (FILT !== 'all' && !xs.length) return '';
    const nx = R.branches[id].find((x) => x.viz === 'next');
    if (!xs.length && !vizFor(id)) return '';
    const viz = FILT === 'all' ? vizFor(id) : '';
    const fr = xs.some((x) => M.freshIds.has(x.id));
    return `<details class="ci-br"${OPEN.has(id) ? ' open' : ''} ontoggle="clubBO('${id}',this.open)"><summary><span class="ci-bi">${I(ic, 'i')}</span><span class="ci-bt"><b>${name}</b><small>${esc(xs[0]?.title || '')}</small></span>${fr ? `<em class="ci-new">${tt('جديد', 'New')}</em>` : ''}<span class="ci-bn num">${xs.length}</span>${I('i-chev', 'i ci-cv')}</summary>
      <div class="ci-bb">${viz}${nx && FILT === 'all' ? nextViz(nx.gws, tid) : ''}${xs.map((x) => item(x, M.freshIds.has(x.id))).join('')}</div></details>`;
  }).join('');
  return `<div class="ci">
    ${loading ? `<div class="ci-load"><span>${tt(`يحلل مباريات الدوري للمقارنة… ${ciProg.done} من ${ciProg.total}`, `Analysing league matches… ${ciProg.done}/${ciProg.total}`)}</span><i style="--p:${cov}%"></i></div>` : ''}
    ${A.ne < 3 && !loading ? `<div class="note">${I('i-info', 'i')}<span>${tt('تحليل الأهداف والتسديدات بالتفصيل يحتاج بيانات المباريات، وبعدها ما وصلت. الملاحظات الحالية من بيانات الفانتازي.', 'Detailed shot data not available yet; showing FPL-based insights.')}</span></div>` : ''}
    <div class="ci-kpi n${R.kpi.length}">${R.kpi.map((k) => `<div class="ci-k"><small>${k.k}</small><b dir="ltr" class="num">${esc(String(k.v))}</b>${k.R ? `<span class="ci-kr ${k.R.r <= 4 ? 'g' : k.R.r >= k.R.n - 3 ? 'b' : ''}">${tt('المركز', 'Rank')} <bdi dir="ltr">${k.R.r}</bdi></span>` : ''}</div>`).join('')}</div>
    <div class="sec"><h2>${I('i-sparkle', 'i')}${tt('أبرز ما يميّزه', 'What stands out')}</h2></div>
    <div class="ci-top">${top.map((x) => item(x, M.freshIds.has(x.id), false)).join('')}</div>
    ${chg.length ? `<div class="sec"><h2>${I('i-refresh', 'i')}${tt('شنو تغيّر من آخر مرة', 'What changed')}</h2></div><div class="ci-top ci-chg">${chg.map((x) => item(x, false, false)).join('')}</div>` : ''}
    <div class="sec"><h2>${I('i-layers', 'i')}${tt('الشجرة الكاملة', 'Full breakdown')}</h2></div>
    <div class="ci-fl" role="tablist">${[['all', tt('الكل', 'All')], ['g', tt('نقاط القوة', 'Strengths')], ['b', tt('نقاط الضعف', 'Weaknesses')], ['n', tt('معلومات', 'Info')]].map(([k, l]) => `<button role="tab" aria-selected="${FILT === k}" class="${FILT === k ? 'on' : ''} ${k}" onclick="clubFI('${k}')">${l}</button>`).join('')}</div>
    <div class="ci-tree">${br}</div>
    <p class="ci-foot">${tt(`محسوبة من ${gamesW(A.p)}${A.ne ? `، منها ${A.ne} بتحليل كل هدف وتسديدة` : ''}. تتحدث وحدها بعد كل جولة.`, `Built from ${A.p} matches${A.ne ? ` (${A.ne} with shot-level data)` : ''}. Updates every gameweek.`)}</p>
  </div>`;
}

/* رجوع الجهاز/الإيماءة/زر الرجوع العلوي: من صفحة النادي يرجع لقائمة الأندية */
/** رسم مباشر بدل المقارنة (morph): صفحة النادي والقائمة مختلفات كلياً فالاستبدال أسرع وما يعلّق */
function paint() { window.__noMorph = true; try { window.render(); } finally { window.__noMorph = false; } }
/** رجوع لقائمة الأندية بنفس مكان التمرير اللي جان بي — نفس اللقطة اللي يعرضها الآيفون أثناء السحب */
function closeClub() { SEL = null; TAB = 'res'; POS = 'ALL'; paint(); window.scrollTo(0, LISTY); requestAnimationFrame(() => window.scrollTo(0, LISTY)); }
const prevHook = window.__backHook;
window.__backHook = (fromPop) => {
  if (ST.view === 'clubs' && SEL != null) { if (fromPop) { closeClub(); return 'popped'; } window.clubBack(); return true; }
  return prevHook ? prevHook(fromPop) : false;
};
