/* =========================================================
   طبقة الإيماءات اللمسية — تخلي التطبيق يتصرف مثل تطبيق هاتف أصيل
   1) سحب وإفلات اللاعبين بملعب الخطة (أساسي ↔ دكة، وترتيب الدكة) مع اهتزاز خفيف
   2) الضغط المطوّل على اللاعب: قائمة عائمة (كابتن، نائب، تبديل، إحصائياته)
   3) السحب يمين/يسار للتنقّل بين الجولات بأي صفحة بيها شريط جولات
   (السحب للتحديث وسحب الأوراق لتحت للإغلاق موجودين بـ motion.js و ui2.js)
   القاعدة: لمسة عادية = نفس السلوك القديم، والتمرير ما يتعطّل أبد.
========================================================= */
import { tt } from './i18n.js';
import { esc } from './ui.js';
import { ST, PM } from './store.js';

const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const haptic = (p = 10) => { try { navigator.vibrate?.(p); } catch {} };

/* ---------- 1+2) لاعبين ملعب الخطة: رفع ← سحب، أو ضغط مطوّل ← قائمة ---------- */
const LIFT = 230, MENU = 560, SLOP = 9;
let G = null; // { el, id, x0, y0, t, lifted, dragging, ghost, timer, menuT, over }
const planCard = (t) => { const el = t.closest?.('.pl[data-pid]'); return el && /pitchTap\(/.test(el.getAttribute('onclick') || '') && window.__teamSwap ? el : null; };

function clearG() {
  if (!G) return;
  clearTimeout(G.timer); clearTimeout(G.menuT);
  cancelAnimationFrame(raf); raf = 0;
  G.ghost?.remove(); G.el.classList.remove('g-lift', 'g-src');
  document.querySelectorAll('.g-can,.g-over,.g-no').forEach((e) => e.classList.remove('g-can', 'g-over', 'g-no'));
  document.documentElement.classList.remove('g-dragging');
  G = null;
}
function lift() {
  if (!G) return; G.lifted = true; haptic(8);
  G.el.classList.add('g-lift'); document.documentElement.classList.add('g-dragging');
  const S = window.__teamSwap; G.T = [];
  document.querySelectorAll('#view .pl[data-pid]').forEach((e) => { const b = +e.dataset.pid; if (b === G.id || !planCard(e)) return; const ok = S.can(G.id, b); e.classList.add(ok ? 'g-can' : 'g-no'); if (ok) G.T.push({ e, r: e.getBoundingClientRect() }); });
  // نجهّز النسخة الطايرة من هسه حتى أول حركة تكون سلسة بدون تأخير
  const r = G.el.getBoundingClientRect(), gh = G.el.cloneNode(true);
  gh.removeAttribute('onclick'); gh.classList.remove('g-lift'); gh.classList.add('g-ghost');
  gh.style.cssText = `position:fixed;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;z-index:999;pointer-events:none;opacity:0;transform:translate3d(${r.left}px,${r.top}px,0)`;
  G.dx = G.x0 - r.left; G.dy = G.y0 - r.top; G.ghost = gh; document.body.appendChild(gh);
  G.menuT = setTimeout(() => { if (G && !G.dragging) { const { el, id } = G; clearG(); haptic([6, 40, 10]); quickMenu(el, id); } }, MENU - LIFT);
}
function startDrag() { G.dragging = true; clearTimeout(G.menuT); G.ghost.style.opacity = '1'; G.el.classList.add('g-src'); }
// الحركة تتحدّث مرة وحدة بكل إطار، وفحص الهدف بالحساب (بدون elementFromPoint) حتى ما يتقطّع
let raf = 0;
function frame() {
  raf = 0; if (!G?.dragging) return;
  const { x, y } = G.p;
  G.ghost.style.transform = `translate3d(${x - G.dx}px,${y - G.dy}px,0) scale(1.08)`;
  let ok = null; for (const t of G.T) { const r = t.r; if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) { ok = t.e; break; } }
  if (ok !== G.over) { G.over?.classList.remove('g-over'); ok?.classList.add('g-over'); if (ok) haptic(5); G.over = ok; }
}
function moveDrag(x, y) { G.p = { x, y }; if (!raf) raf = requestAnimationFrame(frame); }
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) return clearG();
  const el = planCard(e.target); if (!el) return;
  const t = e.touches[0];
  G = { el, id: +el.dataset.pid, x0: t.clientX, y0: t.clientY, lifted: false, dragging: false };
  G.timer = setTimeout(lift, LIFT);
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!G) return;
  const t = e.touches[0], dx = t.clientX - G.x0, dy = t.clientY - G.y0;
  if (!G.lifted) { if (Math.hypot(dx, dy) > SLOP) clearG(); return; } // تمرير عادي
  if (e.cancelable) e.preventDefault();
  if (!G.dragging && Math.hypot(dx, dy) > 4) startDrag();
  if (G.dragging) moveDrag(t.clientX, t.clientY);
}, { passive: false });
const endTouch = (e) => {
  if (!G) return;
  if (G.dragging) {
    const a = G.id, b = G.over ? +G.over.dataset.pid : null; e.preventDefault?.();
    G.el.dataset.gEat = '1'; clearG();
    if (b) { haptic([8, 30, 12]); window.__teamSwap.swap(a, b); }
    setTimeout(() => document.querySelectorAll('[data-g-eat]').forEach((x) => delete x.dataset.gEat), 400);
  } else if (G.lifted) { G.el.dataset.gEat = '1'; clearG(); setTimeout(() => document.querySelectorAll('[data-g-eat]').forEach((x) => delete x.dataset.gEat), 400); }
  else clearG();
};
document.addEventListener('touchend', endTouch); document.addEventListener('touchcancel', () => clearG());
// بعد سحب أو رفع، نبلع النقرة حتى ما تنفتح صفحة اللاعب
document.addEventListener('click', (e) => { const el = e.target.closest?.('[data-g-eat]'); if (el) { e.stopPropagation(); e.preventDefault(); delete el.dataset.gEat; } }, true);
// الماوس: كلك يمين على اللاعب يفتح نفس القائمة
document.addEventListener('contextmenu', (e) => { const el = planCard(e.target); if (!el) return; e.preventDefault(); quickMenu(el, +el.dataset.pid); });

