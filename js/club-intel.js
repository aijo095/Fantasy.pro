/* ============================================================
 * الشجرة الذكية للنوادي
 * تجمع كل مباريات النادي المنتهية (الفانتازي + تحليل ESPN لكل هدف وتسديدة)
 * وتطلع منها ملاحظات مكتوبة: من وين يسجّل ومن وين يستقبل، بأي دقائق، شلون
 * يتصرف إذا تقدّم أو تأخّر، أسلوبه، انضباطه، لاعبينه، وجدوله الجاي.
 * كل ملاحظة تنقاس على باقي أندية الدوري، فتطلع بس الأشياء اللي تميّزه فعلاً.
 * الشجرة تتجدد وحدها: كل جولة تنضاف مباريات جديدة، والملاحظات اللي تغيّرت
 * تنعلَّم «جديد»، واللي شفتها قبل تنزل لتحت حتى تطلع غيرها.
 * ============================================================ */
import { ST, tShort, tName } from './store.js';
import { tt } from './i18n.js';

/* ---------- جلب المباريات (كل مباراة منتهية تنحفظ بالجهاز للأبد) ---------- */
const KEY = 'fp_mx2_', MX = {}, MISS = {}, BUSY = new Set();
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const done = (f) => f.fin && f.hs != null;
const finished = () => ST.G.fxList.filter(done);

async function fetchOne(f) {
  if (MX[f.id] !== undefined || BUSY.has(f.id)) return;
  const c = lsGet(KEY + f.id); if (c) { MX[f.id] = c; return; }
  if (MISS[f.id] && Date.now() - MISS[f.id] < 30 * 60e3) return;
  BUSY.add(f.id);
  try {
    const T = ST.G.teams, r = await fetch(`/api/lineups?mx=1&ko=${encodeURIComponent(f.ko)}&h=${T[f.h].short}&a=${T[f.a].short}`);
    if (r.ok) { const m = await r.json(); if (m?.st === 'post') { MX[f.id] = m; lsSet(KEY + f.id, m); } else MISS[f.id] = Date.now(); }
    else MISS[f.id] = Date.now();
  } catch { MISS[f.id] = Date.now(); }
  BUSY.delete(f.id);
}
let job = null;
export const progress = { done: 0, total: 0, running: false };
/** يجيب مباريات النادي أولاً، وبعدين باقي الدوري بالخلفية (للمقارنة) */
export function load(tid, onUpdate) {
  const all = finished();
  all.forEach((f) => { if (MX[f.id] === undefined) { const c = lsGet(KEY + f.id); if (c) MX[f.id] = c; } });
  const mine = all.filter((f) => f.h === tid || f.a === tid), rest = all.filter((f) => f.h !== tid && f.a !== tid);
  const queue = [...mine, ...rest].filter((f) => MX[f.id] === undefined && !(MISS[f.id] && Date.now() - MISS[f.id] < 30 * 60e3));
  progress.total = all.length; progress.done = all.filter((f) => MX[f.id]).length;
  if (!queue.length || job) return;
  progress.running = true;
  let i = 0, last = 0;
  const tick = () => { progress.done = all.filter((f) => MX[f.id]).length; const now = Date.now(); if (now - last > 700 || i >= queue.length) { last = now; onUpdate?.(); } };
  const worker = async () => { while (i < queue.length) { const f = queue[i++]; await fetchOne(f); tick(); } };
  job = Promise.all(Array.from({ length: 5 }, worker)).finally(() => { job = null; progress.running = false; onUpdate?.(); });
}

/* ---------- التجميع لكل نادي ---------- */
const BK = (m) => (m <= 15 ? 0 : m <= 30 ? 1 : m <= 45 ? 2 : m <= 60 ? 3 : m <= 75 ? 4 : 5);
const z0 = () => ({ l: 0, c: 0, r: 0, s: 0, b: 0, o: 0, p: 0, n: 0, cell: {} });
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function aggregate(tid) {
  const A = { tid, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, cs: 0, fts: 0, btts: 0, o25: 0, res: [],
    H: { p: 0, pts: 0, gf: 0, ga: 0 }, W: { p: 0, pts: 0, gf: 0, ga: 0 },
    ne: 0, nc: 0, tbF: [0, 0, 0, 0, 0, 0], tbA: [0, 0, 0, 0, 0, 0], zF: z0(), zA: z0(), szF: z0(), szA: z0(),
    howF: {}, howA: {}, astF: {}, astA: {}, shF: 0, shA: 0, sotF: 0, sotA: 0, S: {}, SA: {},
    first: 0, firstPts: 0, behind: 0, behindPts: 0, leadLost: 0, htLead: 0, htLeadW: 0, lateF: 0, lateA: 0, stopF: 0, stopA: 0, lateWin: 0, lateLoss: 0,
    h1F: 0, h1A: 0, h2F: 0, h2A: 0, att: [], ven: '', cards: [0, 0, 0, 0, 0, 0] };
  const fx = finished().filter((f) => f.h === tid || f.a === tid).sort((a, b) => String(a.ko).localeCompare(String(b.ko)));
  fx.forEach((f) => {
    const home = f.h === tid, gf = home ? f.hs : f.as, ga = home ? f.as : f.hs, r = gf > ga ? 'W' : gf < ga ? 'L' : 'D', pts = r === 'W' ? 3 : r === 'D' ? 1 : 0;
    A.p++; A.gf += gf; A.ga += ga; A.pts += pts; A[r.toLowerCase()]++; A.res.push({ r, gf, ga, f, home });
    if (!ga) A.cs++; if (!gf) A.fts++; if (gf && ga) A.btts++; if (gf + ga > 2) A.o25++;
    const V = home ? A.H : A.W; V.p++; V.pts += pts; V.gf += gf; V.ga += ga;
    const m = MX[f.id]; if (!m) return;
    A.ne++;
    const me = home ? 'h' : 'a', op = home ? 'a' : 'h';
    if (home && m.att) A.att.push(m.att); if (home && m.ven) A.ven = m.ven;
    // الأهداف بالتسلسل: التوقيت، الجهة، الطريقة، والحالة (متقدم/متأخر)
    let s1 = 0, s2 = 0, ledEver = false, firstSide = null, ht = null;
    const G = [...(m.G || [])].sort((x, y) => x[1] - y[1] || x[2] - y[2]);
    G.forEach((g) => {
      const [sd, mn, ad, how, dz, sz, ast] = g, mine = sd === me, b = BK(mn);
      if (ht == null && mn > 45) ht = [s1, s2];
      if (mine) { s1++; A.tbF[b]++; mn <= 45 ? A.h1F++ : A.h2F++; if (mn >= 76) A.lateF++; if (mn >= 90 || (mn > 45 && ad)) A.stopF++; }
      else { s2++; A.tbA[b]++; mn <= 45 ? A.h1A++ : A.h2A++; if (mn >= 76) A.lateA++; if (mn >= 90 || (mn > 45 && ad)) A.stopA++; }
      if (!firstSide) firstSide = mine ? 'me' : 'op';
      if (s1 > s2) ledEver = true;
      const H = mine ? A.howF : A.howA; H[how] = (H[how] || 0) + 1;
      if (how !== 'og') {
        const Z = mine ? A.zF : A.zA; Z.n++; if (sz) Z[sz]++; if (dz) Z[dz]++; const k = (dz || '?') + (sz || '?'); Z.cell[k] = (Z.cell[k] || 0) + 1;
        const S = mine ? A.astF : A.astA; S[ast || '-'] = (S[ast || '-'] || 0) + 1;
      }
      // هدف متأخر غيّر النتيجة
      if (mn >= 85) { const before = mine ? s1 - 1 - s2 : s1 - (s2 - 1); if (mine && before === 0 && gf > ga && s1 === gf && s2 === ga) A.lateWin++; if (!mine && before === 0 && gf < ga && s1 === gf && s2 === ga) A.lateLoss++; }
    });
    if (ht == null) ht = [s1, s2];
    if (firstSide === 'me') { A.first++; A.firstPts += pts; } else if (firstSide === 'op') { A.behind++; A.behindPts += pts; }
    if (ledEver && r !== 'W') A.leadLost++;
    if (ht[0] > ht[1]) { A.htLead++; if (r === 'W') A.htLeadW++; }
    // التسديدات (موجودة بس إذا التعليق النصي الكامل متوفر)
    if (m.src === 'c') A.nc++;
    (m.src === 'c' ? m.X || [] : []).forEach((x) => {
      const [sd, , , dz, sz, out] = x, mine = sd === me;
      if (mine) { A.shF++; if (out === 'g' || out === 's') A.sotF++; } else { A.shA++; if (out === 'g' || out === 's') A.sotA++; }
      if (x[2] === 'og') return;
      const Z = mine ? A.szF : A.szA; Z.n++; if (sz) Z[sz]++; if (dz) Z[dz]++;
    });
    (m.C || []).forEach((c) => { if (c[0] === me) A.cards[BK(c[1])]++; });
    // إحصائيات المباراة
    Object.entries(m.S?.[me] || {}).forEach(([k, v]) => (A.S[k] = A.S[k] || []).push(v));
    Object.entries(m.S?.[op] || {}).forEach(([k, v]) => (A.SA[k] = A.SA[k] || []).push(v));
  });
  A.s = Object.fromEntries(Object.entries(A.S).map(([k, v]) => [k, avg(v)]));
  A.sa = Object.fromEntries(Object.entries(A.SA).map(([k, v]) => [k, avg(v)]));
  return A;
}

