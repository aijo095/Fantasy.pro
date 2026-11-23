/* حالة اللاعب بالمباراة من التشكيلة الرسمية والتبديلات (ESPN):
   أساسي / بديل / خارج القائمة، ومتى نزل ومتى خرج أو انطرد.
   طلب واحد لكل مباراة، ويتجدد كل دقيقة وكت المباراة شغالة حتى نلحق التبديلات */
import { ST } from './store.js';

const C = {}; // fixtureId -> { res, at, busy, fin }
const listeners = new Set();
// دقيقة ESPN توصل ككائن { min, add }: نحوّلها لنص مثل 68 أو 90+2
const mins = (x) => (x == null ? null : typeof x === 'object' ? (x.min == null ? null : x.add ? `${x.min}+${x.add}` : String(x.min)) : String(x));
export const onLineupState = (fn) => listeners.add(fn);

function fetchFx(f) {
  const c = C[f.id] || (C[f.id] = {});
  if (c.busy) return;
  c.busy = true;
  const T = ST.G.teams;
  Promise.all([
    fetch(`/api/lineups?ko=${encodeURIComponent(f.ko)}&h=${T[f.h].short}&a=${T[f.a].short}&v=2`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    import('./views/live.js'),
  ]).then(([d, L]) => {
    const res = {};
    if (d?.sides) {
      const outAt = {}, inAt = {};
      (d.subs || []).forEach((s) => { if (s.out) outAt[s.out] = mins(s.at); if (s.in) inAt[s.in] = mins(s.at); });
      [['h', f.h], ['a', f.a]].forEach(([k, team]) => {
        const sd = d.sides[k]; if (!sd?.players?.length) return;
        const M = L.mapFPL(sd.players, team);
        ST.G.players.filter((x) => x.team === team).forEach((x) => (res[x.id] = { st: 'out' }));
        sd.players.forEach((e) => {
          const q = M[e.id]; if (!q) return;
          const r = { st: e.starter ? 'xi' : 'bench' };
          if (e.subIn) r.on = inAt[e.id] ?? (e.starter ? null : mins(e.subAt));
          if (e.subOut) r.off = outAt[e.id] ?? (e.starter ? mins(e.subAt) : null) ?? null, r.offBy = 'sub';
          if (e.rc) r.offBy = 'red';
          res[q.id] = r;
        });
      });
    }
    // المباراة خلصت والبيانات وصلت: ما نحتاج نعيد الطلب
    Object.assign(c, { res, at: Date.now(), busy: false, fin: d?.state === 'post' });
    listeners.forEach((fn) => { try { fn(f.id); } catch {} });
  });
}

/** حالة اللاعب بمباراة معيّنة (أو null إذا بعدها ما وصلت). يطلب البيانات بالخلفية إذا تحتاج */
export function stateIn(f, pid) {
  if (!f || (!f.started && !(f.ko && new Date(f.ko) - Date.now() < 80 * 60e3))) return null;
  const c = C[f.id];
  const empty = c?.res && !Object.keys(c.res).length;
  const stale = c?.res && !c.fin && Date.now() - c.at > (empty ? 120e3 : 60e3);
  if (!c?.res || (stale && !c.busy)) fetchFx(f);
  return c?.res ? c.res[pid] || null : null;
}

/** اللاعب خرج من الملعب (تبديل أو طرد) بمباراة شغالة أو خالصة؟ يرجع { at, by } أو null */
export function offInfo(p, gw) {
  const fx = (ST.G.fx[gw] || []).filter((x) => (x.h === p.team || x.a === p.team) && x.started);
  for (const f of fx) {
    const s = stateIn(f, p.id);
    if (s?.offBy) return { at: s.off, by: s.offBy, fid: f.id, fin: !!f.fin };
  }
  return null;
}
