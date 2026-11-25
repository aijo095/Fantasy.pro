/* =========================================================
   «موسمك» — مربع متفاعل بالرئيسية بإيقاع الستوري، تتبدّل بطاقاته حسب «شجرة» مراحل الجولة:
   ┌ مباشر (بعد الإغلاق ولحد ما تخلص الجولة)
   │   نقاطك المباشرة وفرقك عن خصمك ← أحداث لاعبينك (أهداف/صناعات/بونص… بدقيقتها ونقاطها)
   │   ← أحداث خصمك (شكد زاد عليك ومنو) ← تشكيلتك بالملعب (لعب/يلعب/ينتظر + التبديلات)
   ├ بين الجولات (بعد ما تخلص ولحد الإغلاق الجاي)
   │   ملخص الجولة ← نصائح الجولة الجاية ← خصوم تشكيلتك (من التحليل الذكي للأندية)
   │   ← اكتشافات الجولة (محرّك يطوّر نفسه: مولّدات من سياقات مختلفة + ذاكرة شنو انعرض، فكل جولة معلومات جديدة)
   │   ← إحصائيات الأندية (٢ تتبدّل كل جولة حسب اللي غاب أطول: مباريات الأهداف، الشباك النظيفة، فورمة الأندية، الدفاعات المنهارة)
   │   ← أسعار لاعبينك ← مساهماتهم بالموسم
   └ ثابت بكل المراحل: «فقرة هالجولة» (تدور كل جولة) + أساسيات يتبدّل ترتيبها كل جولة
     (ومنها «نادي كابتنك» من التحليل الذكي)
   الدقيقة: الفانتازي ما ينشر دقيقة الهدف — نسجّل دقيقة المباراة لحظة ما نلقط الحدث بالتحديث،
   وإذا انلقط متأخر نكتب «خلال المباراة» بدل ما نفترض رقم.
   كل الأرقام حقيقية من بيانات المدرب ولا رقم مفترض.
========================================================= */
import { ST, PM, tName, tShort } from '../store.js';
import { tt } from '../i18n.js';
import { esc, fmt } from '../ui.js';
import { playerSummary } from './common.js';
import * as FPL from '../fpl.js';
import { chipStatus } from '../fpl.js';
import { liveCalc } from '../live-engine.js';
import { pricePredict } from '../predict.js';
import { analyse as ciAnalyse, load as ciLoad, league as ciLeague, goalsW } from '../club-intel.js';
import { fixturesFor, xp } from '../engine.js';
import { discover, freshest, discLi } from '../story-discover.js';
import * as PS from '../intel/stats.js';

const DUR = 7000, POLL = 120e3;
let SI = 0, SEL = null, HOLD = false, CS_T = 0, CAPX = null, CAPX_K = null, STORY = null, STORY_K = null, LIVE = null, TIPS = [], VIS = true, PT = 0, RIV = null, RIV_K = null;
const BOUND = new WeakSet();
const RM = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = (v) => `<bdi dir="ltr" class="num">${v}</bdi>`;
const ar = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${N(n)} ${few}` : `${N(n)} ${many}`);
const sgn = (v) => `${v > 0 ? '+' : ''}${v}`;

/* ---------- أيقونات خطية (تنرسم عند ظهور الشريحة) ---------- */
const IC = {
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  cup: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 20h8"/>',
  rank: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  bars: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.6"/>',
  crown: '<path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9z"/><path d="M5 20h14"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>',
  boot: '<path d="M4 8h6l2 4 7 2a2 2 0 0 1 1 2v1H4z"/><path d="M7 17v2M11 17v2M15 17v2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  bench: '<path d="M4 11h16M6 11v7M18 11v7M5 7h14"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  wave: '<path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  card: '<rect x="7" y="4" width="10" height="16" rx="2"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.4-5 1.4-5 3.8 0 1 1 1.6 2.5 1.6s2.5-.5 2.5-1.5"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  shirt: '<path d="M8 4l4 2 4-2 4 3-2 4-2-1v10H8V10l-2 1-2-4z"/>',
  vs: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20c0-3 2-5 5-5s5 2 5 5M12 20c0-3 2-5 5-5s5 2 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  glove: '<path d="M7 21v-6L5 10V6a1.5 1.5 0 0 1 3 0v4V4a1.5 1.5 0 0 1 3 0v6V4a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v8l-2 3v4z"/>',
  recap: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 10h8M8 14h5"/>',
};
const ic = (k, cls = '') => `<svg class="sy-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

function ring(pct, col, inner, size = 74, sw = 7) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r, off = C * (1 - Math.max(0, Math.min(1, pct)));
  return `<span class="sy-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${sw}"/><circle class="sy-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" style="--C:${C.toFixed(1)};--o:${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><span class="sy-rin">${inner}</span></span>`;
}
const topPct = (rank, count) => (rank && count ? Math.max(0.1, (rank / count) * 100) : null);
const pctTxt = (p) => (p == null ? '—' : p < 10 ? p.toFixed(1).replace(/\.0$/, '') : Math.round(p));
const chipAr = (n) => ({ wildcard: 'وايلد كارد', freehit: 'فري هت', bboost: 'بنش بوست', '3xc': 'تربل كابتن', manager: 'المدير المساعد' }[n] || n);
const pName = (id) => esc(PM(id)?.name || '—');

/* ---------- تجميع البيانات ---------- */
async function coachStory() { try { const m = await import('../coach.js'); return m.seasonStory(); } catch { return null; } }
function build(cs) {
  const G = ST.G, E = ST.E, en = E.entry, evOf = (g) => G.events.find((e) => e.id === g);
  const rows = (E.hist?.current || []).filter((h) => evOf(h.event)).map((h) => ({ g: h.event, p: h.points, a: evOf(h.event)?.avg || 0, r: h.overall_rank, t: h.event_transfers || 0, c: h.event_transfers_cost || 0, b: h.points_on_bench || 0, v: h.value, gr: h.rank }));
  const fin = rows.filter((x) => evOf(x.g)?.fin);
  const SYS = { Overall: tt('العالم', 'World'), Iraq: tt('العراق', 'Iraq'), 'Second Chance': tt('الفرصة الثانية', 'Second Chance') };
  const lg = (en.leagues?.classic || []).filter((l) => l.entry_rank && l.rank_count > 1).map((l) => ({ raw: l.name, n: SYS[l.name] || l.name, r: l.entry_rank, c: l.rank_count, lr: l.entry_last_rank, x: l.league_type === 'x', pct: 1 - (l.entry_rank - 1) / l.rank_count }));
  const priv = lg.filter((l) => l.x).sort((a, b) => b.pct - a.pct), pub = lg.filter((l) => !l.x).sort((a, b) => a.c - b.c);
  const above = fin.filter((x) => x.p >= x.a).length;
  let streak = 0, cur = 0; fin.forEach((x) => { cur = x.p >= x.a ? cur + 1 : 0; streak = Math.max(streak, cur); });
  let climbs = 0, bestClimb = null; fin.forEach((x, i) => { const pv = fin[i - 1]; if (pv?.r && x.r && x.r < pv.r) { climbs++; const d = pv.r - x.r; if (!bestClimb || d > bestClimb.d) bestClimb = { d, g: x.g }; } });
  const bestGw = fin.reduce((m, x) => (!m || x.p > m.p ? x : m), null), worstGw = fin.reduce((m, x) => (!m || x.p < m.p ? x : m), null);
  const worstBench = fin.reduce((m, x) => (!m || x.b > m.b ? x : m), null);
  const v0 = rows[0]?.v, v1 = rows[rows.length - 1]?.v;
  let chips = []; try { chips = chipStatus(G, E.hist || {}); } catch {}
  const cev = evOf(G.cur), live = !!(cev && !cev.fin && cev.deadline && new Date(cev.deadline) < new Date());
  return { rows, fin, priv, pub, above, streak, climbs, bestClimb, bestGw, worstGw, worstBench, live,
    hitsPts: fin.reduce((s, x) => s + x.c, 0), benchPts: fin.reduce((s, x) => s + x.b, 0), noHit: fin.filter((x) => x.t > 0 && !x.c).length,
    dv: v0 && v1 ? (v1 - v0) / 10 : null, used: (E.hist?.chips || []).map((c) => ({ n: c.name, g: c.event })), chips, cs,
    total: en.summary_overall_points, rank: en.summary_overall_rank, count: G.totalPlayers || 0, gw: G.cur || 1 };
}


