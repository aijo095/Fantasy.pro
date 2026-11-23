/* الجولات: كل جولة من 1 لحد 38 + مصفوفة صعوبة المباريات */
import { ST, PM, tShort, tName, officialRank } from '../store.js';
import { liveCalc } from '../live-engine.js';
import { t, tt } from '../i18n.js';
import { esc, I, fmt, crest, fmtTime, scoreHTML, fxMin } from '../ui.js';
import * as FPL from '../fpl.js';
import { xp, projected, fixturesFor, avgFdr, dgwBgw } from '../engine.js';
import { pShirt, playerSummary } from './common.js';

let gwSel = null, tab = 'gw', span = 6;
const cache = {};
const histOf = (g) => (ST.E.hist.current || []).find((h) => h.event === g);
const chipOf = (g) => (ST.E.hist.chips || []).find((c) => c.event === g);
const CHIP = () => ({ wildcard: tt('وايلد كارد', 'Wildcard'), freehit: tt('فري هيت', 'Free Hit'), bboost: tt('بنش بوست', 'Bench Boost'), '3xc': tt('كابتن ثلاثي', 'Triple Captain') });

export function vSeason() {
  const G = ST.G; if (gwSel == null) gwSel = G.next || G.cur || 1;
  const dg = Object.fromEntries(dgwBgw(1, G.lastGW).map((x) => [x.gw, x]));
  const strip = seasonChart(dg);
  return `${seasonHero()}<div class="tabs2"><button class="${tab === 'gw' ? 'on' : ''}" onclick="seasonTab('gw')">${tt('الجولات', 'Gameweeks')}</button><button class="${tab === 'mx' ? 'on' : ''}" onclick="seasonTab('mx')">${tt('مصفوفة الصعوبة', 'Fixture matrix')}</button></div>
   ${tab === 'gw' ? strip + (gwSel <= G.cur ? pastGW(gwSel) : futureGW(gwSel, dg[gwSel])) : matrix()}`;
}