/* ---------- لاعبين النادي من الفانتازي ---------- */
function squad(tid) {
  const ps = ST.G.players.filter((p) => p.team === tid);
  return { ps, xg: ps.reduce((a, p) => a + (p.xg || 0), 0), xa: ps.reduce((a, p) => a + (p.xa || 0), 0), gls: ps.reduce((a, p) => a + (p.gls || 0), 0), yc: ps.reduce((a, p) => a + (p.yc || 0), 0), rc: ps.reduce((a, p) => a + (p.rc || 0), 0) };
}

/* ---------- أدوات الصياغة ---------- */
const ORD = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const n1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString());
const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);
const goalsW = (n) => plural(n, 'هدف واحد', 'هدفين', 'أهداف', 'هدف');
const gamesW = (n) => plural(n, 'مباراة وحدة', 'مباراتين', 'مباريات', 'مباراة');
const gamesB = (n) => (n <= 2 ? 'ب' : 'بـ ') + gamesW(n);
const ptsW = (n) => (n === 0 ? 'ولا نقطة' : plural(n, 'نقطة وحدة', 'نقطتين', 'نقاط', 'نقطة'));
/** ترتيب النادي بين الأندية لقيمة معيّنة. desc = الأكبر أولاً */
function rankIn(all, tid, fn, desc = true, minN = 12) {
  const xs = all.map((a) => ({ id: a.tid, v: fn(a) })).filter((x) => x.v != null && isFinite(x.v));
  if (xs.length < minN) return null;
  xs.sort((a, b) => (desc ? b.v - a.v : a.v - b.v));
  const i = xs.findIndex((x) => x.id === tid); if (i < 0) return null;
  const vs = xs.map((x) => x.v), m = avg(vs);
  return { r: i + 1, n: xs.length, v: xs[i].v, avg: m, min: Math.min(...vs), max: Math.max(...vs) };
}
const ORD2 = ['', '', 'ثاني', 'ثالث', 'رابع', 'خامس'];
// صياغة الترتيب: «أقوى هجوم بالدوري»، «ثالث أضعف دفاع بالدوري». الوسط ما ينكتب (الشريط يبيّنه)
const rankTxt = (R, more, less, tail = '') => { if (!R) return ''; const b = R.n + 1 - R.r; const t = R.r === 1 ? more : R.r <= 5 ? `${ORD2[R.r]} ${more}` : b === 1 ? less : b <= 5 ? `${ORD2[b]} ${less}` : ''; return t ? `${t}${tail} بالدوري` : ''; };
const extreme = (R) => (!R ? 0 : 1 - (Math.min(R.r, R.n + 1 - R.r) - 1) / (R.n / 2));
const SIDE = { l: tt('اليسرى', 'left'), c: tt('الوسط', 'centre'), r: tt('اليمنى', 'right') };
const DEF_SIDE = { l: tt('اليمنى', 'right'), r: tt('اليسرى', 'left') }; // يسار المهاجم = يمين المدافع
const BKL = ['1 و15', '16 و30', '31 و45', '46 و60', '61 و75', '76 و90'];
const BKN = [tt('أول ربع ساعة', 'first 15 min'), tt('منتصف الشوط الأول', 'mid first half'), tt('آخر الشوط الأول', 'end of first half'), tt('بداية الشوط الثاني', 'start of second half'), tt('منتصف الشوط الثاني', 'mid second half'), tt('آخر ربع ساعة', 'last 15 min')];
const FDR = (tid, gw) => { const f = (ST.G.fx[gw] || []).filter((x) => x.h === tid || x.a === tid); return f.map((x) => (x.h === tid ? x.hd : x.ad)); };

