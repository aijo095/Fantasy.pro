/* =========================================================
   «قصة موسمك» — مربع متفاعل بالرئيسية بشرائح مثل الستوري:
   الدوريات، الترتيب، نقاط كل جولة، خطواتك الصحيحة، أعلى كابتن وشلون جابها، لمحات.
   كل الأرقام من بيانات المدرب الحقيقية (التاريخ + كاش المدرب الذكي) — ولا رقم مفترض.
   يتقدّم تلقائياً، يوقف باللمس المطوّل، سحب يمين/يسار، ونقر على الجوانب.
========================================================= */
import { ST, PM, tName } from '../store.js';
import { tt } from '../i18n.js';
import { esc, fmt } from '../ui.js';
import { playerSummary } from './common.js';

const DUR = 6500;
let CS_T = 0, SI = 0, SEL = null, HOLD = false, PHOLD = false, BOUND = new WeakSet(), CAPX = null, CAPX_K = null, STORY = null, STORY_K = null;
const RM = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = (v) => `<bdi dir="ltr" class="num">${v}</bdi>`;
const ar = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${N(n)} ${few}` : `${N(n)} ${many}`);

/* ---------- أشكال عضوية متحركة ---------- */
const BLOBS = [
  ['M54,-61C69,-49,80,-31,82,-12C84,7,77,27,64,42C51,57,32,67,11,71C-10,75,-33,72,-50,60C-67,48,-78,27,-80,5C-82,-17,-75,-40,-60,-53C-45,-66,-22,-69,-1,-68C20,-67,39,-73,54,-61Z',
   'M47,-55C61,-44,73,-29,77,-11C81,7,77,27,66,43C55,59,37,71,16,76C-5,81,-29,79,-46,67C-63,55,-73,33,-76,11C-79,-11,-75,-33,-62,-47C-49,-61,-27,-67,-6,-66C15,-65,33,-66,47,-55Z',
   'M58,-66C73,-52,81,-31,81,-11C81,9,73,28,60,44C47,60,29,73,8,76C-13,79,-37,72,-54,58C-71,44,-81,23,-81,1C-81,-21,-71,-43,-55,-57C-39,-71,-18,-77,3,-79C24,-81,43,-80,58,-66Z'],
];
function blob(col, op = .22, sc = 1) {
  const [a, b, c] = BLOBS[0];
  const anim = RM() ? '' : `<animate attributeName="d" dur="9s" repeatCount="indefinite" values="${a};${b};${c};${a}" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/>`;
  return `<svg class="ss-blob" viewBox="-100 -100 200 200" aria-hidden="true" style="--sc:${sc}"><path d="${a}" fill="${col}" opacity="${op}">${anim}</path></svg>`;
}

/* ---------- أيقونات مرسومة (تنرسم عند ظهور الشريحة) ---------- */
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
};
const ic = (k, cls = '') => `<svg class="ss-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

/* حلقة نسبة (أعلى من كذا ٪ من المدربين) */
function ring(pct, col, inner, size = 74, sw = 7) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r, off = C * (1 - Math.max(0, Math.min(1, pct)));
  return `<span class="ss-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${sw}"/><circle class="ss-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" style="--C:${C.toFixed(1)};--o:${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><span class="ss-rin">${inner}</span></span>`;
}
const topPct = (rank, count) => (rank && count ? Math.max(0.1, (rank / count) * 100) : null);
const pctTxt = (p) => (p == null ? '—' : p < 1 ? p.toFixed(1) : p < 10 ? p.toFixed(1).replace(/\.0$/, '') : Math.round(p));

