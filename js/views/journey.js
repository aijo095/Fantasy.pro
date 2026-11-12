/* =========================================================
   رحلة الموسم — طريق مضيء على ملعب طويل من الجولة 1 لحد الكأس
   · كل محطة = جولة لعبتها (نقاطك + ترتيبك)، والمحطات المميزة عليها شارة
   · الطريق يتمايل أكثر كل ما تكون جولتك أقوى من المعدل
   · «شغّل الرحلة»: كرة مضيئة تمشي من أول جولة لحد هسة والكاميرا تتبعها
   (كلها من بيانات الفانتازي الحقيقية لحسابك)
========================================================= */
import { ST, PM } from '../store.js';
import { tt } from '../i18n.js';
import { esc, I, fmt, openSheet, sheetHead } from '../ui.js';
import * as FPL from '../fpl.js';

const STEP = 92, TOP = 250, BOT = 150, TOTAL = 38;
const CHIP = { wildcard: tt('وايلد كارد', 'Wildcard'), freehit: tt('فري هت', 'Free Hit'), bboost: tt('بنش بوست', 'Bench Boost'), '3xc': tt('كابتن ثلاثي', 'Triple Captain'), manager: tt('المدرب', 'Manager') };
let built = '', playing = false, capCache = {};

/* ---------- البيانات ---------- */
function data() {
  const hist = ST.E?.hist?.current || [], chips = {}; (ST.E?.hist?.chips || []).forEach((c) => (chips[c.event] = c.name));
  const ev = (g) => ST.G.events.find((e) => e.id === g) || {};
  const rows = hist.map((h, i) => {
    const prev = hist[i - 1], e = ev(h.event);
    return { g: h.event, pts: h.points, net: h.points - (h.event_transfers_cost || 0), avg: e.avg ?? null, top: e.top ?? null,
      rank: h.overall_rank, gwRank: h.rank, move: prev ? prev.overall_rank - h.overall_rank : 0, total: h.total_points, hit: h.event_transfers_cost || 0,
      tr: h.event_transfers || 0, bench: h.points_on_bench || 0, value: h.value, chip: chips[h.event] || null };
  });
  if (!rows.length) return { rows, ms: {} };
  const best = rows.reduce((a, r) => (r.pts > a.pts ? r : a)), worst = rows.reduce((a, r) => (r.pts < a.pts ? r : a));
  const bestRank = rows.reduce((a, r) => (r.rank && r.rank < a.rank ? r : a)), climb = rows.reduce((a, r) => (r.move > a.move ? r : a));
  const ms = {};
  const add = (g, k, ic, label) => { (ms[g] = ms[g] || []).push({ k, ic, label }); };
  add(best.g, 'best', 'i-star', tt('أعلى جولة', 'Best GW'));
  if (bestRank.rank) add(bestRank.g, 'rank', 'i-medal', tt('أفضل ترتيب', 'Best rank'));
  if (climb.move > 0) add(climb.g, 'climb', 'i-up', tt('أكبر صعود', 'Biggest climb'));
  rows.forEach((r) => { if (r.chip) add(r.g, 'chip', 'i-bolt', CHIP[r.chip] || r.chip); if (r.pts >= 90) add(r.g, 'ninety', 'i-fire', tt('نادي الـ90', '90 club')); });
  if (worst.g !== best.g) add(worst.g, 'worst', 'i-down', tt('أصعب جولة', 'Toughest GW'));
  return { rows, ms, best, bestRank, climb };
}