function quickMenu(el, id) {
  closeMenu(); const p = PM(id); if (!p) return;
  const S = window.__teamSwap, inXI = S.inXI(id), P = ST.plan;
  const items = [
    inXI && P.cap !== id && ['setCap', 'i-crown', tt('اجعله كابتن', 'Make captain')],
    inXI && P.vc !== id && P.cap !== id && ['setVC', 'i-star', tt('اجعله نائب الكابتن', 'Make vice')],
    ['startSwap', 'i-swap', inXI ? tt('بدّله مع لاعب', 'Swap with…') : tt('دخّله للتشكيلة', 'Bring on…')],
    ['openPlayer', 'i-chart', tt('إحصائياته', 'Stats')],
  ].filter(Boolean);
  const m = document.createElement('div'); m.className = 'g-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="g-mh"><b>${esc(p.name)}</b><small>${inXI ? tt('أساسي', 'Starter') : tt('بالدكة', 'Bench')}</small></div>${items.map(([fn, ic, l]) => `<button role="menuitem" type="button" data-fn="${fn}"><svg class="i"><use href="#${ic}"/></svg>${l}</button>`).join('')}`;
  const bd = document.createElement('div'); bd.className = 'g-bd';
  document.body.append(bd, m);
  const r = el.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let top = r.bottom + 8; if (top + mh > innerHeight - 90) top = Math.max(12, r.top - mh - 8);
  m.style.left = `${Math.min(innerWidth - mw - 10, Math.max(10, r.left + r.width / 2 - mw / 2))}px`; m.style.top = `${top}px`;
  m.style.transformOrigin = `${r.left + r.width / 2 - parseFloat(m.style.left)}px ${top > r.top ? 0 : mh}px`;
  // نثبّت الحالة الأولى قبل ما نبدي الحركة (إطارين) حتى الدخول يطلع سلس دائماً
  void m.offsetWidth; requestAnimationFrame(() => requestAnimationFrame(() => { m.classList.add('in'); bd.classList.add('in'); }));
  el.classList.add('g-focus');
  // النقرة اللي تجي مع رفع الإصبع بعد الضغط المطوّل ما تسكّر القائمة
  const t0 = Date.now(), close = () => { if (Date.now() - t0 > 450) closeMenu(); };
  bd.addEventListener('click', close); bd.addEventListener('touchstart', close, { passive: true });
  m.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-fn]'); if (!b) return; haptic(6); close(); window[b.dataset.fn]?.(id); if (b.dataset.fn === 'setCap' || b.dataset.fn === 'setVC') window.render(); });
  m.querySelector('button')?.focus({ preventScroll: true });
}
function closeMenu() {
  document.querySelectorAll('.g-focus').forEach((e) => e.classList.remove('g-focus'));
  document.querySelectorAll('.g-menu,.g-bd').forEach((e) => { e.classList.remove('in'); e.classList.add('out'); setTimeout(() => e.remove(), RM() ? 0 : 200); });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
addEventListener('scroll', () => document.querySelector('.g-menu') && closeMenu(), { passive: true });

/* ---------- 3) السحب الأفقي للتنقّل بين الجولات ---------- */
// يشتغل بأي صفحة بيها شريط جولات فيه زر مختار (فريقي، المباشر، الكابتن، المنافسين، الخطة)
const STRIPS = '#tgwstrip,#lvseg,.gwstrip,.mt-gws,.mp-gws';
const NOSWIPE = '.pitch,.rvp,.lu3-pitch,.sy,.scroll-x,.gwstrip,.mt-gws,.mp-gws,.seg,.chips2,.tabs2,.mc-tabs,input,textarea,select,.g-menu,[data-noswipe],canvas,svg.chart';
// أي شريط يتمرر أفقياً (الدوريات، الفلاتر، الجداول…) يتمرر لوحده وما يسحب الصفحة
function inHScroll(el) {
  for (let n = el; n && n.id !== 'view' && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
  }
  return false;
}
let SW = null;
document.addEventListener('touchstart', (e) => {
  if (G || e.touches.length > 1 || document.querySelector('.ov,.g-menu')) return;
  const t = e.target; if (!t.closest?.('#view') || t.closest(NOSWIPE) || inHScroll(t)) return;
  const strip = document.querySelector(`#view :is(${STRIPS})`); if (!strip?.querySelector('.on')) return;
  const x = e.touches[0].clientX; if (x < 18 || x > innerWidth - 18) return; // حافة الشاشة للرجوع بالمتصفح
  SW = { x0: x, y0: e.touches[0].clientY, t: Date.now(), strip, lock: null };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!SW) return; const dx = e.touches[0].clientX - SW.x0, dy = e.touches[0].clientY - SW.y0;
  if (!SW.lock) { if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) SW.lock = 'x'; else if (Math.abs(dy) > 10) { SW = null; return; } }
  if (SW?.lock === 'x') { const v = document.getElementById('view'); v.style.transform = `translateX(${dx * 0.25}px)`; v.style.transition = 'none'; SW.dx = dx; }
}, { passive: true });
document.addEventListener('touchend', () => {
  if (!SW) return; const { dx = 0, lock, strip, t } = SW; SW = null;
  const v = document.getElementById('view'); v.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)'; v.style.transform = '';
  if (lock !== 'x' || (Math.abs(dx) < 70 && !(Math.abs(dx) > 40 && Date.now() - t < 260))) return;
  // نختار الجولة المجاورة حسب مكانها على الشاشة (يسار/يمين) فيشتغل صح بالعربي والإنجليزي
  const on = strip.querySelector('.on'), r0 = on.getBoundingClientRect();
  const bs = [...strip.querySelectorAll('button:not([disabled])')].filter((b) => b !== on).map((b) => ({ b, x: b.getBoundingClientRect().left - r0.left }));
  const want = dx > 0 ? bs.filter((o) => o.x < 0).sort((a, b) => b.x - a.x)[0] : bs.filter((o) => o.x > 0).sort((a, b) => a.x - b.x)[0];
  if (!want) { haptic([4, 30, 4]); return; }
  haptic(8); document.documentElement.dataset.gswipe = dx > 0 ? 'r' : 'l';
  want.b.click();
  setTimeout(() => delete document.documentElement.dataset.gswipe, 420);
});
document.addEventListener('touchcancel', () => { if (SW) { const v = document.getElementById('view'); v.style.transform = ''; SW = null; } });