/* ---------- الملاحظات ---------- */
/** يرجع { A, sq, all, branches:[{id, items:[...]}] } */
export { goalsW, gamesW, ptsW };
export function analyse(tid) {
  const all = Object.keys(ST.G.teams).map((id) => aggregate(+id)), A = all.find((a) => a.tid === tid), sq = squad(tid);
  const per = (a, k) => (a.p ? a[k] / a.p : null), perE = (a, k) => (a.ne >= 3 ? a[k] / a.ne : null), cover = A.p ? A.ne / A.p : 0;
  const espnAll = all.filter((a) => a.p && a.ne / a.p >= 0.7);
  const L = (fn, desc = true) => rankIn(espnAll, tid, fn, desc, 12);
  const LF = (fn, desc = true) => rankIn(all.filter((a) => a.p), tid, fn, desc, 12);
  const out = { att: [], def: [], zone: [], time: [], set: [], style: [], mind: [], disc: [], fpl: [], next: [] };
  // big/unit = الرقم الأساسي للبطاقة، والنص يشرحه
  const tidy = (t) => String(t || '').replace(/،\s*(?=[.\n]|$)/g, '').replace(/\.\s*\./g, '.').replace(/^\s*\.\s*/, '').trim();
  const add = (br, id, title, text, w, tone = 'n', extra = {}) => out[br].push({ id, title, text: tidy(text), w: Math.max(0, Math.min(1.5, w)), tone, ...extra });
  const kpi = [];
  if (!A.p) return { A, sq, all, cover, kpi, branches: out };
  const perC = (a, k) => (a.nc >= 3 ? a[k] / a.nc : null);
  const toneR = (R, goodTop = true) => (!R ? 'n' : (goodTop ? R.r <= 4 : R.r >= R.n - 3) ? 'g' : (goodTop ? R.r >= R.n - 3 : R.r <= 4) ? 'b' : 'n');

  /* الأرقام الرئيسية */
  { const R1 = LF((a) => per(a, 'pts')), R2 = LF((a) => per(a, 'gf')), R3 = LF((a) => per(a, 'ga'), false), R4 = LF((a) => per(a, 'cs'));
    kpi.push({ k: tt('نقاط بالمباراة', 'Points / game'), v: n1(per(A, 'pts')), R: R1 }, { k: tt('سجّل بالمباراة', 'Scored / game'), v: n1(per(A, 'gf')), R: R2 }, { k: tt('استقبل بالمباراة', 'Conceded / game'), v: n1(per(A, 'ga')), R: R3 }, { k: tt('شباك نظيفة', 'Clean sheets'), v: String(A.cs), R: R4 });
    if (A.nc >= 3) kpi.push({ k: tt('تسديدات بالمباراة', 'Shots / game'), v: n1(perC(A, 'shF')), R: L((a) => perC(a, 'shF')) });
    if (A.ne >= 3 && A.s.poss != null) kpi.push({ k: tt('استحواذ', 'Possession'), v: Math.round(A.s.poss) + '%', R: L((a) => a.s.poss) }); }

  /* الهجوم */
  { const R = LF((a) => per(a, 'gf')); add('att', 'gf', R && R.r <= 4 ? tt('من أقوى الهجمات', 'Among the best attacks') : R && R.r >= R.n - 3 ? tt('هجومه من الأضعف', 'Among the weakest attacks') : tt('معدل التسجيل', 'Scoring rate'), `سجّل ${goalsW(A.gf)} ${gamesB(A.p)}${R ? `، ${rankTxt(R, 'أقوى هجوم', 'أضعف هجوم')}` : ''}.`, 0.5 + extreme(R) * 0.6, toneR(R), { big: n1(per(A, 'gf')), unit: tt('هدف بالمباراة', 'per game'), R }); }
  if (sq.xg > 3) { const d = sq.gls - sq.xg; if (Math.abs(d) >= 2) add('att', 'xg', d > 0 ? tt('يشطّب أحسن من المتوقع', 'Finishing above expectation') : tt('يضيّع فرص أكثر من المتوقع', 'Finishing below expectation'), d > 0 ? `لاعبينه سجّلوا ${sq.gls} هدف من فرص قيمتها ${n1(sq.xg)} هدف متوقع. هالتشطيب العالي عادةً ما يستمر طول الموسم.` : `لاعبينه سجّلوا ${sq.gls} هدف بس من فرص قيمتها ${n1(sq.xg)} هدف متوقع. الفرص موجودة، فالأهداف ممكن تجي.`, 0.55 + Math.min(0.6, Math.abs(d) / 8), d > 0 ? 'g' : 'b', { big: (d > 0 ? '+' : '−') + n1(Math.abs(d)), unit: tt('عن المتوقع', 'vs xG') }); }
  { const top = [...sq.ps].sort((a, b) => b.gls - a.gls)[0]; if (top && A.gf >= 6 && top.gls / A.gf >= 0.33) add('att', 'dep', tt(`يعتمد على ${top.name}`, `Relies on ${top.name}`), `سجّل ${top.gls} من أهداف الفريق الـ${A.gf}. إذا غاب، الهجوم يتأثر كلش.`, 0.5 + (top.gls / A.gf - 0.33) * 2, 'n', { pid: top.id, big: pc(top.gls, A.gf) + '%', unit: tt('من الأهداف', 'of goals') }); else if (A.gf >= 8) { const sc = sq.ps.filter((p) => p.gls > 0).length; if (sc >= 8) add('att', 'spread', tt('أهدافه موزّعة على لاعبين كثار', 'Goals spread across the squad'), 'الخطر يجي من أكثر من مكان، فإيقافه أصعب.', 0.55, 'g', { big: String(sc), unit: tt('لاعب سجّل', 'scorers') }); } }
  if (A.nc >= 3) {
    const sh = perC(A, 'shF'), R = L((a) => perC(a, 'shF'));
    add('att', 'shots', tt('التسديد', 'Shooting'), `${pc(A.sotF, A.shF)}% من تسديداته على المرمى${R ? `، ${rankTxt(R, 'أكثر فريق يسدد', 'أقل فريق يسدد')}` : ''}.`, 0.35 + extreme(R) * 0.6, toneR(R), { big: n1(sh), unit: tt('تسديدة بالمباراة', 'shots per game'), R });
    const RC = L((a) => (a.nc >= 3 && a.shF ? a.zF.n / a.shF : null));
    if (A.shF && RC && extreme(RC) > 0.7) add('att', 'conv', RC.r <= 3 ? tt('يستغل فرصه', 'Clinical') : tt('يحتاج فرص كثيرة حتى يسجّل', 'Wasteful'), `${rankTxt(RC, 'أعلى نسبة تحويل', 'أقل نسبة تحويل')}.`, 0.5 + extreme(RC) * 0.5, RC.r <= 3 ? 'g' : 'b', { big: pc(A.zF.n, A.shF) + '%', unit: tt('من تسديداته أهداف', 'conversion'), R: RC });
  }
  if (A.ne >= 3) {
    const H = A.howF, n = A.gf - (H.og || 0);
    if (n >= 5) {
      if ((H.h || 0) / n >= 0.28) add('att', 'head', tt('خطير بالكرات العالية', 'Dangerous in the air'), `${H.h} من أهدافه براسية. العرضيات والكرات الثابتة سلاحه.`, 0.55 + (H.h / n - 0.28) * 2, 'g', { big: pc(H.h, n) + '%', unit: tt('براسية', 'headers') });
      if ((H.l || 0) / n >= 0.45) add('att', 'left', tt('أغلب أهدافه بالقدم اليسرى', 'Mostly left-footed goals'), `${H.l} من ${n} أهداف، وهذا نادر بالدوري.`, 0.45, 'n', { big: pc(H.l, n) + '%', unit: tt('باليسرى', 'left foot') });
      if ((H.p || 0) >= 3) add('att', 'pens', tt('يكسب ركلات جزاء', 'Wins penalties'), `${H.p} من أهدافه من ركلات جزاء.`, 0.4 + H.p / 15, 'n', { big: pc(H.p, n) + '%', unit: tt('من الجزاء', 'from pens') });
    }
    const Z = A.zF; if (Z.n >= 5) {
      if (Z.o / Z.n >= 0.25) add('att', 'long', tt('يسجّل من بعيد', 'Scores from distance'), `${Z.o} من أهدافه من برا الصندوق.`, 0.55 + (Z.o / Z.n - 0.25) * 2, 'g', { big: pc(Z.o, Z.n) + '%', unit: tt('من برا الصندوق', 'outside box') });
      if (Z.s / Z.n >= 0.35) add('att', 'poach', tt('أهدافه قريبة من المرمى', 'Close-range finisher'), `${Z.s} من ${Z.n} أهداف من داخل منطقة الست ياردات، فيعتمد على العرضيات والمتابعات.`, 0.5, 'n', { big: pc(Z.s, Z.n) + '%', unit: tt('من الست ياردات', 'six-yard box') });
    }
  }

  /* الدفاع */
  { const R = LF((a) => per(a, 'ga'), false); add('def', 'ga', R && R.r <= 4 ? tt('من أقوى الدفاعات', 'Among the best defences') : R && R.r >= R.n - 3 ? tt('دفاعه من الأضعف', 'Among the weakest defences') : tt('معدل الاستقبال', 'Goals conceded'), `استقبل ${goalsW(A.ga)} ${gamesB(A.p)}${R ? `، ${rankTxt(R, 'أقوى دفاع', 'أضعف دفاع')}` : ''}.`, 0.5 + extreme(R) * 0.6, toneR(R), { big: n1(per(A, 'ga')), unit: tt('هدف بالمباراة', 'per game'), R }); }
  { const R = LF((a) => per(a, 'cs')); if (A.cs) add('def', 'cs', tt('الشباك النظيفة', 'Clean sheets'), `حافظ على نظافة شباكه ${gamesB(A.cs)} من ${A.p}${R ? `، ${rankTxt(R, 'أكثر فريق', 'أقل فريق')}` : ''}.`, 0.4 + extreme(R) * 0.5, toneR(R), { big: pc(A.cs, A.p) + '%', unit: tt('من مبارياته', 'of games'), R }); else if (A.p >= 4) add('def', 'nocs', tt('ولا مرة شباكه نظيفة', 'No clean sheets yet'), `${gamesB(A.p)} ما حافظ على نظافة شباكه، فمدافعينه وحارسه ما يجيبون نقاط الشباك.`, 0.9, 'b', { big: '0', unit: tt('شباك نظيفة', 'clean sheets') }); }
  if (A.nc >= 3) {
    const R = L((a) => (a.nc >= 3 ? a.shA / a.nc : null), false);
    add('def', 'shA', tt('التسديدات اللي يسمح بيها', 'Shots allowed'), `${pc(A.sotA, A.shA)}% منها على مرماه${R ? `، ${rankTxt(R, 'أقل فريق يسمح بتسديدات', 'أكثر فريق يسمح بتسديدات')}` : ''}.`, 0.35 + extreme(R) * 0.6, toneR(R), { big: n1(A.shA / A.nc), unit: tt('تسديدة بالمباراة', 'per game'), R });
  }
  if (A.ne >= 3) {
    const H = A.howA, n = A.ga - (H.og || 0);
    if (n >= 4 && (H.h || 0) / n >= 0.28) add('def', 'headA', tt('يعاني بالكرات العالية', 'Weak in the air'), `${H.h} من الأهداف اللي دخلت عليه براسيات.`, 0.6 + (H.h / n - 0.28) * 2, 'b', { big: pc(H.h, n) + '%', unit: tt('براسية', 'headers') });
    if (A.zA.n >= 4 && A.zA.o / A.zA.n >= 0.25) add('def', 'longA', tt('تدخل عليه أهداف من بعيد', 'Concedes from distance'), `${A.zA.o} أهداف من برا الصندوق، يعني خط الوسط ما يضغط على المسدد.`, 0.6, 'b', { big: pc(A.zA.o, A.zA.n) + '%', unit: tt('من برا الصندوق', 'outside box') });
    if ((A.astA.x || 0) >= 3) add('def', 'counter', tt('مكشوف بالمرتدات', 'Exposed on the counter'), `${A.astA.x} أهداف دخلت عليه من هجمات مرتدة سريعة.`, 0.55 + A.astA.x / 12, 'b', { big: String(A.astA.x), unit: tt('من مرتدات', 'from counters') });
    if ((A.astA.c || 0) >= 3 && A.zA.n && A.astA.c / A.zA.n >= 0.3) add('def', 'crossA', tt('العرضيات تتعبه', 'Struggles with crosses'), `${A.astA.c} من الأهداف اللي دخلت عليه جت بعد كرة عرضية.`, 0.55, 'b', { big: pc(A.astA.c, A.zA.n) + '%', unit: tt('من عرضيات', 'from crosses') });
  }

  /* المناطق */
  if (A.ne >= 3) {
    const sideNote = (Z, SZ, mine) => {
      const n = Z.l + Z.c + Z.r; if (n < 4) return;
      const top = ['l', 'c', 'r'].sort((a, b) => Z[b] - Z[a])[0], share = Z[top] / n;
      if (top === 'c' || share < 0.4) return;
      const other = top === 'l' ? 'r' : 'l'; if (Z[top] / Math.max(1, Z[other]) < 1.5) return;
      const shN = SZ.l + SZ.c + SZ.r, shS = shN ? SZ[top] / shN : 0;
      const shTxt = shN >= 15 && shS >= 0.4 ? ` ونفس الشي بالتسديدات: ${pc(SZ[top], shN)}% منها من هالجهة.` : shN >= 15 && shS < 0.3 ? ` التسديدات من هالجهة قليلة (${pc(SZ[top], shN)}%)، بس كلها خطيرة.` : '';
      if (mine) add('zone', 'zF', tt(`أخطر جهة عنده: ${SIDE[top]}`, `Most dangerous side: ${SIDE[top]}`), `${Z[top]} من ${n} أهداف سجّلها من الجهة ${SIDE[top]} للصندوق، مقابل ${Z[other]} من الجهة ${SIDE[other]}.${shTxt}`, 0.6 + (share - 0.4) * 2, 'g', { big: pc(Z[top], n) + '%', unit: tt(`من ${SIDE[top]}`, SIDE[top]) });
      else add('zone', 'zA', tt(`نقطة ضعفه: جهة دفاعه ${DEF_SIDE[top]}`, `Weak spot: his ${DEF_SIDE[top]} flank`), `${Z[top]} من ${n} أهداف دخلت عليه من الجهة ${SIDE[top]} للمهاجم، يعني من جهة دفاعه ${DEF_SIDE[top]}.${shTxt}`, 0.75 + (share - 0.4) * 2, 'b', { big: pc(Z[top], n) + '%', unit: tt('من هالجهة', 'this side') });
    };
    sideNote(A.zF, A.szF, true); sideNote(A.zA, A.szA, false);
    if (A.nc >= 3 && A.szA.n) { const RB = L((a) => (a.nc >= 3 && a.szA.n ? (a.szA.s + a.szA.b + a.szA.p) / a.szA.n : null), false);
      if (RB && extreme(RB) > 0.6) add('zone', 'boxA', RB.r <= 4 ? tt('يبعد الخصوم عن صندوقه', 'Keeps opponents out of the box') : tt('يسمح بتسديدات من قريب', 'Allows close-range shots'), `${rankTxt(RB, 'أقل نسبة', 'أعلى نسبة', ' تسديدات من داخل الصندوق')}.`, 0.45 + extreme(RB) * 0.4, RB.r <= 4 ? 'g' : 'b', { big: pc(A.szA.s + A.szA.b + A.szA.p, A.szA.n) + '%', unit: tt('من داخل صندوقه', 'inside his box'), R: RB }); }
  }

  /* التوقيت */
  if (A.ne >= 3 && A.gf + A.ga >= 6) {
    const net = A.tbF.map((v, i) => v - A.tbA[i]), best = net.indexOf(Math.max(...net)), worst = net.indexOf(Math.min(...net));
    if (A.tbF[best] >= 3 && net[best] >= 2) add('time', 'best', tt(`أقوى فترة: ${BKN[best]}`, `Best spell: ${BKN[best]}`), `سجّل ${A.tbF[best]} واستقبل ${A.tbA[best]} بين الدقيقة ${BKL[best]}.`, 0.5 + net[best] / 8, 'g', { big: '+' + net[best], unit: tt('فارق الأهداف', 'goal diff') });
    if (A.tbA[worst] >= 3 && net[worst] <= -2) add('time', 'worst', tt(`أضعف فترة: ${BKN[worst]}`, `Weakest spell: ${BKN[worst]}`), `استقبل ${A.tbA[worst]} وسجّل ${A.tbF[worst]} بين الدقيقة ${BKL[worst]}، وهنا يفقد تركيزه.`, 0.6 + -net[worst] / 8, 'b', { big: '−' + -net[worst], unit: tt('فارق الأهداف', 'goal diff') });
    const RL = L((a) => perE(a, 'lateA'), false);
    if (A.lateA >= 4 && RL && RL.r >= RL.n - 4) add('time', 'lateA', tt('تدخل عليه أهداف متأخرة', 'Concedes late'), `${A.lateA} أهداف بآخر ربع ساعة${A.stopA ? `، منها ${A.stopA} بالوقت بدل الضائع` : ''}، ${rankTxt(RL, 'أقل فريق', 'أكثر فريق', ' يستقبل متأخر')}.`, 0.7, 'b', { big: String(A.lateA), unit: tt('بعد الدقيقة 75', 'after 75′'), R: RL });
    const RF = L((a) => perE(a, 'lateF'));
    if (A.lateF >= 4 && RF && RF.r <= 4) add('time', 'lateF', tt('يحسم بآخر الدقائق', 'Late finisher'), `${A.lateF} أهداف سجّلها بآخر ربع ساعة${A.stopF ? `، منها ${A.stopF} بالوقت بدل الضائع` : ''}، فلا تطلع منه قبل الصافرة.`, 0.65, 'g', { big: String(A.lateF), unit: tt('بعد الدقيقة 75', 'after 75′'), R: RF });
    if (A.h2F + A.h1F >= 6) { const r2 = A.h2F / (A.h1F + A.h2F);
      if (r2 >= 0.68) add('time', 'h2', tt('أقوى بالشوط الثاني', 'Stronger after the break'), `سجّل ${A.h2F} من أهدافه الـ${A.h1F + A.h2F} بالشوط الثاني.`, 0.5, 'n', { big: pc(A.h2F, A.h1F + A.h2F) + '%', unit: tt('بالشوط الثاني', '2nd half') });
      if (r2 <= 0.32) add('time', 'h1', tt('يبدأ مبارياته بقوة', 'Fast starter'), `سجّل ${A.h1F} من أهدافه الـ${A.h1F + A.h2F} بالشوط الأول.`, 0.5, 'n', { big: pc(A.h1F, A.h1F + A.h2F) + '%', unit: tt('بالشوط الأول', '1st half') }); }
  }

  /* الكرات الثابتة */
  if (A.ne >= 3) {
    const spF = (A.astF.k || 0) + (A.astF.f || 0), spA = (A.astA.k || 0) + (A.astA.f || 0), pF = A.howF.p || 0, pA = A.howA.p || 0;
    const RF = L((a) => (a.ne >= 3 ? ((a.astF.k || 0) + (a.astF.f || 0)) / a.ne : null)), RA = L((a) => (a.ne >= 3 ? ((a.astA.k || 0) + (a.astA.f || 0)) / a.ne : null), false);
    if (spF + pF) add('set', 'spF', tt('أهدافه من الكرات الثابتة', 'Set-piece goals scored'), `${A.astF.k || 0} بعد ركنية، ${A.astF.f || 0} من ضربة حرة، و${pF} من ركلة جزاء${RF ? `. ${rankTxt(RF, 'أخطر فريق', 'أقل فريق')} بالكرات الثابتة` : ''}.`, 0.4 + extreme(RF) * 0.5, toneR(RF), { big: String(spF + pF), unit: tt('هدف', 'goals'), R: RF });
    if (spA + pA) add('set', 'spA', tt('أهداف دخلت عليه من الكرات الثابتة', 'Set-piece goals conceded'), `${A.astA.k || 0} بعد ركنية، ${A.astA.f || 0} من ضربة حرة، و${pA} من ركلة جزاء${RA ? `. ${rankTxt(RA, 'أقل فريق يستقبل', 'أكثر فريق يستقبل', ' منها')}` : ''}.`, 0.4 + extreme(RA) * 0.5, toneR(RA), { big: String(spA + pA), unit: tt('هدف', 'goals'), R: RA });
    if (A.s.cor != null) { const RK = L((a) => a.s.cor); add('set', 'cor', tt('الركنيات', 'Corners'), `ويسمح للخصم بـ ${n1(A.sa.cor)} ركنية بالمباراة${RK ? `. ${rankTxt(RK, 'أكثر فريق', 'أقل فريق', ' يكسب ركنيات')}` : ''}.`, 0.3 + extreme(RK) * 0.4, 'n', { big: n1(A.s.cor), unit: tt('ركنية بالمباراة', 'per game'), R: RK }); }
  }
  { const tk = (k) => sq.ps.filter((p) => p[k] === 1).map((p) => p.name); const pen = tk('pen'), cor = tk('cor'), dfk = tk('dfk');
    if (pen.length || cor.length || dfk.length) add('set', 'takers', tt('منو ينفّذ الكرات الثابتة', 'Set-piece takers'), [pen.length && `الجزاء: ${pen.join('، ')}`, cor.length && `الركنيات: ${cor.join('، ')}`, dfk.length && `الضربات الحرة: ${dfk.join('، ')}`].filter(Boolean).join('\n') + '\nهذولة يكسبون نقاط إضافية بالفانتازي.', 0.45, 'n'); }

  /* الأسلوب */
  if (A.ne >= 3) {
    if (A.s.poss != null) { const v = A.s.poss, R = L((a) => a.s.poss); add('style', 'poss', v >= 55 ? tt('يحب يمسك الكرة', 'Possession side') : v <= 45 ? tt('يترك الكرة للخصم', 'Happy without the ball') : tt('استحواذ متوازن', 'Balanced possession'), `${v >= 55 ? 'يبني من الخلف ويطوّل النَفَس' : v <= 45 ? 'يلعب على المساحات والهجمات السريعة' : 'يمسك الكرة ويتركها حسب الخصم'}${R ? `. ${rankTxt(R, 'أعلى استحواذ', 'أقل استحواذ')}` : ''}.`, 0.4 + extreme(R) * 0.5, 'n', { big: Math.round(v) + '%', unit: tt('استحواذ', 'possession'), R }); }
    if (A.s.pas && A.s.pasA) { const acc = (A.s.pasA / A.s.pas) * 100, R = L((a) => (a.s.pas && a.s.pasA ? a.s.pasA / a.s.pas : null)); add('style', 'pass', tt('دقة التمرير', 'Passing accuracy'), `${Math.round(A.s.pas)} تمريرة بالمباراة${R ? `، ${rankTxt(R, 'أدق فريق', 'أقل فريق دقة')}` : ''}.`, 0.3 + extreme(R) * 0.5, 'n', { big: Math.round(acc) + '%', unit: tt('دقة', 'accuracy'), R }); }
    if (A.s.crs != null) { const R = L((a) => a.s.crs); add('style', 'crs', tt('العرضيات', 'Crossing'), `${A.s.crsA ? `${Math.round((A.s.crsA / A.s.crs) * 100)}% منها توصل لزميل` : 'يعتمد على الأطراف'}${R ? `. ${rankTxt(R, 'أكثر فريق يرفع عرضيات', 'أقل فريق يرفع عرضيات')}` : ''}.`, 0.3 + extreme(R) * 0.5, 'n', { big: n1(A.s.crs), unit: tt('عرضية بالمباراة', 'per game'), R }); }
    if (A.s.lb != null) { const R = L((a) => a.s.lb); add('style', 'lb', tt('الكرات الطويلة', 'Long balls'), `مقياس للعب المباشر${R ? `. ${rankTxt(R, 'أكثر فريق يلعب طويل', 'أقل فريق يلعب طويل')}` : ''}.`, 0.3 + extreme(R) * 0.5, 'n', { big: n1(A.s.lb), unit: tt('كرة طويلة بالمباراة', 'per game'), R }); }
    if (A.s.tkl != null) { const v = (A.s.tkl || 0) + (A.s.int || 0), R = L((a) => (a.s.tkl != null ? (a.s.tkl || 0) + (a.s.int || 0) : null)); add('style', 'press', tt('افتكاك الكرة', 'Winning the ball'), `${n1(A.s.tkl)} تدخّل و${n1(A.s.int)} قطع بالمباراة${R ? `، ${rankTxt(R, 'أكثر فريق يفتك الكرة', 'أقل فريق يفتك الكرة')}` : ''}. هذا يرفع نقاط المساهمات الدفاعية لمدافعينه.`, 0.3 + extreme(R) * 0.5, 'n', { big: n1(v), unit: tt('بالمباراة', 'per game'), R }); }
    if (A.s.clr != null) { const R = L((a) => a.s.clr); add('style', 'clr', tt('التشتيت', 'Clearances'), `${A.s.clr >= 25 ? 'يدافع بعمق ويتعرّض لضغط كثير' : 'قليل ما ينحصر بمنطقته'}${R ? `. ${rankTxt(R, 'أكثر فريق يشتت', 'أقل فريق يشتت')}` : ''}.`, 0.3 + extreme(R) * 0.5, 'n', { big: n1(A.s.clr), unit: tt('بالمباراة', 'per game'), R }); }
  }

  /* النتائج والشخصية */
  { const hp = A.H.p ? A.H.pts / A.H.p : 0, wp = A.W.p ? A.W.pts / A.W.p : 0;
    if (A.H.p >= 3 && A.W.p >= 3 && Math.abs(hp - wp) >= 0.8) add('mind', 'venue', hp > wp ? tt('قوي بملعبه وضعيف برا', 'Strong at home, weak away') : tt('نتائجه برا أحسن', 'Better away from home'), `بملعبه ${n1(hp)} نقطة بالمباراة وأهدافه ${A.H.gf} مقابل ${A.H.ga}، وبرا ${n1(wp)} نقطة وأهدافه ${A.W.gf} مقابل ${A.W.ga}.${A.ven && A.att.length ? ` معدل الحضور بـ ${A.ven}: ${Math.round(avg(A.att)).toLocaleString('en')} متفرّج.` : ''}`, 0.55 + Math.min(0.5, Math.abs(hp - wp) / 3), 'n', { big: n1(Math.abs(hp - wp)), unit: tt('فرق النقاط', 'ppg gap') });
    const rs = A.res.map((x) => x.r); let k = rs.length - 1, n = 0; const unb = rs[k] !== 'L'; while (k >= 0 && (unb ? rs[k] !== 'L' : rs[k] !== 'W')) { n++; k--; }
    let wins = 0; for (let j = rs.length - 1; j >= 0 && rs[j] === 'W'; j--) wins++;
    if (wins >= 3) add('mind', 'streak', tt('سلسلة انتصارات', 'Winning run'), 'بأحسن حالاته هسه.', 0.6 + wins / 12, 'g', { big: String(wins), unit: tt('فوز متتالي', 'wins in a row') });
    else if (n >= 4) add('mind', 'streak', unb ? tt('سلسلة بدون خسارة', 'Unbeaten run') : tt('سلسلة بدون فوز', 'Winless run'), unb ? 'ثابت وصعب ينغلب.' : 'يمر بفترة صعبة.', 0.55 + n / 15, unb ? 'g' : 'b', { big: String(n), unit: tt('مباريات', 'games') });
    const l5 = A.res.slice(-5); if (l5.length === 5 && A.p >= 8) { const g5 = l5.reduce((a, x) => a + x.gf, 0) / 5, c5 = l5.reduce((a, x) => a + x.ga, 0) / 5, gS = A.gf / A.p, cS = A.ga / A.p;
      if (g5 - gS >= 0.6) add('mind', 'formUp', tt('هجومه بتصاعد', 'Attack on the rise'), `بآخر 5 مباريات يسجّل ${n1(g5)} هدف بالمباراة، ومعدل موسمه ${n1(gS)}.`, 0.6, 'g', { big: n1(g5), unit: tt('آخر 5', 'last 5') });
      if (c5 - cS >= 0.6) add('mind', 'formDn', tt('دفاعه تراجع مؤخراً', 'Defence slipping lately'), `بآخر 5 مباريات يستقبل ${n1(c5)} هدف بالمباراة، ومعدل موسمه ${n1(cS)}.`, 0.6, 'b', { big: n1(c5), unit: tt('آخر 5', 'last 5') });
      if (cS - c5 >= 0.6) add('mind', 'defUp', tt('دفاعه تحسّن مؤخراً', 'Defence improving'), `بآخر 5 مباريات يستقبل ${n1(c5)} هدف بس بالمباراة، ومعدل موسمه ${n1(cS)}.`, 0.6, 'g', { big: n1(c5), unit: tt('آخر 5', 'last 5') }); }
  }
  if (A.ne >= 4) {
    if (A.first >= 3) { const r = A.firstPts / (A.first * 3); add('mind', 'first', r >= 0.75 ? tt('إذا سجّل أول ما يفرّط', 'Rarely drops points after scoring first') : tt('حتى لما يسجّل أول ما يضمنها', 'Drops points even after scoring first'), `سجّل الهدف الأول ${gamesB(A.first)} وجمع منها ${ptsW(A.firstPts)} من أصل ${A.first * 3}.`, 0.4 + (r < 0.6 ? 0.4 : 0), r >= 0.75 ? 'g' : r < 0.6 ? 'b' : 'n', { big: n1(A.firstPts / A.first), unit: tt('نقطة بالمباراة', 'ppg') }); }
    if (A.behind >= 3) { const R = L((a) => (a.behind >= 2 ? a.behindPts / a.behind : null)), ok = A.behindPts / A.behind >= 1; add('mind', 'behind', ok ? tt('يرجع لما يتأخر', 'Fights back') : tt('إذا تأخر صعب يرجع', 'Rarely recovers when behind'), `استقبل الهدف الأول ${gamesB(A.behind)} وجمع منها ${ptsW(A.behindPts)}${R ? `، ${rankTxt(R, 'أكثر فريق يرجع', 'أقل فريق يرجع')}` : ''}.`, 0.45 + extreme(R) * 0.5, ok ? 'g' : 'b', { big: n1(A.behindPts / A.behind), unit: tt('نقطة بالمباراة', 'ppg'), R }); }
    if (A.leadLost >= 3) add('mind', 'leadLost', tt('يضيّع تقدّمه', 'Throws away leads'), `تقدّم ${gamesB(A.leadLost)} وما فاز بيها.${A.lateLoss ? ` و${gamesB(A.lateLoss)} خسر بهدف بعد الدقيقة 85.` : ''}`, 0.6 + A.leadLost / 15, 'b', { big: String(A.leadLost), unit: tt('مباريات', 'games') });
    if (A.htLead >= 3) { const r = A.htLeadW / A.htLead; add('mind', 'ht', r >= 0.8 ? tt('إذا خلّص الشوط الأول متقدّم، يفوز', 'Wins when leading at half-time') : tt('يتقدّم بالشوط الأول ويفرّط بالثاني', 'Lets half-time leads slip'), `خلّص الشوط الأول متقدّم ${gamesB(A.htLead)}، وكمّلها فوز ب${A.htLeadW} منها.`, r < 0.7 ? 0.6 : 0.35, r >= 0.8 ? 'g' : r < 0.7 ? 'b' : 'n', { big: pc(A.htLeadW, A.htLead) + '%', unit: tt('حوّلها لفوز', 'converted') }); }
    if (A.lateWin >= 2) add('mind', 'lateWin', tt('يخطف الفوز بآخر الدقائق', 'Snatches late wins'), `حسم ${gamesW(A.lateWin)} بهدف بعد الدقيقة 85.`, 0.55, 'g', { big: String(A.lateWin), unit: tt('فوز متأخر', 'late wins') });
  }
  { const b = pc(A.btts, A.p), o = pc(A.o25, A.p); if (A.p >= 6 && (b >= 65 || b <= 30)) add('mind', 'btts', b >= 65 ? tt('مبارياته مفتوحة', 'Open games') : tt('مبارياته مقفولة', 'Tight games'), `الفريقين سجّلوا بـ ${b}% من مبارياته، وانسجل بيها أكثر من هدفين بـ ${o}%.`, 0.45, 'n', { big: b + '%', unit: tt('الفريقين سجّلوا', 'both scored') }); }

  /* الانضباط */
  { const yc = A.ne >= 3 && A.s.yc != null ? A.s.yc : sq.yc / A.p, R = A.ne >= 3 ? L((a) => a.s.yc) : null;
    add('disc', 'yc', tt('الإنذارات', 'Bookings'), `لاعبينه أخذوا ${sq.yc} إنذار و${sq.rc} طرد بالموسم${R ? `، ${rankTxt(R, 'أكثر فريق ينذر', 'أقل فريق ينذر')}` : ''}.`, 0.3 + extreme(R) * 0.5, R && R.r <= 3 ? 'b' : 'n', { big: n1(yc), unit: tt('إنذار بالمباراة', 'per game'), R });
    const bk = sq.ps.filter((p) => p.yc >= 4).sort((a, b) => b.yc - a.yc); if (bk.length) add('disc', 'ban', tt('قريبين من الإيقاف', 'Close to a ban'), bk.map((p) => `${p.name}: ${p.yc} إنذارات`).join('\n') + '\nخمس إنذارات قبل الجولة 19 تعني إيقاف مباراة.', 0.5 + bk.length * 0.1, 'b', { big: String(bk.length), unit: tt('لاعب', 'players') });
    if (A.ne >= 3 && A.s.fou != null) { const R2 = L((a) => a.s.fou); add('disc', 'fou', tt('الأخطاء', 'Fouls'), `${R2 ? `${rankTxt(R2, 'أكثر فريق يرتكب أخطاء', 'أقل فريق يرتكب أخطاء')}.` : ''}${A.s.off != null ? ` ومعدل التسلل ${n1(A.s.off)} بالمباراة.` : ''}`.trim(), 0.25 + extreme(R2) * 0.4, 'n', { big: n1(A.s.fou), unit: tt('خطأ بالمباراة', 'per game'), R: R2 }); }
    const late = A.cards[4] + A.cards[5], tot = A.cards.reduce((a, b) => a + b, 0); if (tot >= 8 && late / tot >= 0.55) add('disc', 'lateCards', tt('إنذاراته تجي بآخر المباراة', 'Late bookings'), 'أغلب إنذاراته بعد الدقيقة 60، لما يتعب أو يدافع عن النتيجة.', 0.4, 'n', { big: pc(late, tot) + '%', unit: tt('بعد الدقيقة 60', 'after 60′') });
  }

  /* اللاعبين والفانتازي */
  { const ps = sq.ps.filter((p) => p.min > 0);
    const best = [...ps].sort((a, b) => b.total - a.total).slice(0, 3); if (best.length) add('fpl', 'best', tt('الأكثر نقاط', 'Top points'), best.map((p) => `${p.name}: ${p.total} نقطة`).join('\n'), 0.6, 'n', { pids: best.map((p) => p.id) });
    const val = ps.filter((p) => p.min >= 270).sort((a, b) => b.ppg / b.price - a.ppg / a.price)[0]; if (val) add('fpl', 'value', tt(`أفضل قيمة: ${val.name}`, `Best value: ${val.name}`), `${n1(val.ppg)} نقطة بالمباراة، وسعره ${val.price.toFixed(1)} مليون.`, 0.55, 'g', { pid: val.id, big: n1(val.ppg), unit: tt('نقطة بالمباراة', 'ppg') });
    const diff = ps.filter((p) => p.own < 8 && p.min >= 270 && p.ppg >= 4.5).sort((a, b) => b.ppg - a.ppg)[0]; if (diff) add('fpl', 'diff', tt(`لاعب مخفي: ${diff.name}`, `Differential: ${diff.name}`), `${n1(diff.ppg)} نقطة بالمباراة، ومملوك بس من ${diff.own}% من المدربين.`, 0.6, 'g', { pid: diff.id, big: diff.own + '%', unit: tt('ملكية', 'owned') });
    const gk = ps.filter((p) => p.pos === 'GK').sort((a, b) => b.min - a.min)[0]; if (gk && gk.min >= 270) add('fpl', 'gk', tt(`الحارس: ${gk.name}`, `Keeper: ${gk.name}`), `${gk.saves} تصدّي و${gk.cs} شباك نظيفة${gk.ps ? `، وصد ${gk.ps} ركلة جزاء` : ''}.`, 0.4, 'n', { pid: gk.id, big: n1((gk.saves / gk.min) * 90), unit: tt('تصدّي بالمباراة', 'saves/90') });
    const dc = ps.filter((p) => (p.pos === 'DEF' || p.pos === 'MID') && p.min >= 270).sort((a, b) => b.dc90 - a.dc90)[0]; if (dc && dc.dc90 >= 8) add('fpl', 'dc', tt(`أقوى مساهمات دفاعية: ${dc.name}`, `Top defensive contributions: ${dc.name}`), 'قريب من نقاط المساهمات الدفاعية كل مباراة.', 0.5, 'n', { pid: dc.id, big: n1(dc.dc90), unit: tt('مساهمة بالمباراة', 'per 90') });
    const nail = ps.filter((p) => A.p >= 4 && p.min / (A.p * 90) >= 0.92).map((p) => p.name); if (nail.length) add('fpl', 'nailed', tt('مضمونين باللعب', 'Nailed starters'), nail.join('، ') + '.', 0.35, 'n', { big: String(nail.length), unit: tt('لاعب', 'players') });
    const inj = sq.ps.filter((p) => p.st && p.st !== 'a' && p.news).slice(0, 6); if (inj.length) add('fpl', 'inj', tt('الغيابات والشكوك', 'Absences & doubts'), inj.map((p) => `${p.name}${p.chance != null ? `: جاهزيته ${p.chance}%` : ''}`).join('\n'), 0.55 + inj.length * 0.05, 'b', { big: String(inj.length), unit: tt('لاعب', 'players') });
  }

  /* الجاي */
  { const cur = ST.G.next || ST.G.cur, gws = Array.from({ length: 5 }, (_, i) => cur + i).filter((g) => g <= 38);
    const sumFor = (id) => { const ds = gws.flatMap((g) => FDR(id, g)); return ds.length ? avg(ds) : null; };
    const me = sumFor(tid), R = rankIn(Object.keys(ST.G.teams).map((id) => ({ tid: +id })), tid, (a) => sumFor(a.tid), false, 12);
    if (me != null) add('next', 'fdr', R && R.r <= 4 ? tt('جدوله الجاي سهل', 'Easy run ahead') : R && R.r >= R.n - 3 ? tt('جدوله الجاي صعب', 'Tough run ahead') : tt('صعوبة جدوله الجاي', 'Fixture difficulty'), `للجولات ${gws[0]}–${gws[gws.length - 1]}${R ? `، ${rankTxt(R, 'أسهل جدول', 'أصعب جدول')}` : ''}. المقياس من 1 (سهل) إلى 5 (صعب).`, 0.45 + extreme(R) * 0.6, toneR(R), { viz: 'next', gws, big: n1(me), unit: tt('من 5', 'of 5'), R });
    const dbl = gws.filter((g) => FDR(tid, g).length > 1), bl = gws.filter((g) => !FDR(tid, g).length);
    if (dbl.length) add('next', 'dgw', tt('عنده جولة مزدوجة', 'Double gameweek'), `يلعب مباراتين بالجولة ${dbl.join('، ')}، فلاعبينه قيمتهم تتضاعف.`, 0.9, 'g', { big: String(dbl[0]), unit: tt('الجولة', 'GW') });
    if (bl.length) add('next', 'bgw', tt('عنده جولة فارغة', 'Blank gameweek'), `ما يلعب بالجولة ${bl.join('، ')}، فخطّط لبدلاء لاعبينه قبلها.`, 0.85, 'b', { big: String(bl[0]), unit: tt('الجولة', 'GW') });
  }
  return { A, sq, all, cover, kpi, branches: out };
}

