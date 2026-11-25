/* =========================================================
   عدسة الكاميرا: لما تضغط على قميص لاعب بالملعب، كل شي حوله يغبّش ويعتم،
   والكاميرا تقترب على اللاعب بعمق ميدان، وبعدين بطاقته تطلع من الظلام
   بإضاءة جانبية. يشتغل بس على قمصان الملعب اللي تفتح تفاصيل اللاعب،
   وينطفي إذا الجهاز مفعّل «تقليل الحركة».
========================================================= */
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const E = 'cubic-bezier(.2,.8,.2,1)';
let busy = false;

document.addEventListener('click', (e) => {
  const el = e.target.closest('.pitch .pl[onclick], .benchbox .pl[onclick]');
  if (!el || el.__cine || busy) return;
  if (!/^\s*(playerGW|openPlayer)\(/.test(el.getAttribute('onclick') || '')) return;
  if (RM() || document.documentElement.classList.contains('no-cine')) return;
  e.stopPropagation(); e.preventDefault();
  focus(el);
}, true);

function focus(el) {
  busy = true;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const vw = innerWidth, vh = innerHeight, tx = vw / 2 - cx, ty = vh * 0.42 - cy;
  const k = Math.min(2.3, (vw * 0.42) / r.width);

  // الخلفية: غبش وعتمة، وبقعة ضوء على مكان اللاعب
  const ov = document.createElement('div');
  ov.className = 'cine-ov';
  ov.style.setProperty('--x', `${cx}px`); ov.style.setProperty('--y', `${cy}px`);
  ov.innerHTML = '<i class="cine-blur"></i><i class="cine-vig"></i><i class="cine-bars t"></i><i class="cine-bars b"></i>';
  // القميص نفسه يطلع فوك الغبش ويقترب
  const cl = el.cloneNode(true);
  cl.removeAttribute('onclick'); cl.removeAttribute('role'); cl.removeAttribute('tabindex');
  cl.classList.add('cine-clone');
  Object.assign(cl.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  cl.insertAdjacentHTML('beforeend', '<i class="cine-light"></i>');
  ov.appendChild(cl);
  document.body.appendChild(ov);
  el.style.opacity = '0';

  const D = 560 * (window.__cineSlow || 1);
  ov.querySelector('.cine-blur').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
  ov.querySelector('.cine-vig').animate([{ opacity: 0, transform: 'scale(1.35)' }, { opacity: 1, transform: 'scale(1)' }], { duration: D, easing: E, fill: 'forwards' });
  ov.querySelectorAll('.cine-bars').forEach((b, i) => b.animate([{ transform: `scaleY(0)` }, { transform: 'scaleY(1)' }], { duration: 420, delay: 60, easing: E, fill: 'forwards' }));
  cl.animate([
    { transform: 'translate(0,0) scale(1)', filter: 'brightness(1) drop-shadow(0 0 0 rgba(0,0,0,0))' },
    { transform: `translate(${tx}px,${ty}px) scale(${k})`, filter: 'brightness(1.08) drop-shadow(0 24px 30px rgba(0,0,0,.75))' },
  ], { duration: D, easing: E, fill: 'forwards' });
  cl.querySelector('.cine-light').animate([{ transform: 'translateX(-130%) skewX(-18deg)', opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: 'translateX(130%) skewX(-18deg)', opacity: 0 }], { duration: 700, delay: 260, easing: 'ease-in-out', fill: 'forwards' });

  setTimeout(() => {
    // البطاقة تطلع من الظلام بإضاءة جانبية
    document.documentElement.classList.add('cine-in');
    el.__cine = true; try { el.click(); } finally { el.__cine = false; }
    el.style.opacity = '';
    const out = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 120, easing: 'ease-out', fill: 'forwards' });
    out.onfinish = () => { ov.remove(); busy = false; };
    setTimeout(() => document.documentElement.classList.remove('cine-in'), 900);
  }, D + 80);
  setTimeout(() => { if (ov.isConnected) { ov.remove(); el.style.opacity = ''; busy = false; } }, 2500); // أمان
}