/* ---------- الهندسة: محطات بطريق متعرّج ---------- */
function geom(W, rows) {
  const H = TOP + BOT + (TOTAL - 1) * STEP, done = rows.length;
  const P = [];
  for (let i = 0; i < TOTAL; i++) {
    const r = rows[i], y = H - BOT - i * STEP;
    let amp;
    if (r) { const rel = r.avg ? (r.pts - r.avg) / Math.max(20, r.avg) : 0; amp = Math.max(.32, Math.min(1, .62 + rel * .9)); }
    else amp = .28;
    const side = i === 0 ? 0 : i % 2 ? 1 : -1;
    P.push({ x: W / 2 + side * amp * W * .3, y, r, i, g: r?.g ?? i + 1, done: i < done });
  }
  return { H, P };
}
function curve(pts) {
  if (!pts.length) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i], p3 = pts[i + 1] || p2, k = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * k, c1y = p1.y + (p2.y - p0.y) * k, c2x = p2.x - (p3.x - p1.x) * k, c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/* ---------- الكأس (رسم أصلي) ---------- */
const trophy = (cx, y) => `<g class="jr-trophy" transform="translate(${cx},${y})">
  <ellipse cx="0" cy="118" rx="120" ry="18" fill="url(#jrPodGlow)"/>
  <path d="M-92 118 L-70 96 H70 L92 118 Z" fill="url(#jrStep)"/><path d="M-66 96 L-50 80 H50 L66 96 Z" fill="url(#jrStep)" opacity=".9"/>
  <g class="jr-cup">
    <path d="M-30 -10 C-58 -10 -60 22 -32 30" fill="none" stroke="url(#jrGold)" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 -10 C58 -10 60 22 32 30" fill="none" stroke="url(#jrGold)" stroke-width="7" stroke-linecap="round"/>
    <path d="M-34 -16 H34 C34 26 20 44 0 48 C-20 44 -34 26 -34 -16 Z" fill="url(#jrGold)"/>
    <path d="M-22 -10 C-22 18 -14 32 -4 38" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/>
    <rect x="-7" y="47" width="14" height="14" fill="url(#jrGold)"/>
    <path d="M-24 76 L-18 60 H18 L24 76 Z" fill="url(#jrGold)"/>
    <rect x="-28" y="74" width="56" height="7" rx="2" fill="#7A5310"/>
  </g>
</g>`;

/* ---------- الواجهة ---------- */
export function vJourney() {
  const D = data();
  if (!D.rows.length) return `<div class="empty">${I('i-season', 'i', 'width:40px;height:40px')}<b>${tt('الرحلة تبدي بعد أول جولة', 'Your journey starts after GW1')}</b></div>`;
  const last = D.rows.at(-1), first = D.rows[0];
  const gained = first.rank && last.rank ? first.rank - last.rank : 0;
  return `<div class="jr-head">
      <div class="jr-ttl"><b>${tt('رحلة الموسم', 'Season journey')}</b><span>${tt(`${D.rows.length} جولة من ${TOTAL} · الطريق للكأس`, `${D.rows.length} of ${TOTAL} GWs · road to the cup`)}</span></div>
      <div class="jr-kpis">
        <div><small>${tt('المجموع', 'Total')}</small><b>${fmt(last.total)}</b></div>
        <div><small>${tt('ترتيبك هسة', 'Rank now')}</small><b>${fmt(last.rank)}</b></div>
        <div><small>${tt('من أول جولة', 'Since GW1')}</small><b class="${gained >= 0 ? 'up' : 'dn'}">${gained >= 0 ? '▲' : '▼'} ${fmt(Math.abs(gained))}</b></div>
      </div>
      <div class="jr-legend">${[['best', 'i-star', tt('أعلى جولة', 'Best')], ['rank', 'i-medal', tt('أفضل ترتيب', 'Best rank')], ['climb', 'i-up', tt('أكبر صعود', 'Climb')], ['chip', 'i-bolt', tt('ورقة', 'Chip')], ['worst', 'i-down', tt('أصعب', 'Toughest')]].map(([k, ic, l]) => `<span class="jr-lg ${k}">${I(ic)}${l}</span>`).join('')}</div>
    </div>
    <div id="jrHost" class="jr-host"></div>
    <div class="jr-ctrl"><button class="btn btn-p" onclick="jrPlay()">${I('i-live')}${tt('شغّل الرحلة', 'Play the journey')}</button><button class="btn btn-g" onclick="jrTo(${last.g})">${I('i-target')}${tt('جولتي الحالية', 'Current GW')}</button></div>`;
}

