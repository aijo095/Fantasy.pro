/* =========================================================
   طبقة «بريميوم» — تشتغل فقط لما html فيه class="lux"
   الخلفية الحيّة · المغناطيس · الانتقال السائل · البارالاكس · الضبابية · الاهتزاز
========================================================= */
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const on = () => root.classList.contains('lux');
root.classList.add('lux');

/* ---------- 24 خلفية جزيئات وخطوط ---------- */
const cv = document.createElement('canvas'); cv.id = 'lux-bg'; document.body.prepend(cv);
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, P = [];
function size() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.round(Math.min(46, (W * H) / 15000));
  P = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22, r: Math.random() * 1.4 + .5, c: Math.random() < .7 ? '52,211,153' : '96,165,250' }));
}
size(); addEventListener('resize', size);
let last = 0;
function draw(t) {
  requestAnimationFrame(draw);
  if (!on() || document.hidden || t - last < 33) return; last = t;
  const ox = tx * 14, oy = ty * 14 - scrollY * .04;
  ctx.clearRect(0, 0, W, H);
  for (const p of P) {
    if (!reduced) { p.x += p.vx; p.y += p.vy; }
    if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20; if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
  }
  ctx.lineWidth = .6;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
    if (d < 13000) { ctx.strokeStyle = `rgba(${a.c},${(1 - d / 13000) * .16})`; ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke(); }
  }
  for (const p of P) { ctx.fillStyle = `rgba(${p.c},.55)`; ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, p.r, 0, 7); ctx.fill(); }
}
requestAnimationFrame(draw);

let tx = 0, ty = 0; // الميلان ملغي بطلب المستخدم

/* ---------- 27 ضبابية تتغير مع التمرير ---------- */
let tbb = -1;
addEventListener('scroll', () => {
  const v = Math.round(Math.min(26, 6 + scrollY / 12));
  if (v !== tbb) { tbb = v; root.style.setProperty('--tbb', v + 'px'); }
}, { passive: true });

/* ---------- 30 اهتزاز خفيف (آيفون iOS 18+ عبر مفتاح مخفي · أندرويد عبر vibrate) ---------- */
const hapL = document.createElement('label'); hapL.className = 'lux-hap'; hapL.setAttribute('aria-hidden', 'true');
const hapI = document.createElement('input'); hapI.type = 'checkbox'; hapI.setAttribute('switch', ''); hapI.tabIndex = -1;
hapL.appendChild(hapI); document.body.appendChild(hapL);
function haptic() {
  if (!on()) return;
  try { if (navigator.vibrate) { navigator.vibrate(8); return; } } catch {}
  try { hapL.click(); } catch {}
}
window.luxHaptic = haptic;

/* ---------- 23 مغناطيس + 30 لمعة ونبضة ---------- */
const MAG = '.btn, .icon-btn, .tbtn, .seg button, .chips2 button, .bnav button, .av';
let mag = null;
document.addEventListener('pointerdown', (e) => {
  if (!on()) return;
  const b = e.target.closest?.(MAG);
  if (b) { mag = b; b.classList.add('mag', 'mag-on'); pull(b, e); }
  const pop = e.target.closest?.('.bnav button, .tabs2 button, .mc-tabs button');
  if (pop) { pop.classList.remove('pop'); void pop.offsetWidth; pop.classList.add('pop'); setTimeout(() => pop.classList.remove('pop'), 420); }
  const sh = e.target.closest?.('.btn-p, .hero, .team-hero, .badge-c:not(.locked), .card.tap');
  if (sh && !reduced) { const s = document.createElement('i'); s.className = 'lux-shine'; if (getComputedStyle(sh).position === 'static') sh.style.position = 'relative'; sh.appendChild(s); setTimeout(() => s.remove(), 650); }
  if (e.target.closest?.('button, .tap, .row, .card.tap, a')) haptic();
}, { passive: true, capture: true });
function pull(b, e) {
  const r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const k = Math.min(1, 60 / Math.max(r.width, r.height));
  b.style.translate = `${(dx * .35 * k).toFixed(1)}px ${(dy * .35 * k).toFixed(1)}px`;
}
document.addEventListener('pointermove', (e) => {
  if (!mag) return;
  const r = mag.getBoundingClientRect(), out = e.clientX < r.left - 30 || e.clientX > r.right + 30 || e.clientY < r.top - 30 || e.clientY > r.bottom + 30;
  if (out) { release(); return; } pull(mag, e);
}, { passive: true });
function release() { if (!mag) return; const b = mag; mag = null; b.classList.remove('mag-on'); b.style.translate = ''; setTimeout(() => b.classList.remove('mag'), 520); }
document.addEventListener('pointerup', release, { passive: true });
document.addEventListener('pointercancel', release, { passive: true });