/* ---------- بطاقات ---------- */
function sRecap(D) {
  // نقاط الجولة والفرق عن المعدل والترتيب العام موجودة بالمربع الفوك — هنا بس اللي ما ينعرض هناك
  const x = D.fin[D.fin.length - 1]; if (!x) return null;
  const g = D.cs?.byGw?.[x.g], tr = (ST.E?.transfers || []).filter((t) => t.event === x.g), P = (id) => ST.live && ST.liveRawGW === x.g ? ST.live[id]?.total_points : null;
  const items = [];
  if (g?.cap && g.topPts) items.push(`<div><small>${tt('الكابتن', 'Captain')}</small><b>${N(g.capPts * g.mult)}</b><em>${pName(g.cap)}</em></div>`);
  if (g?.top && g.topPts && g.top !== g.cap) items.push(`<div><small>${tt('نجم تشكيلتك', 'Your top scorer')}</small><b>${N(g.topPts)}</b><em>${pName(g.top)}</em></div>`);
  if (x.gr) items.push(`<div><small>${tt('ترتيبك بالجولة نفسها', 'GW rank')}</small><b>${N(fmt(x.gr))}</b><em>${D.count ? tt(`أعلى ${pctTxt(topPct(x.gr, D.count))}٪`, `top ${pctTxt(topPct(x.gr, D.count))}%`) : ''}</em></div>`);
  items.push(`<div><small>${tt('نقاط بالدكة', 'Bench pts')}</small><b>${N(x.b)}</b><em>${x.b >= 8 ? tt('ضاعت كثير', 'a lot lost') : tt('ما ضاع هواية', 'little lost')}</em></div>`);
  let trH = '';
  if (tr.length) { const rows = tr.map((t) => { const pi = P(t.element_in), po = P(t.element_out); return `<li><b class="in">${pName(t.element_in)}</b>${pi != null ? `<span>${N(pi)}</span>` : ''}<i>${ic('swap')}</i><b class="out">${pName(t.element_out)}</b>${po != null ? `<span>${N(po)}</span>` : ''}</li>`; }).join(''); trH = `<p class="sy-note">${tt('انتقالاتك هالجولة', 'Your transfers this GW')}${x.c ? ` · ${tt('خصم', 'hit')} ${N(-x.c)}` : ''}</p><ul class="sy-trl">${rows}</ul>`; }
  else if (!x.t) trH = `<p class="sy-note">${tt('ما سويت انتقالات هالجولة', 'No transfers this GW')}</p>`;
  return { k: 'rc', col: 'var(--c-mint)', ic: 'recap', h: tt(`شنو صار بالجولة ${x.g}`, `GW ${x.g} breakdown`), sub: '', to: `seasonGo(${x.g})`, toL: tt('تفاصيل الجولة', 'GW details'),
    body: `<div class="sy-grid">${items.slice(0, 4).map((h, i) => h.replace('<div>', `<div style="--d:${60 + i * 70}ms">`)).join('')}</div>${trH}` };
}
/* فقرات الأسبوع — وحدة تتصدّر كل جولة حسب الخطة */
function wCaptain(D) {
  const b = D.cs?.best; if (!b || !PM(b.id)) return null;
  return { k: 'cp', col: 'var(--c-gold)', ic: 'crown', tab: tt('الكابتن', 'Captain'), h: tt('أعلى نقاط كابتن', 'Best captain haul'), sub: tt(`بالجولة ${b.gw}`, `GW ${b.gw}`),
    to: `openPlayer(${b.id})`, toL: tt('صفحة اللاعب', 'Player page'),
    body: `<div class="sy-cp"><div class="sy-cpn"><b>${pName(b.id)}</b><small>${esc(tName(PM(b.id).team))}</small></div>
      <div class="sy-cpv"><b class="num sy-cnt" data-v="${b.tot}">${b.tot}</b><span><em>×${N(b.mult)}</em>${tt('نقطة كابتن', 'captain pts')}</span></div>
      <div class="sy-why" id="syCapWhy">${CAPX && CAPX_K === `${b.id}_${b.gw}` ? CAPX : `<span class="sy-ld">${tt('نجيب شلون جابها…', 'Loading…')}</span>`}</div></div>` };
}
function wTransfer(D) {
  const t = D.cs?.trBest; if (!t || t.d <= 0 || !PM(t.inn)) return null;
  return { k: 'tr', col: 'var(--c-teal)', ic: 'swap', tab: tt('انتقال', 'Transfer'), h: tt('أنجح انتقال سويته', 'Your best transfer'), sub: tt(`بالجولة ${t.gw} — نقاطه بجولته والجولتين بعدها`, `GW ${t.gw} + next two`),
    to: `openPlayer(${t.inn})`, toL: tt('صفحة اللاعب', 'Player page'),
    body: `<div class="sy-tr"><div class="in" style="--d:60ms"><small>${tt('دخل', 'In')}</small><b>${pName(t.inn)}</b></div><span class="sy-tra">${ic('swap')}</span><div class="out" style="--d:160ms"><small>${tt('طلع', 'Out')}</small><b>${pName(t.out)}</b></div></div>
      <div class="sy-big sm"><b class="num up">${N(`+${t.d}`)}</b><span>${tt('نقطة ربحتها من هالقرار', 'pts gained by this call')}</span></div>` };
}
function wGoal(D) {
  if (!D.total || !D.fin.length) return null;
  const last5 = D.fin.slice(-5), avg = last5.reduce((s, x) => s + x.p, 0) / last5.length;
  const next = Math.ceil((D.total + 1) / 100) * 100, need = next - D.total, gws = avg > 0 ? Math.ceil(need / avg) : null;
  const tp = topPct(D.rank, D.count); let rk = '';
  if (tp != null) { const thr = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50].filter((v) => v < tp).pop(); if (thr) { const tgt = Math.floor((D.count * thr) / 100), climb = D.rank - tgt; rk = `<div style="--d:160ms"><small>${tt(`حتى تدخل أعلى ${thr}٪`, `To reach top ${thr}%`)}</small><b>${N(fmt(climb))}</b><em>${tt('مركز لازم تصعدها', 'places to climb')}</em><i class="sy-mb"><i style="--w:${Math.round(Math.min(1, thr / tp) * 100)}%"></i></i></div>`; } }
  const gTxt = gws ? (gws === 1 ? tt('تقريباً جولة وحدة', '~1 GW') : gws === 2 ? tt('تقريباً جولتين', '~2 GWs') : tt(`تقريباً ${gws} جولات`, `~${gws} GWs`)) : '';
  return { k: 'gl', col: 'var(--c-lav)', ic: 'flag', tab: tt('هدفك', 'Goal'), h: tt('هدفك الجاي', 'Your next goal'), sub: tt(`حسب معدلك بآخر ${last5.length} جولات (${Math.round(avg)} نقطة)`, `From your last ${last5.length} GWs avg`),
    to: "go('season')", toL: tt('موسمك', 'Season'),
    body: `<div class="sy-goal"><div style="--d:60ms"><small>${tt(`باقيلك حتى توصل ${next}`, `To reach ${next}`)}</small><b>${N(need)}</b><em>${gTxt}</em><i class="sy-mb"><i style="--w:${100 - need}%"></i></i></div>${rk}</div>` };
}
function wForm(D) {
  if (D.fin.length < 6) return null;
  const L = D.fin.slice(-4), P = D.fin.slice(0, -4), av = (a) => a.reduce((s, x) => s + x.p - x.a, 0) / a.length;
  const lm = av(L), pm = av(P), d = lm - pm;
  const H = 46, W = 300, mx = Math.max(...D.fin.map((x) => Math.abs(x.p - x.a)), 1);
  const path = D.fin.map((x, i) => `${i ? 'L' : 'M'}${((i / (D.fin.length - 1)) * W).toFixed(1)},${(H / 2 - ((x.p - x.a) / mx) * (H / 2 - 4)).toFixed(1)}`).join('');
  return { k: 'fm', col: 'var(--c-sky)', ic: 'wave', tab: tt('فورمتك', 'Form'), h: tt('فورمتك هسة', 'Your form now'), sub: tt('الفرق عن معدل الجولة: آخر 4 جولات مقابل قبلها', 'Vs GW avg: last 4 GWs vs before'),
    to: "go('season')", toL: tt('موسمك', 'Season'),
    body: `<div class="sy-grid two"><div style="--d:60ms"><small>${tt('آخر 4 جولات', 'Last 4')}</small><b class="${lm >= 0 ? 'up' : 'dn'}">${N(sgn(Math.round(lm)))}</b><em>${tt('نقطة بالجولة', 'pts per GW')}</em></div><div style="--d:140ms"><small>${tt('قبلها', 'Before')}</small><b class="${pm >= 0 ? 'up' : 'dn'}">${N(sgn(Math.round(pm)))}</b><em>${tt('نقطة بالجولة', 'pts per GW')}</em></div></div>
      <svg class="sy-spark" viewBox="-4 0 ${W + 8} ${H}" dir="ltr" aria-hidden="true"><path d="M0,${H / 2}H${W}" class="sy-zero"/><path class="sy-line" d="${path}" pathLength="1"/></svg>
      <p class="sy-note">${Math.abs(d) < 2 ? tt('ثابت على نفس المستوى', 'Holding steady') : d > 0 ? tt('فورمتك بتحسّن واضح', 'Clearly improving') : tt('فورمتك نازلة شوية — راجع تشكيلتك', 'Dipping — review your team')}</p>` };
}
function wChips(D) {
  // نفس الورقة ممكن تجي بنصّين للموسم — ناخذ النص المفتوح، وإذا ماكو فالجاي
  const by = {}; (D.chips || []).filter((c) => !c.expired).forEach((c) => { const o = by[c.name]; if (!o || (c.open && !o.open) || (!o.open && !c.open && c.start < o.start)) by[c.name] = c; });
  const C = Object.values(by); if (!C.length) return null;
  const left = C.reduce((s, c) => s + c.left, 0);
  return { k: 'ch', col: 'var(--c-peach)', ic: 'bolt', tab: tt('أوراقك', 'Chips'), h: tt('أوراقك', 'Your chips'), sub: tt(`باقيلك ${left} ورقة`, `${left} left`),
    to: "go('chips')", toL: tt('أفضل توقيت', 'Best timing'),
    body: `<div class="sy-chips">${C.slice(0, 6).map((c, i) => `<div class="${c.left ? '' : 'used'}" style="--d:${i * 60}ms">${ic(c.left ? 'bolt' : 'check')}<b>${chipAr(c.name)}</b><em>${c.left ? (c.open ? tt('متاحة', 'available') : tt(`تفتح بالجولة ${c.start}`, `opens GW${c.start}`)) : tt(`استخدمتها بالجولة ${c.used[0]?.event ?? ''}`, `used GW${c.used[0]?.event ?? ''}`)}</em></div>`).join('')}</div>` };
}
function wBench(D) {
  if (!D.worstBench?.b) return null;
  return { k: 'bn', col: 'var(--c-peach)', ic: 'bench', tab: tt('الدكة', 'Bench'), h: tt('نقاط بقت بالدكة', 'Points left on bench'), sub: '',
    to: "go('team')", toL: tt('رتب تشكيلتك', 'Set your XI'),
    body: `<div class="sy-big"><b class="num sy-cnt" data-v="${D.benchPts}">${D.benchPts}</b><span>${tt('نقطة بكل الجولات', 'pts all season')}</span></div><div class="sy-grid two"><div style="--d:80ms"><small>${tt('أكثر جولة', 'Worst GW')}</small><b>${N(D.worstBench.b)}</b><em>${tt(`الجولة ${D.worstBench.g}`, `GW ${D.worstBench.g}`)}</em></div><div style="--d:150ms"><small>${tt('معدلها بالجولة', 'Per GW')}</small><b>${N((D.benchPts / Math.max(1, D.fin.length)).toFixed(1))}</b><em>${tt('نقطة', 'pts')}</em></div></div>` };
}
const WEEKLY = [wCaptain, wTransfer, wGoal, wForm, wChips, wBench];