/* ---------- تجميع البيانات (مرة لكل تحديث بيانات) ---------- */
async function coachStory() { try { const m = await import('../coach.js'); return m.seasonStory(); } catch { return null; } }
function build(cs) {
  const G = ST.G, E = ST.E, en = E.entry, hist = (E.hist?.current || []).filter((h) => G.events.find((e) => e.id === h.event));
  const avgOf = (g) => G.events.find((e) => e.id === g)?.avg || 0;
  const rows = hist.map((h) => ({ g: h.event, p: h.points, a: avgOf(h.event), r: h.overall_rank, t: h.event_transfers || 0, c: h.event_transfers_cost || 0, b: h.points_on_bench || 0, v: h.value }));
  const fin = rows.filter((x) => G.events.find((e) => e.id === x.g)?.fin);
  const SYS = { Overall: tt('العام', 'Overall'), 'Gameweek 1': tt('من الجولة 1', 'Gameweek 1'), 'Second Chance': tt('الفرصة الثانية', 'Second Chance') };
  const lg = (en.leagues?.classic || []).filter((l) => l.entry_rank && l.rank_count > 1).map((l) => ({ n: SYS[l.name] || l.name, r: l.entry_rank, c: l.rank_count, lr: l.entry_last_rank, x: l.league_type === 'x', pct: 1 - (l.entry_rank - 1) / l.rank_count }));
  const priv = lg.filter((l) => l.x).sort((a, b) => b.pct - a.pct), pub = lg.filter((l) => !l.x).sort((a, b) => a.c - b.c);
  const above = fin.filter((x) => x.p >= x.a).length;
  let streak = 0, cur = 0; fin.forEach((x) => { cur = x.p >= x.a ? cur + 1 : 0; streak = Math.max(streak, cur); });
  let climbs = 0, bestClimb = null; fin.forEach((x, i) => { const pv = fin[i - 1]; if (pv?.r && x.r && x.r < pv.r) { climbs++; const d = pv.r - x.r; if (!bestClimb || d > bestClimb.d) bestClimb = { d, g: x.g }; } });
  const bestGw = fin.reduce((m, x) => (!m || x.p > m.p ? x : m), null), worstGw = fin.reduce((m, x) => (!m || x.p < m.p ? x : m), null);
  const hitsPts = fin.reduce((s, x) => s + x.c, 0), benchPts = fin.reduce((s, x) => s + x.b, 0), noHit = fin.filter((x) => x.t > 0 && !x.c).length;
  const v0 = rows[0]?.v, v1 = rows[rows.length - 1]?.v;
  const chips = (E.hist?.chips || []).map((c) => ({ n: c.name, g: c.event }));
  return { rows, fin, priv, pub, above, streak, climbs, bestClimb, bestGw, worstGw, hitsPts, benchPts, noHit, dv: v0 && v1 ? (v1 - v0) / 10 : null, chips, cs,
    total: en.summary_overall_points, rank: en.summary_overall_rank, count: G.totalPlayers || 0 };
}
const chipAr = (n) => ({ wildcard: 'البطاقة الحرة', freehit: 'الضربة الحرة', bboost: 'تعزيز الدكة', '3xc': 'الكابتن الثلاثي', manager: 'المدير المساعد' }[n] || n);

