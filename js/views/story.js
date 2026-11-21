/* =========================================================
   «موسمك» — مربع متفاعل بالرئيسية تتبدّل معلوماته حسب خطة:
   1) فقرة المرحلة: مباشر أثناء الجولة، وملخص آخر جولة بعدها.
   2) فقرة الأسبوع: تتغيّر كل جولة (كابتن، أنجح انتقال، هدفك الجاي، فورمتك، أوراقك، الدكة).
   3) الأساسيات: ترتيبك، الدوريات، نقاط الجولات، خطواتك الصحيحة، لمحات — ويتبدّل ترتيبها كل جولة.
   كل شريحة تنضغط وتوديك لمكان المعلومة. كل الأرقام حقيقية من بيانات المدرب — ولا رقم مفترض.
========================================================= */
import { ST, PM, tName } from '../store.js';
import { tt } from '../i18n.js';
import { esc, fmt } from '../ui.js';
import { playerSummary } from './common.js';
import { chipStatus } from '../fpl.js';

const AUTO = 9000;
let SI = 0, SEL = null, TOUCHED = false, CS_T = 0, CAPX = null, CAPX_K = null, STORY = null, STORY_K = null, LIVE = null, TMR = null, VIS = true;
const BOUND = new WeakSet();
const RM = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = (v) => `<bdi dir="ltr" class="num">${v}</bdi>`;
const ar = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${N(n)} ${few}` : `${N(n)} ${many}`);
const sgn = (v) => `${v > 0 ? '+' : ''}${v}`;

/* ---------- أيقونات خطية (تنرسم عند ظهور الشريحة) ---------- */
const IC = {
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
  recap: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 10h8M8 14h5"/>',
};
const ic = (k, cls = '') => `<svg class="sy-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

function ring(pct, col, inner, size = 74, sw = 7) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r, off = C * (1 - Math.max(0, Math.min(1, pct)));
  return `<span class="sy-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${sw}"/><circle class="sy-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" style="--C:${C.toFixed(1)};--o:${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><span class="sy-rin">${inner}</span></span>`;
}
const topPct = (rank, count) => (rank && count ? Math.max(0.1, (rank / count) * 100) : null);
const pctTxt = (p) => (p == null ? '—' : p < 10 ? p.toFixed(1).replace(/\.0$/, '') : Math.round(p));
const chipAr = (n) => ({ wildcard: 'البطاقة الحرة', freehit: 'الضربة الحرة', bboost: 'تعزيز الدكة', '3xc': 'الكابتن الثلاثي', manager: 'المدير المساعد' }[n] || n);
const pName = (id) => esc(PM(id)?.name || '—');

