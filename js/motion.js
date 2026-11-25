/* =========================================================
   الحركة: عدّاد الأرقام لكل الأرقام الكبيرة، تموّج الضغط،
   وميض تغيّر القيم المباشرة، والسحب للتحديث
========================================================= */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const NUM_SEL = '.h2-pts b, .h2-st b, .h2-st em, .pz-sb b, .pz-row>b, .sq-stats b, .live-side b, .live-side em, .pu2-s b, .pu2-rk b, .pu2-rank em, .dc-ring b, .dc-row .col>.num, .pitch .lb, .benchbox .lb, .gwstrip b, .sq-tabs b, .pz-bar span, .h2-dl .cd b, .mx td.c, .tile b, .tag.num, .pill.num, .kpi b, .stat b, .big-num, .kpis b, .kv b, .stat .v, .tstrip b, .lab-res b, .score-ring b, .score, .count, .col.num, .vs .big, .ring b, .gauge b, .ss-h-main b, .ss-h-grid b, .ss-cmp b, .ss-hl em, .lpts, .rvs-stats b.num, .mc-lu-sum b, .st-pts, .cp-pct, .dc-n';
const RX = /^([▲▼+\-−£]*\s*)([\d,]+(?:\.\d+)?)(%?)$/;
const prev = new Map();

/** يحرّك كل رقم من 0 (أو من قيمته السابقة) لحد قيمته الجديدة */
export function countAll(root, firstView) {
  if (reduced()) return;
  root.querySelectorAll(NUM_SEL).forEach((el, i) => {
    if (el.children.length && !el.classList.contains('count')) { const t = el.firstChild; if (!t || t.nodeType !== 3) return; }
    const node = el.children.length ? el.firstChild : el; const raw = (node.nodeType === 3 ? node.nodeValue : node.textContent).trim();
    const m = raw.match(RX); if (!m) return;
    const sign = m[1], str = m[2], pct = m[3], v = parseFloat(str.replace(/,/g, '')); if (!isFinite(v) || v === 0) return;
    const dec = (str.split('.')[1] || '').length, comma = str.includes(','), key = `${location.hash}|${i}`;
    const from = firstView ? 0 : prev.get(key); prev.set(key, v);
    if (from == null || from === v) return;
    if (!firstView) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add(v > from ? 'flash' : 'flash-down'); }
    const fmt = (x) => { const s = x.toFixed(dec); return comma ? Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s; };
    const set = (x) => { const txt = sign + fmt(x) + pct; if (node.nodeType === 3) node.nodeValue = txt; else node.textContent = txt; };
    const t0 = performance.now(), dur = Math.min(900, 450 + i * 25);
    set(from);
    const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); set(from + (v - from) * e); if (k < 1) requestAnimationFrame(step); else set(v); };
    requestAnimationFrame(step);
  });
}

/* ردّ فعل الضغط صار بالـ CSS (انكماش خفيف). هنا بس: اهتزاز خفيف للزر الرئيسي، ولفّة أيقونة التحديث */
document.addEventListener('click', (e) => {
  if (e.target.closest('.bnav button')) { try { navigator.vibrate?.(6); } catch {} return; }
  const el = e.target.closest('.btn, .tap, .seg button, .chips2 button, .nb, .icon-btn'); if (!el) return;
  try { if (el.matches('.btn-p')) navigator.vibrate?.(6); } catch {}
  if (reduced()) return;
  const ic = el.querySelector('svg.i use[href="#i-refresh"]')?.parentElement;
  if (ic) { ic.classList.remove('fp-spin'); void ic.getBoundingClientRect(); ic.classList.add('fp-spin'); setTimeout(() => ic.classList.remove('fp-spin'), 600); }
}, { capture: true, passive: true });

/* الجرس يرن مرة وحدة لما يزيد عدد التنبيهات */
let lastUnread = null;
window.addEventListener('fp-notif', () => {
  const dot = document.getElementById('bellDot'); if (!dot) return;
  const n = dot.classList.contains('hidden') ? 0 : 1, btn = dot.closest('.icon-btn');
  if (lastUnread === 0 && n && btn && !reduced()) { btn.classList.remove('bell-ring'); void btn.offsetWidth; btn.classList.add('bell-ring'); setTimeout(() => btn.classList.remove('bell-ring'), 700); }
  lastUnread = n;
});

/* السحب لتحت للتحديث (بالرئيسية والصفحات الرئيسية) */
let y0 = null, pulled = 0;
const ind = () => document.getElementById('ptr') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'ptr', innerHTML: '<svg class="i"><use href="#i-refresh"/></svg>' });
document.addEventListener('touchstart', (e) => { if (window.scrollY <= 0 && !document.querySelector('.ov') && window.__canPull?.()) { y0 = e.touches[0].clientY; pulled = 0; } }, { passive: true });
document.addEventListener('touchmove', (e) => { if (y0 == null) return; pulled = Math.max(0, Math.min(110, (e.touches[0].clientY - y0) * 0.5)); const p = ind(); p.style.opacity = Math.min(1, pulled / 60); p.style.transform = `translate(-50%, ${pulled - 40}px) rotate(${pulled * 4}deg)`; p.classList.toggle('ready', pulled >= 65); }, { passive: true });
document.addEventListener('touchend', () => { if (y0 == null) return; const p = ind(); if (pulled >= 65) { p.classList.add('go'); try { navigator.vibrate?.(10); } catch {} (window.__pullRefresh?.() || window.loadAll?.(true) || Promise.resolve()).finally(() => { p.classList.remove('go', 'ready'); p.style.opacity = 0; }); } else { p.style.opacity = 0; p.style.transform = 'translate(-50%,-40px)'; } y0 = null; pulled = 0; });