/* الأساسيات */
function sRank(D) {
  // المجموع والترتيب العام بالمربع الفوك — هنا مسارك: النسبة، أحسن ترتيب، وخط الموسم
  const F = D.fin.filter((x) => x.r); if (F.length < 2) return null;
  const tp = topPct(D.rank, D.count), best = F.reduce((m, x) => (!m || x.r < m.r ? x : m), null), first = F[0];
  const W = 330, H = 56, rs = F.map((x) => Math.log10(x.r)), mn = Math.min(...rs), sp = Math.max(...rs) - mn || 1;
  const pts = F.map((x, i) => [(i / (F.length - 1)) * W, 6 + ((Math.log10(x.r) - mn) / sp) * (H - 12)]), lp = pts[pts.length - 1];
  const bi = F.indexOf(best), bp = pts[bi];
  return { k: 'rk', col: 'var(--c-lav)', ic: 'rank', h: tt('مسار ترتيبك', 'Your rank path'), sub: tt('الأعلى بالخط = ترتيب أحسن', 'Higher = better'), to: "go('season')", toL: tt('موسمك', 'Season'),
    body: `<div class="sy-rk2">${ring(tp != null ? 1 - tp / 100 : 0, 'var(--c-lav)', `<small>${tt('أعلى', 'Top')}</small><b class="num">${pctTxt(tp)}٪</b>`, 74, 7)}
      <div class="sy-grid two" style="flex:1"><div style="--d:80ms"><small>${tt('أحسن ترتيب', 'Best rank')}</small><b>${N(fmt(best.r))}</b><em>${tt(`الجولة ${best.g}`, `GW ${best.g}`)}</em></div><div style="--d:150ms"><small>${tt('من أول الموسم', 'Since GW1')}</small><b class="${first.r >= D.rank ? 'up' : 'dn'}">${first.r >= D.rank ? '▲' : '▼'} ${N(fmt(Math.abs(first.r - (D.rank || first.r))))}</b><em>${tt('مركز', 'places')}</em></div></div></div>
      <svg class="sy-spark" viewBox="-6 0 ${W + 12} ${H}" dir="ltr" aria-hidden="true"><path class="sy-line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')}" pathLength="1"/><circle cx="${bp[0]}" cy="${bp[1]}" r="4" class="sy-dot best"/><circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" class="sy-dot"/></svg><div class="sy-spl" dir="ltr"><span dir="rtl">${tt('ج', 'GW')}${N(F[0].g)}</span><span dir="rtl">${tt('ج', 'GW')}${N(F[F.length - 1].g)}</span></div>` };
}
function sLeagues(D) {
  // العالم + دوري بلدك + الدوريات الخاصة
  const reg = ST.E.entry.player_region_name, all = [...D.pub, ...D.priv];
  const world = all.find((l) => l.raw === 'Overall'), country = reg ? all.find((l) => l.raw === reg) : null;
  const L = [world, country, ...D.priv].filter(Boolean).slice(0, 6); if (!L.length) return null;
  return { k: 'lg', col: 'var(--c-sky)', ic: 'cup', tab: tt('الدوريات', 'Leagues'), h: tt('ترتيبك بالدوريات', 'Your league ranks'), sub: '', to: "go('leagues')", toL: tt('كل الدوريات', 'All leagues'),
    body: `<div class="sy-lg">${L.map((l, i) => { const mv = l.lr && l.lr !== l.r ? l.lr - l.r : 0, big = l.r >= 10000; return `<div class="sy-lgi" style="--d:${i * 70}ms">${ring(l.pct, l.pct >= .75 ? 'var(--c-mint)' : l.pct >= .4 ? 'var(--c-sky)' : 'var(--c-peach)', big ? `<small>${tt('أعلى', 'Top')}</small><b class="num">${pctTxt(topPct(l.r, l.c))}٪</b>` : `<b class="num">${fmt(l.r)}</b>`, 58, 5)}<span class="sy-lgn">${esc(l.n)}</span><small>${big ? `${N(fmt(l.r))} ${tt('من', 'of')} ` : `${tt('من', 'of')} `}${N(fmt(l.c))}${mv && !big ? ` <em class="${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'}${N(Math.abs(mv))}</em>` : ''}</small></div>`; }).join('')}</div>` };
}
function sGws(D) {
  // أعمدة آخر الجولات موجودة تحت بالرئيسية — هنا الفرق التراكمي عن المعدل (شكد سبقت المدرب العادي)
  const R = D.fin; if (R.length < 3) return null;
  let acc = 0; const cum = R.map((x) => (acc += x.p - x.a)), mx = Math.max(1, ...cum.map(Math.abs));
  const W = 330, H = 90, z = H / 2, pts = cum.map((v, i) => [(i / (cum.length - 1)) * W, z - (v / mx) * (z - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(''), area = `${line}L${W},${z}L0,${z}Z`;
  const last = cum[cum.length - 1], peak = cum.reduce((m, v, i) => (v > cum[m] ? i : m), 0);
  return { k: 'gw', col: 'var(--c-mint)', ic: 'bars', h: tt('سبقك عن المعدل', 'Your edge over average'), sub: tt('مجموع فرق نقاطك عن معدل كل جولة', 'Running total vs GW averages'), to: "go('season')", toL: tt('موسمك', 'Season'),
    body: `<div class="sy-big sm"><b class="num ${last >= 0 ? 'up' : 'dn'}">${N(sgn(last))}</b><span>${last >= 0 ? tt('نقطة فوق المدرب العادي', 'pts above the average manager') : tt('نقطة تحت المدرب العادي', 'pts below the average manager')}</span></div>
      <svg class="sy-cum" viewBox="0 0 ${W} ${H}" dir="ltr" aria-hidden="true"><path d="M0,${z}H${W}" class="sy-zero"/><path d="${area}" class="sy-area"/><path d="${line}" class="sy-line" pathLength="1"/><circle cx="${pts[peak][0]}" cy="${pts[peak][1]}" r="4" class="sy-dot best"/></svg>
      <p class="sy-note">${tt(`أعلى سبق كان بالجولة ${R[peak].g} (${sgn(cum[peak])})`, `Peak at GW ${R[peak].g} (${sgn(cum[peak])})`)}</p>` };
}
function sMoves(D) {
  const cs = D.cs, M = [];
  if (cs?.capRight) M.push(['crown', 'var(--c-gold)', tt(`كابتنك كان الأفضل أو قريب منه بـ ${cs.capRight} من ${cs.capN} جولات`, `Captain was the right pick ${cs.capRight}/${cs.capN}`), cs.capRight / cs.capN]);
  if (cs?.trOk) M.push(['swap', 'var(--c-mint)', tt(`${cs.trOk} من ${cs.trN} انتقالات طلعت صح`, `${cs.trOk}/${cs.trN} transfers paid off`) + (cs.trGain ? ` <em>${N(`+${cs.trGain}`)} ${tt('نقطة', 'pts')}</em>` : ''), cs.trOk / cs.trN]);
  if (D.above) M.push(['star', 'var(--c-sky)', tt(`تفوقت على المعدل بـ ${D.above} جولة`, `Beat the average in ${D.above} GWs`) + (D.streak > 1 ? ` <em>${tt('أطول سلسلة', 'best run')} ${N(D.streak)}</em>` : ''), D.above / Math.max(1, D.fin.length)]);
  if (D.climbs) M.push(['up', 'var(--c-teal)', tt(`ترتيبك صعد بـ ${D.climbs} جولة`, `Rank rose in ${D.climbs} GWs`) + (D.bestClimb ? ` <em>${tt('أكبر قفزة', 'biggest')} ${N(fmt(D.bestClimb.d))}</em>` : ''), D.climbs / Math.max(1, D.fin.length - 1)]);
  if (D.noHit) M.push(['check', 'var(--c-lav)', tt(`انتقالات بدون خصم بـ ${D.noHit} جولة`, `${D.noHit} GWs of hit-free transfers`), null]);
  if (!M.length) return null;
  return { k: 'mv', col: 'var(--c-teal)', ic: 'check', tab: tt('قراراتك', 'Right calls'), h: tt('خطواتك الصحيحة', 'Your right calls'), sub: '', to: "go('stats')", toL: tt('قراراتك ونتائجها', 'Your decisions'),
    body: `<ul class="sy-mv">${M.slice(0, 5).map((m, i) => `<li style="--d:${80 + i * 80}ms;--c:${m[1]}">${ic(m[0], 'draw')}<span>${m[2]}${m[3] != null ? `<i class="sy-mb"><i style="--w:${Math.round(m[3] * 100)}%"></i></i>` : ''}</span></li>`).join('')}</ul>` };
}
function sExtras(D) {
  const X = [];
  if (D.bestGw) X.push(['spark', 'var(--c-mint)', tt('أحسن جولة', 'Best GW'), N(D.bestGw.p), tt(`الجولة ${D.bestGw.g}`, `GW ${D.bestGw.g}`)]);
  if (D.worstGw && D.fin.length > 2) X.push(['bars', 'var(--c-coral)', tt('أضعف جولة', 'Worst GW'), N(D.worstGw.p), tt(`الجولة ${D.worstGw.g}`, `GW ${D.worstGw.g}`)]);
  if (D.dv != null) X.push(['rank', 'var(--c-sky)', tt('قيمة الفريق', 'Team value'), N(sgn(+D.dv.toFixed(1))), tt('مليون من البداية', 'm since start')]);
  X.push(['bench', 'var(--c-peach)', tt('ضاعت بالدكة', 'Bench lost'), N(D.benchPts), tt('نقطة', 'pts')]);
  X.push(['swap', 'var(--c-lav)', tt('خصم الانتقالات', 'Hits'), N(D.hitsPts ? -D.hitsPts : 0), D.hitsPts ? tt('نقطة', 'pts') : tt('ولا خصم', 'none')]);
  X.push(['bolt', 'var(--c-gold)', tt('أوراق استخدمتها', 'Chips used'), N(D.used.length), D.used.length ? D.used.map((c) => chipAr(c.n)).join('، ') : tt('ولا وحدة', 'none')]);
  return { k: 'xt', col: 'var(--c-peach)', ic: 'spark', tab: tt('لمحات', 'Snapshots'), h: tt('لمحات من موسمك', 'Season snapshots'), sub: '', to: "go('season')", toL: tt('موسمك', 'Season'),
    body: `<div class="sy-xt">${X.map((x, i) => `<div style="--d:${i * 55}ms;--c:${x[1]}">${ic(x[0])}<small>${x[2]}</small><b>${x[3]}</b><em>${x[4]}</em></div>`).join('')}</div>` };
}

/* ---------- المباشر: سجل الأحداث بدقيقتها (من فرق التحديثات) ---------- */
const EVK = ['goals_scored', 'assists', 'clean_sheets', 'saves', 'penalties_saved', 'penalties_missed', 'own_goals', 'yellow_cards', 'red_cards', 'bonus'];
const EVN = {
  goals_scored: ['ball', (n) => ar(n, 'هدف', 'هدفين', 'أهداف', 'هدف')], assists: ['boot', (n) => ar(n, 'صناعة', 'صناعتين', 'صناعات', 'صناعة')],
  clean_sheets: ['shield', () => tt('شباك نظيفة', 'clean sheet')], saves: ['glove', (n) => `${N(n)} ${tt('تصديات', 'saves')}`],
  penalties_saved: ['glove', () => tt('صد ضربة جزاء', 'pen saved')], penalties_missed: ['ball', () => tt('ضيّع جزاء', 'pen missed')],
  own_goals: ['ball', () => tt('هدف بمرماه', 'own goal')], yellow_cards: ['card', () => tt('إنذار', 'yellow')], red_cards: ['card', () => tt('طرد', 'red')], bonus: ['star', (n) => `${N(n)} ${tt('بونص', 'bonus')}`],
};
const fxOf = (team, gw = ST.G.cur) => (ST.G.fx[gw] || []).find((f) => f.h === team || f.a === team);
const scoreTxt = (f) => (f ? `${esc(tShort(f.h))} ${N(`${f.hs ?? 0}-${f.as ?? 0}`)} ${esc(tShort(f.a))}` : '');
const evKey = () => `fp_evlog_${ST.E?.entry?.id}_${ST.G.cur}`;
function evLog() { try { return JSON.parse(localStorage.getItem(evKey()) || 'null') || { snap: {}, ev: [] }; } catch { return { snap: {}, ev: [] }; } }
/** يقارن الإحصاءات الحالية بآخر لقطة: أي زيادة = حدث جديد بدقيقة المباراة الحالية */
function trackEvents(ids) {
  const L = ST.live; if (!L || ST.liveRawGW !== ST.G.cur) return evLog();
  const log = evLog(), first = !Object.keys(log.snap).length;
  ids.forEach((id) => {
    const s = L[id]; if (!s) return; const prev = log.snap[id], f = fxOf(PM(id)?.team);
    EVK.forEach((k, i) => { if (k === 'bonus' || k === 'clean_sheets' || k === 'saves') return; const now = s[k] || 0, was = prev ? prev[i] : 0; if (now > was) for (let n = was; n < now; n++) log.ev.push({ id, k, min: first || !prev ? null : f?.min ?? null, at: Date.now() }); });
    log.snap[id] = EVK.map((k) => s[k] || 0);
  });
  try { localStorage.setItem(evKey(), JSON.stringify(log)); } catch {}
  return log;
}
/** لاعب بالمباشر: أحداثه + نقاطه + مباراته */
function pLive(id, mult = 1) {
  const s = ST.live?.[id] || {}, p = PM(id), f = fxOf(p?.team);
  const evs = EVK.filter((k) => (s[k] || 0) > 0 && !(k === 'saves' && s[k] < 3) && !(k === 'clean_sheets' && (p?.pos === 'FWD' || (s.minutes || 0) < 60)));
  return { id, p, s, f, mult, pts: (s.total_points || 0) * Math.max(1, mult), raw: s.total_points || 0, min: s.minutes || 0, evs };
}
const evChips = (x, log) => x.evs.map((k) => { const [ico, lab] = EVN[k]; const mins = k === 'goals_scored' || k === 'assists' ? (log?.ev || []).filter((e) => e.id === x.id && e.k === k).map((e) => e.min) : []; const mt = mins.length ? mins.map((m) => (m != null ? `${tt('د', 'm')}${N(m)}` : '')).filter(Boolean).join(' ، ') : ''; return `<span class="ev-${k}">${ic(ico)}${lab(x.s[k])}${mt ? `<i>${mt}</i>` : ''}</span>`; }).join('');
function evRow(x, log, i, extra = '') {
  return `<li style="--d:${80 + i * 70}ms"><div class="sy-evh"><b>${esc(x.p?.name || '—')}${x.mult >= 2 ? `<em class="sy-cap">×${N(x.mult)}</em>` : ''}</b><span class="sy-evp">${N(x.pts)}<small>${tt('نقطة', 'pts')}</small></span></div>
    <div class="sy-evc">${evChips(x, log) || `<span class="mut">${N(x.min)} ${tt('دقيقة', 'min')}</span>`}</div>
    <div class="sy-evf">${x.f ? `${scoreTxt(x.f)}${x.f.fin ? ` · ${tt('خلصت', 'FT')}` : x.f.started ? ` · <i class="sy-live"></i>${tt('د', 'm')}${N(x.f.min || 0)}` : ''}` : ''}${extra}</div></li>`;
}

/* الخصوم: بس مواجهات دوريات H2H (خصمك بهالجولة بكل دوري مواجهات) */
async function h2hMatch(L, g) {
  const me = ST.E.entry.id; let page = 1, more = true;
  while (more && page <= 5) { const r = await FPL.loadH2HMatches(L.id, g, page); const m = (r?.results || []).find((x) => x.entry_1_entry === me || x.entry_2_entry === me); if (m) { const a = m.entry_1_entry === me; return { league: L.name, lid: L.id, entry: a ? m.entry_2_entry : m.entry_1_entry, name: (a ? m.entry_2_player_name : m.entry_1_player_name) || '', team: (a ? m.entry_2_name : m.entry_1_name) || '', my: a ? m.entry_1_points : m.entry_2_points, his: a ? m.entry_2_points : m.entry_1_points, bye: !(a ? m.entry_2_entry : m.entry_1_entry) }; } more = !!r?.has_next; page++; }
  return null;
}
async function ensureRival() {
  const G = ST.G, H = (ST.E?.entry?.leagues?.h2h || []).slice(0, 3); if (!H.length || !STORY) return;
  const live = STORY.live, k = `${live ? 'L' : 'B'}_${G.cur}_${G.next}_${H.map((l) => l.id).join(',')}`; if (RIV_K === k) return; RIV_K = k;
  try {
    if (live) {
      const M = (await Promise.all(H.map((L) => h2hMatch(L, G.cur).catch(() => null)))).filter((m) => m && !m.bye);
      for (const m of M) { try { m.picks = await FPL.fetchPicks(m.entry, G.cur); } catch {} }
      RIV = { live: true, M: M.filter((m) => m.picks) };
    } else {
      const fin = STORY.fin[STORY.fin.length - 1]?.g;
      const [last, next] = await Promise.all([fin ? Promise.all(H.map((L) => h2hMatch(L, fin).catch(() => null))) : [], G.next ? Promise.all(H.map((L) => h2hMatch(L, G.next).catch(() => null))) : []]);
      RIV = { live: false, gw: fin, last: (last || []).filter((m) => m && !m.bye), next: (next || []).filter((m) => m && !m.bye) };
    }
    paint();
  } catch { RIV_K = null; }
}
function sLvTotal(D) {
  if (!D.live || LIVE == null) return null;
  const c = ST.E.picks ? liveCalc(ST.E.picks, ST.G.cur) : null, cap = c?.rows.find((r) => r.m >= 2);
  const played = c ? c.rows.filter((r) => r.m > 0 && r.min > 0).length : 0, on = c ? c.rows.filter((r) => r.m > 0).length : 11;
  const R0 = RIV?.live ? RIV.M[0] : null, rc = R0 ? liveCalc(R0.picks, ST.G.cur) : null, gap = rc ? LIVE - rc.total : null;
  return { k: 'lt', col: 'var(--c-coral)', ic: 'pulse', h: tt(`وين وصلت بالجولة ${D.gw}`, `Where GW ${D.gw} stands`), sub: tt('تتحدث وية المباريات', 'Updating with the matches'), to: "go('live')", toL: tt('تابع المباشر', 'Follow live'),
    body: `<div class="sy-grid">${cap ? `<div style="--d:80ms"><small>${tt('كابتنك', 'Captain')}</small><b>${N(cap.pts * cap.m)}</b><em>${esc(PM(cap.id)?.name || '')}</em></div>` : ''}
      <div style="--d:150ms"><small>${tt('لاعبين لعبوا', 'Played')}</small><b>${N(`${played}/${on}`)}</b><em>${tt('من تشكيلتك', 'of your XI')}</em><i class="sy-mb"><i style="--w:${Math.round((played / Math.max(1, on)) * 100)}%"></i></i></div>
      ${gap != null ? `<div style="--d:220ms" class="wide"><small>${tt('مواجهتك ويا', 'H2H vs')} ${esc(R0.name)}</small><b class="${gap >= 0 ? 'up' : 'dn'}">${N(sgn(gap))}</b><em>${gap > 0 ? tt('فايز لحد هسة', 'winning') : gap < 0 ? tt('خسران لحد هسة', 'losing') : tt('متعادلين', 'level')} · ${esc(R0.league)}</em></div>` : ''}</div>` };
}
function sLvMine(D) {
  if (!D.live || !ST.E.picks || !ST.live) return null;
  const c = liveCalc(ST.E.picks, ST.G.cur); if (!c) return null;
  const log = trackEvents(c.rows.map((r) => r.id));
  const X = c.rows.filter((r) => r.m > 0).map((r) => pLive(r.id, r.m)).filter((x) => x.evs.length || x.raw >= 5).sort((a, b) => b.pts - a.pts);
  return { k: 'lm', col: 'var(--c-mint)', ic: 'ball', h: tt('أحداث لاعبينك', 'Your players’ events'), sub: X.length ? tt(`${X.length} من لاعبينك سوّوا الفرق لحد هسة`, `${X.length} players making a difference`) : '', to: "go('live')", toL: tt('كل التفاصيل', 'All details'),
    body: X.length ? `<ul class="sy-ev">${X.slice(0, 4).map((x, i) => evRow(x, log, i)).join('')}</ul>` : `<p class="sy-empty">${ic('clock')}${tt('بعد ماكو أهداف أو صناعات للاعبينك بهالجولة — أول ما يصير شي يطلع هنا', 'No goals or assists yet — they’ll show here')}</p>` };
}
function rivalCard(m, i) {
  const rc = liveCalc(m.picks, ST.G.cur), mine = new Set((ST.E.picks?.picks || []).map((x) => x.element)); if (!rc) return null;
  const log = trackEvents(rc.rows.map((r) => r.id));
  const X = rc.rows.filter((r) => r.m > 0 && !mine.has(r.id)).map((r) => pLive(r.id, r.m)).filter((x) => x.evs.length || x.raw >= 4).sort((a, b) => b.pts - a.pts);
  const shared = rc.rows.filter((r) => r.m > 0 && mine.has(r.id)).length, gap = LIVE != null ? LIVE - rc.total : null, dif = X.reduce((s, x) => s + x.pts, 0);
  return { k: `lr${i}`, col: 'var(--c-lav)', ic: 'vs', h: tt(`مواجهتك ويا ${m.name}`, `H2H vs ${m.name}`), sub: `${esc(m.team)} · ${tt('دوري', 'league')} ${esc(m.league)}`, to: "go('rivals')", toL: tt('متتبّع المنافسين', 'Rivals tracker'),
    body: `<div class="sy-vs"><div><small>${tt('انت', 'You')}</small><b>${N(LIVE ?? '—')}</b></div><span class="${gap >= 0 ? 'up' : 'dn'}">${gap != null ? N(sgn(gap)) : ''}</span><div><small>${esc(m.name)}</small><b>${N(rc.total)}</b></div></div>
      ${X.length ? `<p class="sy-note">${tt(`لاعبينه اللي ما عندك زادوا عليك ${dif} نقطة`, `His differentials added ${dif} pts`)}</p><ul class="sy-ev">${X.slice(0, 3).map((x, j) => evRow(x, log, j)).join('')}</ul>` : `<p class="sy-empty">${ic('shield')}${tt(`لاعبينه المختلفين بعد ما جابوا شي — وعندكم ${shared} لاعب مشترك`, `His differentials quiet so far — ${shared} shared`)}</p>`}` };
}
function sLvRival(D) {
  if (!D.live || !RIV?.live || !ST.live) return null;
  return RIV.M.map(rivalCard).filter(Boolean);
}
function sH2H(D) {
  // بين الجولات: نتيجة مواجهات الجولة اللي خلصت + خصمك الجاي بكل دوري مواجهات
  if (D.live || !RIV || RIV.live || (!RIV.last.length && !RIV.next.length)) return null;
  const res = (m) => (m.my > m.his ? ['up', tt('فزت', 'Won')] : m.my < m.his ? ['dn', tt('خسرت', 'Lost')] : ['', tt('تعادل', 'Draw')]);
  return { k: 'hh', col: 'var(--c-lav)', ic: 'vs', h: tt('مواجهاتك المباشرة', 'Your H2H matches'), sub: '', to: "go('leagues')", toL: tt('دوريات المواجهات', 'H2H leagues'),
    body: `${RIV.last.length ? `<p class="sy-note">${tt(`نتايج الجولة ${RIV.gw}`, `GW ${RIV.gw} results`)}</p><ul class="sy-hh">${RIV.last.map((m, i) => { const [c, t] = res(m); return `<li style="--d:${60 + i * 70}ms"><div><b>${esc(m.name)}</b><small>${esc(m.league)}</small></div><span class="sc">${N(m.my)}<small>${tt('انت', 'You')}</small></span><span class="sc">${N(m.his)}<small>${tt('هو', 'Him')}</small></span><em class="${c}">${t}</em></li>`; }).join('')}</ul>` : ''}
      ${RIV.next.length ? `<p class="sy-note">${tt(`خصومك بالجولة ${ST.G.next}`, `GW ${ST.G.next} opponents`)}</p><ul class="sy-hh nx">${RIV.next.map((m, i) => `<li style="--d:${200 + i * 70}ms"><div><b>${esc(m.name)}</b><small>${esc(m.team)} · ${esc(m.league)}</small></div></li>`).join('')}</ul>` : ''}` };
}
function sLvXI(D) {
  if (!D.live || !ST.E.picks || !ST.live) return null;
  const c = liveCalc(ST.E.picks, ST.G.cur); if (!c) return null;
  const st = (r) => { const f = fxOf(PM(r.id)?.team); return r.min > 0 ? (f?.fin ? 'done' : 'on') : f?.started && !f.fin ? 'bench' : f?.fin ? 'out' : 'wait'; };
  const R = c.rows.filter((r) => r.m > 0 || r.subIn).sort((a, b) => b.pts * b.m - a.pts * a.m);
  const lab = { done: tt('خلص', 'done'), on: tt('يلعب', 'playing'), wait: tt('ينتظر', 'to play'), bench: tt('ما نزل', 'unused'), out: tt('ما لعب', 'DNP') };
  const nx = (r) => { const f = fxOf(PM(r.id)?.team); return f?.ko ? new Date(f.ko).toLocaleTimeString('ar-IQ', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''; };
  return { k: 'lx', col: 'var(--c-sky)', ic: 'shirt', h: tt('تشكيلتك بالملعب', 'Your XI on the pitch'), sub: c.subs?.length ? tt(`${c.subs.length} تبديل تلقائي`, `${c.subs.length} auto-subs`) : '', to: "go('team')", toL: tt('فريقي', 'My team'),
    body: `<div class="sy-xi">${R.map((r, i) => { const s = st(r); return `<div class="${s}" style="--d:${i * 35}ms"><b>${esc(PM(r.id)?.name || '')}${r.m >= 2 ? `<em class="sy-cap">×${r.m}</em>` : ''}${r.subIn ? `<em class="sy-sub">${tt('بديل', 'sub')}</em>` : ''}</b><span>${s === 'wait' ? `<small>${nx(r)}</small>` : `${N(r.pts * Math.max(1, r.m))}<small>${lab[s]}</small>`}</span></div>`; }).join('')}</div>` };
}

/* ---------- بين الجولات ---------- */
function sNext() {
  // «خطوتك الجاية» تنعرض تحت بالرئيسية — هنا مباريات تشكيلتك بالجولة الجاية وصعوبتها
  const g = ST.G.next, xi = ST.plan?.xi; if (!g || !xi?.length) return null;
  const R = xi.map(PM).filter(Boolean).map((p) => ({ p, f: fixturesFor(p.team, g) })).filter((x) => x.f.length || true);
  const dbl = R.filter((x) => x.f.length > 1), blank = R.filter((x) => !x.f.length), avgF = R.filter((x) => x.f.length).map((x) => x.f[0].fdr);
  const easy = R.filter((x) => x.f.length && x.f[0].fdr <= 2).sort((a, b) => xp(b.p, g) - xp(a.p, g));
  const hard = R.filter((x) => x.f.length && x.f[0].fdr >= 4);
  const chip = (x) => `<span class="sy-f sy-d${x.f[0]?.fdr || 0}">${esc(x.p.name)}<small>${x.f.map((f) => `${tt('ضد', 'vs')} <bdi dir="ltr">${esc(tShort(f.opp))}</bdi> ${f.home ? tt('بأرضه', '(H)') : tt('برا', '(A)')}`).join(' + ')}</small></span>`;
  return { k: 'nx', col: 'var(--c-gold)', ic: 'clock', h: tt(`مباريات تشكيلتك بالجولة ${g}`, `Your XI fixtures GW ${g}`), sub: avgF.length ? tt(`معدل الصعوبة ${(avgF.reduce((a, b) => a + b, 0) / avgF.length).toFixed(1)} من 5`, `Avg difficulty ${(avgF.reduce((a, b) => a + b, 0) / avgF.length).toFixed(1)}/5`) : '', to: "go('team')", toL: tt('فريقي', 'My team'),
    body: `${easy.length ? `<p class="sy-note">${tt('مباريات سهلة', 'Easy fixtures')} · ${N(easy.length)}</p><div class="sy-fx">${easy.slice(0, 4).map(chip).join('')}</div>` : ''}
      ${hard.length ? `<p class="sy-note">${tt('مباريات صعبة', 'Tough fixtures')} · ${N(hard.length)}</p><div class="sy-fx">${hard.slice(0, 3).map(chip).join('')}</div>` : ''}
      ${dbl.length ? `<p class="sy-note up">${tt(`${dbl.length} لاعب عنده مباراتين`, `${dbl.length} with a double`)}: ${dbl.map((x) => esc(x.p.name)).join('، ')}</p>` : ''}
      ${blank.length ? `<p class="sy-note dn">${tt(`${blank.length} لاعب ما عنده مباراة`, `${blank.length} blank`)}: ${blank.map((x) => esc(x.p.name)).join('، ')}</p>` : ''}` };
}
function sPrices() {
  const sq = (ST.plan?.squad || (ST.E.picks?.picks || []).map((x) => x.element)).map(PM).filter(Boolean); if (!sq.length) return null;
  const ch = sq.filter((p) => p.cc).sort((a, b) => b.cc - a.cc);
  const pr = sq.map((p) => [p, pricePredict(p)]).filter(([, r]) => r && Math.abs(r.prog || 0) >= 50).sort((a, b) => Math.abs(b[1].prog) - Math.abs(a[1].prog));
  const val = sq.reduce((s, p) => s + p.price, 0), dS = sq.reduce((s, p) => s + p.ccs, 0);
  if (!ch.length && !pr.length) return null;
  return { k: 'pr', col: 'var(--c-teal)', ic: 'coin', h: tt('أسعار لاعبينك', 'Your players’ prices'), sub: tt(`قيمة تشكيلتك ${val.toFixed(1)} مليون (${sgn(+dS.toFixed(1))} من بداية الموسم)`, `Squad ${val.toFixed(1)}m (${sgn(+dS.toFixed(1))} since start)`), to: "go('prices')", toL: tt('توقعات الأسعار', 'Price predictions'),
    body: `<ul class="sy-px">${ch.slice(0, 3).map((p, i) => `<li style="--d:${80 + i * 60}ms"><b>${esc(p.name)}</b><span class="${p.cc > 0 ? 'up' : 'dn'}">${p.cc > 0 ? '▲' : '▼'} ${N(Math.abs(p.cc).toFixed(1))}</span><small>${tt('هالجولة', 'this GW')} · ${N(p.price.toFixed(1))}</small></li>`).join('')}
      ${pr.filter(([p]) => !ch.slice(0, 3).includes(p)).slice(0, 3 - Math.min(2, ch.length) + 1).map(([p, r], i) => `<li style="--d:${260 + i * 60}ms"><b>${esc(p.name)}</b><span class="${r.prog > 0 ? 'up' : 'dn'}">${r.prog > 0 ? tt('ممكن يصعد', 'may rise') : tt('ممكن ينزل', 'may drop')}</span><small>${tt('وصل', 'at')} ${N(`${Math.abs(Math.round(r.prog))}%`)}</small><i class="sy-mb"><i style="--w:${Math.min(100, Math.abs(Math.round(r.prog)))}%;--c:${r.prog > 0 ? 'var(--c-mint)' : 'var(--c-coral)'}"></i></i></li>`).join('')}</ul>` };
}
/* المساهمات: كل جولة زاوية مختلفة ولاعبين مختلفين (تدور حسب رقم الجولة) */
function recent(ids, n = 4) {
  const G = PS.load().gws || {}, gs = Object.keys(G).map(Number).sort((a, b) => b - a).slice(0, n), o = {};
  ids.forEach((id) => { o[id] = gs.reduce((a, g) => { const r = G[g]?.[id]; if (r) { a.pts += r[0] || 0; a.min += r[1] || 0; a.xg += (r[3] || 0) / 100; a.xa += (r[4] || 0) / 100; a.dc += r[7] || 0; } return a; }, { pts: 0, min: 0, xg: 0, xa: 0, dc: 0 }); });
  return { o, n: gs.length };
}
function sContrib() {
  const sq = (ST.plan?.squad || (ST.E.picks?.picks || []).map((x) => x.element)).map(PM).filter(Boolean); if (!sq.length) return null;
  const gw = ST.G.cur || 1, R = recent(sq.map((p) => p.id)), out = sq.filter((p) => p.pos !== 'GK');
  const bar = (rows, mx, i0 = 0) => rows.map((r, i) => `<li style="--d:${80 + (i + i0) * 70}ms"><div class="sy-cth"><b>${esc(r.p.name)}</b><span class="sy-ctn">${r.tags}</span></div><span class="sy-ctbar">${r.segs.map(([c, v]) => `<i class="${c}" style="--w:${Math.max(0, (v / mx) * 100)}%"></i>`).join('')}</span></li>`).join('');
  const tag = (c, icn, txt) => `<em class="${c}">${ic(icn)}${txt}</em>`;
  const MODES = [
    () => { // أهداف وصناعات بالموسم
      const A = out.map((p) => ({ p, v: (p.gls || 0) + (p.ast || 0) })).filter((x) => x.v).sort((a, b) => b.v - a.v).slice(0, 4); if (!A.length) return null; const mx = Math.max(...A.map((a) => a.v));
      return { h: tt('أهداف وصناعات لاعبينك', 'Your goals & assists'), sub: tt('مجموع الموسم', 'Season totals'), leg: [['g', tt('أهداف', 'Goals')], ['a', tt('صناعات', 'Assists')]],
        rows: A.map((a) => ({ p: a.p, tags: tag('g', 'ball', `${N(a.p.gls || 0)} ${tt('هدف', 'G')}`) + tag('a', 'boot', `${N(a.p.ast || 0)} ${tt('صناعة', 'A')}`), segs: [['g', a.p.gls || 0], ['a', a.p.ast || 0]] })), mx };
    },
    () => { // الأخطر بآخر الجولات (المتوقع)
      if (!R.n) return null; const A = out.map((p) => ({ p, r: R.o[p.id] })).filter((x) => x.r.xg + x.r.xa > 0).sort((a, b) => b.r.xg + b.r.xa - (a.r.xg + a.r.xa)).slice(0, 4); if (!A.length) return null; const mx = Math.max(...A.map((a) => a.r.xg + a.r.xa));
      return { h: tt('الأخطر بفريقك هسة', 'Most dangerous right now'), sub: tt(`الأهداف والصناعات المتوقعة بآخر ${R.n} جولات`, `xG + xA, last ${R.n} GWs`), leg: [['g', tt('أهداف متوقعة', 'xG')], ['a', tt('صناعات متوقعة', 'xA')]],
        rows: A.map((a) => ({ p: a.p, tags: tag('g', 'ball', N(a.r.xg.toFixed(1))) + tag('a', 'boot', N(a.r.xa.toFixed(1))), segs: [['g', a.r.xg], ['a', a.r.xa]] })), mx };
    },
    () => { // نقاط آخر الجولات
      if (!R.n) return null; const A = sq.map((p) => ({ p, r: R.o[p.id] })).filter((x) => x.r.pts > 0).sort((a, b) => b.r.pts - a.r.pts).slice(0, 4); if (!A.length) return null; const mx = Math.max(...A.map((a) => a.r.pts));
      return { h: tt('منو شايل فريقك', 'Who’s carrying your team'), sub: tt(`نقاط آخر ${R.n} جولات`, `Points, last ${R.n} GWs`), leg: [['g', tt('نقاط', 'Points')]],
        rows: A.map((a) => ({ p: a.p, tags: tag('g', 'star', `${N(a.r.pts)} ${tt('نقطة', 'pts')}`) + tag('a', 'clock', `${N(a.r.min)} ${tt('دقيقة', 'min')}`), segs: [['g', a.r.pts]] })), mx };
    },
    () => { // الدفاع
      const A = sq.filter((p) => p.pos === 'DEF' || p.pos === 'MID' || p.pos === 'GK').map((p) => ({ p, v: (p.dc || 0) })).filter((x) => x.v || x.p.cs).sort((a, b) => b.v - a.v || (b.p.cs || 0) - (a.p.cs || 0)).slice(0, 4); if (!A.length) return null; const mx = Math.max(1, ...A.map((a) => a.v));
      return { h: tt('صلابة دفاعك', 'Your defensive output'), sub: tt('المساهمات الدفاعية والشباك النظيفة بالموسم', 'Defensive contributions & clean sheets'), leg: [['a', tt('مساهمات دفاعية', 'Def. contributions')]],
        rows: A.map((a) => ({ p: a.p, tags: tag('a', 'shield', `${N(a.v)} ${tt('مساهمة', 'DC')}`) + tag('g', 'check', `${N(a.p.cs || 0)} ${tt('نظيفة', 'CS')}`), segs: [['a', a.v]] })), mx };
    },
    () => { // البونص
      const A = sq.map((p) => ({ p, v: p.bonus || 0 })).filter((x) => x.v).sort((a, b) => b.v - a.v).slice(0, 4); if (!A.length) return null; const mx = Math.max(...A.map((a) => a.v));
      return { h: tt('صيّادين البونص', 'Bonus hunters'), sub: tt('نقاط البونص بالموسم', 'Season bonus points'), leg: [['g', tt('بونص', 'Bonus')]],
        rows: A.map((a) => ({ p: a.p, tags: tag('g', 'star', `${N(a.v)} ${tt('بونص', 'bonus')}`) + tag('a', 'spark', `${N(a.p.bps || 0)} ${tt('نقطة تقييم', 'BPS')}`), segs: [['g', a.v]] })), mx };
    },
  ];
  let M = null; for (let i = 0; i < MODES.length && !M; i++) M = MODES[(gw + i) % MODES.length]();
  if (!M) return null;
  return { k: 'ct', col: 'var(--c-sky)', ic: 'star', h: M.h, sub: M.sub, to: "go('players')", toL: tt('إحصاءات اللاعبين', 'Player stats'),
    body: `<div class="sy-leg">${M.leg.map(([c, l]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div><ul class="sy-ctb">${bar(M.rows, M.mx)}</ul>` };
}

/* ---------- شرح كابتن (طلب واحد لملخص اللاعب، ينخزن) ---------- */
async function loadCapWhy() {
  const b = STORY?.cs?.best; if (!b) return; const k = `${b.id}_${b.gw}`; if (CAPX_K === k) return; CAPX_K = k;
  try {
    const d = await playerSummary(b.id), H = (d.history || []).filter((h) => h.round === b.gw);
    if (!H.length) { CAPX = ''; return; }
    const s = (f) => H.reduce((a, h) => a + (+h[f] || 0), 0), opp = H.map((h) => `${esc(tName(h.opponent_team))} ${h.was_home ? tt('(بأرضه)', '(H)') : tt('(برا)', '(A)')}`).join(' + ');
    const pos = PM(b.id)?.pos ?? PM(b.id)?.element_type, C = [];
    if (s('goals_scored')) C.push(['ball', ar(s('goals_scored'), 'هدف', 'هدفين', 'أهداف', 'هدف')]);
    if (s('assists')) C.push(['boot', ar(s('assists'), 'صناعة', 'صناعتين', 'صناعات', 'صناعة')]);
    if (s('clean_sheets') && pos !== 4) C.push(['shield', tt('شباك نظيفة', 'clean sheet')]);
    if (s('bonus')) C.push(['star', `${N(s('bonus'))} ${tt('بونص', 'bonus')}`]);
    if (s('saves') >= 3) C.push(['shield', `${N(s('saves'))} ${tt('تصديات', 'saves')}`]);
    if (!C.length) C.push(['spark', `${N(s('minutes'))} ${tt('دقيقة', 'min')}`]);
    CAPX = `<small>${tt('ضد', 'vs')} ${opp}${H.length > 1 ? ` — ${tt('جولة مزدوجة', 'double GW')}` : ''}</small><div>${C.map((c, i) => `<span style="--d:${i * 80}ms">${ic(c[0])}${c[1]}</span>`).join('')}</div>`;
  } catch { CAPX = ''; }
  const el = document.getElementById('syCapWhy'); if (el) { el.innerHTML = CAPX; const box = document.getElementById('syBox'); if (box) fit(box); }
}

/* ---------- الشجرة: شنو يطلع بكل مرحلة وبأي ترتيب ---------- */
/* من التحليل الذكي للأندية: نقاط ضعف خصوم لاعبينك بالجولة الجاية، وقوة خصوم دفاعك، ونادي الكابتن */
const CIK = {};
const ciOf = (tid) => { const k = `${tid}:${ST.G.fxList?.filter((f) => f.fin).length || 0}`; if (!CIK[k]) { try { CIK[k] = ciAnalyse(tid); } catch { CIK[k] = null; } } return CIK[k]; };
const ciPick = (R, brs, tone) => (R ? brs.flatMap((b) => R.branches[b] || []).filter((x) => x.tone === tone && !x.always).sort((a, b) => b.w - a.w)[0] : null);
function sOpp() {
  const g = ST.G.next, xi = ST.plan?.xi, T = ciLeague(); if (!g || !xi?.length || !T) return null;
  const tm = Object.values(T).filter((A) => A.p >= 3); if (tm.length < 12) return null;
  const per = (A, k) => A[k] / A.p;
  const rank = (tid, k, desc) => { const xs = [...tm].sort((a, b) => (desc ? per(b, k) - per(a, k) : per(a, k) - per(b, k))); return { r: xs.findIndex((A) => A.tid === tid) + 1, n: xs.length }; };
  const OR = ['', '', 'ثاني ', 'ثالث ', 'رابع ', 'خامس '];
  const rk = (R, best, worst) => (R.r <= 5 ? `، ${OR[R.r]}${best} بالدوري` : R.n + 1 - R.r <= 5 ? `، ${OR[R.n + 1 - R.r]}${worst} بالدوري` : '');
  const last5 = (A, k) => A.res.slice(-5).reduce((a, r) => a + r[k], 0);
  // نجمّع لاعبيك حسب الخصم والدور (هجوم/دفاع) حتى ما يتكرر نفس الخصم
  const G = {};
  xi.map(PM).filter(Boolean).forEach((p) => { const f = fixturesFor(p.team, g)[0]; if (!f || !T[f.opp]?.p) return; const att = p.pos === 'MID' || p.pos === 'FWD', k = f.opp + (att ? 'a' : 'd'); (G[k] = G[k] || { f, att, ps: [] }).ps.push(p); });
  const rows = Object.values(G).map(({ f, att, ps }) => {
    const O = T[f.opp], on = esc(tName(f.opp)), names = ps.sort((a, b) => xp(b, g) - xp(a, g)).slice(0, 2).map((p) => esc(p.name)).join(tt(' و', ' & '));
    if (att) { // لاعبيك الهجوميين: شكد يستقبل الخصم
      const R = rank(f.opp, 'ga', true), ga = per(O, 'ga'), good = R.r <= R.n / 2;
      const x = good ? tt(`${on} يستقبل ${ga.toFixed(1)} هدف بالمباراة${rk(R, 'أضعف دفاع', 'أقوى دفاع')}، ودخل عليه ${goalsW(last5(O, 'ga'))} بآخر 5، وشباكه نظيفة بـ ${O.cs} بس من ${O.p}. فرصة أهداف وصناعات للاعبيك`, `${on} concede ${ga.toFixed(1)}/game`)
        : tt(`${on} يستقبل ${ga.toFixed(1)} بس بالمباراة${rk(R, 'أضعف دفاع', 'أقوى دفاع')}، وشباكه نظيفة بـ ${O.cs} من ${O.p}. مباراة صعبة على لاعبيك الهجوميين`, `${on} concede only ${ga.toFixed(1)}/game`);
      return { good, names, f, big: ga.toFixed(1), unit: tt('يستقبل', 'conc.'), x, w: Math.abs(R.r - R.n / 2) };
    }
    // مدافعيك وحارسك: شكد يسجّل الخصم ومنو هدّافه
    const R = rank(f.opp, 'gf', true), gf = per(O, 'gf'), danger = R.r <= R.n / 2;
    const top = ST.G.players.filter((p) => p.team === f.opp && p.gls > 0).sort((a, b) => b.gls - a.gls)[0];
    const topT = top ? tt(`، وهدّافه ${esc(top.name)} سجّل ${goalsW(top.gls)}`, `, top scorer ${esc(top.name)} (${top.gls})`) : '';
    const x = danger ? tt(`${on} يسجّل ${gf.toFixed(1)} بالمباراة${rk(R, 'أقوى هجوم', 'أضعف هجوم')}${topT}. فرصة الشباك النظيفة ضعيفة`, `${on} score ${gf.toFixed(1)}/game`)
      : tt(`${on} يسجّل ${gf.toFixed(1)} بس بالمباراة${rk(R, 'أقوى هجوم', 'أضعف هجوم')}، وما سجّل بـ ${O.fts} من ${O.p}${topT}. فرصة شباك نظيفة لدفاعك`, `${on} score only ${gf.toFixed(1)}/game`);
    return { good: !danger, names, f, big: gf.toFixed(1), unit: tt('يسجّل', 'scores'), x, w: Math.abs(R.r - R.n / 2) };
  }).sort((a, b) => b.w - a.w);
  ciLoad(rows[0]?.f.opp);
  if (!rows.length) return null;
  const good = rows.filter((r) => r.good).slice(0, 2), warn = rows.filter((r) => !r.good).slice(0, 2);
  const li = (r, i) => `<li style="--d:${80 + i * 60}ms"><b>${r.names} ${tt('ضد', 'vs')} <bdi dir="ltr">${esc(tShort(r.f.opp))}</bdi></b><span class="${r.good ? 'up' : 'dn'}" dir="ltr">${r.big}</span><small>${r.x}</small></li>`;
  return { k: 'opp', col: 'var(--c-lav)', ic: 'target', h: tt(`خصوم تشكيلتك بالجولة ${g}`, `Your opponents GW ${g}`), sub: tt('الرقم: شكد يستقبل الخصم (للمهاجمين) أو يسجّل (للمدافعين) بالمباراة', 'Opponent goals conceded/scored per game'), to: `clubAI(${rows[0].f.opp})`, toL: tt('تحليل الخصم', 'Opponent analysis'),
    body: `${good.length ? `<p class="sy-note up">${tt('فرص لتشكيلتك', 'Opportunities')}</p><ul class="sy-px">${good.map(li).join('')}</ul>` : ''}${warn.length ? `<p class="sy-note dn">${tt('انتبه', 'Watch out')}</p><ul class="sy-px">${warn.map((r, i) => li(r, i + good.length)).join('')}</ul>` : ''}` };
}
function sCapClub() {
  const cap = PM(ST.plan?.cap), g = ST.G.next, T = ciLeague(); if (!cap || !g || !T?.[cap.team]?.p) return null;
  const tm = Object.values(T).filter((A) => A.p >= 3), A = T[cap.team], f = fixturesFor(cap.team, g)[0], O = f ? T[f.opp] : null;
  const rnk = (tid, k) => [...tm].sort((a, b) => b[k] / b.p - a[k] / a.p).findIndex((x) => x.tid === tid) + 1;
  const n = tm.length, l5 = A.res.slice(-5), p5 = l5.reduce((a, r) => a + (r.r === 'W' ? 3 : r.r === 'D' ? 1 : 0), 0);
  const items = [
    { t: tt(`هجوم ${tName(cap.team)}`, 'Attack'), big: (A.gf / A.p).toFixed(1), x: tt(`هدف بالمباراة، ترتيبه ${rnk(cap.team, 'gf')} من ${n} بالتسجيل`, `goals/game, ranked ${rnk(cap.team, 'gf')}/${n}`), up: rnk(cap.team, 'gf') <= n / 2 },
    { t: tt(`${cap.name} بالموسم`, `${cap.name} this season`), big: String(cap.gls + cap.ast), x: tt(`${cap.gls + cap.ast ? `${cap.gls ? goalsW(cap.gls) : 'ولا هدف'} و${cap.ast} صناعة` : 'ما سجّل ولا صنع لحد هسه'}، وفرصه تسوى ${cap.xg.toFixed(1)} هدف متوقع${A.gf && cap.gls + cap.ast ? `. ساهم بـ ${Math.round(((cap.gls + cap.ast) / A.gf) * 100)}% من أهداف فريقه` : ''}`, `${cap.gls} G, ${cap.ast} A, ${cap.xg.toFixed(1)} xG`), up: true },
    { t: tt('فورمة الفريق بآخر 5', 'Team form, last 5'), big: String(p5), x: tt(`نقطة من 15، سجّل ${goalsW(l5.reduce((a, r) => a + r.gf, 0))}`, `pts of 15`), up: p5 >= 8 },
  ];
  if (O) { const r = [...tm].sort((a, b) => b.ga / b.p - a.ga / a.p).findIndex((x) => x.tid === f.opp) + 1;
    items.push({ t: tt(`دفاع ${tName(f.opp)}`, `${tName(f.opp)} defence`), big: (O.ga / O.p).toFixed(1), x: tt(`يستقبل بالمباراة، ${r <= n / 2 ? `من أضعف ${r <= 5 ? 5 : 10} دفاعات` : 'من الدفاعات القوية'} (ترتيبه ${n + 1 - r} من ${n})`, `conceded/game`), up: r <= n / 2 }); }
  const good = items.filter((x) => x.up).length;
  return { k: 'capc', col: 'var(--c-gold)', ic: 'crown', h: tt(`كابتنك ${cap.name}`, `Your captain ${cap.name}`), sub: f ? tt(`ضد ${tName(f.opp)} ${f.home ? 'بأرضه' : 'برا'}، ${good >= 3 ? 'اختيار قوي' : good === 2 ? 'اختيار متوسط' : 'فكّر ببديل'}`, `vs ${tName(f.opp)}`) : '', to: `clubAI(${cap.team})`, toL: tt('تحليل النادي', 'Club analysis'),
    body: `<ul class="sy-px">${items.map((x, i) => `<li style="--d:${80 + i * 60}ms"><b>${esc(x.t)}</b><span class="${x.up ? 'up' : 'dn'}" dir="ltr">${x.big}</span><small>${esc(x.x)}</small></li>`).join('')}</ul>` };
}

/* ---------- إحصائيات الأندية بالمربع: تتبدّل كل جولة (٢ من ٤) وتتحدث بعد كل مباراة ---------- */
const rt = (a, b) => (b ? a / b : 0);
const pct = (a, b) => `${Math.round(rt(a, b) * 100)}%`;
const mine = (...tids) => (ST.plan?.squad || []).map(PM).filter((p) => p && tids.includes(p.team));
const nextFx = () => { const g = ST.G.next; const T = ciLeague(); return g && T ? { g, T, fx: (ST.G.fx[g] || []).filter((f) => T[f.h]?.p >= 3 && T[f.a]?.p >= 3) } : null; };
const vsN = (h, a) => `${esc(tName(h))} ${tt('ضد', 'vs')} ${esc(tName(a))}`;
const RES = { W: tt('ف', 'W'), D: tt('ت', 'D'), L: tt('خ', 'L') };
const formStr = (A) => `<span class="sy-fm5">${A.res.slice(-5).map((r) => `<i class="${r.r}">${RES[r.r]}</i>`).join('')}</span>`;

function sGoalFx() {
  const X = nextFx(); if (!X || X.fx.length < 3) return null;
  const rows = X.fx.map((f) => { const H = X.T[f.h], W = X.T[f.a];
    const e = (rt(H.gf, H.p) + rt(W.ga, W.p)) / 2 + (rt(W.gf, W.p) + rt(H.ga, H.p)) / 2;
    return { f, e, o: (rt(H.o25, H.p) + rt(W.o25, W.p)) / 2, own: mine(f.h, f.a).length }; }).sort((a, b) => b.e - a.e);
  const lo = rows[rows.length - 1];
  const li = (r, i) => `<li style="--d:${80 + i * 60}ms"><b>${vsN(r.f.h, r.f.a)}</b><span class="up" dir="ltr">${r.e.toFixed(1)}</span><small>${tt(`${Math.round(r.o * 100)}% من مبارياتهم بيها أكثر من هدفين`, `${Math.round(r.o * 100)}% of their games over 2.5`)}${r.own ? tt(`، عندك ${r.own === 1 ? 'لاعب واحد' : r.own === 2 ? 'لاعبين' : r.own + ' لاعبين'} بيها`, `, you own ${r.own}`) : ''}</small></li>`;
  return { k: 'gfx', col: 'var(--c-coral)', ic: 'ball', h: tt(`مباريات الأهداف بالجولة ${X.g}`, `Goal-fest fixtures GW ${X.g}`), sub: tt('الرقم = أهداف متوقعة من معدل تسجيل واستقبال الفريقين', 'Expected goals from both sides’ averages'), to: "go('team')", toL: tt('فريقي', 'My team'),
    body: `<ul class="sy-px">${rows.slice(0, 3).map(li).join('')}</ul><p class="sy-note">${tt(`أقل مباراة أهداف: ${vsN(lo.f.h, lo.f.a)} (${lo.e.toFixed(1)})`, `Lowest: ${vsN(lo.f.h, lo.f.a)} (${lo.e.toFixed(1)})`)}</p>` };
}
function sCSOdds() {
  const X = nextFx(); if (!X || !X.fx.length) return null;
  const rows = X.fx.flatMap((f) => [[f.h, f.a, 1], [f.a, f.h, 0]]).map(([t, o, home]) => { const A = X.T[t], O = X.T[o];
    return { t, o, home, A, O, s: (rt(A.cs, A.p) + rt(O.fts, O.p)) / 2 - (rt(A.ga, A.p) + rt(O.gf, O.p)) / 10, own: mine(t).filter((p) => p.pos === 'DEF' || p.pos === 'GKP') }; }).sort((a, b) => b.s - a.s).slice(0, 4);
  const li = (r, i) => `<li style="--d:${80 + i * 60}ms"><b>${esc(tName(r.t))} ${tt('ضد', 'vs')} <bdi dir="ltr">${esc(tShort(r.o))}</bdi> ${r.home ? tt('بأرضه', '(H)') : tt('برا', '(A)')}</b><span class="up" dir="ltr">${pct(r.A.cs, r.A.p)}</span><small>${tt(`شباكه نظيفة بـ ${r.A.cs} من ${r.A.p}، وخصمه ما سجّل بـ ${r.O.fts} من ${r.O.p}`, `${r.A.cs}/${r.A.p} clean sheets; opponent blanked ${r.O.fts}/${r.O.p}`)}${r.own.length ? tt(`. عندك: ${r.own.map((p) => esc(p.name)).join('، ')}`, `. You own: ${r.own.map((p) => esc(p.name)).join(', ')}`) : ''}</small></li>`;
  return { k: 'csx', col: 'var(--c-mint)', ic: 'shield', h: tt(`أقرب الفرق للشباك النظيفة بالجولة ${X.g}`, `Best clean-sheet bets GW ${X.g}`), sub: tt('من شباكه النظيفة وعجز خصمه عن التسجيل', 'From clean sheets and the opponent’s blanks'), to: "go('market')", toL: tt('السوق', 'Market'),
    body: `<ul class="sy-px">${rows.map(li).join('')}</ul>` };
}
function sClubForm() {
  const T = ciLeague(); if (!T) return null;
  const xs = Object.values(T).filter((A) => A.p >= 6).map((A) => { const l = A.res.slice(-5), p5 = l.reduce((a, r) => a + (r.r === 'W' ? 3 : r.r === 'D' ? 1 : 0), 0);
    return { A, p5, d: p5 / l.length - A.pts / A.p, gf: l.reduce((a, r) => a + r.gf, 0), ga: l.reduce((a, r) => a + r.ga, 0) }; });
  if (xs.length < 10) return null;
  const hot = [...xs].sort((a, b) => b.p5 - a.p5 || b.d - a.d).slice(0, 2), cold = [...xs].sort((a, b) => a.p5 - b.p5 || a.d - b.d).slice(0, 2);
  const why = (x) => x.d >= 0.3 ? tt('أحسن من معدله بالموسم', 'above his season rate') : x.d <= -0.3 ? tt('أسوأ من معدله بالموسم', 'below his season rate') : tt('نفس مستواه بالموسم', 'in line with his season');
  const li = (x, i, up) => `<li style="--d:${80 + i * 60}ms"><b>${esc(tName(x.A.tid))} ${formStr(x.A)}</b><span class="${up ? 'up' : 'dn'}" dir="ltr">${x.p5}</span><small>${tt(`نقطة من آخر 5، سجّل ${x.gf} واستقبل ${x.ga}، ${why(x)}`, `pts from last 5, ${x.gf}-${x.ga}, ${why(x)}`)}</small></li>`;
  return { k: 'cfm', col: 'var(--c-gold)', ic: 'pulse', h: tt('فورمة الأندية بآخر 5 مباريات', 'Club form, last 5'), sub: tt('ف فوز، ت تعادل، خ خسارة', 'W win, D draw, L loss'), to: "go('clubs')", toL: tt('الأندية', 'Clubs'),
    body: `<p class="sy-note up">${tt('الأندية الطايرة', 'Flying')}</p><ul class="sy-px">${hot.map((x, i) => li(x, i, 1)).join('')}</ul><p class="sy-note dn">${tt('الأندية المتراجعة', 'Struggling')}</p><ul class="sy-px">${cold.map((x, i) => li(x, i + 2, 0)).join('')}</ul>` };
}
function sSoftD() {
  const X = nextFx(); if (!X || !X.fx.length) return null;
  const rows = X.fx.flatMap((f) => [[f.h, f.a], [f.a, f.h]]).map(([t, o]) => { const l = X.T[o].res.slice(-5); return { t, o, ga: l.reduce((a, r) => a + r.ga, 0), n: l.length }; })
    .sort((a, b) => b.ga - a.ga).slice(0, 3).map((r) => ({ ...r, p: ST.G.players.filter((p) => p.team === r.t && (p.pos === 'FWD' || p.pos === 'MID') && p.st === 'a').sort((a, b) => b.form - a.form)[0] })).filter((r) => r.p && r.ga >= 6);
  if (!rows.length) return null;
  const own = new Set(ST.plan?.squad || []);
  const li = (r, i) => `<li style="--d:${80 + i * 60}ms"><b>${esc(r.p.name)} ${tt('ضد', 'vs')} <bdi dir="ltr">${esc(tShort(r.o))}</bdi>${own.has(r.p.id) ? tt(' (عندك)', ' (owned)') : ''}</b><span class="dn" dir="ltr">${r.ga}</span><small>${tt(`${esc(tName(r.o))} استقبل ${goalsW(r.ga)} بآخر ${r.n} مباريات، و${esc(r.p.name)} أعلى فورمة بفريقه (${r.p.form})`, `${esc(tName(r.o))} conceded ${r.ga} in last ${r.n}; ${esc(r.p.name)} is his side’s top form (${r.p.form})`)}</small></li>`;
  return { k: 'sfd', col: 'var(--c-coral)', ic: 'target', h: tt(`دفاعات منهارة بالجولة ${X.g}`, `Leaky defences GW ${X.g}`), sub: tt('ومنو أحسن لاعب يستغلها', 'And who can exploit them'), to: "go('market')", toL: tt('السوق', 'Market'),
    body: `<ul class="sy-px">${rows.map(li).join('')}</ul>` };
}
const CLUBS = [sGoalFx, sCSOdds, sClubForm, sSoftD];
/* اكتشافات الجولة: من محرّك يطوّر نفسه (story-discover.js) */
function sDisc(part) {
  const all = discover(3), xs = all.slice(part * 3, part * 3 + 3); if (xs.length < (part ? 2 : 2)) return null;
  const g = ST.G.next;
  return { k: 'dsc' + part, col: part ? 'var(--c-mint)' : 'var(--c-lav)', ic: 'spark', h: part ? tt(`اكتشافات أكثر للجولة ${g}`, `More discoveries GW ${g}`) : tt(`اكتشافات الجولة ${g}`, `GW ${g} discoveries`),
    sub: tt('معلومات من زوايا مختلفة، تتجدد كل جولة وما تتكرر', 'Fresh angles each gameweek, never repeated'), to: "go('players')", toL: tt('اللاعبين', 'Players'),
    body: `<ul class="sy-px">${xs.map(discLi).join('')}</ul>` };
}
const TREE = {
  live: { lead: [sLvTotal, sLvMine, sLvRival, sLvXI], core: 1 },
  between: { lead: [sRecap, sH2H, sNext, sOpp, sPrices, sContrib], core: 3 },
};
const CORE = [sRank, sLeagues, sMoves, sExtras, sCapClub];
function plan() {
  const D = STORY; if (!D) return [];
  const T = TREE[D.live ? 'live' : 'between'];
  const lead = T.lead.flatMap((f) => f(D) || []).filter(Boolean);
  let wk = null; for (let i = 0; i < WEEKLY.length && !wk; i++) { wk = WEEKLY[(D.gw + i) % WEEKLY.length](D); if (wk) wk.week = true; }
  const off = D.gw % CORE.length, core = [...CORE.slice(off), ...CORE.slice(0, off)].map((f) => f(D)).filter(Boolean).slice(0, T.core);
  const out = [...lead]; if (wk) out.splice(Math.min(2, out.length), 0, wk);
  if (!D.live) {
    const cl = freshest(CLUBS.map((f) => f(D)).filter(Boolean), 2), d0 = sDisc(0), d1 = sDisc(1);
    const at = out.findIndex((x) => x.k === 'opp'); out.splice(at >= 0 ? at + 1 : Math.min(4, out.length), 0, ...[d0, ...cl].filter(Boolean));
    if (d1) { const pr = out.findIndex((x) => x.k === 'pr'); out.splice(pr >= 0 ? pr + 1 : out.length, 0, d1); }
  }
  return [...out, ...core];
}

/* ---------- الواجهة ---------- */
const BG = `<div class="sy-bg" aria-hidden="true"><svg viewBox="0 0 400 400"><defs><linearGradient id="syG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".9"/><stop offset=".6" stop-color="currentColor" stop-opacity=".08"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
  <g class="r1"><circle cx="200" cy="200" r="70" fill="none" stroke="url(#syG)" stroke-width="1.2"/></g>
  <g class="r2"><circle cx="200" cy="200" r="120" fill="none" stroke="url(#syG)" stroke-width="1" stroke-dasharray="2 7"/></g>
  <g class="r3"><circle cx="200" cy="200" r="175" fill="none" stroke="url(#syG)" stroke-width="1"/></g>
  <path d="M200 0V400" stroke="url(#syG)" stroke-width=".8" class="ln"/></svg><i class="sy-glow"></i><i class="sy-sheen"></i></div>`;
const slideHTML = (s, on) => `<div class="sy-sl${on ? ' on' : ''}" data-k="${s.k}" data-to="${esc(s.to)}" style="--c:${s.col}" ${on ? '' : 'aria-hidden="true"'}>
  <div class="sy-t">${ic(s.ic, 'draw sy-tic')}<div><h3>${s.h}</h3>${s.sub ? `<p>${s.sub}</p>` : ''}</div>${s.week ? `<span class="sy-wk">${tt('فقرة هالجولة', 'This GW')}</span>` : ''}</div>
  <div class="sy-bd">${s.body}</div>
  <button class="sy-go" type="button"><span>${s.toL}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></button></div>`;

export function storyHTML(opt = {}) {
  if (!ST.E?.entry || !ST.G) return '';
  LIVE = opt.livePts ?? null; if (opt.tips) TIPS = opt.tips;
  const k = `${ST.E.entry.id}_${ST.G.finished}_${ST.G.cur}_${ST.E.entry.summary_overall_points}`;
  if (STORY_K !== k) { STORY_K = k; STORY = build(STORY?.cs || null); }
  else STORY.live = build(STORY.cs).live;
  if (!STORY.cs?.has && Date.now() - CS_T > 4000) { CS_T = Date.now(); coachStory().then((cs) => { if (!cs?.has || STORY_K !== k) return; STORY = build(cs); paint(); }); }
  ensureRival();
  const S = plan(); if (!S.length) return '';
  if (SI >= S.length) SI = 0;
  return `<section class="sy${HOLD ? ' hold' : ''}" id="syBox" style="--c:${S[SI].col}" aria-roledescription="carousel" aria-label="${tt('موسمك', 'Your season')}">${BG}
    <div class="sy-prog">${S.map((s, i) => `<span class="${i < SI ? 'done' : i === SI ? 'cur' : ''}"><i style="animation-duration:${DUR}ms"></i></span>`).join('')}</div>
    <div class="sy-hd"><span class="sy-tag">${STORY.live ? tt('مباشر الآن', 'Live now') : tt(`موسمك · الجولة ${ST.G.cur}`, `Your season · GW ${ST.G.cur}`)}</span><button class="sy-pp" type="button" aria-label="${tt('إيقاف/تشغيل', 'Pause/play')}"><span></span><span></span></button></div>
    <div class="sy-stage">${S.map((s, i) => slideHTML(s, i === SI)).join('')}</div>
  </section>`;
}
function paint() { const el = document.getElementById('syBox'); if (!el) return; const h = storyHTML({ livePts: LIVE }); if (!h) return; el.outerHTML = h; bind(); }

function fit(box, anim = true) {
  const st = box.querySelector('.sy-stage'), on = box.querySelector('.sy-sl.on'); if (!st || !on) return;
  if (!anim) st.style.transition = 'none';
  st.style.height = `${on.offsetHeight}px`;
  if (!anim) { void st.offsetHeight; st.style.transition = ''; }
}
function setSlide(i, user) {
  const S = plan(); if (!S.length) return;
  const box = document.getElementById('syBox'); if (!box) return;
  const prev = SI; SI = (i + S.length) % S.length;
  if (user && S[SI].k !== 'gw') SEL = null;
  const d = SI > prev || (prev === S.length - 1 && SI === 0) ? 1 : -1;
  box.style.setProperty('--c', S[SI].col);
  box.querySelectorAll('.sy-sl').forEach((el, j) => {
    el.classList.remove('in-f', 'in-b', 'out-f', 'out-b');
    if (j === SI) { el.classList.add('on', d > 0 ? 'in-f' : 'in-b'); el.removeAttribute('aria-hidden'); }
    else { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); if (j === prev) el.classList.add(d > 0 ? 'out-f' : 'out-b'); }
  });
  box.querySelectorAll('.sy-prog span').forEach((el, j) => { el.className = j < SI ? 'done' : ''; if (j === SI) { void el.offsetWidth; el.className = 'cur'; } });
  box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
  fit(box);
  countUp(box.querySelector('.sy-sl.on'));
  if (S[SI].k === 'cp') loadCapWhy();
}
function countUp(sl) {
  if (!sl || RM()) return;
  sl.querySelectorAll('.sy-cnt').forEach((el) => { const v = +el.dataset.v; if (!v) return; const t0 = performance.now(), d = 850; const f = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(v * e)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); });
}
function run(to) {
  const m = /^(\w+)\((.*)\)$/.exec(to || ''); if (!m || typeof window[m[1]] !== 'function') return;
  const a = m[2].trim(); window[m[1]](a === '' ? undefined : /^-?\d+$/.test(a) ? +a : a.replace(/^'|'$/g, ''));
}
/* تحديث المباشر بهدوء: كل دقيقتين، بس إذا الرئيسية مفتوحة والمربع ظاهر والجولة شغالة */
async function poll() {
  if (!STORY?.live || ST.view !== 'home' || !VIS || document.hidden) return;
  const g = ST.G.cur;
  try {
    const [l, fx] = await Promise.all([FPL.loadLive(g, true), FPL.loadFixturesGW(g, true)]);
    ST.live = Object.fromEntries(l.elements.map((x) => [x.id, x.stats])); ST.liveRaw = l.elements; ST.liveRawGW = g;
    if (Array.isArray(fx) && fx.length) ST.G.fx[g] = fx.map((x) => FPL.fxBest({ id: x.id, ev: x.event, h: x.team_h, a: x.team_a, hd: x.team_h_difficulty, ad: x.team_a_difficulty, ko: x.kickoff_time, fin: !!(x.finished || (x.finished_provisional && (x.minutes || 0) >= 90)), started: x.started, hs: x.team_h_score, as: x.team_a_score, min: x.minutes, stats: x.stats || [] }));
    if (ST.view === 'home') window.render?.();
  } catch {}
}
function bind() {
  const box = document.getElementById('syBox'); if (!box || BOUND.has(box)) return; BOUND.add(box);
  requestAnimationFrame(() => fit(box, false));
  box.addEventListener('animationend', (e) => { if (e.target.parentElement?.classList.contains('cur') && e.target.closest('.sy-prog')) setSlide(SI + 1); });
  box.querySelector('.sy-pp').addEventListener('click', (e) => { e.stopPropagation(); HOLD = !HOLD; box.classList.toggle('hold', HOLD); });
  // ضوء يتبع الإصبع/الماوس
  box.addEventListener('pointermove', (e) => { const r = box.getBoundingClientRect(); box.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`); box.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`); }, { passive: true });
  let x0 = null, y0 = 0, t0 = 0, moved = false, lp = null;
  const st = box.querySelector('.sy-stage');
  st.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); moved = false; lp = setTimeout(() => box.classList.add('hold'), 230); });
  st.addEventListener('pointermove', (e) => { if (x0 != null && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) moved = true; });
  st.addEventListener('pointerup', (e) => {
    if (x0 == null) return; clearTimeout(lp); if (!HOLD) box.classList.remove('hold');
    const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0; x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { setSlide(SI + (dx > 0 ? 1 : -1), true); return; } // RTL: السحب لليمين = التالي
    if (!moved && dt < 230) { const r = box.getBoundingClientRect(); setSlide(SI + (e.clientX - r.left < r.width / 2 ? 1 : -1), true); }
  });
  st.addEventListener('pointercancel', () => { x0 = null; clearTimeout(lp); if (!HOLD) box.classList.remove('hold'); });
  st.addEventListener('click', (e) => {
    const pk = e.target.closest('[data-pick]'); if (pk) { e.stopPropagation(); pickGw(+pk.dataset.pick); return; }
    const go = e.target.closest('.sy-go'); if (go) { e.stopPropagation(); run(go.closest('.sy-sl')?.dataset.to); }
  });
  countUp(box.querySelector('.sy-sl.on'));
  if (plan()[SI]?.k === 'cp') loadCapWhy();
  if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { VIS = en.isIntersecting; box.classList.toggle('off', !VIS); }, { threshold: .35 }).observe(box);
  clearInterval(PT); if (STORY?.live) PT = setInterval(poll, POLL);
}
function pickGw(g) {
  SEL = g; HOLD = true; const box = document.getElementById('syBox'); box?.classList.add('hold');
  const sl = box?.querySelector('.sy-sl[data-k=gw]'), s = sGws(STORY); if (!sl || !s) return;
  sl.querySelectorAll('.sy-gw button').forEach((b) => b.classList.toggle('on', +b.dataset.pick === g));
  const t = document.createElement('div'); t.innerHTML = slideHTML(s, true);
  sl.querySelector('.sy-gd').replaceWith(t.querySelector('.sy-gd')); sl.querySelector('.sy-go').replaceWith(t.querySelector('.sy-go')); sl.dataset.to = s.to;
  sl.querySelector('.sy-gd').classList.add('flash');
}
if (typeof window !== 'undefined') addEventListener('resize', () => { const b = document.getElementById('syBox'); if (b) fit(b, false); }, { passive: true });
export function afterStory() { bind(); }
