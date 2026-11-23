/* =========================================================
   التبديلات التلقائية: الفانتازي يدخّل لاعب الدكة بدل الأساسي اللي ما لعب،
   حسب ترتيب الدكة وبشرط التشكيلة تبقى صحيحة، والحارس بدل الحارس.
   هنا نعرف مبكراً منو راح يغيب (مصاب، خارج القائمة، على الدكة وما نزل،
   أو فريقه ما يلعب)، ومنو البديل اللي راح يدخل بداله، حتى نحسبه
   بنسبة الفوز ونعرضه بالتشكيلة، وننبّه لما تخلص الجولة.
========================================================= */
import { ST, PM } from './store.js';
import { validXI } from './engine.js';
import { stateIn } from './lineup-state.js';
import { tt } from './i18n.js';

/** راح يغيب عن الجولة؟ يرجع { miss, why } */
export function willMiss(p, gw, L = ST.live || {}) {
  if (!p) return { miss: false };
  const fx = (ST.G.fx[gw] || []).filter((x) => x.h === p.team || x.a === p.team);
  if (!fx.length) return { miss: true, why: tt('فريقه ما يلعب', 'blank') };
  if ((L[p.id]?.minutes || 0) > 0) return { miss: false };
  let why = '';
  for (const f of fx) {
    const s = stateIn(f, p.id);
    if (!f.started) {
      if (s?.st === 'out') { why = tt('خارج القائمة', 'not in squad'); continue; }
      if (!s && (p.chance === 0 || ['i', 's', 'u', 'n'].includes(p.st))) { why = p.st === 's' ? tt('موقوف', 'suspended') : tt('مصاب أو غايب', 'injured/unavailable'); continue; }
      return { miss: false };
    }
    if (f.fin) { why = why || tt('ما لعب', 'did not play'); continue; }
    if (s?.st === 'out') { why = tt('خارج القائمة', 'not in squad'); continue; }
    if (s?.st === 'bench' && s.on == null && (f.min || 0) >= 85) { why = tt('بقى على الدكة', 'unused sub'); continue; }
    return { miss: false };
  }
  return { miss: true, why };
}

/** خطة التبديلات: اللي صارت فعلاً (calc.subs) + المتوقعة + هل النائب راح ياخذ شارة الكابتن */
export function autoPlan(calc, gw, L = ST.live || {}) {
  if (!calc || calc.chip === 'bboost') return { done: [], pending: [], capSwitch: null };
  const rows = [...calc.rows].sort((a, b) => a.pos - b.pos);
  const done = (calc.subs || []).map((s) => ({ ...s, pts: rows.find((r) => r.id === s.in)?.pts || 0 }));
  const xi = rows.filter((r) => r.pos <= 11), bench = rows.filter((r) => r.pos > 11);
  const used = new Set(done.map((s) => s.in)), cur = xi.map((r) => (r.subOut ? done.find((s) => s.out === r.id)?.in : r.id));
  const pending = [];
  xi.forEach((r, i) => {
    if (r.subOut || r.min > 0) return;
    const w = willMiss(PM(r.id), gw, L); if (!w.miss) return;
    const isGK = PM(r.id)?.pos === 'GK';
    for (const b of bench) {
      if (used.has(b.id) || b.subIn) continue;
      if ((PM(b.id)?.pos === 'GK') !== isGK) continue;
      if (willMiss(PM(b.id), gw, L).miss) continue;
      const ids = cur.map((x, k) => (k === i ? b.id : x));
      if (!validXI(ids) && validXI(cur)) continue;
      used.add(b.id); cur[i] = b.id;
      pending.push({ out: r.id, in: b.id, why: w.why, played: b.min > 0, pts: b.pts });
      break;
    }
  });
  const cap = rows.find((r) => r.cap), vc = rows.find((r) => r.vc);
  const capSwitch = cap && vc && !calc.capOut && cap.min === 0 && willMiss(PM(cap.id), gw, L).miss && !willMiss(PM(vc.id), gw, L).miss ? { cap: cap.id, vc: vc.id } : null;
  return { done, pending, capSwitch };
}