/* ---------- الذاكرة: شنو تغيّر وشنو شفته ---------- */
export function memory(tid, R) {
  const k = 'fp_ci_' + tid, prev = lsGet(k) || {}, gw = ST.G.cur, A = R.A;
  const sig = { gf: A.p ? A.gf / A.p : 0, ga: A.p ? A.ga / A.p : 0, ppg: A.p ? A.pts / A.p : 0, p: A.p, ids: Object.values(R.branches).flat().map((x) => x.id) };
  const changes = [];
  const base = prev.hist?.find((h) => h.p < A.p) || null; // آخر مرة قبل مباريات جديدة
  if (base && A.p > base.p) {
    const dg = sig.gf - base.gf, dc = sig.ga - base.ga, dp = sig.ppg - base.ppg;
    if (Math.abs(dp) >= 0.08) changes.push({ id: 'chg_ppg', title: dp > 0 ? tt('نقاطه بالمباراة ارتفعت', 'Points per game up') : tt('نقاطه بالمباراة نزلت', 'Points per game down'), text: `من ${n1(base.ppg)} إلى ${n1(sig.ppg)} بعد آخر ${gamesW(A.p - base.p)}.`, tone: dp > 0 ? 'g' : 'b', w: 0.7 });
    if (Math.abs(dc) >= 0.08) changes.push({ id: 'chg_ga', title: dc < 0 ? tt('دفاعه صار أقوى', 'Defence tightened') : tt('صار يستقبل أكثر', 'Conceding more'), text: `معدل الاستقبال من ${n1(base.ga)} إلى ${n1(sig.ga)} بالمباراة.`, tone: dc < 0 ? 'g' : 'b', w: 0.65 });
    if (Math.abs(dg) >= 0.08) changes.push({ id: 'chg_gf', title: dg > 0 ? tt('صار يسجّل أكثر', 'Scoring more') : tt('هجومه هدأ', 'Scoring less'), text: `معدل التسجيل من ${n1(base.gf)} إلى ${n1(sig.gf)} بالمباراة.`, tone: dg > 0 ? 'g' : 'b', w: 0.65 });
    const fresh = sig.ids.filter((id) => !(base.ids || []).includes(id));
    fresh.forEach((id) => changes.push({ id: 'new_' + id, ref: id }));
  }
  const seen = prev.seen || {};
  const hist = [{ gw, ...sig }, ...(prev.hist || []).filter((h) => h.p !== A.p)].slice(0, 6);
  return { changes, seen, save: (shown) => { shown.forEach((id) => (seen[id] = (seen[id] || 0) + 1)); lsSet(k, { hist, seen, at: Date.now() }); }, freshIds: new Set(changes.filter((c) => c.ref).map((c) => c.ref)) };
}