/* ---------- الشرائح ---------- */
function sLeagues(D) {
  const L = [...D.priv.slice(0, 3), ...D.pub.slice(0, Math.max(0, 4 - Math.min(3, D.priv.length)))].slice(0, 4);
  if (!L.length) return null;
  const tp = topPct(D.rank, D.count);
  return { k: 'lg', col: 'var(--c-sky)', ic: 'cup', h: tt('ترتيبك بالدوريات', 'Your league ranks'),
    sub: tp != null ? tt(`أعلى من ${pctTxt(100 - tp)}٪ من كل المدربين`, `Top ${pctTxt(tp)}% overall`) : '',
    body: `<div class="ss-lg">${L.map((l, i) => { const mv = l.lr && l.lr !== l.r ? l.lr - l.r : 0; return `<button class="ss-lgi" style="--d:${i * 90}ms" onclick="event.stopPropagation();go('leagues')">${ring(l.pct, l.pct >= .75 ? 'var(--c-mint)' : l.pct >= .4 ? 'var(--c-sky)' : 'var(--c-peach)', l.r < 10000 ? `<b class="num">${fmt(l.r)}</b>` : `<small>${tt('أعلى', 'Top')}</small><b class="num">${pctTxt(topPct(l.r, l.c))}٪</b>`, 64, 6)}<span class="ss-lgn">${esc(l.n)}</span><small>${l.r >= 10000 ? `${N(fmt(l.r))} ${tt('من', 'of')} ` : `${tt('من', 'of')} `}${N(fmt(l.c))}${mv && l.r < 10000 ? ` <em class="${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'}${N(fmt(Math.abs(mv)))}</em>` : ''}</small></button>`; }).join('')}</div>` };
}
function sRank(D) {
  if (!D.total) return null;
  const tp = topPct(D.rank, D.count), F = D.fin.filter((x) => x.r);
  let spark = '';
  if (F.length >= 2) {
    const W = 330, H = 54, rs = F.map((x) => Math.log10(x.r)), mn = Math.min(...rs), mx = Math.max(...rs), sp = mx - mn || 1;
    const pts = F.map((x, i) => [(i / (F.length - 1)) * W, 6 + ((Math.log10(x.r) - mn) / sp) * (H - 12)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const lp = pts[pts.length - 1];
    spark = `<svg class="ss-spark" viewBox="-6 0 ${W + 12} ${H}" dir="ltr" aria-hidden="true"><path class="ss-line" d="${d}" pathLength="1"/><circle cx="${lp[0]}" cy="${lp[1]}" r="4.5" class="ss-dot"/></svg><div class="ss-spl" dir="ltr"><span dir="rtl">${tt('ج', 'GW')}${N(F[0].g)}</span><span>${tt('ترتيبك عبر الموسم — الأعلى أفضل', 'Rank through the season — higher is better')}</span><span dir="rtl">${tt('ج', 'GW')}${N(F[F.length - 1].g)}</span></div>`;
  }
  return { k: 'rk', col: 'var(--c-lav)', ic: 'rank', h: tt('ترتيبك ونقاطك', 'Rank & points'), sub: '',
    body: `<div class="ss-rk"><div class="ss-big"><b class="num ss-cnt" data-v="${D.total}">${fmt(D.total)}</b><span>${tt('نقطة بالموسم', 'season points')}</span></div>
      <div class="ss-rk2">${ring(tp != null ? 1 - tp / 100 : 0, 'var(--c-lav)', `<small>${tt('أعلى', 'Top')}</small><b class="num">${pctTxt(tp)}٪</b>`, 78, 7)}<div><small>${tt('الترتيب العام', 'Overall rank')}</small><b class="num">${D.rank ? fmt(D.rank) : '—'}</b>${D.count ? `<small>${tt('من', 'of')} ${N(fmt(D.count))} ${tt('مدرب', 'managers')}</small>` : ''}</div></div>${spark}</div>` };
}
function sGws(D) {
  const R = D.rows; if (!R.length) return null;
  const mx = Math.max(1, ...R.map((x) => Math.max(x.p, x.a)));
  const sel = R.find((x) => x.g === SEL) || R[R.length - 1];
  const det = (x) => `<div class="ss-gd" id="ssGd"><b>${tt('الجولة', 'GW')} ${N(x.g)}</b><span><b class="num">${x.p}</b> ${tt('نقطة', 'pts')}</span><span class="${x.p >= x.a ? 'up' : 'dn'}">${N(`${x.p - x.a >= 0 ? '+' : ''}${x.p - x.a}`)} ${tt('عن المعدل', 'vs avg')}</span>${x.r ? `<span>${tt('ترتيب', 'rank')} ${N(fmt(x.r))}</span>` : ''}<span>${x.t ? `${ar(x.t, 'انتقال', 'انتقالين', 'انتقالات', 'انتقال')}${x.c ? ` (${tt('خصم', 'hit')} ${N(`-${x.c}`)})` : ''}` : tt('بدون انتقالات', 'no transfers')}</span>${x.b ? `<span>${tt('دكة', 'bench')} ${N(x.b)}</span>` : ''}</div>`;
  return { k: 'gw', col: 'var(--c-mint)', ic: 'bars', h: tt('نقاطك بكل جولة', 'Points every GW'), sub: tt(`${D.above} من ${D.fin.length} جولة فوق المعدل — اضغط على أي عمود`, `${D.above}/${D.fin.length} above avg — tap a bar`),
    body: `<div class="ss-gw" dir="ltr">${R.map((x, i) => `<button class="${x.p >= x.a ? 'up' : ''}${x.g === sel.g ? ' on' : ''}" style="--h:${((x.p / mx) * 100).toFixed(1)}%;--a:${((x.a / mx) * 100).toFixed(1)}%;--d:${i * 18}ms" onclick="event.stopPropagation();ssPick(${x.g})" aria-label="GW${x.g}: ${x.p}"><i></i><s></s></button>`).join('')}</div>${det(sel)}` };
}
function sMoves(D) {
  const cs = D.cs, M = [];
  if (cs?.capRight) M.push(['crown', 'var(--c-gold)', tt(`كابتنك كان الأفضل أو قريب منه بـ ${cs.capRight} من ${cs.capN} جولات`, `Captain was the best pick in ${cs.capRight}/${cs.capN} GWs`), cs.capRight / cs.capN]);
  if (cs?.trOk) M.push(['swap', 'var(--c-mint)', tt(`${cs.trOk} من ${cs.trN} انتقالات طلعت صح`, `${cs.trOk}/${cs.trN} transfers paid off`) + (cs.trGain ? ` <em>${N(`+${cs.trGain}`)} ${tt('نقطة', 'pts')}</em>` : ''), cs.trOk / cs.trN]);
  if (D.above) M.push(['star', 'var(--c-sky)', tt(`تفوقت على المعدل بـ ${D.above} جولة`, `Beat the average in ${D.above} GWs`) + (D.streak > 1 ? ` <em>${tt('أطول سلسلة', 'best run')} ${N(D.streak)}</em>` : ''), D.above / D.fin.length]);
  if (D.climbs) M.push(['up', 'var(--c-teal)', tt(`ترتيبك صعد بـ ${D.climbs} جولة`, `Rank went up in ${D.climbs} GWs`) + (D.bestClimb ? ` <em>${tt('أكبر قفزة', 'biggest')} ${N(fmt(D.bestClimb.d))}</em>` : ''), D.climbs / Math.max(1, D.fin.length - 1)]);
  if (D.noHit) M.push(['check', 'var(--c-lav)', tt(`سويت انتقالات بدون خصم بـ ${D.noHit} جولة`, `${D.noHit} GWs of transfers without a hit`), null]);
  if (!M.length) return null;
  return { k: 'mv', col: 'var(--c-teal)', ic: 'check', h: tt('خطواتك الصحيحة', 'Your right calls'), sub: '',
    body: `<ul class="ss-mv">${M.slice(0, 5).map((m, i) => `<li style="--d:${120 + i * 110}ms;--c:${m[1]}">${ic(m[0], 'draw')}<span>${m[2]}${m[3] != null ? `<i class="ss-mb"><i style="--w:${Math.round(m[3] * 100)}%"></i></i>` : ''}</span></li>`).join('')}</ul>` };
}
function sCaptain(D) {
  const b = D.cs?.best; if (!b) return null;
  const p = PM(b.id); if (!p) return null;
  return { k: 'cp', col: 'var(--c-gold)', ic: 'crown', h: tt('أعلى نقاط كابتن', 'Best captain haul'), sub: tt(`بالجولة ${b.gw}`, `GW ${b.gw}`),
    body: `<div class="ss-cp"><div class="ss-cpn"><b>${esc(p.name)}</b><small>${esc(tName(p.team))}</small></div>
      <div class="ss-cpv"><b class="num ss-cnt" data-v="${b.tot}">${b.tot}</b><span><em>×${N(b.mult)}</em>${tt('نقطة كابتن', 'captain pts')}</span></div>
      <div class="ss-why" id="ssCapWhy">${CAPX && CAPX_K === `${b.id}_${b.gw}` ? CAPX : `<span class="ss-ld">${tt('نجيب شلون جابها…', 'Loading how…')}</span>`}</div>
      ${b.chip === '3xc' ? `<small class="ss-cpc">${tt('بالكابتن الثلاثي', 'with Triple Captain')}</small>` : ''}</div>` };
}
function sExtras(D) {
  const X = [];
  if (D.bestGw) X.push(['spark', 'var(--c-mint)', tt('أحسن جولة', 'Best GW'), `${N(D.bestGw.p)}`, tt(`الجولة ${D.bestGw.g}`, `GW ${D.bestGw.g}`)]);
  if (D.worstGw && D.fin.length > 2) X.push(['bars', 'var(--c-coral)', tt('أضعف جولة', 'Worst GW'), `${N(D.worstGw.p)}`, tt(`الجولة ${D.worstGw.g}`, `GW ${D.worstGw.g}`)]);
  if (D.dv != null) X.push(['rank', 'var(--c-sky)', tt('قيمة الفريق', 'Team value'), `${N(`${D.dv >= 0 ? '+' : ''}${D.dv.toFixed(1)}`)}`, tt('مليون من البداية', 'm since start')]);
  X.push(['bench', 'var(--c-peach)', tt('نقاط ضاعت بالدكة', 'Bench pts lost'), `${N(D.benchPts)}`, tt('بكل الجولات', 'all GWs')]);
  if (D.hitsPts || D.fin.length) X.push(['swap', 'var(--c-lav)', tt('خصم الانتقالات', 'Transfer hits'), `${N(D.hitsPts ? `-${D.hitsPts}` : 0)}`, D.hitsPts ? tt('نقطة', 'pts') : tt('ولا خصم', 'none')]);
  X.push(['star', 'var(--c-gold)', tt('الرقاقات', 'Chips'), `${N(D.chips.length)}`, D.chips.length ? D.chips.map((c) => `${chipAr(c.n)} ${tt('ج', 'GW')}${N(c.g)}`).join('، ') : tt('ولا وحدة لهسة', 'none yet')]);
  return { k: 'xt', col: 'var(--c-peach)', ic: 'spark', h: tt('لمحات من موسمك', 'Season snapshots'), sub: '',
    body: `<div class="ss-xt">${X.slice(0, 6).map((x, i) => `<div style="--d:${i * 70}ms;--c:${x[1]}">${ic(x[0])}<small>${x[2]}</small><b>${x[3]}</b><em>${x[4]}</em></div>`).join('')}</div>` };
}

/* ---------- شرح كابتن (طلب واحد لملخص اللاعب، ينخزن) ---------- */
async function loadCapWhy() {
  const b = STORY?.cs?.best; if (!b) return; const k = `${b.id}_${b.gw}`; if (CAPX_K === k) return;
  CAPX_K = k;
  try {
    const d = await playerSummary(b.id), H = (d.history || []).filter((h) => h.round === b.gw);
    if (!H.length) { CAPX = ''; return; }
    const s = (f) => H.reduce((a, h) => a + (+h[f] || 0), 0), opp = H.map((h) => `${esc(tName(h.opponent_team))} ${h.was_home ? tt('(أرضه)', '(H)') : tt('(برا)', '(A)')}`).join(' + ');
    const pos = PM(b.id)?.pos ?? PM(b.id)?.element_type;
    const C = [];
    if (s('goals_scored')) C.push(['ball', ar(s('goals_scored'), 'هدف', 'هدفين', 'أهداف', 'هدف')]);
    if (s('assists')) C.push(['boot', ar(s('assists'), 'صناعة', 'صناعتين', 'صناعات', 'صناعة')]);
    if (s('clean_sheets') && pos !== 4) C.push(['shield', tt('شباك نظيفة', 'clean sheet')]);
    if (s('bonus')) C.push(['star', `${N(s('bonus'))} ${tt('بونص', 'bonus')}`]);
    if (s('saves') >= 3) C.push(['shield', `${N(s('saves'))} ${tt('تصديات', 'saves')}`]);
    if (!C.length) C.push(['spark', `${N(s('minutes'))} ${tt('دقيقة', 'min')}`]);
    CAPX = `<small>${tt('ضد', 'vs')} ${opp}${H.length > 1 ? ` — ${tt('جولة مزدوجة', 'double GW')}` : ''}</small><div>${C.map((c, i) => `<span style="--d:${i * 90}ms">${ic(c[0])}${c[1]}</span>`).join('')}</div>`;
  } catch { CAPX = ''; }
  const el = document.getElementById('ssCapWhy'); if (el) el.innerHTML = CAPX;
}

/* ---------- الواجهة ---------- */
function slides() { const D = STORY; if (!D) return []; return [sRank(D), sLeagues(D), sGws(D), sMoves(D), sCaptain(D), sExtras(D)].filter(Boolean); }
export function storyHTML() {
  if (!ST.E?.entry || !ST.G) return '';
  const k = `${ST.E.entry.id}_${ST.G.finished}_${ST.E.entry.summary_overall_points}`;
  if (STORY_K !== k) { STORY_K = k; STORY = build(null); }
  if (!STORY.cs?.best && Date.now() - CS_T > 4000) { CS_T = Date.now(); coachStory().then((cs) => { if (!cs?.has || STORY_K !== k) return; STORY = build(cs); const el = document.getElementById('ssBox'); if (el) { el.outerHTML = storyHTML(); bind(); } }); }
  const S = slides(); if (!S.length) return '';
  if (SI >= S.length) SI = 0;
  return `<section class="ss${HOLD || PHOLD ? ' hold' : ''}" id="ssBox" style="--sc:${S[SI].col}" aria-roledescription="carousel" aria-label="${tt('قصة موسمك', 'Your season story')}">
    <div class="ss-prog">${S.map((s, i) => `<span class="${i < SI ? 'done' : i === SI ? 'cur' : ''}"><i style="animation-duration:${DUR}ms"></i></span>`).join('')}</div>
    <div class="ss-hd"><span class="ss-tag">${tt('قصة موسمك', 'Your season')}</span><button class="ss-pp" onclick="event.stopPropagation();ssPause()" aria-label="${tt('إيقاف/تشغيل', 'Pause/play')}"><span></span><span></span></button></div>
    <div class="ss-stage">${S.map((s, i) => `<div class="ss-sl${i === SI ? ' on' : ''}" data-k="${s.k}" style="--c:${s.col}" ${i === SI ? '' : 'aria-hidden="true"'}>
      ${blob(s.col, .2, 1)}
      <div class="ss-t">${ic(s.ic, 'draw ss-tic')}<div><h3>${s.h}</h3>${s.sub ? `<p>${s.sub}</p>` : ''}</div></div>
      ${s.body}</div>`).join('')}</div>
    <div class="ss-dots">${S.map((s, i) => `<button class="${i === SI ? 'on' : ''}" style="--c:${s.col}" onclick="event.stopPropagation();ssGo(${i})" aria-label="${s.h}"></button>`).join('')}</div>
  </section>`;
}

function setSlide(i, user) {
  const S = slides(); if (!S.length) return; SI = (i + S.length) % S.length;
  if (user && S[SI].k !== 'gw') SEL = null;
  const box = document.getElementById('ssBox'); if (!box) return;
  if (PHOLD) { PHOLD = false; if (!HOLD) box.classList.remove('hold'); }
  box.style.setProperty('--sc', S[SI].col);
  box.querySelectorAll('.ss-sl').forEach((el, j) => { el.classList.toggle('on', j === SI); j === SI ? el.removeAttribute('aria-hidden') : el.setAttribute('aria-hidden', 'true'); });
  box.querySelectorAll('.ss-prog span').forEach((el, j) => { el.className = j < SI ? 'done' : ''; if (j === SI) { void el.offsetWidth; el.className = 'cur'; } });
  box.querySelectorAll('.ss-dots button').forEach((el, j) => el.classList.toggle('on', j === SI));
  countUp(box.querySelector('.ss-sl.on'));
  if (S[SI].k === 'cp') loadCapWhy();
}
function countUp(sl) {
  if (!sl || RM()) return;
  sl.querySelectorAll('.ss-cnt').forEach((el) => { const v = +el.dataset.v; if (!v) return; const t0 = performance.now(), d = 900; const f = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(v * e)); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); });
}
function bind() {
  const box = document.getElementById('ssBox'); if (!box || BOUND.has(box)) return; BOUND.add(box);
  box.addEventListener('animationend', (e) => { if (e.target.parentElement?.classList.contains('cur') && e.target.closest('.ss-prog')) setSlide(SI + 1); });
  let x0 = null, y0 = 0, t0 = 0, moved = false, lp = null;
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); moved = false; lp = setTimeout(() => box.classList.add('hold'), 220); });
  box.addEventListener('pointermove', (e) => { if (x0 != null && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) moved = true; });
  const up = (e) => {
    if (x0 == null) return; clearTimeout(lp); if (!HOLD && !PHOLD) box.classList.remove('hold');
    const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0; x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { setSlide(SI + (dx > 0 ? 1 : -1), true); return; } // RTL: السحب لليمين = التالي
    if (!moved && dt < 220) { const r = box.getBoundingClientRect(); setSlide(SI + (e.clientX - r.left < r.width / 2 ? 1 : -1), true); }
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', () => { x0 = null; clearTimeout(lp); if (!HOLD) box.classList.remove('hold'); });
  countUp(box.querySelector('.ss-sl.on'));
  if (slides()[SI]?.k === 'cp') loadCapWhy();
  // نوقف التقدم التلقائي إذا المربع طلع من الشاشة
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(([en]) => box.classList.toggle('off', !en.isIntersecting), { threshold: .35 }); io.observe(box); }
}
export function afterStory() { bind(); }
if (typeof window !== 'undefined') {
  window.ssGo = (i) => setSlide(i, true);
  window.ssPause = () => { HOLD = !HOLD; document.getElementById('ssBox')?.classList.toggle('hold', HOLD); };
  window.ssPick = (g) => {
    SEL = g; PHOLD = true; const box = document.getElementById('ssBox'); box?.classList.add('hold');
    const D = STORY, s = sGws(D); if (!box || !s) return;
    const sl = box.querySelector('.ss-sl[data-k=gw]'); if (!sl) return;
    sl.querySelectorAll('.ss-gw button').forEach((b) => b.classList.toggle('on', b.getAttribute('aria-label')?.startsWith(`GW${g}:`)));
    const tmp = document.createElement('div'); tmp.innerHTML = s.body; const nd = tmp.querySelector('#ssGd'); const od = sl.querySelector('#ssGd'); if (nd && od) od.replaceWith(nd);
  };
}
