/* الواجهة الجديدة (معاينة) — تفاعلات: مؤشرات تنزلق، شريط علوي زجاجي، سحب الأوراق، اتجاه الانتقال */
const $ = (s, r = document) => r.querySelector(s);
const ORDER = ['home', 'team', 'season', 'players', 'more'];

/* 1) مؤشر شريط التنقّل */
function navInd() {
  const nav = $('#bnav'); if (!nav || !nav.children.length) return;
  let ind = nav.querySelector('.nav-ind'); if (!ind) { ind = document.createElement('i'); ind.className = 'nav-ind'; nav.prepend(ind); }
  const on = nav.querySelector('button.on'); if (!on) { ind.style.width = '0'; return; }
  ind.style.setProperty('--nx', on.offsetLeft + 'px'); ind.style.width = on.offsetWidth + 'px';
}
/* 2) مؤشر التبويبات (متغيرات CSS حتى ما ينمسح مع التحديث) */
function tabInd(root = document) {
  root.querySelectorAll('.tabs2, .mc-tabs').forEach((t) => {
    const on = t.querySelector('button.on'); if (!on || !on.offsetWidth) return;
    t.setAttribute('data-fx-keep', '1');
    const ix = on.offsetLeft + 'px', iw = on.offsetWidth + 'px';
    if (t.style.getPropertyValue('--ix') !== ix) t.style.setProperty('--ix', ix);
    if (t.style.getPropertyValue('--iw') !== iw) t.style.setProperty('--iw', iw);
  });
}
/* 3) اتجاه انتقال الصفحات */
let lastView = null;
function viewDir() {
  const v = $('#view'), cur = v?.dataset.view; if (!cur || cur === lastView) return;
  const a = ORDER.indexOf(lastView), b = ORDER.indexOf(cur), rtl = document.dir !== 'ltr';
  const d = a < 0 || b < 0 ? 0 : (b > a ? 1 : -1) * (rtl ? -1 : 1);
  v.style.setProperty('--dx', d * 26 + 'px'); lastView = cur;
}
let raf = 0;
const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { viewDir(); navInd(); tabInd(); }); };
new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-view'] });
addEventListener('resize', tick); tick(); setTimeout(tick, 400);

/* 4) الشريط العلوي يصير زجاجي عند التمرير */
const tb = $('.topbar');
addEventListener('scroll', () => tb?.classList.toggle('scrolled', scrollY > 8), { passive: true });

/* 4ب) الشريط السفلي يصغر لكبسولة وأنت تنزل، ويتبع إصبعك خطوة بخطوة (مثل شريط سفاري)
   الحجم الحقيقي ما يتغير أبداً: بس transform، فالحركة على كارت الشاشة وما تقطّع */
{
  const nav = $('.bnav'); let lastY = scrollY, p = 0, raf = 0, idleT = 0;
  const RANGE = 90; // كم بكسل تمرير حتى يصغر بالكامل
  const paint = () => { raf = 0; nav?.style.setProperty('--navp', p.toFixed(3)); nav?.classList.toggle('is-mini', p > 0.5); };
  const put = (v, snap) => { p = Math.max(0, Math.min(1, v)); nav?.classList.toggle('nav-drag', !snap); if (!raf) raf = requestAnimationFrame(paint); };
  const settle = () => put(p > 0.42 ? 1 : 0, true); // وكت يوقف التمرير: يكمل للأقرب بنعومة
  addEventListener('scroll', () => {
    const y = scrollY, d = y - lastY; lastY = y;
    clearTimeout(idleT);
    const atEnd = innerHeight + y >= document.documentElement.scrollHeight - 4;
    if (y < 60 || (atEnd && d < 0)) { put(0, true); return; }
    put(p + d / RANGE, false);
    idleT = setTimeout(settle, 110);
  }, { passive: true });
  nav?.addEventListener('pointerdown', () => { clearTimeout(idleT); put(0, true); });
}