export function afterJourney() {
  const host = document.getElementById('jrHost'); if (!host) return;
  const D = data(); if (!D.rows.length) return;
  const W = Math.round(host.clientWidth || 360), key = `${W}|${D.rows.map((r) => r.g + ':' + r.pts + ':' + r.rank).join(',')}`;
  if (host.querySelector('.jr-scroll') && built === key) return;
  built = key; host.innerHTML = '';
  const { H, P } = geom(W, D.rows), done = P.filter((p) => p.done), fut = P.slice(Math.max(0, done.length - 1));
  const dDone = curve(done), dFut = curve(fut), cx = W / 2, tY = 18;
  const lastP = done.at(-1), topP = P.at(-1);
  const stations = P.map((p) => {
    const r = p.r, ms = D.ms[p.g] || [], big = ms.length > 0, cur = p.done && p === lastP;
    const right = p.x < cx; // التسمية بالجهة الثانية من الطريق
    const lab = r ? `<g class="jr-lab" transform="translate(${right ? 26 : -26},0)" text-anchor="${right ? 'start' : 'end'}">
        <text class="jr-pts" y="-2">${r.pts}</text><text class="jr-sub" y="15">${tt('ج', 'GW')}${p.g} · ${r.move > 0 ? '▲' : r.move < 0 ? '▼' : '•'}</text></g>` : `<text class="jr-fut" x="${right ? 22 : -22}" y="4" text-anchor="${right ? 'start' : 'end'}">${tt('ج', 'GW')}${p.g}</text>`;
    const badges = ms.slice(0, 2).map((m, k) => `<g class="jr-badge ${m.k}" transform="translate(${(k - (Math.min(2, ms.length) - 1) / 2) * 26},-34)"><circle r="11"/><use href="#${m.ic}" x="-7" y="-7" width="14" height="14"/></g>`).join('');
    const tone = r ? (r.move > 0 ? 'up' : r.move < 0 ? 'dn' : '') : '';
    return `<g class="jr-st ${p.done ? 'done' : 'fut'} ${big ? 'big' : ''} ${cur ? 'cur' : ''} ${tone}" data-g="${p.g}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})" style="--d:${p.i * 45}ms" ${r ? `onclick="jrOpen(${p.g})"` : ''}>
      <circle class="jr-hit" r="30"/>${p.done ? `<circle class="jr-halo" r="${big ? 24 : 18}"/>` : ''}
      <circle class="jr-ring" r="${big ? 14 : 11}"/><circle class="jr-core" r="${big ? 6 : 4.5}"/>${cur ? '<circle class="jr-pulse" r="14"/>' : ''}
      ${badges}${lab}</g>`;
  }).join('');
  const sparks = Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 100}%;--s:${5 + (i % 5) * 1.6}s;--dl:-${(i * .7) % 6}s"></i>`).join('');
  const wrap = document.createElement('div'); wrap.className = 'jr-wrap'; wrap.setAttribute('data-keep', '1');
  wrap.innerHTML = `<div class="jr-lights"><i></i><i></i></div><div class="jr-scroll"><div class="jr-pitch" style="height:${H}px">
    <div class="jr-sparks">${sparks}</div>
    <svg class="jr-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="jrGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3C4"/><stop offset=".45" stop-color="#F5C542"/><stop offset="1" stop-color="#B7791F"/></linearGradient>
        <linearGradient id="jrStep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B4416"/><stop offset="1" stop-color="#1D160A"/></linearGradient>
        <radialGradient id="jrPodGlow"><stop offset="0" stop-color="rgba(251,191,36,.55)"/><stop offset="1" stop-color="rgba(251,191,36,0)"/></radialGradient>
        <radialGradient id="jrRays" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(255,214,102,.55)"/><stop offset=".5" stop-color="rgba(255,214,102,.12)"/><stop offset="1" stop-color="rgba(255,214,102,0)"/></radialGradient>
        <filter id="jrGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <g class="jr-lines" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.5">
        <rect x="14" y="10" width="${W - 28}" height="${H - 20}" rx="6"/>
        <line x1="14" y1="${H / 2}" x2="${W - 14}" y2="${H / 2}"/><circle cx="${cx}" cy="${H / 2}" r="${W * .16}"/>
        <rect x="${W * .2}" y="${H - 10 - 150}" width="${W * .6}" height="150"/><rect x="${W * .34}" y="${H - 10 - 56}" width="${W * .32}" height="56"/>
        <rect x="${W * .2}" y="10" width="${W * .6}" height="150"/><rect x="${W * .34}" y="10" width="${W * .32}" height="56"/>
        <rect x="${W * .41}" y="${H - 10}" width="${W * .18}" height="12" stroke="rgba(255,255,255,.35)"/>
      </g>
      <circle class="jr-rays" cx="${cx}" cy="${tY + 60}" r="150" fill="url(#jrRays)"/>
      ${trophy(cx, tY)}
      <path class="jr-to-cup" d="M${topP.x.toFixed(1)},${topP.y.toFixed(1)} Q${cx},${(topP.y + tY + 140) / 2} ${cx},${tY + 132}" fill="none"/>
      <path class="jr-fut-path" d="${dFut}" fill="none"/>
      <path class="jr-glow" d="${dDone}" fill="none" filter="url(#jrGlow)"/>
      <path class="jr-path" d="${dDone}" fill="none"/>
      <path class="jr-dash" d="${dDone}" fill="none"/>
      ${stations}
      <g class="jr-comet" style="opacity:0"><circle r="22" class="c3"/><circle r="12" class="c2"/><circle r="6" class="c1"/></g>
    </svg></div></div>
    <div class="jr-toast"></div>`;
  host.appendChild(wrap);
  // رسم الطريق
  const path = wrap.querySelector('.jr-path'), glow = wrap.querySelector('.jr-glow'), len = path.getTotalLength();
  [path, glow].forEach((el) => { el.style.strokeDasharray = len; el.style.strokeDashoffset = len; });
  wrap.style.setProperty('--len', len);
  requestAnimationFrame(() => wrap.classList.add('go'));
  const sc = wrap.querySelector('.jr-scroll');
  sc.scrollTop = Math.max(0, lastP.y - sc.clientHeight * .55);
}

