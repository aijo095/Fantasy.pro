/* =========================================================
   المحرك المباشر: نقاط رسمية فقط، تبديلات تلقائية، الكابتن البديل،
   الملكية الفعلية (EO)، أسهم الترتيب، التهديدات، ومحاكي "ماذا لو"
========================================================= */
import { ST, PM } from './store.js';
import { validXI } from './engine.js';

/* ---------- أحداث المباراة الأسرع ----------
   مشكلة التأخير: قائمة المباريات بالفانتازي (fixtures → stats) تتأخر دقايق عن بيانات اللاعبين المباشرة (event/live).
   فكان التطبيق يعرض نقاط إيزي (من المباشر) بس الهدف والصناعة والبونص قدام (من المباريات).
   الحل: نبني أحداث كل مباراة من بيانات اللاعبين المباشرة الرسمية نفسها، وناخذ الأحدث من المصدرين:
   - الأهداف والصناعات والبطاقات والتصديات والدفاع: أرقام ما تنقص، فناخذ المصدر اللي سجّل أكثر
   - BPS: من المباشر (أحدث)، وبعد ما تخلص المباراة من الفانتازي إذا موجود
   - البونص: نفس طريقة الفانتازي الرسمي (3/2/1 حسب BPS الحالي مع التعادل) — مثل ما يعرضه تطبيق البريميرليغ */
const FX_KEYS = ['goals_scored', 'assists', 'own_goals', 'penalties_saved', 'penalties_missed', 'yellow_cards', 'red_cards', 'saves', 'defensive_contribution'];
export function bonusFromBps(list) {
  const pl = list.filter((x) => x.value > 0).sort((a, b) => b.value - a.value), out = [];
  let pts = 3, i = 0;
  while (i < pl.length && pts > 0) { const v = pl[i].value, grp = pl.filter((x) => x.value === v); grp.forEach((x) => out.push({ element: x.element, value: pts })); i += grp.length; pts -= grp.length; }
  return out;
}
let fxsMemo = { raw: null, gw: 0, m: new Map() };
export function fxStats(f, gw = f?.ev) {
  const base = f?.stats || [];
  const raw = ST.liveRaw && ST.liveRawGW === gw ? ST.liveRaw : null;
  if (!f?.started || !raw) return base;
  if (fxsMemo.raw !== raw || fxsMemo.gw !== gw) fxsMemo = { raw, gw, m: new Map() };
  const mk = f.id + '|' + (f.fin ? 1 : 0) + '|' + base.length + '|' + JSON.stringify(base).length;
  if (fxsMemo.m.has(mk)) return fxsMemo.m.get(mk);
  const fxs = ST.G.fx[gw] || [], cnt = (tm) => fxs.filter((x) => x.h === tm || x.a === tm).length;
  const side = (tm) => (tm === f.h ? 'h' : tm === f.a ? 'a' : null);
  // قيمة الحدث للاعب بهالمباراة بالذات (الجولة المزدوجة: من تفاصيل المباراة؛ العادية: من المجموع)
  const valOf = (e, k, single) => {
    if (single) return +(e.stats?.[k] || 0);
    const ex = (e.explain || []).find((x) => x.fixture === f.id); if (!ex) return null;
    const r = (ex.stats || []).find((s) => s.identifier === k); return r ? +r.value : null;
  };
  const rows = [];
  for (const e of raw) {
    const p = PM(e.id); if (!p) continue; const s = side(p.team); if (!s) continue;
    const single = cnt(p.team) === 1;
    if (!single && !(e.explain || []).some((x) => x.fixture === f.id)) continue;
    if (single && !(e.stats?.minutes > 0) && !FX_KEYS.some((k) => e.stats?.[k])) continue;
    rows.push({ e, s, single });
  }
  if (!rows.length) return base;
  const fromLive = (k) => { const o = { identifier: k, h: [], a: [] }, ok = rows.some((r) => r.single || valOf(r.e, k, false) != null); if (!ok) return null;
    rows.forEach((r) => { const v = valOf(r.e, k, r.single); if (v) o[r.s].push({ value: v, element: r.e.id }); });
    o.h.sort((a, b) => b.value - a.value); o.a.sort((a, b) => b.value - a.value); return o; };
  const sum = (o) => (o ? [...o.h, ...o.a].reduce((a, x) => a + x.value, 0) : 0);
  const old = (k) => base.find((x) => x.identifier === k);
  const out = base.filter((x) => !FX_KEYS.includes(x.identifier) && x.identifier !== 'bps' && x.identifier !== 'bonus');
  FX_KEYS.forEach((k) => { const L = fromLive(k), B = old(k); const pickL = L && sum(L) >= sum(B); const v = pickL ? L : B; if (v) out.push(v); });
  const bL = fromLive('bps'), bB = old('bps'), bps = f.fin && bB && (bB.h.length || bB.a.length) ? bB : bL || bB;
  if (bps) out.push(bps);
  const bnB = old('bonus'), bnOK = bnB && (bnB.h.length || bnB.a.length);
  if (f.fin && bnOK) out.push(bnB);
  else if (bps) { const all = [...bps.h.map((x) => ({ ...x, s: 'h' })), ...bps.a.map((x) => ({ ...x, s: 'a' }))]; const bn = bonusFromBps(all), sOf = (id) => all.find((x) => x.element === id)?.s;
    out.push({ identifier: 'bonus', h: bn.filter((x) => sOf(x.element) === 'h'), a: bn.filter((x) => sOf(x.element) === 'a') }); }
  else if (bnB) out.push(bnB);
  fxsMemo.m.set(mk, out);
  return out;
}

