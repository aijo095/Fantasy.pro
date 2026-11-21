/* جولة تعريفية خفيفة: تلميح يطلع مرة وحدة لكل ميزة جديدة، ويختفي للأبد من تضغط "فهمت" */
import { tt } from './i18n.js';
const K = 'fp_tips_seen';
const seen = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch { return []; } };
export function tip(key, text) {
  if (seen().includes(key)) return '';
  return `<div class="tip" data-tip="${key}"><span class="tip-dot"></span><p>${text}</p><button onclick="tipOk('${key}')">${tt('فهمت', 'Got it')}</button></div>`;
}
window.tipOk = (key) => {
  try { localStorage.setItem(K, JSON.stringify([...new Set([...seen(), key])])); } catch {}
  document.querySelectorAll(`.tip[data-tip="${key}"]`).forEach((el) => { el.classList.add('out'); setTimeout(() => el.remove(), 220); });
};