/* ---------- التفاعل ---------- */
function toast(html) { const t = document.querySelector('.jr-toast'); if (!t) return; t.innerHTML = html; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
window.jrTo = (g) => {
  const sc = document.querySelector('.jr-scroll'), st = document.querySelector(`.jr-st[data-g="${g}"]`); if (!sc || !st) return;
  const y = +st.getAttribute('transform').match(/,([\d.]+)\)/)[1];
  sc.scrollTo({ top: y - sc.clientHeight * .55, behavior: 'smooth' });
  st.classList.remove('flash'); void st.getBBox(); st.classList.add('flash');
};
window.jrPlay = () => {
  if (playing) return; const wrap = document.querySelector('.jr-wrap'); if (!wrap) return;
  const D = data(), sc = wrap.querySelector('.jr-scroll'), path = wrap.querySelector('.jr-path'), comet = wrap.querySelector('.jr-comet');
  const len = path.getTotalLength(), sts = [...wrap.querySelectorAll('.jr-st.done')];
  const ys = sts.map((s) => +s.getAttribute('transform').match(/,([\d.]+)\)/)[1]);
  playing = true; wrap.classList.add('playing'); sts.forEach((s) => s.classList.remove('lit'));
  const dur = Math.min(14000, 1400 + D.rows.length * 380), t0 = performance.now(); let k = 0;
  comet.style.opacity = 1;
  const step = (now) => {
    const f = Math.min(1, (now - t0) / dur), e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    const pt = path.getPointAtLength(len * e);
    comet.setAttribute('transform', `translate(${pt.x},${pt.y})`);
    path.style.strokeDashoffset = len * (1 - e);
    sc.scrollTop = pt.y - sc.clientHeight * .55;
    while (k < sts.length && pt.y <= ys[k] + 2) {
      const s = sts[k], r = D.rows[k]; s.classList.add('lit');
      if (r) { const m = D.ms[r.g]; toast(`<b>${tt('ج', 'GW')}${r.g}</b> <span class="p">${r.pts}</span>${m ? ` <em>${m.map((x) => x.label).join(' · ')}</em>` : ''}`); if (m) window.luxHaptic?.(); }
      k++;
    }
    if (f < 1) requestAnimationFrame(step);
    else { playing = false; wrap.classList.remove('playing'); comet.style.opacity = 0; window.luxHaptic?.(); }
  };
  path.style.transition = 'none'; requestAnimationFrame(step);
};
window.jrOpen = async (g) => {
  const D = data(), r = D.rows.find((x) => x.g === g); if (!r) return;
  const ms = D.ms[g] || [], vsAvg = r.avg != null ? r.pts - r.avg : null;
  const body = (cap) => sheetHead(`<b style="font-size:17px">${g}</b>`, tt(`الجولة ${g}`, `Gameweek ${g}`), ms.map((m) => m.label).join(' · ') || tt('محطة من رحلتك', 'A stop on your journey'), 'linear-gradient(140deg,#FDE68A,#F5C542 55%,#B7791F)', '#1C1404') +
    `<div class="jr-sh"><div class="jr-big"><b>${r.pts}</b><span>${tt('نقطة', 'pts')}${r.hit ? ` <em>(−${r.hit})</em>` : ''}</span></div>
     <div class="jr-grid">
       <div><small>${tt('المعدل', 'Average')}</small><b>${r.avg ?? '—'}</b>${vsAvg != null ? `<i class="${vsAvg >= 0 ? 'up' : 'dn'}">${vsAvg >= 0 ? '+' : ''}${vsAvg}</i>` : ''}</div>
       <div><small>${tt('أعلى نقاط', 'Highest')}</small><b>${r.top ?? '—'}</b></div>
       <div><small>${tt('ترتيبك العام', 'Overall rank')}</small><b>${fmt(r.rank)}</b><i class="${r.move >= 0 ? 'up' : 'dn'}">${r.move ? (r.move > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(r.move)) : '—'}</i></div>
       <div><small>${tt('ترتيب الجولة', 'GW rank')}</small><b>${fmt(r.gwRank)}</b></div>
       <div><small>${tt('انتقالات', 'Transfers')}</small><b>${r.tr}</b>${r.hit ? `<i class="dn">−${r.hit}</i>` : ''}</div>
       <div><small>${tt('نقاط الدكة', 'Bench pts')}</small><b>${r.bench}</b></div>
       <div><small>${tt('الكابتن', 'Captain')}</small><b class="jr-cap">${cap === undefined ? '…' : cap ? esc(cap) : '—'}</b></div>
       <div><small>${tt('الورقة', 'Chip')}</small><b>${r.chip ? CHIP[r.chip] || r.chip : '—'}</b></div>
     </div></div>`;
  const known = capCache[g];
  openSheet(body(known));
  if (known !== undefined) return;
  try {
    const pk = await FPL.fetchPicks(ST.profile.teamId, g), c = pk?.picks?.find((x) => x.is_captain), p = c && PM(c.element);
    capCache[g] = p ? `${p.web_name || p.name}${c.multiplier === 3 ? ' ×3' : ''}` : null;
  } catch { capCache[g] = null; }
  const el = document.querySelector('.jr-cap'); if (el) el.textContent = capCache[g] || '—';
};