/* ---------- البونص المؤقت لكل مباراة ---------- */
export function provisionalBonus(gw) {
  // بونص كل مباراة من أحدث BPS رسمي (نفس حساب الفانتازي) — يتأكد نهائياً لما تخلص المباراة
  const out = {};
  (ST.G.fx[gw] || []).filter((f) => f.started).forEach((f) => {
    const b = fxStats(f, gw).find((s) => s.identifier === 'bonus'); if (!b) return;
    [...(b.h || []), ...(b.a || [])].forEach((x) => (out[x.element] = (out[x.element] || 0) + x.value));
  });
  return out;
}
export function estimatedBonus(gw) {
  const out = {}, raw = ST.liveRaw && ST.liveRawGW === gw ? ST.liveRaw : null; if (!raw) return out;
  const fx = ST.G.fx[gw] || [];
  fx.filter((f) => f.started).forEach((f) => {
    const confirmed = (f.stats || []).find((s) => s.identifier === 'bonus'); if (confirmed && (confirmed.h.length || confirmed.a.length)) return;
    // كل لاعبي الفريقين اللي لعبوا بهالمباراة
    const pl = raw.filter((e) => { const p = PM(e.id); if (!p || (p.team !== f.h && p.team !== f.a)) return false; const ex = e.explain || []; return ex.length ? ex.some((x) => x.fixture === f.id) : (e.stats?.minutes || 0) > 0; })
      .map((e) => { const ex = (e.explain || []).find((x) => x.fixture === f.id); const b = ex ? (ex.stats || []).find((s) => s.identifier === 'bps')?.value : null; return { id: e.id, bps: b ?? e.stats?.bps ?? 0, min: e.stats?.minutes || 0 }; })
      .filter((x) => x.min > 0).sort((a, b) => b.bps - a.bps);
    // توزيع 3/2/1 مع التعادل حسب قوانين الفانتازي
    let pts = 3, i = 0;
    while (i < pl.length && pts > 0) { const v = pl[i].bps, grp = pl.filter((x) => x.bps === v); grp.forEach((x) => (out[x.id] = (out[x.id] || 0) + pts)); i += grp.length; pts -= grp.length; }
  });
  return out;
}

const teamDone = (team, gw) => { const f = (ST.G.fx[gw] || []).filter((x) => x.h === team || x.a === team); return f.length > 0 && f.every((x) => x.fin); };
const teamBlank = (team, gw) => !(ST.G.fx[gw] || []).some((x) => x.h === team || x.a === team);