/* 5) سحب الورقة للأسفل للإغلاق (من المقبض، أو من أي مكان إذا الورقة بأعلاها) */
let drag = null;
document.addEventListener('touchstart', (e) => {
  const sh = e.target.closest?.('.sheet'); if (!sh) return;
  const onGrab = !!e.target.closest('.grab');
  if (!onGrab && sh.scrollTop > 0) return;
  drag = { sh, y: e.touches[0].clientY, dy: 0, onGrab, active: onGrab, t: Date.now() };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const dy = e.touches[0].clientY - drag.y;
  if (!drag.active) { if (dy > 12 && drag.sh.scrollTop <= 0) drag.active = true; else if (dy < -6) { drag = null; return; } else return; }
  drag.dy = Math.max(0, dy); drag.sh.classList.add('dragging'); drag.sh.classList.remove('settle');
  drag.sh.style.transform = `translateY(${drag.dy}px)`;
  const ov = drag.sh.parentElement; if (ov) ov.style.opacity = String(Math.max(.35, 1 - drag.dy / 600));
  if (e.cancelable) e.preventDefault();
}, { passive: false });
const end = () => {
  if (!drag) return; const { sh, dy, t, active } = drag; drag = null; if (!active) return;
  const fast = dy / Math.max(1, Date.now() - t) > 0.55;
  sh.classList.remove('dragging'); sh.classList.add('settle');
  if (dy > 130 || (fast && dy > 50)) { sh.style.transform = 'translateY(105%)'; setTimeout(() => (document.querySelector('.sh-back') ? window.sheetBack?.() : window.closeSheet?.(true)), 150); }
  else { sh.style.transform = ''; const ov = sh.parentElement; if (ov) ov.style.opacity = ''; }
};
document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);


/* التنقّل والتبويبات تشتغل من أول لمسة (عند نزول الإصبع) — وما نعتمد على click اللي الآيفون أحياناً يبلعه */
let eat = null, eatT = 0;
document.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  const b = e.target.closest?.('#bnav button, .tabs2 button, .mc-tabs button'); if (!b || b.disabled) return;
  eat = b; eatT = Date.now();
  if (b.parentElement.id === 'bnav') {
    const ind = b.parentElement.querySelector('.nav-ind');
    if (ind) { ind.style.setProperty('--nx', b.offsetLeft + 'px'); ind.style.width = b.offsetWidth + 'px'; }
  }
  b.click();
});
// نبلع الـ click الأصلي اللي يجي بعد اللمسة حتى ما يتنفذ مرتين
document.addEventListener('click', (e) => {
  if (!e.isTrusted || !eat || Date.now() - eatT > 700) return;
  if (e.target.closest?.('#bnav button, .tabs2 button, .mc-tabs button')) { e.stopPropagation(); e.preventDefault(); eat = null; }
}, true);

/* هالة الضوء بالبطاقات الرئيسية تتبع الإصبع */
document.addEventListener('pointermove', (e) => {
  const h = e.target.closest?.('.hero, .team-hero, .ss-hero'); if (!h) return;
  const r = h.getBoundingClientRect();
  h.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
  h.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
}, { passive: true });

/* ===== لمسات احترافية هادئة ===== */
const MAIN = ['home', 'team', 'season', 'players', 'more'];
/* ضغطة ثانية على التبويب الحالي ترجعك لأعلى الصفحة */
(function wrapGo() {
  if (!window.go) return setTimeout(wrapGo, 200);
  const _go = window.go;
  window.go = (v, o = {}) => {
    const prev = document.getElementById('view')?.dataset.view;
    if (prev === v && MAIN.includes(v) && !o.back) { if (scrollY > 4) scrollTo({ top: 0, behavior: 'smooth' }); return; }
    return _go(v, o);
  };
})();

/* (4) تنبيه هادئ إذا انقطع الإنترنت، ويتحدث وحده لما يرجع */
const off = document.createElement('div'); off.className = 'net-off'; off.textContent = 'ماكو إنترنت — تشوف آخر بيانات محفوظة';
document.body.appendChild(off);
const net = () => off.classList.toggle('show', !navigator.onLine);
addEventListener('offline', net); addEventListener('online', () => { net(); window.loadAll?.(true); }); net();