/* الجولة الحالية: النقاط المباشرة والترتيب الرسمي الحالي بدل سجل الجولات (يتحدث بس بعد نهاية الجولة) */
function liveHist(g) {
  const h0 = histOf(g); if (g !== ST.G.cur || !ST.E?.picks) return h0;
  const en = ST.E.entry || {}, c = ST.live && ST.liveRawGW === g ? liveCalc(ST.E.picks, g, undefined, ST.live) : null;
  const pts = c ? c.total : en.summary_event_points ?? h0?.points ?? 0;
  const bench = c ? c.rows.filter((r) => r.m === 0).reduce((a, r) => a + r.pts, 0) : h0?.points_on_bench ?? 0;
  const R = officialRank();
  return { ...(h0 || {}), points: pts, points_on_bench: bench, overall_rank: R.rank || h0?.overall_rank, event_transfers: h0?.event_transfers ?? ST.E.picks?.entry_history?.event_transfers ?? 0, event_transfers_cost: c ? c.hit : h0?.event_transfers_cost ?? 0, __live: true, __move: R.move };
}
const cRank = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmt(n));
function rowsFor(g) {
  if (g === ST.G.cur && ST.E?.picks && ST.live && ST.liveRawGW === g) {
    const c = liveCalc(ST.E.picks, g, undefined, ST.live);
    return c.rows.map((r) => ({ id: r.id, pts: r.pts * Math.max(1, r.m), raw: r.pts, cap: r.cap, vc: r.vc, bench: r.m === 0, m: r.m }));
  }
  return cache[g]?.rows || null;
}
let myTr = null;
/* ---------- تقرير الجولة: شنو صار بقراراتك ---------- */
function reportHTML(g) {
  const c = cache[g], ev = ST.G.events.find((e) => e.id === g), h = histOf(g);
  if (!ev?.fin || !c?.rows || c.note || !h) return '';
  const xi = c.rows.filter((r) => !r.bench), bn = c.rows.filter((r) => r.bench), nm = (id) => esc(PM(id)?.name || '');
  const items = [];
  const row = (k, ico, title, sub, val, cls) => items.push(`<div class="rp-row ${k}"><span class="rp-i ${cls}">${ico}</span><div class="rp-t"><b>${title}</b><small>${sub}</small></div><em class="rp-v ${cls}">${val}</em></div>`);
  const sg = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  // الكابتن
  const cap = xi.find((r) => r.cap && r.m > 1) || xi.find((r) => r.m > 1), best = xi.slice().sort((a, b) => b.raw - a.raw)[0];
  if (cap && best) { const mult = cap.m, lost = (best.raw - cap.raw) * (mult - 1);
    if (lost > 0) row('cap', '©', tt(`الكابتن ${nm(cap.id)} جاب ${cap.raw * mult}`, `Captain ${nm(cap.id)}: ${cap.raw * mult}`), tt(`لو كبتنت ${nm(best.id)} (${best.raw}) جان زدت`, `${nm(best.id)} (${best.raw}) would have added`), sg(lost), 'bad');
    else row('cap', '©', tt(`الكابتن ${nm(cap.id)} جاب ${cap.raw * mult}`, `Captain ${nm(cap.id)}: ${cap.raw * mult}`), tt('أفضل اختيار ممكن من تشكيلتك', 'The best pick in your XI'), '✓', 'good'); }
  // الدكة
  const bp = c.chip === 'bboost' ? 0 : bn.reduce((a, r) => a + r.raw, 0), topB = bn.slice().sort((a, b) => b.raw - a.raw)[0];
  if (c.chip === 'bboost') row('bench', '⇪', tt('لعبت بنش بوست', 'Bench Boost played'), tt(`الدكة جابت ${bn.reduce((a, r) => a + r.raw, 0)} نقطة وانحسبت`, 'Bench points counted'), '✓', 'good');
  else if (topB) row('bench', '▤', tt(`${bp} نقطة بقت على الدكة`, `${bp} pts left on bench`), bp ? tt(`أعلاهم ${nm(topB.id)} (${topB.raw})`, `Top: ${nm(topB.id)} (${topB.raw})`) : tt('ما ضيّعت شي', 'Nothing wasted'), bp >= 8 ? sg(-bp) : bp ? String(bp) : '✓', bp >= 8 ? 'bad' : bp ? 'mid' : 'good');
  // الانتقالات
  if (c.tr?.length) { const net = c.tr.reduce((a, x) => a + x.pin - x.pout, 0) - (h.event_transfers_cost || 0);
    row('tr', '⇄', tt(`${c.tr.length} انتقال${h.event_transfers_cost ? ` (خصم ${h.event_transfers_cost})` : ''}`, `${c.tr.length} transfer(s)`), c.tr.map((x) => `<span class="mv" dir="ltr">${nm(x.out)} ${x.pout}<i class="mv-a">→</i>${nm(x.in)} ${x.pin}</span>`).join(' · '), sg(net), net > 0 ? 'good' : net < 0 ? 'bad' : 'mid'); }
  // أفضل وأسوأ أساسي
  const worst = xi.slice().sort((a, b) => a.raw - b.raw)[0];
  if (best && worst && best.id !== worst.id) row('bw', '★', tt(`الأفضل ${nm(best.id)} (${best.raw})`, `Best: ${nm(best.id)} (${best.raw})`), tt(`الأقل ${nm(worst.id)} (${worst.raw})`, `Lowest: ${nm(worst.id)} (${worst.raw})`), String(best.raw), 'good');
  const diff = ev.avg != null ? h.points - ev.avg : 0;
  const grade = diff >= 15 ? [tt('جولة ممتازة', 'Excellent'), 'good'] : diff >= 4 ? [tt('جولة جيدة', 'Good'), 'good'] : diff > -5 ? [tt('جولة عادية', 'Average'), 'mid'] : [tt('جولة ضعيفة', 'Poor'), 'bad'];
  return `<div class="sec"><h2>${I('i-list')}${tt('تقرير الجولة', 'GW report')}</h2><span class="rp-g ${grade[1]}">${grade[0]}</span></div><div class="card rp-card">${items.join('')}</div>`;
}
function capHTML(g) {
  const rows = rowsFor(g), capR = rows?.find((r) => r.cap && r.m !== 0) || rows?.find((r) => r.cap);
  return `<small>${tt('الكابتن', 'Captain')}</small>${capR ? `<b>${esc(PM(capR.id)?.name || '')}</b><em class="mut">${capR.pts} ${tt('نقطة', 'pts')}</em>` : rows ? '<b>—</b>' : '<b class="mut">…</b>'}`;
}
function pastGW(g) {
  const G = ST.G, ev = G.events.find((e) => e.id === g), h = liveHist(g), c = chipOf(g), prev = histOf(g - 1);
  const mv = h?.__live ? h.__move : h && prev && prev.overall_rank ? prev.overall_rank - h.overall_rank : 0;
  const me = h ? h.points : null, avg = ev.avg ?? null, top = ev.top ?? null, mx = Math.max(me || 0, avg || 0, top || 0, 1);
  const bar = (lab, v, cls) => `<div class="ss-cmp ${cls}"><span>${lab}</span><div><i style="width:${v == null ? 0 : Math.max(3, (v / mx) * 100)}%"></i></div><b class="num">${v ?? '—'}</b></div>`;
  const rows = rowsFor(g), capR = rows?.find((r) => r.cap && r.m !== 0) || rows?.find((r) => r.cap);
  const diff = me != null && avg != null ? me - avg : null;
  const head = `<div class="card ss-gw">
    <div class="ss-gw-top"><div><small>${t('gw')} ${g}</small><b>${ev.fin ? tt('منتهية', 'Finished') : `<span class="livebadge">${tt('جارية', 'Live')}</span>`}</b></div>${c ? `<span class="tag violet">${I('i-bolt')}${CHIP()[c.name] || c.name}</span>` : ''}${diff != null ? `<span class="ss-diff ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲ +' : '▼ '}${diff} ${tt('عن المعدل', 'vs avg')}</span>` : ''}</div>
    <div class="ss-cmps">${bar(tt('أنت', 'You'), me, 'me')}${bar(tt('المعدل', 'Average'), avg, 'avg')}${bar(tt('الأعلى', 'Highest'), top, 'top')}</div>
    <div class="ss-mini">
      <div><small>${t('overall')}</small><b class="num">${h?.overall_rank ? cRank(h.overall_rank) : '—'}</b>${mv ? `<em class="${mv > 0 ? 'up' : 'down'}">${mv > 0 ? '▲' : '▼'}${cRank(Math.abs(mv))}</em>` : ''}</div>
      <div id="gwCap">${capHTML(g)}</div>
      <div><small>${tt('الدكة', 'Bench')}</small><b class="num">${h?.points_on_bench ?? '—'}</b><em class="mut">${tt('نقطة', 'pts')}</em></div>
      <div><small>${tt('الانتقالات', 'Transfers')}</small><b class="num">${h?.event_transfers ?? '—'}</b>${h?.event_transfers_cost ? `<em class="down">−${h.event_transfers_cost}</em>` : `<em class="mut">${tt('بلا خصم', 'no hit')}</em>`}</div>
    </div></div>`;
  return head + `<div id="gwRep">${reportHTML(g)}</div><div class="sec"><h2>${I('i-star')}${tt('أبرز لاعبيك', 'Your standouts')}</h2><button class="lnk" onclick="go('team')">${tt('الملعب', 'Pitch')} ›</button></div><div id="gwTeam">${teamBlock(g)}</div>
   <div class="sec"><h2>${I('i-cal')}${tt('نتائج الجولة', 'Results')}</h2><span class="mut" style="font-size:12px">${(G.fx[g] || []).length} ${tt('مباراة', 'matches')}</span></div>${fixtures(g)}`;
}
/* بطاقة الموسم */
function seasonHero() {
  const en = ST.E.entry || {}, hist = (ST.E.hist.current || []).filter((h) => h.event <= ST.G.cur), R = officialRank();
  const done = hist.filter((h) => h.event < ST.G.cur || ST.G.events.find((e) => e.id === h.event)?.fin);
  const best = done.reduce((a, h) => (!a || h.points > a.points ? h : a), null);
  const above = done.filter((h) => { const e = ST.G.events.find((x) => x.id === h.event); return e?.avg != null && h.points >= e.avg; }).length;
  const hits = done.reduce((a, h) => a + (h.event_transfers_cost || 0), 0);
  return `<div class="ss-hero"><div class="ss-h-main"><small>${tt('موسمك', 'Your season')}</small><b class="num">${fmt(en.summary_overall_points ?? 0)}</b><span>${tt('نقطة', 'pts')}</span></div>
    <div class="ss-h-grid">
      <div><small>${t('overall')}</small><b class="num">${R.rank ? fmt(R.rank) : '—'}</b></div>
      <div><small>${tt('أفضل جولة', 'Best GW')}${best ? ` <em>(${t('gw')} ${best.event})</em>` : ''}</small><b class="num">${best ? best.points : '—'}</b></div>
      <div><small>${tt('فوق المعدل', 'Above avg')}</small><b class="num">${above}/${done.length}</b></div>
      <div><small>${tt('الخصومات', 'Hits')}</small><b class="num ${hits ? 'down' : ''}">${hits ? '−' + hits : 0}</b></div>
    </div></div>`;
}
/* مخطط الموسم: عمود لكل جولة (نقاطك) + شَرطة معدل الجولة — اضغط للانتقال */
function seasonChart(dg) {
  const G = ST.G, evs = G.events, W = 10, H = 96, pad = 16;
  const vals = evs.map((e) => { const h = e.id === G.cur ? liveHist(e.id) : histOf(e.id); return { e, me: e.id <= G.cur && h ? h.points : null, avg: e.id <= G.cur ? e.avg ?? null : null }; });
  const mx = Math.max(10, ...vals.map((v) => Math.max(v.me || 0, v.avg || 0)));
  const y = (v) => H - (v / mx) * (H - pad);
  const bars = `<line x1="0" x2="${evs.length * W}" y1="${H}" y2="${H}" class="base"/>` + vals.map((v, i) => {
    const x = i * W, on = v.e.id === gwSel, cur = v.e.id === G.cur && !v.e.fin;
    let g = '';
    if (v.me != null) { const yy = y(Math.max(0, v.me)); const hh = Math.max(2, H - yy), r = Math.min(2, hh / 2), x0 = x + 2, x1 = x + W - 2; g += `<path d="M${x0} ${H}V${H - hh + r}Q${x0} ${H - hh} ${x0 + r} ${H - hh}H${x1 - r}Q${x1} ${H - hh} ${x1} ${H - hh + r}V${H}Z" class="b${on ? ' on' : ''}${cur ? ' cur' : ''}" style="--i:${i}"/>`; }
    else g += `<circle cx="${x + W / 2}" cy="${H - 2}" r="1.6" class="fut${dg[v.e.id]?.dbl.length ? ' dbl' : ''}"/>`;
    if (v.avg != null) g += `<line x1="${x + 1}" x2="${x + W - 1}" y1="${y(v.avg)}" y2="${y(v.avg)}" class="avg"/>`;
    if (on && v.me != null) g += `<text x="${x + W / 2}" y="${y(Math.max(0, v.me)) - 4}" class="lbl">${v.me}</text>`;
    g += `<rect x="${x}" y="0" width="${W}" height="${H + 14}" class="hit" onclick="seasonGo(${v.e.id})"><title>${t('gw')} ${v.e.id}${v.me != null ? ` · ${v.me}` : ''}${v.avg != null ? ` · ${tt('المعدل', 'avg')} ${v.avg}` : ''}</title></rect>`;
    if (v.e.id % 5 === 0 || v.e.id === 1) g += `<text x="${x + W / 2}" y="${H + 11}" class="ax${on ? ' on' : ''}">${v.e.id}</text>`;
    return g;
  }).join('');
  const sel = vals.find((v) => v.e.id === gwSel);
  return `<div class="card ss-chart"><div class="ss-c-head"><b>${tt('مسار موسمك', 'Season path')}</b><span class="ss-leg"><i class="sw"></i>${tt('نقاطك', 'Your pts')}<i class="tk"></i>${tt('معدل الجولة', 'GW avg')}</span></div>
    <svg viewBox="0 -4 ${evs.length * W} ${H + 18}" preserveAspectRatio="none" dir="ltr">${bars}</svg>
    <div class="ss-nav" dir="ltr"><button onclick="seasonGo(${Math.max(1, gwSel - 1)})" aria-label="prev">‹</button><b dir="rtl">${t('gw')} ${gwSel}${sel?.me != null ? ` · <span class="num">${sel.me}</span> ${tt('نقطة', 'pts')}` : ` · ${tt('قادمة', 'upcoming')}`}</b><button onclick="seasonGo(${Math.min(G.lastGW || 38, gwSel + 1)})" aria-label="next">›</button></div></div>`;
}
function teamBlock(g) {
  const rows = rowsFor(g), c = cache[g];
  if (!rows) return c === null || c === undefined ? `<div class="card mut">${t('loading')}</div>` : `<div class="card mut">${esc(c?.err || t('noData'))}</div>`;
  const played = rows.filter((r) => !r.bench && r.pts != null).sort((a, b) => b.pts - a.pts);
  const top3 = played.slice(0, 3), worst = played.filter((r) => !r.cap).slice(-1)[0], benchPts = rows.filter((r) => r.bench).reduce((a, r) => a + (r.pts || 0), 0);
  const card = (r, k, lab) => { const p = PM(r.id); if (!p) return ''; return `<button class="ss-hl ${k}" onclick="playerGW(${p.id},${g},${r.cap ? 2 : 1})"><span class="ss-hl-rk">${lab}</span><div class="mini">${pShirt(p)}</div><b>${esc(p.name)}</b><em class="num">${r.pts ?? '—'}</em>${r.cap ? '<i class="c">C</i>' : ''}</button>`; };
  const list = `<div class="list">${rows.slice().sort((a, b) => (a.bench - b.bench) || (b.pts ?? -1) - (a.pts ?? -1)).map((r) => { const p = PM(r.id); return p ? `<div class="row tap" onclick="playerGW(${p.id},${g},${r.cap ? 2 : 1})" style="${r.bench ? 'opacity:.6' : ''}"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)} ${r.cap ? `<span class="tag" style="background:var(--gold);color:#1C1404">C</span>` : r.vc ? '<span class="tag">V</span>' : ''}${r.bench ? ` <span class="tag">${t('bench')}</span>` : ''}</b><span>${r.line || tShort(p.team)}</span></div><div class="col" style="font-size:16px">${r.pts ?? '—'}<small>${tt('نقطة', 'pts')}</small></div></div>` : ''; }).join('')}</div>`;
  return `<div class="ss-hls">${top3.map((r, i) => card(r, i === 0 ? 'gold' : '', i === 0 ? tt('الأفضل', 'Best') : `#${i + 1}`)).join('')}${worst ? card(worst, 'low', tt('الأقل', 'Lowest')) : ''}</div>
   ${benchPts ? `<p class="ss-note">${I('i-bench', 'i', 'width:14px;height:14px')}${tt(`${benchPts} نقطة بقت على الدكة`, `${benchPts} pts left on bench`)}</p>` : ''}
   <details class="ss-all"><summary>${tt('كل لاعبيك بهالجولة', 'All your players')}</summary>${list}</details>${c?.note ? `<p class="mut" style="font-size:12px;margin:8px 2px">${c.note}</p>` : ''}`;
}
async function loadTeam(g) {
  if (cache[g]) return; cache[g] = null;
  const id = ST.profile.teamId;
  try {
    const [pk, lv, trAll] = await Promise.all([FPL.fetchPicks(id, g), FPL.loadLive(g), (myTr = myTr || FPL.fetchTransfers(id).catch(() => []))]);
    const L = Object.fromEntries(lv.elements.map((x) => [x.id, x.stats]));
    cache[g] = { chip: pk.active_chip, tr: (Array.isArray(trAll) ? trAll : []).filter((x) => x.event === g).map((x) => ({ in: x.element_in, out: x.element_out, pin: L[x.element_in]?.total_points || 0, pout: L[x.element_out]?.total_points || 0 })), rows: pk.picks.sort((a, b) => a.position - b.position).map((x) => { const s = L[x.element] || {}; return { id: x.element, raw: s.total_points || 0, m: x.multiplier, pts: (s.total_points || 0) * (x.multiplier || 1), cap: x.is_captain, vc: x.is_vice_captain, bench: x.position > 11, line: `${s.minutes ?? 0}' · ${tt('أهداف', 'G')} ${s.goals_scored || 0} · ${tt('صناعة', 'A')} ${s.assists || 0}${s.bonus ? ` · ${tt('بونص', 'B')} ${s.bonus}` : ''}` }; }) };
  } catch {
    // بديل: نقاط لاعبينك الحاليين بهذي الجولة من سجل كل لاعب
    try {
      const sq = ST.plan ? [...ST.plan.xi, ...ST.plan.bench] : [];
      const rows = await Promise.all(sq.map(async (pid) => { const d = await playerSummary(pid).catch(() => null); const hs = (d?.history || []).filter((x) => x.round === g); return { id: pid, pts: hs.length ? hs.reduce((a, x) => a + x.total_points, 0) : null, line: hs.length ? hs.map((x) => `${tShort(x.opponent_team)} (${x.was_home ? t('home_s') : t('away_s')}) · ${x.minutes}'`).join(' + ') : tt('ما لعب أو بيانات غير متوفرة', 'No data') }; }));
      cache[g] = { rows: rows.sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1)), note: tt('تشكيلتك الرسمية لهالجولة غير متاحة هنا، فهذي نقاط لاعبينك الحاليين بنفس الجولة.', 'Official picks for this GW unavailable — showing your current players\' points that GW.') };
    } catch (e) { cache[g] = { err: e.message }; }
  }
  if (ST.view === 'season' && gwSel === g) { const el = document.getElementById('gwTeam'); if (el) el.innerHTML = teamBlock(g); const c = document.getElementById('gwCap'); if (c) c.innerHTML = capHTML(g); const rp = document.getElementById('gwRep'); if (rp) rp.innerHTML = reportHTML(g); }
  // تحميل مسبق للجولتين المجاورتين حتى يطلع الكابتن والأبرز فوراً
  [g - 1, g + 1].forEach((x) => { if (x >= 1 && x <= ST.G.cur && cache[x] === undefined) setTimeout(() => loadTeam(x), 300); });
}
function fixtures(g) {
  const fx = (ST.G.fx[g] || []).slice().sort((a, b) => (a.ko || '').localeCompare(b.ko || ''));
  if (!fx.length) return `<div class="card mut">${tt('مباريات هذي الجولة غير متوفرة', 'No fixtures available')}</div>`;
  const mine = new Set((ST.plan?.squad || []).map((id) => PM(id)?.team));
  let day = '';
  return `<div class="list">${fx.map((f) => { const d = f.ko ? new Date(f.ko).toLocaleDateString(document.dir === 'ltr' ? 'en-GB' : 'ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' }) : tt('موعد غير محدد', 'TBC'); const hd = d !== day ? `<div class="mut" style="font-size:12px;padding:10px 12px 4px;background:var(--bg2)">${(day = d)}</div>` : '';
    return hd + `<div class="row tap" onclick="${window.openMatchC ? `openMatchC(${f.id},${f.ev})` : `go('live')`}"><div class="flex" style="flex:1;justify-content:flex-end;gap:8px;min-width:0"><b style="font-size:13.5px;${mine.has(f.h) ? 'color:var(--acc)' : ''}">${tName(f.h)}</b>${crest(tShort(f.h), 26)}</div><div class="fxr-mid">${f.started ? `${scoreHTML(f.hs, f.as, 'score', 'font-size:17px')}${f.fin ? '' : '<span class="fxr-min"><i></i>' + fxMin(f, true) + '</span>'}` : `<span class="num mut" style="font-size:13px">${f.ko ? new Date(f.ko).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>`}</div><div class="flex" style="flex:1;gap:8px;min-width:0">${crest(tShort(f.a), 26)}<b style="font-size:13.5px;${mine.has(f.a) ? 'color:var(--acc)' : ''}">${tName(f.a)}</b></div></div>`; }).join('')}</div>`;
}
function futureGW(g, d) {
  const G = ST.G, ev = G.events.find((e) => e.id === g), P = ST.plan;
  const sq = P ? [...P.xi, ...P.bench].map(PM) : [];
  const cap = [...(P?.xi || [])].map(PM).sort((a, b) => xp(b, g) - xp(a, g))[0];
  const playing = sq.filter((p) => fixturesFor(p.team, g).length).length;
  return `<div class="hero"><div class="flex between"><div><div class="mut" style="font-size:13px">${t('gw')} ${g} · ${tt('الإغلاق', 'Deadline')} ${fmtTime(ev.deadline)}</div><div class="big-num" style="font-size:36px">${P ? projected(P, g) : '—'} <span class="mut" style="font-size:14px">${tt('متوقع لفريقك', 'projected')}</span></div></div>${d?.dbl.length ? `<span class="tag violet">${tt('جولة مزدوجة', 'Double GW')}</span>` : d?.blank.length && (G.fx[g] || []).length ? `<span class="tag amber">${tt('جولة فارغة', 'Blank GW')}</span>` : ''}</div>
   <div class="kpis"><div><small>${tt('لاعبينك يلعبون', 'Your players playing')}</small><b>${playing}/15</b></div><div><small>${tt('الكابتن المقترح', 'Suggested captain')}</small><b style="font-size:15px">${cap ? esc(cap.name) : '—'}</b>${cap ? `<em class="up"> ${xp(cap, g)} xP</em>` : ''}</div><div><small>${tt('مزدوجة/فارغة', 'Double/blank')}</small><b style="font-size:15px">${d ? `${d.dbl.length}/${d.blank.length}` : '0/0'}</b></div></div></div>
   <div class="sec"><h2>${I('i-users')}${tt('لاعبينك بهالجولة', 'Your players')}</h2></div>
   <div class="list">${sq.sort((a, b) => xp(b, g) - xp(a, g)).map((p) => { const f = fixturesFor(p.team, g); return `<div class="row tap" onclick="openPlayer(${p.id})"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)}</b><span>${f.length ? f.map((x) => `<span class="rate f${x.fdr}">${tShort(x.opp)} ${x.home ? t('home_s') : t('away_s')}</span>`).join(' ') : `<span class="tag amber">${tt('ما يلعب', 'Blank')}</span>`}</span></div><div class="col" style="color:var(--acc)">${xp(p, g)}<small>xP</small></div></div>`; }).join('')}</div>
   <div class="sec"><h2>${I('i-cal')}${tt('مباريات الجولة', 'Fixtures')}</h2></div>${fixtures(g)}`;
}
function matrix() {
  const G = ST.G, from = G.next || G.cur, to = Math.min(G.lastGW, from + span - 1), gws = []; for (let g = from; g <= to; g++) gws.push(g);
  const myCount = {}; (ST.plan?.squad || []).forEach((id) => { const tm = PM(id).team; myCount[tm] = (myCount[tm] || 0) + 1; });
  const rows = Object.values(G.teams).map((tm) => ({ tm, avg: avgFdr(tm.id, from, gws.length) })).sort((a, b) => a.avg - b.avg);
  return `<div class="flex between wrap" style="margin-bottom:10px"><div class="seg">${[4, 6, 8, 12, 38].map((n) => `<button class="${span === n ? 'on' : ''}" onclick="seasonSpan(${n})">${n === 38 ? tt('للنهاية', 'To end') : n + ' ' + tt('جولات', 'GWs')}</button>`).join('')}</div></div>
   <div class="card scroll-x" dir="ltr" style="padding:10px"><table class="mx"><thead><tr><th style="text-align:left">${tt('النادي', 'Club')}</th><th>${tt('المعدل', 'Avg')}</th>${gws.map((g) => `<th>${g}</th>`).join('')}</tr></thead><tbody>
   ${rows.map(({ tm, avg }) => `<tr><td class="tn" onclick="openClub(${tm.id})"><span class="mx-tn"><b>${tm.short}</b><i class="${myCount[tm.id] ? 'on' : ''}">${myCount[tm.id] || ''}</i></span></td><td class="c" style="background:var(--s2)">${avg.toFixed(1)}</td>${gws.map((g) => { const f = fixturesFor(tm.id, g); return f.length ? `<td class="c f${Math.round(f.reduce((a, x) => a + x.fdr, 0) / f.length)}">${f.map((x) => `${tShort(x.opp)}<small>${x.home ? 'H' : 'A'}</small>`).join('')}</td>` : '<td class="c blank">—</td>'; }).join('')}</tr>`).join('')}
   </tbody></table></div>
   <div class="flex wrap" style="gap:6px;margin-top:10px;font-size:12px"><span class="mut">${tt('الصعوبة', 'Difficulty')}:</span>${[1, 2, 3, 4, 5].map((d) => `<span class="rate f${d}">${d}</span>`).join('')}<span class="mut">· ${tt('مرتبة من الأسهل · الرقم الأخضر = عدد لاعبينك', 'Sorted easiest first · green = your players')}</span></div>`;
}
export function afterSeason() {
  if (tab === 'gw' && gwSel <= ST.G.cur) loadTeam(gwSel);
}
Object.assign(window, {
  seasonGo: (g) => { gwSel = g; tab = 'gw'; if (ST.view !== 'season') window.go('season'); else window.render(); },
  seasonTab: (x) => { tab = x; window.render(); },
  seasonSpan: (n) => { span = n; window.render(); },
});
