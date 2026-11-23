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
/** ترتيب النادي بين الأندية لقيمة معيّنة. desc = الأكبر أولاً */
function rankIn(all, tid, fn, desc = true, minN = 12) {
  const xs = all.map((a) => ({ id: a.tid, v: fn(a) })).filter((x) => x.v != null && isFinite(x.v));
  if (xs.length < minN) return null;
  xs.sort((a, b) => (desc ? b.v - a.v : a.v - b.v));
  const i = xs.findIndex((x) => x.id === tid); if (i < 0) return null;
  const vs = xs.map((x) => x.v), m = avg(vs);
  return { r: i + 1, n: xs.length, v: xs[i].v, avg: m, min: Math.min(...vs), max: Math.max(...vs) };
}
const rankTxt = (R, more, less) => (!R ? '' : R.r === 1 ? `${more} بالدوري` : R.r === R.n ? `${less} بالدوري` : R.r <= 10 ? `${ORD[R.r]} ${more} بالدوري` : `${ORD[R.n + 1 - R.r] || R.n + 1 - R.r} ${less} بالدوري`);
const extreme = (R) => (!R ? 0 : 1 - (Math.min(R.r, R.n + 1 - R.r) - 1) / (R.n / 2));
const SIDE = { l: tt('اليسرى', 'left'), c: tt('الوسط', 'centre'), r: tt('اليمنى', 'right') };
const DEF_SIDE = { l: tt('اليمنى', 'right'), r: tt('اليسرى', 'left') }; // يسار المهاجم = يمين المدافع
const BKL = ['1–15', '16–30', '31–45', '46–60', '61–75', '76–90'];
const BKN = [tt('أول ربع ساعة', 'first 15 min'), tt('الدقائق 16–30', 'minutes 16–30'), tt('آخر الشوط الأول', 'end of first half'), tt('بداية الشوط الثاني', 'start of second half'), tt('الدقائق 61–75', 'minutes 61–75'), tt('آخر ربع ساعة', 'last 15 min')];
const FDR = (tid, gw) => { const f = (ST.G.fx[gw] || []).filter((x) => x.h === tid || x.a === tid); return f.map((x) => (x.h === tid ? x.hd : x.ad)); };