/* =========================================================
   v5 — حركات إضافية: الأشرطة تتعبّى، الأسهم تتحرك، أحداث المباريات، الاحتفال
========================================================= */
/** كل شريط نسبة (عرضه بالـ %) يتعبّى من الصفر */
export function growBars(root) {
  if (reduced() || !root) return;
  root.querySelectorAll('[style*="width:"]').forEach((el, i) => {
    if (el.dataset.fxg || el.children.length || !/width:\s*[\d.]+%/.test(el.getAttribute('style') || '')) return;
    const h = el.getBoundingClientRect().height; if (!h || h > 16) return;
    el.dataset.fxg = 1; el.style.setProperty('--fxd', `${Math.min(i, 12) * 40}ms`); el.classList.add('fx-grow');
  });
}
/** أسهم ▲▼ تصير متحركة (صعود/نزول) */
export function animArrows(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/[▲▼]/.test(n.nodeValue) && !n.parentElement.closest('.arw, svg, textarea') ? 1 : 3) });
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  list.forEach((n) => { const f = document.createDocumentFragment(); n.nodeValue.split(/([▲▼])/).forEach((part) => { if (part === '▲' || part === '▼') { const sp = document.createElement('span'); sp.className = 'arw ' + (part === '▲' ? 'up' : 'down'); sp.textContent = part; f.appendChild(sp); } else if (part) f.appendChild(document.createTextNode(part)); }); n.parentNode.replaceChild(f, n); });
}
/** طبقة الحركات لصفحة أو ورقة */
export function decorate(root, first) { if (first) growBars(root); animArrows(root); }

/* أحداث المباريات: فقاعة فوق قميص اللاعب أو شريط فوق الشاشة */
const EV = { goal: ['⚽', 'سجّل هدف!'], assist: ['🅰️', 'صنع هدف!'], yellow: ['🟨', 'كرت أصفر'], red: ['🟥', 'كرت أحمر'], bonus: ['⭐', 'بونص'], save: ['🧤', 'صدّ جزاء'], bad: ['😬', 'حدث سلبي'], leak: ['🥅', 'استقبل هدف'], pts: ['', ''] };
window.__fxEvents = (list) => {
  if (window.__glowNotify?.(list)) { list = list.filter((e) => document.querySelector(`#view [data-pid="${e.id}"]`)); if (!list.length) return; }
  if (reduced()) return;
  const names = window.__fxName || ((id) => '#' + id);
  let banner = 0;
  list.forEach((e, k) => setTimeout(() => {
    const el = document.querySelector(`#view [data-pid="${e.id}"]`);
    const [emo, txt] = EV[e.k] || ['', ''];
    if (el && el.getBoundingClientRect().top > 0 && el.getBoundingClientRect().bottom < innerHeight) {
      const b = document.createElement('span');
      b.className = `fx-pop ${e.k}`; b.textContent = e.k === 'pts' ? (e.n > 0 ? '+' : '') + e.n : e.k === 'bonus' ? `⭐+${e.n}` : emo;
      el.appendChild(b); setTimeout(() => b.remove(), 1900);
      if (e.k === 'goal' || e.k === 'red' || e.k === 'yellow') { el.classList.remove('fx-hit'); void el.offsetWidth; el.classList.add('fx-hit'); }
    } else if (e.k !== 'pts' && banner < 3) {
      banner++;
      const d = document.createElement('div'); d.className = `fx-banner ${e.k}`;
      d.innerHTML = `<span class="e">${emo}</span><b></b><span>${txt}${e.k === 'bonus' ? ` +${e.n}` : ''}</span>`; d.querySelector('b').textContent = names(e.id);
      document.body.appendChild(d); setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3100);
    }
  }, k * 350));
};

/* 🎉 قصاصات احتفال خفيفة */
export function confetti(msg) {
  if (reduced()) return;
  const wrap = document.createElement('div'); wrap.className = 'fx-confetti';
  const C = ['#34D399', '#FBBF24', '#60A5FA', '#F472B6', '#A78BFA', '#F87171'];
  for (let i = 0; i < 46; i++) { const p = document.createElement('i'); p.style.cssText = `left:${Math.random() * 100}%;background:${C[i % C.length]};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 0.35}s;animation-duration:${1.6 + Math.random() * 0.9}s;${i % 3 ? '' : 'border-radius:50%;'}`; wrap.appendChild(p); }
  if (msg) { const m = document.createElement('div'); m.className = 'fx-cmsg'; m.textContent = msg; wrap.appendChild(m); }
  document.body.appendChild(wrap); setTimeout(() => wrap.remove(), 3400);
}