/* ---------- تجميع البيانات ---------- */
async function coachStory() { try { const m = await import('../coach.js'); return m.seasonStory(); } catch { return null; } }
function build(cs) {
  const G = ST.G, E = ST.E, en = E.entry, evOf = (g) => G.events.find((e) => e.id === g);
  const rows = (E.hist?.current || []).filter((h) => evOf(h.event)).map((h) => ({ g: h.event, p: h.points, a: evOf(h.event)?.avg || 0, r: h.overall_rank, t: h.event_transfers || 0, c: h.event_transfers_cost || 0, b: h.points_on_bench || 0, v: h.value }));
  const fin = rows.filter((x) => evOf(x.g)?.fin);
  const SYS = { Overall: tt('العام', 'Overall'), 'Second Chance': tt('الفرصة الثانية', 'Second Chance') };
  const lg = (en.leagues?.classic || []).filter((l) => l.entry_rank && l.rank_count > 1).map((l) => ({ n: SYS[l.name] || l.name, r: l.entry_rank, c: l.rank_count, lr: l.entry_last_rank, x: l.league_type === 'x', pct: 1 - (l.entry_rank - 1) / l.rank_count }));
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

/* ---------- الشرائح: كل وحدة { k, col, ic, tab, h, sub, body, to, toL } ---------- */
function sLive(D) {
  if (!D.live || LIVE == null) return null;
  const prev = D.fin[D.fin.length - 1], d = prev ? LIVE - prev.p : null;
  return { k: 'lv', col: 'var(--c-coral)', ic: 'pulse', tab: tt('مباشر', 'Live'), h: tt(`الجولة ${D.gw} مباشر`, `GW ${D.gw} live`), sub: tt('النقاط تتحدث وية المباريات', 'Updating with the matches'),
    to: "go('live')", toL: tt('تابع المباشر', 'Follow live'),
    body: `<div class="sy-big"><b class="num sy-cnt" data-v="${LIVE}">${LIVE}</b><span>${tt('نقطة لحد هسة', 'pts so far')}</span></div>${d != null ? `<p class="sy-note">${tt('مقارنة بالجولة الماضية', 'vs last GW')} <span class="${d >= 0 ? 'up' : 'dn'}">${N(sgn(d))}</span></p>` : ''}` };
}
function sRecap(D) {
  const x = D.fin[D.fin.length - 1]; if (!x) return null;
  const pv = D.fin[D.fin.length - 2], mv = pv?.r && x.r ? pv.r - x.r : 0, g = D.cs?.byGw?.[x.g];
  const items = [];
  items.push(`<div><small>${tt('عن المعدل', 'vs avg')}</small><b class="${x.p >= x.a ? 'up' : 'dn'}">${N(sgn(x.p - x.a))}</b><em>${tt('المعدل', 'avg')} ${N(x.a)}</em></div>`);
  if (mv) items.push(`<div><small>${tt('ترتيبك', 'Rank')}</small><b class="${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'} ${N(fmt(Math.abs(mv)))}</b><em>${tt('مركز', 'places')}</em></div>`);
  if (g?.cap) items.push(`<div><small>${tt('الكابتن', 'Captain')}</small><b>${N(g.capPts * g.mult)}</b><em>${pName(g.cap)}</em></div>`);
  if (g?.top && g.top !== g.cap) items.push(`<div><small>${tt('نجم تشكيلتك', 'Your top scorer')}</small><b>${N(g.topPts)}</b><em>${pName(g.top)}</em></div>`);
  items.push(`<div><small>${tt('الانتقالات', 'Transfers')}</small><b>${N(x.t)}</b><em>${x.c ? `${tt('خصم', 'hit')} ${N(-x.c)}` : tt('بدون خصم', 'no hit')}</em></div>`);
  return { k: 'rc', col: 'var(--c-mint)', ic: 'recap', tab: tt('الملخص', 'Recap'), h: tt(`ملخص الجولة ${x.g}`, `GW ${x.g} recap`), sub: '',
    to: `seasonGo(${x.g})`, toL: tt('تفاصيل الجولة', 'GW details'),
    body: `<div class="sy-big"><b class="num sy-cnt" data-v="${x.p}">${x.p}</b><span>${tt('نقطة', 'pts')}</span></div><div class="sy-grid">${items.slice(0, 4).map((h, i) => h.replace('<div>', `<div style="--d:${80 + i * 70}ms">`)).join('')}</div>` };
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
  if (!D.total) return null;
  const tp = topPct(D.rank, D.count), F = D.fin.filter((x) => x.r);
  let spark = '';
  if (F.length >= 2) {
    const W = 330, H = 50, rs = F.map((x) => Math.log10(x.r)), mn = Math.min(...rs), sp = Math.max(...rs) - mn || 1;
    const pts = F.map((x, i) => [(i / (F.length - 1)) * W, 6 + ((Math.log10(x.r) - mn) / sp) * (H - 12)]), lp = pts[pts.length - 1];
    spark = `<svg class="sy-spark" viewBox="-6 0 ${W + 12} ${H}" dir="ltr" aria-hidden="true"><path class="sy-line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')}" pathLength="1"/><circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" class="sy-dot"/></svg><div class="sy-spl" dir="ltr"><span dir="rtl">${tt('ج', 'GW')}${N(F[0].g)}</span><span>${tt('ترتيبك عبر الموسم', 'Rank through the season')}</span><span dir="rtl">${tt('ج', 'GW')}${N(F[F.length - 1].g)}</span></div>`;
  }
  return { k: 'rk', col: 'var(--c-lav)', ic: 'rank', tab: tt('ترتيبك', 'Rank'), h: tt('ترتيبك ونقاطك', 'Rank & points'), sub: '', to: "go('season')", toL: tt('موسمك', 'Season'),
    body: `<div class="sy-big"><b class="num sy-cnt" data-v="${D.total}">${fmt(D.total)}</b><span>${tt('نقطة بالموسم', 'season points')}</span></div>
      <div class="sy-rk2">${ring(tp != null ? 1 - tp / 100 : 0, 'var(--c-lav)', `<small>${tt('أعلى', 'Top')}</small><b class="num">${pctTxt(tp)}٪</b>`, 74, 7)}<div><small>${tt('الترتيب العام', 'Overall rank')}</small><b class="num">${D.rank ? fmt(D.rank) : '—'}</b>${D.count ? `<small>${tt('من', 'of')} ${N(fmt(D.count))} ${tt('مدرب', 'managers')}</small>` : ''}</div></div>${spark}` };
}
function sLeagues(D) {
  const L = [...D.priv.slice(0, 3), ...D.pub.slice(0, Math.max(0, 4 - Math.min(3, D.priv.length)))].slice(0, 4); if (!L.length) return null;
  return { k: 'lg', col: 'var(--c-sky)', ic: 'cup', tab: tt('الدوريات', 'Leagues'), h: tt('ترتيبك بالدوريات', 'League ranks'), sub: '', to: "go('leagues')", toL: tt('كل الدوريات', 'All leagues'),
    body: `<div class="sy-lg">${L.map((l, i) => { const mv = l.lr && l.lr !== l.r ? l.lr - l.r : 0, big = l.r >= 10000; return `<div class="sy-lgi" style="--d:${i * 70}ms">${ring(l.pct, l.pct >= .75 ? 'var(--c-mint)' : l.pct >= .4 ? 'var(--c-sky)' : 'var(--c-peach)', big ? `<small>${tt('أعلى', 'Top')}</small><b class="num">${pctTxt(topPct(l.r, l.c))}٪</b>` : `<b class="num">${fmt(l.r)}</b>`, 58, 5)}<span class="sy-lgn">${esc(l.n)}</span><small>${big ? `${N(fmt(l.r))} ${tt('من', 'of')} ` : `${tt('من', 'of')} `}${N(fmt(l.c))}${mv && !big ? ` <em class="${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'}${N(Math.abs(mv))}</em>` : ''}</small></div>`; }).join('')}</div>` };
}
function sGws(D) {
  const R = D.rows; if (!R.length) return null;
  const mx = Math.max(1, ...R.map((x) => Math.max(x.p, x.a))), sel = R.find((x) => x.g === SEL) || R[R.length - 1];
  return { k: 'gw', col: 'var(--c-mint)', ic: 'bars', tab: tt('الجولات', 'GWs'), h: tt('نقاطك بكل جولة', 'Points every GW'), sub: tt(`${D.above} من ${D.fin.length} فوق المعدل — اختار جولة`, `${D.above}/${D.fin.length} above avg — pick one`),
    to: `seasonGo(${sel.g})`, toL: tt(`افتح الجولة ${sel.g}`, `Open GW ${sel.g}`),
    body: `<div class="sy-gw" dir="ltr">${R.map((x, i) => `<button class="${x.p >= x.a ? 'up' : ''}${x.g === sel.g ? ' on' : ''}" style="--h:${((x.p / mx) * 100).toFixed(1)}%;--a:${((x.a / mx) * 100).toFixed(1)}%;--d:${i * 16}ms" data-pick="${x.g}" aria-label="${tt('الجولة', 'GW')} ${x.g}: ${x.p}"><i></i><s></s></button>`).join('')}</div>
      <div class="sy-gd"><b>${tt('الجولة', 'GW')} ${N(sel.g)}</b><span><b class="num">${sel.p}</b> ${tt('نقطة', 'pts')}</span><span class="${sel.p >= sel.a ? 'up' : 'dn'}">${N(sgn(sel.p - sel.a))} ${tt('عن المعدل', 'vs avg')}</span>${sel.r ? `<span>${tt('ترتيب', 'rank')} ${N(fmt(sel.r))}</span>` : ''}<span>${sel.t ? `${ar(sel.t, 'انتقال', 'انتقالين', 'انتقالات', 'انتقال')}${sel.c ? ` (${tt('خصم', 'hit')} ${N(-sel.c)})` : ''}` : tt('بدون انتقالات', 'no transfers')}</span></div>` };
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

/* ---------- الخطة: شنو يتصدر وبأي ترتيب، حسب الجولة والمرحلة ---------- */
function plan() {
  const D = STORY; if (!D) return [];
  const lead = D.live ? sLive(D) || sRecap(D) : sRecap(D);
  let wk = null; for (let i = 0; i < WEEKLY.length && !wk; i++) { wk = WEEKLY[(D.gw + i) % WEEKLY.length](D); if (wk) wk.week = true; }
  const core = [sRank, sLeagues, sGws, sMoves, sExtras], off = D.gw % core.length;
  const rot = [...core.slice(off), ...core.slice(0, off)].map((f) => f(D)).filter(Boolean);
  return [lead, wk, ...rot].filter(Boolean);
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

/* ---------- الواجهة ---------- */
const slideHTML = (s, on) => `<div class="sy-sl${on ? ' on' : ''}" data-k="${s.k}" data-to="${esc(s.to)}" style="--c:${s.col}" ${on ? '' : 'aria-hidden="true"'}>
  <div class="sy-t">${ic(s.ic, 'draw sy-tic')}<div><h3>${s.h}</h3>${s.sub ? `<p>${s.sub}</p>` : ''}</div>${s.week ? `<span class="sy-wk">${tt('فقرة هالجولة', 'This GW')}</span>` : ''}</div>
  <div class="sy-bd">${s.body}</div>
  <div class="sy-go"><span>${s.toL}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></div></div>`;

export function storyHTML(opt = {}) {
  if (!ST.E?.entry || !ST.G) return '';
  LIVE = opt.livePts ?? null;
  const k = `${ST.E.entry.id}_${ST.G.finished}_${ST.G.cur}_${ST.E.entry.summary_overall_points}`;
  if (STORY_K !== k) { STORY_K = k; STORY = build(STORY?.cs || null); }
  if (!STORY.cs?.has && Date.now() - CS_T > 4000) { CS_T = Date.now(); coachStory().then((cs) => { if (!cs?.has || STORY_K !== k) return; STORY = build(cs); const el = document.getElementById('syBox'); if (el) { el.outerHTML = storyHTML({ livePts: LIVE }); bind(); } }); }
  const S = plan(); if (!S.length) return '';
  if (SI >= S.length) SI = 0;
  return `<section class="sy" id="syBox" style="--c:${S[SI].col}" aria-roledescription="carousel" aria-label="${tt('موسمك', 'Your season')}">
    <nav class="sy-tabs" role="tablist">${S.map((s, i) => `<button role="tab" aria-selected="${i === SI}" class="${i === SI ? 'on' : ''}" style="--c:${s.col}" data-i="${i}">${ic(s.ic)}<span>${s.tab}</span></button>`).join('')}</nav>
    <div class="sy-stage">${S.map((s, i) => slideHTML(s, i === SI)).join('')}</div>
  </section>`;
}

function fit(box, anim = true) {
  const st = box.querySelector('.sy-stage'), on = box.querySelector('.sy-sl.on'); if (!st || !on) return;
  if (!anim) st.style.transition = 'none';
  st.style.height = `${on.offsetHeight}px`;
  if (!anim) { void st.offsetHeight; st.style.transition = ''; }
}
function setSlide(i, user, dir) {
  const S = plan(); if (!S.length) return;
  const box = document.getElementById('syBox'); if (!box) return;
  const prev = SI; SI = (i + S.length) % S.length; if (prev === SI) return;
  if (user) { TOUCHED = true; if (S[SI].k !== 'gw') SEL = null; }
  const d = dir ?? (SI > prev ? 1 : -1);
  box.style.setProperty('--c', S[SI].col);
  box.querySelectorAll('.sy-sl').forEach((el, j) => {
    el.classList.remove('in-f', 'in-b', 'out-f', 'out-b');
    if (j === SI) { el.classList.add('on', d > 0 ? 'in-f' : 'in-b'); el.removeAttribute('aria-hidden'); }
    else { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); if (j === prev) el.classList.add(d > 0 ? 'out-f' : 'out-b'); }
  });
  const tabs = box.querySelectorAll('.sy-tabs button');
  tabs.forEach((el, j) => { el.classList.toggle('on', j === SI); el.setAttribute('aria-selected', j === SI); });
  const nav = box.querySelector('.sy-tabs'), t = tabs[SI];
  if (nav && t) nav.scrollTo({ left: t.offsetLeft - (nav.clientWidth - t.offsetWidth) / 2, behavior: RM() ? 'auto' : 'smooth' });
  fit(box);
  countUp(box.querySelector('.sy-sl.on'));
  if (S[SI].k === 'cp') loadCapWhy();
  arm();
}
function countUp(sl) {
  if (!sl || RM()) return;
  sl.querySelectorAll('.sy-cnt').forEach((el) => { const v = +el.dataset.v; if (!v) return; const t0 = performance.now(), d = 850; const f = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(v * e)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); });
}
/* تبديل هادئ تلقائي — يوقف نهائياً أول ما المستخدم يتفاعل، ويوقف إذا المربع مو ظاهر */
function arm() {
  clearTimeout(TMR); if (TOUCHED || RM()) return;
  TMR = setTimeout(() => { if (!document.getElementById('syBox')) return; if (VIS && !document.hidden) setSlide(SI + 1, false, 1); else arm(); }, AUTO);
}
function bind() {
  const box = document.getElementById('syBox'); if (!box || BOUND.has(box)) return; BOUND.add(box);
  requestAnimationFrame(() => fit(box, false));
  box.querySelector('.sy-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) setSlide(+b.dataset.i, true); });
  let x0 = null, y0 = 0, swiped = false;
  const st = box.querySelector('.sy-stage');
  st.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; swiped = false; });
  st.addEventListener('pointerup', (e) => {
    if (x0 == null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; setSlide(SI + (dx > 0 ? 1 : -1), true, dx > 0 ? 1 : -1); } // RTL: السحب لليمين = التالي
  });
  st.addEventListener('pointercancel', () => { x0 = null; });
  st.addEventListener('click', (e) => {
    if (swiped) { swiped = false; return; }
    const pk = e.target.closest('[data-pick]');
    if (pk) { pickGw(+pk.dataset.pick); return; }
    const sl = e.target.closest('.sy-sl.on'); if (!sl?.dataset.to) return;
    TOUCHED = true; clearTimeout(TMR);
    run(sl.dataset.to);
  });
  countUp(box.querySelector('.sy-sl.on'));
  if (plan()[SI]?.k === 'cp') loadCapWhy();
  if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { VIS = en.isIntersecting; }, { threshold: .4 }).observe(box);
  arm();
}
function run(to) {
  const m = /^(\w+)\((.*)\)$/.exec(to || ''); if (!m || typeof window[m[1]] !== 'function') return;
  const a = m[2].trim(); window[m[1]](a === '' ? undefined : /^-?\d+$/.test(a) ? +a : a.replace(/^'|'$/g, ''));
}
function pickGw(g) {
  SEL = g; TOUCHED = true; clearTimeout(TMR);
  const box = document.getElementById('syBox'), sl = box?.querySelector('.sy-sl[data-k=gw]'), s = sGws(STORY); if (!sl || !s) return;
  sl.querySelectorAll('.sy-gw button').forEach((b) => b.classList.toggle('on', +b.dataset.pick === g));
  const t = document.createElement('div'); t.innerHTML = slideHTML(s, true);
  sl.querySelector('.sy-gd').replaceWith(t.querySelector('.sy-gd')); sl.querySelector('.sy-go').replaceWith(t.querySelector('.sy-go')); sl.dataset.to = s.to;
  sl.querySelector('.sy-gd').classList.add('flash');
}
if (typeof window !== 'undefined') addEventListener('resize', () => { const b = document.getElementById('syBox'); if (b) fit(b, false); }, { passive: true });
export function afterStory() { bind(); }