/* ---------- الملاحظات ---------- */
/** يرجع { A, sq, all, branches:[{id, items:[...]}] } */
export { goalsW, gamesW };
export function analyse(tid) {
  const all = Object.keys(ST.G.teams).map((id) => aggregate(+id)), A = all.find((a) => a.tid === tid), sq = squad(tid);
  const per = (a, k) => (a.p ? a[k] / a.p : null), perE = (a, k) => (a.ne >= 3 ? a[k] / a.ne : null), cover = A.p ? A.ne / A.p : 0;
  const espnAll = all.filter((a) => a.p && a.ne / a.p >= 0.7);
  const L = (fn, desc = true) => rankIn(espnAll, tid, fn, desc, 12);
  const LF = (fn, desc = true) => rankIn(all.filter((a) => a.p), tid, fn, desc, 12);
  const out = { att: [], def: [], zone: [], time: [], set: [], style: [], mind: [], disc: [], fpl: [], next: [] };
  const add = (br, id, title, text, w, tone = 'n', extra = {}) => out[br].push({ id, title, text, w: Math.max(0, Math.min(1.5, w)), tone, ...extra });
  if (!A.p) return { A, sq, all, cover, branches: out };

  /* الهجوم */
  { const R = LF((a) => per(a, 'gf')); add('att', 'gf', tt(`يسجّل ${n1(per(A, 'gf'))} بالمباراة`, `${n1(per(A, 'gf'))} goals per game`), `${goalsW(A.gf)} ب${gamesW(A.p)}${R ? ` — ${rankTxt(R, 'أقوى هجوم', 'أضعف هجوم')}` : ''}.`, 0.5 + extreme(R) * 0.6, R && R.r <= 4 ? 'g' : R && R.r >= R.n - 3 ? 'b' : 'n', { big: n1(per(A, 'gf')), unit: tt('هدف/مباراة', 'goals/game'), R }); }
  if (sq.xg > 3) { const d = sq.gls - sq.xg; if (Math.abs(d) >= 2) add('att', 'xg', d > 0 ? tt('يشطّب أحسن من المتوقع', 'Finishing above xG') : tt('يضيّع فرص أكثر من المتوقع', 'Finishing below xG'), d > 0 ? `لاعبينه سجّلوا ${sq.gls} من فرص قيمتها ${n1(sq.xg)} هدف متوقع، يعني أكثر بـ ${n1(d)}. هالتشطيب العالي عادةً ما يستمر طول الموسم.` : `لاعبينه سجّلوا ${sq.gls} بس من فرص قيمتها ${n1(sq.xg)} هدف متوقع، يعني أقل بـ ${n1(-d)}. الفرص موجودة، فالأهداف ممكن تجي.`, 0.55 + Math.min(0.6, Math.abs(d) / 8), d > 0 ? 'g' : 'b'); }
  { const top = [...sq.ps].sort((a, b) => b.gls - a.gls)[0]; if (top && A.gf >= 6 && top.gls / A.gf >= 0.33) add('att', 'dep', tt('يعتمد على لاعب واحد', 'Relies on one scorer'), `${top.name} سجّل ${top.gls} من ${A.gf} (${pc(top.gls, A.gf)}%). إذا غاب، الهجوم يتأثر كلش.`, 0.5 + (top.gls / A.gf - 0.33) * 2, 'n', { pid: top.id }); else if (A.gf >= 8) { const sc = sq.ps.filter((p) => p.gls > 0).length; if (sc >= 8) add('att', 'spread', tt('أهدافه موزّعة', 'Goals spread out'), `${sc} لاعبين مختلفين سجّلوا، فإيقافه أصعب لأن الخطر يجي من أكثر من مكان.`, 0.55, 'g'); } }
  if (A.ne >= 3) {
    const perC = (a, k) => (a.nc >= 3 ? a[k] / a.nc : null), sh = perC(A, 'shF'), R = L((a) => perC(a, 'shF'));
    if (sh != null) add('att', 'shots', tt(`${n1(sh)} تسديدة بالمباراة`, `${n1(sh)} shots per game`), `${pc(A.sotF, A.shF)}% منها على المرمى${A.shF ? `، وكل ${n1(A.shF / Math.max(1, A.zF.n + (A.howF.og || 0)))} تسديدات تطلع هدف` : ''}.${R ? ` ${rankTxt(R, 'أكثر فريق يسدد', 'أقل فريق يسدد')}.` : ''}`, 0.35 + extreme(R) * 0.6, 'n', { R });
    const conv = A.nc >= 3 && A.shF ? A.zF.n / A.shF : null, RC = L((a) => (a.nc >= 3 && a.shF ? a.zF.n / a.shF : null));
    if (conv != null && RC && extreme(RC) > 0.7) add('att', 'conv', RC.r <= 3 ? tt('تحويل الفرص عالي', 'Clinical') : tt('يحتاج فرص كثيرة حتى يسجّل', 'Wasteful'), `يسجّل من ${pc(A.zF.n, A.shF)}% من تسديداته — ${rankTxt(RC, 'أعلى نسبة', 'أقل نسبة')}.`, 0.5 + extreme(RC) * 0.5, RC.r <= 3 ? 'g' : 'b');
    const H = A.howF, n = A.gf - (H.og || 0);
    if (n >= 5) {
      if ((H.h || 0) / n >= 0.28) add('att', 'head', tt('خطير بالراسيات', 'Dangerous in the air'), `${H.h} من أهدافه (${pc(H.h, n)}%) براسية. الكرات العرضية والثابتة سلاحه.`, 0.55 + (H.h / n - 0.28) * 2, 'g');
      if ((H.l || 0) / n >= 0.45) add('att', 'left', tt('يسجّل بالقدم اليسرى أكثر', 'Mostly left-footed goals'), `${H.l} من ${n} أهداف بالقدم اليسرى — نادر بالدوري.`, 0.45, 'n');
      if ((H.p || 0) >= 3) add('att', 'pens', tt(`${H.p} أهداف من ركلات جزاء`, `${H.p} penalty goals`), `${pc(H.p, n)}% من أهدافه من الجزاء.`, 0.4 + H.p / 15, 'n');
    }
    const Z = A.zF; if (Z.n >= 5) {
      if (Z.o / Z.n >= 0.25) add('att', 'long', tt('يسجّل من بعيد', 'Scores from distance'), `${Z.o} أهداف من برا الصندوق (${pc(Z.o, Z.n)}%).`, 0.55 + (Z.o / Z.n - 0.25) * 2, 'g');
      if (Z.s / Z.n >= 0.35) add('att', 'poach', tt('أهدافه قريبة من المرمى', 'Close-range goals'), `${Z.s} من ${Z.n} من داخل منطقة الست ياردات. يعتمد على التمريرات العرضية والمتابعات.`, 0.5, 'n');
    }
  }

  /* الدفاع */
  { const R = LF((a) => per(a, 'ga'), false); add('def', 'ga', tt(`يستقبل ${n1(per(A, 'ga'))} بالمباراة`, `${n1(per(A, 'ga'))} conceded per game`), `${goalsW(A.ga)} ب${gamesW(A.p)}${R ? ` — ${rankTxt(R, 'أقوى دفاع', 'أضعف دفاع')}` : ''}.`, 0.5 + extreme(R) * 0.6, R && R.r <= 4 ? 'g' : R && R.r >= R.n - 3 ? 'b' : 'n', { big: n1(per(A, 'ga')), unit: tt('هدف/مباراة', 'goals/game'), R }); }
  { const R = LF((a) => per(a, 'cs')); if (A.cs) add('def', 'cs', tt(`${A.cs} شباك نظيفة`, `${A.cs} clean sheets`), `بـ ${pc(A.cs, A.p)}% من مبارياته ما استقبل${R ? ` — ${rankTxt(R, 'أكثر فريق', 'أقل فريق')} بالشباك النظيفة` : ''}.`, 0.4 + extreme(R) * 0.5, R && R.r <= 4 ? 'g' : 'n', { R }); else if (A.p >= 4) add('def', 'nocs', tt('ولا شباك نظيفة', 'No clean sheets'), `ب${gamesW(A.p)} ما حافظ على نظافة شباكه ولا مرة. مدافعينه وحارسه ما يجيبون نقاط الشباك.`, 0.9, 'b'); }
  if (A.ne >= 3) {
    const sh = A.nc >= 3 ? A.shA / A.nc : null, R = L((a) => (a.nc >= 3 ? a.shA / a.nc : null), false);
    if (sh != null) add('def', 'shA', tt(`يسمح بـ ${n1(sh)} تسديدة بالمباراة`, `Allows ${n1(sh)} shots per game`), `${pc(A.sotA, A.shA)}% منها على مرماه.${R ? ` ${rankTxt(R, 'أقل فريق يسمح بتسديدات', 'أكثر فريق يسمح بتسديدات')}.` : ''}`, 0.35 + extreme(R) * 0.6, R && R.r <= 4 ? 'g' : R && R.r >= R.n - 3 ? 'b' : 'n', { R });
    const H = A.howA, n = A.ga - (H.og || 0);
    if (n >= 4 && (H.h || 0) / n >= 0.28) add('def', 'headA', tt('يعاني بالكرات العالية', 'Weak in the air'), `${H.h} من الأهداف اللي استقبلها (${pc(H.h, n)}%) براسيات.`, 0.6 + (H.h / n - 0.28) * 2, 'b');
    if (A.zA.n >= 4 && A.zA.o / A.zA.n >= 0.25) add('def', 'longA', tt('ينضرب من بعيد', 'Concedes from distance'), `${A.zA.o} أهداف دخلت عليه من برا الصندوق (${pc(A.zA.o, A.zA.n)}%). خط الوسط ما يضغط على المسدد.`, 0.6, 'b');
    if ((A.astA.x || 0) >= 3) add('def', 'counter', tt('مكشوف بالمرتدات', 'Exposed on the break'), `${A.astA.x} أهداف استقبلها من هجمات مرتدة سريعة.`, 0.55 + A.astA.x / 12, 'b');
    if ((A.astA.c || 0) >= 3 && A.zA.n && A.astA.c / A.zA.n >= 0.3) add('def', 'crossA', tt('العرضيات تتعبه', 'Struggles with crosses'), `${A.astA.c} من الأهداف اللي استقبلها جت من كرة عرضية (${pc(A.astA.c, A.zA.n)}%).`, 0.55, 'b');
  }

  /* المناطق: من وين يسجّل ومن وين يستقبل */
  if (A.ne >= 3) {
    const sideNote = (Z, SZ, mine) => {
      const n = Z.l + Z.c + Z.r; if (n < 4) return;
      const top = ['l', 'c', 'r'].sort((a, b) => Z[b] - Z[a])[0], share = Z[top] / n;
      if (top === 'c' || share < 0.4) return;
      const other = top === 'l' ? 'r' : 'l', ratio = Z[top] / Math.max(1, Z[other]);
      if (ratio < 1.5) return;
      const shN = SZ.l + SZ.c + SZ.r, shS = shN ? SZ[top] / shN : 0, shTxt = shN >= 15 && shS >= 0.4 ? ` ونفس الشي بالتسديدات: ${pc(SZ[top], shN)}% منها من هالجهة.` : shN >= 15 && SZ[top] / shN < 0.3 ? ` بس التسديدات من هالجهة قليلة (${pc(SZ[top], shN)}%)، يعني الفرص منها قليلة بس خطيرة.` : '';
      if (mine) add('zone', 'zF', tt(`يسجّل أكثر من الجهة ${SIDE[top]}`, `Scores mostly from the ${SIDE[top]}`), `${Z[top]} من ${n} أهداف (${pc(Z[top], n)}%) من الجهة ${SIDE[top]} للصندوق، مقابل ${Z[other]} من الجهة ${SIDE[other]}.${shTxt}`, 0.6 + (share - 0.4) * 2, 'g', { viz: 'zF' });
      else add('zone', 'zA', tt(`يستقبل أكثر من الجهة ${SIDE[top]}`, `Concedes mostly from the ${SIDE[top]}`), `${Z[top]} من ${n} أهداف (${pc(Z[top], n)}%) دخلت عليه من الجهة ${SIDE[top]} للمهاجم، يعني من جهة دفاعه ${DEF_SIDE[top]}. هاي نقطة ضعفه الأوضح.${shTxt}`, 0.75 + (share - 0.4) * 2, 'b', { viz: 'zA' });
    };
    sideNote(A.zF, A.szF, true); sideNote(A.zA, A.szA, false);
    const inBoxA = A.nc >= 3 && A.szA.n ? (A.szA.s + A.szA.b + A.szA.p) / A.szA.n : null, RB = L((a) => (a.szA.n ? (a.szA.s + a.szA.b + a.szA.p) / a.szA.n : null), false);
    if (inBoxA != null && RB && extreme(RB) > 0.6) add('zone', 'boxA', RB.r <= 4 ? tt('يمنع التسديد من داخل الصندوق', 'Keeps shots outside the box') : tt('يسمح بتسديدات من قريب', 'Allows close-range shots'), `${pc(A.szA.s + A.szA.b + A.szA.p, A.szA.n)}% من تسديدات الخصوم عليه من داخل الصندوق — ${rankTxt(RB, 'أقل نسبة', 'أعلى نسبة')}.`, 0.45 + extreme(RB) * 0.4, RB.r <= 4 ? 'g' : 'b');
    add('zone', 'map', tt('خريطة الأهداف', 'Goal map'), '', 0.3, 'n', { viz: 'map', always: true });
  }

  /* التوقيت */
  if (A.ne >= 3 && A.gf + A.ga >= 6) {
    const net = A.tbF.map((v, i) => v - A.tbA[i]), best = net.indexOf(Math.max(...net)), worst = net.indexOf(Math.min(...net));
    add('time', 'chart', tt('الأهداف حسب الدقائق', 'Goals by minute'), '', 0.3, 'n', { viz: 'time', always: true });
    if (A.tbF[best] >= 3 && net[best] >= 2) add('time', 'best', tt(`أقوى فترة: ${BKN[best]}`, `Best spell: ${BKN[best]}`), `سجّل ${A.tbF[best]} واستقبل ${A.tbA[best]} بالدقائق ${BKL[best]}.`, 0.5 + net[best] / 8, 'g');
    if (A.tbA[worst] >= 3 && net[worst] <= -2) add('time', 'worst', tt(`أضعف فترة: ${BKN[worst]}`, `Weakest spell: ${BKN[worst]}`), `استقبل ${A.tbA[worst]} وسجّل ${A.tbF[worst]} بالدقائق ${BKL[worst]}. هنا يكسر تركيزه.`, 0.6 + -net[worst] / 8, 'b');
    const RL = L((a) => perE(a, 'lateA'), false);
    if (A.lateA >= 4 && RL && RL.r >= RL.n - 4) add('time', 'lateA', tt('يستقبل متأخر', 'Concedes late'), `${A.lateA} أهداف دخلت عليه بآخر ربع ساعة${A.stopA ? `، منها ${A.stopA} بالوقت الضائع` : ''} — ${rankTxt(RL, 'أقل فريق', 'أكثر فريق')} بالأهداف المتأخرة.`, 0.7, 'b');
    const RF = L((a) => perE(a, 'lateF'));
    if (A.lateF >= 4 && RF && RF.r <= 4) add('time', 'lateF', tt('يحسم بآخر الدقائق', 'Late scorer'), `${A.lateF} أهداف سجّلها بآخر ربع ساعة${A.stopF ? `، منها ${A.stopF} بالوقت الضائع` : ''}. لا تطلع منه قبل الصافرة.`, 0.65, 'g');
    if (A.h2F + A.h1F >= 6) { const r2 = A.h2F / (A.h1F + A.h2F); if (r2 >= 0.68) add('time', 'h2', tt('يصحى بالشوط الثاني', 'Second-half team'), `${pc(A.h2F, A.h1F + A.h2F)}% من أهدافه بالشوط الثاني.`, 0.5, 'n'); if (r2 <= 0.32) add('time', 'h1', tt('يبدأ قوي', 'Fast starter'), `${pc(A.h1F, A.h1F + A.h2F)}% من أهدافه بالشوط الأول.`, 0.5, 'n'); }
  }

  /* الكرات الثابتة */
  if (A.ne >= 3) {
    const spF = (A.astF.k || 0) + (A.astF.f || 0), spA = (A.astA.k || 0) + (A.astA.f || 0), pF = A.howF.p || 0, pA = A.howA.p || 0;
    const RF = L((a) => perE(a, 'ne') && ((a.astF.k || 0) + (a.astF.f || 0)) / a.ne), RA = L((a) => perE(a, 'ne') && ((a.astA.k || 0) + (a.astA.f || 0)) / a.ne, false);
    if (spF + pF) add('set', 'spF', tt(`${spF + pF} أهداف من كرات ثابتة`, `${spF + pF} set-piece goals`), `${A.astF.k || 0} بعد ركنية، ${A.astF.f || 0} من ضربة حرة، و${pF} جزاء${RF ? ` — ${rankTxt(RF, 'أخطر فريق', 'أقل فريق')} بالكرات الثابتة` : ''}.`, 0.4 + extreme(RF) * 0.5, RF && RF.r <= 4 ? 'g' : 'n');
    if (spA + pA) add('set', 'spA', tt(`استقبل ${spA + pA} من كرات ثابتة`, `${spA + pA} set-piece goals conceded`), `${A.astA.k || 0} بعد ركنية، ${A.astA.f || 0} من ضربة حرة، و${pA} جزاء${RA ? ` — ${rankTxt(RA, 'أقل فريق يستقبل', 'أكثر فريق يستقبل')} منها` : ''}.`, 0.4 + extreme(RA) * 0.5, RA && RA.r >= RA.n - 3 ? 'b' : 'n');
    const cor = A.s.cor, RK = L((a) => a.s.cor);
    if (cor != null) add('set', 'cor', tt(`${n1(cor)} ركنيات بالمباراة`, `${n1(cor)} corners per game`), `ويسمح بـ ${n1(A.sa.cor)} للخصم.${RK ? ` ${rankTxt(RK, 'أكثر فريق', 'أقل فريق')} بالركنيات.` : ''}`, 0.3 + extreme(RK) * 0.4, 'n');
  }
  { const tk = (k) => sq.ps.filter((p) => p[k] === 1).map((p) => p.name); const pen = tk('pen'), cor = tk('cor'), dfk = tk('dfk');
    if (pen.length || cor.length || dfk.length) add('set', 'takers', tt('منو ينفّذ', 'Set-piece takers'), [pen.length && `الجزاء: ${pen.join('، ')}`, cor.length && `الركنيات: ${cor.join('، ')}`, dfk.length && `الضربات الحرة: ${dfk.join('، ')}`].filter(Boolean).join(' · ') + '. هذولة نقاط إضافية بالفانتازي.', 0.45, 'n'); }

  /* الأسلوب */
  if (A.ne >= 3) {
    const st = (k, desc, more, less, title, fmt, w0 = 0.3) => { const v = A.s[k]; if (v == null) return; const R = L((a) => a.s[k], desc); add('style', k, title(v), `${fmt(v)}${R ? ` — ${rankTxt(R, more, less)}` : ''}.`, w0 + extreme(R) * 0.5, 'n', { R, big: n1(v) }); };
    st('poss', true, 'أعلى استحواذ', 'أقل استحواذ', (v) => tt(`استحواذ ${Math.round(v)}%`, `${Math.round(v)}% possession`), (v) => (v >= 55 ? 'يحب يمسك الكرة ويبني من الخلف' : v <= 45 ? 'يترك الكرة للخصم ويلعب على المساحات' : 'استحواذ متوازن'), 0.4);
    if (A.s.pas && A.s.pasA) { const acc = (A.s.pasA / A.s.pas) * 100, R = L((a) => (a.s.pas && a.s.pasA ? a.s.pasA / a.s.pas : null)); add('style', 'pass', tt(`دقة تمرير ${Math.round(acc)}%`, `${Math.round(acc)}% pass accuracy`), `${Math.round(A.s.pas)} تمريرة بالمباراة${R ? ` — ${rankTxt(R, 'أدق فريق', 'أقل دقة')}` : ''}.`, 0.3 + extreme(R) * 0.5, 'n'); }
    st('crs', true, 'أكثر فريق يرفع عرضيات', 'أقل فريق يرفع عرضيات', (v) => tt(`${n1(v)} عرضية بالمباراة`, `${n1(v)} crosses per game`), (v) => (A.s.crsA ? `${Math.round((A.s.crsA / v) * 100)}% منها توصل` : 'لعب على الأطراف'));
    st('lb', true, 'أكثر فريق يلعب طويل', 'أقل فريق يلعب طويل', (v) => tt(`${n1(v)} كرة طويلة بالمباراة`, `${n1(v)} long balls per game`), () => 'مقياس للعب المباشر');
    { const v = (A.s.tkl || 0) + (A.s.int || 0); if (A.s.tkl != null) { const R = L((a) => (a.s.tkl != null ? (a.s.tkl || 0) + (a.s.int || 0) : null)); add('style', 'press', tt(`${n1(v)} افتكاك وقطع بالمباراة`, `${n1(v)} tackles+interceptions`), `${n1(A.s.tkl)} تدخل و${n1(A.s.int)} قطع${R ? ` — ${rankTxt(R, 'أكثر فريق يفتك الكرة', 'أقل فريق يفتك الكرة')}` : ''}. هذا يرفع نقاط المساهمات الدفاعية لمدافعينه.`, 0.3 + extreme(R) * 0.5, 'n'); } }
    st('clr', true, 'أكثر فريق يشتت', 'أقل فريق يشتت', (v) => tt(`${n1(v)} تشتيت بالمباراة`, `${n1(v)} clearances per game`), (v) => (v >= 25 ? 'يدافع بعمق ويتعرض لضغط' : 'قليل ما ينحصر بمنطقته'));
  }

  /* النتائج والعقلية */
  { const hp = A.H.p ? A.H.pts / A.H.p : 0, wp = A.W.p ? A.W.pts / A.W.p : 0;
    if (A.H.p >= 3 && A.W.p >= 3 && Math.abs(hp - wp) >= 0.8) add('mind', 'venue', hp > wp ? tt('قوي بملعبه وضعيف برا', 'Strong at home, weak away') : tt('أحسن خارج ملعبه', 'Better away'), `بملعبه ${n1(hp)} نقطة بالمباراة (${A.H.gf}–${A.H.ga})، وبرا ${n1(wp)} (${A.W.gf}–${A.W.ga}).${A.ven && A.att.length ? ` معدل الحضور بـ ${A.ven}: ${Math.round(avg(A.att)).toLocaleString('en')}.` : ''}`, 0.55 + Math.min(0.5, Math.abs(hp - wp) / 3), 'n');
    // السلسلة الحالية
    const rs = A.res.map((x) => x.r); let k = rs.length - 1, n = 0; const unb = rs[k] !== 'L'; while (k >= 0 && (unb ? rs[k] !== 'L' : rs[k] !== 'W')) { n++; k--; }
    const wins = (() => { let c = 0; for (let j = rs.length - 1; j >= 0 && rs[j] === 'W'; j--) c++; return c; })();
    if (wins >= 3) add('mind', 'streak', tt(`${wins} انتصارات متتالية`, `${wins} wins in a row`), 'بأحسن حالاته هسه.', 0.6 + wins / 12, 'g');
    else if (n >= 4) add('mind', 'streak', unb ? tt(`${n} مباريات بدون خسارة`, `${n} unbeaten`) : tt(`${n} مباريات بدون فوز`, `${n} without a win`), unb ? 'ثابت وصعب ينغلب.' : 'يمر بفترة صعبة.', 0.55 + n / 15, unb ? 'g' : 'b');
    const l5 = A.res.slice(-5); if (l5.length === 5 && A.p >= 8) { const g5 = l5.reduce((a, x) => a + x.gf, 0) / 5, c5 = l5.reduce((a, x) => a + x.ga, 0) / 5, gS = A.gf / A.p, cS = A.ga / A.p;
      if (g5 - gS >= 0.6) add('mind', 'formUp', tt('هجومه بتصاعد', 'Attack trending up'), `بآخر 5 مباريات يسجّل ${n1(g5)} بالمباراة، مقابل ${n1(gS)} معدل موسمه.`, 0.6, 'g');
      if (c5 - cS >= 0.6) add('mind', 'formDn', tt('دفاعه تراجع مؤخراً', 'Defence slipping'), `بآخر 5 مباريات يستقبل ${n1(c5)} بالمباراة، مقابل ${n1(cS)} معدل موسمه.`, 0.6, 'b');
      if (cS - c5 >= 0.6) add('mind', 'defUp', tt('دفاعه تحسّن', 'Defence improving'), `بآخر 5 مباريات يستقبل ${n1(c5)} بس، مقابل ${n1(cS)} معدل موسمه.`, 0.6, 'g'); }
  }
  if (A.ne >= 4) {
    if (A.first >= 3) add('mind', 'first', tt(`إذا سجّل أول: ${n1(A.firstPts / A.first)} نقطة بالمباراة`, `Scoring first: ${n1(A.firstPts / A.first)} ppg`), `سجّل أول ب${gamesW(A.first)} وجمع ${A.firstPts} من ${A.first * 3} نقطة.`, 0.4 + (A.firstPts / (A.first * 3) < 0.6 ? 0.4 : 0), A.firstPts / (A.first * 3) >= 0.75 ? 'g' : 'n');
    if (A.behind >= 3) { const R = L((a) => (a.behind >= 2 ? a.behindPts / a.behind : null)); add('mind', 'behind', A.behindPts / A.behind >= 1 ? tt('يرجع من التأخر', 'Fights back') : tt('إذا تأخر ينهار', 'Folds when behind'), `تأخر ب${gamesW(A.behind)} وجمع منها ${A.behindPts} نقطة${R ? ` — ${rankTxt(R, 'أكثر فريق يرجع', 'أقل فريق يرجع')}` : ''}.`, 0.45 + extreme(R) * 0.5, A.behindPts / A.behind >= 1 ? 'g' : 'b'); }
    if (A.leadLost >= 3) add('mind', 'leadLost', tt('يضيّع التقدم', 'Drops leads'), `تقدّم ب${gamesW(A.leadLost)} وما فاز بيها. ${A.lateLoss ? `وب${gamesW(A.lateLoss)} خسر بهدف بعد الدقيقة 85.` : ''}`, 0.6 + A.leadLost / 15, 'b');
    if (A.htLead >= 3) add('mind', 'ht', tt(`متقدّم بالاستراحة ${A.htLead} مرات`, `Led at HT ${A.htLead} times`), `فاز بـ ${A.htLeadW} منها (${pc(A.htLeadW, A.htLead)}%).`, A.htLeadW / A.htLead < 0.7 ? 0.6 : 0.35, A.htLeadW / A.htLead < 0.7 ? 'b' : 'g');
    if (A.lateWin >= 2) add('mind', 'lateWin', tt(`${A.lateWin} انتصارات بهدف متأخر`, `${A.lateWin} late winners`), 'حسم المباراة بعد الدقيقة 85.', 0.55, 'g');
  }
  { const b = pc(A.btts, A.p), o = pc(A.o25, A.p); if (A.p >= 6 && (b >= 65 || b <= 30)) add('mind', 'btts', b >= 65 ? tt('مبارياته مفتوحة', 'Open games') : tt('مبارياته مقفولة', 'Tight games'), `الفريقين سجّلوا بـ ${b}% من مبارياته، وأكثر من هدفين بـ ${o}%.`, 0.45, 'n'); }

  /* الانضباط */
  { const yc = A.ne >= 3 && A.s.yc != null ? A.s.yc : sq.yc / A.p, R = A.ne >= 3 ? L((a) => a.s.yc) : null;
    add('disc', 'yc', tt(`${n1(yc)} إنذار بالمباراة`, `${n1(yc)} yellows per game`), `${sq.yc} إنذار و${sq.rc} طرد للاعبينه بالموسم${R ? ` — ${rankTxt(R, 'أكثر فريق ينذر', 'أقل فريق ينذر')}` : ''}.`, 0.3 + extreme(R) * 0.5, R && R.r <= 3 ? 'b' : 'n');
    const bk = sq.ps.filter((p) => p.yc >= 4).sort((a, b) => b.yc - a.yc); if (bk.length) add('disc', 'ban', tt('قريبين من الإيقاف', 'Suspension risk'), bk.map((p) => `${p.name} (${p.yc})`).join('، ') + '. خمسة إنذارات قبل الجولة 19 تعني إيقاف مباراة.', 0.5 + bk.length * 0.1, 'b');
    if (A.ne >= 3 && A.s.fou != null) { const R2 = L((a) => a.s.fou); add('disc', 'fou', tt(`${n1(A.s.fou)} خطأ بالمباراة`, `${n1(A.s.fou)} fouls per game`), `${R2 ? `${rankTxt(R2, 'أكثر فريق يرتكب أخطاء', 'أقل فريق يرتكب أخطاء')}.` : ''} ${A.s.off != null ? `وتسلل ${n1(A.s.off)} بالمباراة.` : ''}`, 0.25 + extreme(R2) * 0.4, 'n'); }
    const late = A.cards[4] + A.cards[5], tot = A.cards.reduce((a, b) => a + b, 0); if (tot >= 8 && late / tot >= 0.55) add('disc', 'lateCards', tt('إنذاراته بآخر المباراة', 'Late cards'), `${pc(late, tot)}% من إنذاراته بعد الدقيقة 60.`, 0.4, 'n');
  }

  /* اللاعبين والفانتازي */
  { const ps = sq.ps.filter((p) => p.min > 0);
    const best = [...ps].sort((a, b) => b.total - a.total).slice(0, 3); if (best.length) add('fpl', 'best', tt('الأكثر نقاط', 'Top scorers (FPL)'), best.map((p) => `${p.name} ${p.total}`).join(' · '), 0.6, 'n', { pids: best.map((p) => p.id) });
    const val = ps.filter((p) => p.min >= 270).sort((a, b) => b.ppg / b.price - a.ppg / a.price)[0]; if (val) add('fpl', 'value', tt(`أفضل قيمة: ${val.name}`, `Best value: ${val.name}`), `${n1(val.ppg)} نقطة بالمباراة بسعر ${val.price.toFixed(1)}م.`, 0.55, 'g', { pid: val.id });
    const diff = ps.filter((p) => p.own < 8 && p.min >= 270 && p.ppg >= 4.5).sort((a, b) => b.ppg - a.ppg)[0]; if (diff) add('fpl', 'diff', tt(`لاعب مخفي: ${diff.name}`, `Differential: ${diff.name}`), `${n1(diff.ppg)} نقطة بالمباراة ومملوك بس من ${diff.own}%.`, 0.6, 'g', { pid: diff.id });
    const gk = ps.filter((p) => p.pos === 'GK').sort((a, b) => b.min - a.min)[0]; if (gk && gk.min >= 270) add('fpl', 'gk', tt(`الحارس: ${gk.name}`, `Keeper: ${gk.name}`), `${gk.saves} تصدّي (${n1((gk.saves / gk.min) * 90)} بالمباراة)، ${gk.cs} شباك نظيفة${gk.ps ? `، وصد ${gk.ps} جزاء` : ''}.`, 0.4, 'n', { pid: gk.id });
    const dc = ps.filter((p) => (p.pos === 'DEF' || p.pos === 'MID') && p.min >= 270).sort((a, b) => b.dc90 - a.dc90)[0]; if (dc && dc.dc90 >= 8) add('fpl', 'dc', tt(`أقوى مساهمات دفاعية: ${dc.name}`, `Top defensive contributions: ${dc.name}`), `${n1(dc.dc90)} مساهمة بالـ90 دقيقة، فنقاط المساهمات الدفاعية قريبة منه كل مباراة.`, 0.5, 'n', { pid: dc.id });
    const nail = ps.filter((p) => A.p >= 4 && p.min / (A.p * 90) >= 0.92).map((p) => p.name); if (nail.length) add('fpl', 'nailed', tt('مضمونين باللعب', 'Nailed starters'), nail.join('، ') + '.', 0.35, 'n');
    const inj = sq.ps.filter((p) => p.st && p.st !== 'a' && p.news).slice(0, 6); if (inj.length) add('fpl', 'inj', tt(`${inj.length} غيابات أو شكوك`, `${inj.length} absences/doubts`), inj.map((p) => `${p.name}${p.chance != null ? ` ${p.chance}%` : ''}`).join(' · '), 0.55 + inj.length * 0.05, 'b', { list: inj.map((p) => ({ id: p.id, name: p.name, news: p.news, ch: p.chance })) });
  }

  /* الجاي */
  { const cur = ST.G.next || ST.G.cur, gws = Array.from({ length: 5 }, (_, i) => cur + i).filter((g) => g <= 38);
    const sumFor = (id) => { const ds = gws.flatMap((g) => FDR(id, g)); return ds.length ? avg(ds) : null; };
    const me = sumFor(tid), R = rankIn(Object.keys(ST.G.teams).map((id) => ({ tid: +id })), tid, (a) => sumFor(a.tid), false, 12);
    if (me != null) add('next', 'fdr', R && R.r <= 4 ? tt('جدوله الجاي سهل', 'Easy run ahead') : R && R.r >= R.n - 3 ? tt('جدوله الجاي صعب', 'Tough run ahead') : tt('جدوله الجاي', 'Next fixtures'), `معدل الصعوبة ${n1(me)} للجولات ${gws[0]}–${gws[gws.length - 1]}${R ? ` — ${rankTxt(R, 'أسهل جدول', 'أصعب جدول')}` : ''}.`, 0.45 + extreme(R) * 0.6, R && R.r <= 4 ? 'g' : R && R.r >= R.n - 3 ? 'b' : 'n', { viz: 'next', gws });
    const dbl = gws.filter((g) => FDR(tid, g).length > 1), bl = gws.filter((g) => !FDR(tid, g).length);
    if (dbl.length) add('next', 'dgw', tt(`جولة مزدوجة: ${dbl.join('، ')}`, `Double GW: ${dbl.join(', ')}`), 'يلعب مباراتين بهالجولة: لاعبينه قيمتهم تتضاعف.', 0.9, 'g');
    if (bl.length) add('next', 'bgw', tt(`ما يلعب بالجولة ${bl.join('، ')}`, `Blank in GW ${bl.join(', ')}`), 'خطّط لبدلاء لاعبينه قبلها.', 0.85, 'b');
  }
  return { A, sq, all, cover, branches: out };
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