/* ---------- 4) الجداول: تثبيت عمود الاسم مع تمرير أفقي ناعم ---------- */
// جداول الترتيب (أول عمود #) يتثبت فيها الرقم والاسم، وباقي الجداول يتثبت أول عمود
function tagTables() {
  document.querySelectorAll('#view .scroll-x > table.tbl:not([data-gs]), .ov .scroll-x > table.tbl:not([data-gs])').forEach((tb) => {
    tb.dataset.gs = (tb.querySelector('th')?.textContent || '').trim() === '#' ? '2' : '1';
    const box = tb.parentElement; box.classList.add('g-xs');
    const upd = () => { const max = box.scrollWidth - box.clientWidth, s = Math.abs(box.scrollLeft); box.dataset.edge = max <= 2 ? 'none' : s < 2 ? 'start' : s >= max - 2 ? 'end' : 'mid'; };
    box.addEventListener('scroll', upd, { passive: true }); upd();
  });
}
let tq = 0; new MutationObserver(() => { cancelAnimationFrame(tq); tq = requestAnimationFrame(tagTables); }).observe(document.body, { childList: true, subtree: true });
// ما نخلّي انتقال السحب عالق على #view
document.addEventListener('transitionend', (e) => { if (e.target.id === 'view' && e.propertyName === 'transform') e.target.style.transition = ''; });