/** حساب نقاط تشكيلة مباشرة (مع البونص المؤقت والتبديلات التلقائية) */
export function liveCalc(picks, gw = ST.G.cur, bonusMap = null, liveMap = null) {
  const L = liveMap || ST.live || {}; if (!picks?.picks) return null;
  const pb = bonusMap || provisionalBonus(gw), chip = picks.active_chip;
  const ps = [...picks.picks].sort((a, b) => a.position - b.position).map((x) => ({ ...x }));
  const ptsOf = (id) => { const s = L[id] || {}; return (s.total_points || 0) + (s.bonus ? 0 : pb[id] || 0); };
  const minOf = (id) => L[id]?.minutes || 0;
  const out = (id) => { const p = PM(id); return p && minOf(id) === 0 && (teamDone(p.team, gw) || teamBlank(p.team, gw)); };
  let xi = ps.filter((x) => x.position <= 11), bench = ps.filter((x) => x.position > 11);
  const subs = [];
  if (chip !== 'bboost') {
    xi.filter((x) => out(x.element)).forEach((o) => {
      const isGK = PM(o.element)?.pos === 'GK';
      for (const b of bench) {
        if (b.used || minOf(b.element) === 0) continue;
        if ((PM(b.element)?.pos === 'GK') !== isGK) continue;
        const ids = xi.map((x) => (x === o ? b.element : x.element));
        if (!validXI(ids)) continue;
        b.used = true; subs.push({ out: o.element, in: b.element }); o.subbedOut = true; b.subbedIn = true; break;
      }
    });
  }
  const starters = chip === 'bboost' ? ps : [...xi.filter((x) => !x.subbedOut), ...bench.filter((x) => x.subbedIn)];
  const cap = ps.find((x) => x.is_captain), vc = ps.find((x) => x.is_vice_captain);
  const capOut = cap && out(cap.element);
  const capMult = chip === '3xc' ? 3 : 2;
  let total = 0; const rows = ps.map((x) => {
    const on = starters.includes(x);
    let m = on ? 1 : 0;
    if (on && x === cap && !capOut) m = capMult; if (on && x === vc && capOut) m = capMult;
    const pts = ptsOf(x.element), bonus = L[x.element]?.bonus || pb[x.element] || 0; // للعرض: البونص كله (سواء الفانتازي ضافه للنقاط أو لسه بالمباراة)
    total += pts * m;
    return { id: x.element, pos: x.position, pts, m, bonus, min: minOf(x.element), subIn: !!x.subbedIn, subOut: !!x.subbedOut, cap: x === cap, vc: x === vc };
  });
  const hit = picks.entry_history?.event_transfers_cost || 0;
  return { total: total - hit, raw: total, hit, rows, subs, capOut, chip, bonus: pb };
}

/* ---------- الملكية الفعلية التقديرية ---------- */
let eoCache = null;
export function eoMap() {
  if (eoCache && eoCache.t === ST.G.fetchedAt) return eoCache.m;
  const P = ST.G.players, m = {};
  P.forEach((p) => (m[p.id] = p.own * 0.88));
  // شارة الكابتن: الأكثر امتلاكاً + الأعلى متوقعاً يتقاسمونها
  const caps = [...P].sort((a, b) => b.own * (+b.form + 2) - a.own * (+a.form + 2)).slice(0, 4), share = [48, 18, 8, 4];
  caps.forEach((p, i) => (m[p.id] += share[i]));
  eoCache = { t: ST.G.fetchedAt, m }; return m;
}
/** أسهم الترتيب: كل لاعب شكد يربحك أو يخسرك مقابل باقي المدربين */
export function rankImpact(calc) {
  const eo = eoMap(), L = ST.live || {}, pb = calc?.bonus || {};
  const mine = Object.fromEntries((calc?.rows || []).map((r) => [r.id, r.m]));
  const all = ST.G.players.map((p) => { const s = L[p.id] || {}; const pts = (s.total_points || 0) + (s.bonus ? 0 : pb[p.id] || 0); const my = mine[p.id] || 0; const e = eo[p.id] / 100; return { p, pts, my, eo: Math.round(eo[p.id]), gain: Math.round((my - e) * pts * 10) / 10, perPt: Math.round((my - e) * 100) / 100 }; });
  const gains = all.filter((x) => x.my > 0).sort((a, b) => b.gain - a.gain);
  const threats = all.filter((x) => x.my === 0 && x.eo >= 5).sort((a, b) => a.gain - b.gain).slice(0, 12);
  const safety = Math.round(all.reduce((a, x) => a + (eo[x.p.id] / 100) * x.pts, 0) * 10) / 10;
  return { gains, threats, safety };
}

/* ---------- ماذا لو ---------- */
export const WHATIF = { goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 }, assist: { GK: 3, DEF: 3, MID: 3, FWD: 3 }, cs: { GK: 4, DEF: 4, MID: 1, FWD: 0 }, bonus3: { GK: 3, DEF: 3, MID: 3, FWD: 3 }, yellow: { GK: -1, DEF: -1, MID: -1, FWD: -1 }, red: { GK: -3, DEF: -3, MID: -3, FWD: -3 }, pensave: { GK: 5, DEF: 0, MID: 0, FWD: 0 } };
export function whatIf(calc, pid, ev) {
  const p = PM(pid); const d = WHATIF[ev]?.[p.pos] ?? 0;
  const my = calc?.rows.find((r) => r.id === pid)?.m || 0, eo = eoMap()[pid] / 100;
  return { pts: d, me: d * my, field: Math.round(d * eo * 10) / 10, net: Math.round((d * my - d * eo) * 10) / 10 };
}
