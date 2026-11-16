/* =========================================================
   اكتشاف الأنماط الموسمية — Seasonal Pattern Intelligence (القدرة 12)
   من نتائج مباريات الموسم الحالي الرسمية (G.fx) ونقاط اللاعبين بالجولات الأخيرة:
   - ضغط المباريات: بالمباريات اللي فرق الراحة بين الفريقين يومين أو أكثر، شلون يلعب الأقل راحة
   - مراحل الموسم: أداء الفريق بآخر 6 مباريات مقارنة بأول الموسم
   - أفضلية الأرض هذا الموسم
   - أداء اللاعب أمام الخصوم السهلين والصعبين
   كل نمط عنده مستوى: "مؤكد" (|t| ≥ 2.5 وعينة كافية) أو "محتمل" (|t| ≥ 1.8). غير هيج ما نعرضه.
   حدود البيانات: الراحة محسوبة من مباريات الدوري بس (الكؤوس والبطولات الأوروبية مو موجودة
   ببيانات الفانتازي)، والبيانات من هذا الموسم بس — ما عندنا مواسم سابقة.
========================================================= */
const DAY = 864e5;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const vari = (a) => { const m = mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : 0; };
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;

/** اختبار Welch بين مجموعتين، مع حد أدنى للتباين */
export function welch(a, b, floor = 0.5) {
  if (a.length < 2 || b.length < 2) return { t: 0, d: 0 };
  const d = mean(a) - mean(b), se = Math.sqrt(Math.max(vari(a), floor) / a.length + Math.max(vari(b), floor) / b.length);
  return { t: se ? d / se : 0, d, ma: mean(a), mb: mean(b) };
}
export function level(t, na, nb, minN = 4) {
  if (na >= minN && nb >= minN && Math.abs(t) >= 2.5) return 'confirmed';
  const pn = Math.max(3, Math.ceil(minN / 2));
  if (na >= pn && nb >= pn && Math.abs(t) >= 1.8) return 'possible';
  return null;
}

/** مباريات كل فريق المنتهية بالترتيب، مع أيام الراحة وفرق الأهداف */
export function teamGames(fx) {
  const all = Object.values(fx || {}).flat().filter((m) => m.ko).sort((a, b) => new Date(a.ko) - new Date(b.ko));
  const T = {}, last = {};
  for (const m of all) {
    for (const side of ['h', 'a']) {
      const t = m[side], home = side === 'h';
      const rest = last[t] ? (new Date(m.ko) - last[t]) / DAY : null;
      last[t] = new Date(m.ko).getTime();
      if (!m.fin || m.hs == null) { (T[t] = T[t] || []).push({ ko: m.ko, rest, home, fin: false, fdr: home ? m.hd : m.ad }); continue; }
      const gf = home ? m.hs : m.as, ga = home ? m.as : m.hs;
      (T[t] = T[t] || []).push({ ko: m.ko, rest, home, fin: true, gd: gf - ga, pts: gf > ga ? 3 : gf === ga ? 1 : 0, fdr: home ? m.hd : m.ad });
    }
  }
  return T;
}

/** كل الأنماط المكتشفة (مرتبة: المؤكد أول) */
export function patterns(G, opts = {}) {
  const T = teamGames(G.fx), out = [];
  // أقل من 6 جولات منتهية = بدري على أي نمط موسمي
  const finG = Object.values(G.fx || {}).filter((L) => L.length && L.every((m) => m.fin)).length;
  if (finG < 6) return out;
  // متوسط فرق الأهداف لكل فريق — نقارن بالانحراف عنه حتى قوة الفريق ما تخبط النتيجة
  const avgGd = Object.fromEntries(Object.entries(T).map(([t, L]) => { const f = L.filter((x) => x.fin); return [t, f.length ? mean(f.map((x) => x.gd)) : 0]; }));
  // 1) ضغط المباريات: بكل مباراة نقارن الفريق الأقل راحة بالأكثر راحة (فرق يومين أو أكثر)
  //    ونحسب انحراف فرق أهدافه عن معدله، حتى قوة الفريق ما تخبط النتيجة
  const short = [], normal = [];
  Object.values(G.fx || {}).flat().forEach((m) => {
    if (!m.fin || m.hs == null) return;
    const xh = (T[m.h] || []).find((x) => x.ko === m.ko), xa = (T[m.a] || []).find((x) => x.ko === m.ko);
    if (!xh || !xa || xh.rest == null || xa.rest == null || xh.rest > 30 || xa.rest > 30 || Math.abs(xh.rest - xa.rest) < 2) return;
    const [less, more, tl, tm] = xh.rest < xa.rest ? [xh, xa, m.h, m.a] : [xa, xh, m.a, m.h];
    short.push(less.gd - avgGd[tl]); normal.push(more.gd - avgGd[tm]);
  });
  const w = welch(short, normal, 1);
  const lv = level(w.t, short.length, normal.length, 12);
  if (lv) out.push({ kind: 'congestion', level: lv, effect: r2(w.d), n: [short.length, normal.length], t: r1(w.t) });
  // 2) مراحل الموسم لكل فريق: آخر 6 مقابل اللي قبلها
  Object.entries(T).forEach(([t, L]) => {
    const f = L.filter((x) => x.fin); if (f.length < 12) return;
    const a = f.slice(-6).map((x) => x.gd), b = f.slice(0, -6).map((x) => x.gd);
    const s = welch(a, b, 1), l = level(s.t, a.length, b.length, 6);
    if (l) out.push({ kind: s.d > 0 ? 'team_rise' : 'team_drop', team: +t, level: l, effect: r2(s.d), from: r2(s.mb), to: r2(s.ma), n: [a.length, b.length], t: r1(s.t) });
  });
  // 3) أفضلية الأرض هذا الموسم
  const hp = [], ap = []; Object.values(T).forEach((L) => L.forEach((x) => { if (x.fin) (x.home ? hp : ap).push(x.pts); }));
  const hw = welch(hp, ap, 0.5), hl = level(hw.t, hp.length, ap.length, 20);
  if (hl) out.push({ kind: 'home_adv', level: hl, effect: r2(hw.d), n: [hp.length, ap.length], t: r1(hw.t) });
  // 4) اللاعبين أمام الخصوم السهلين والصعبين (من نقاط الجولات المخزنة)
  if (opts.pts && opts.ids) {
    for (const id of opts.ids) {
      const p = G.PM[id]; if (!p) continue;
      const easy = [], hard = [];
      for (const [g, act] of Object.entries(opts.pts)) {
        const f = (G.fx[g] || []).filter((m) => m.h === p.team || m.a === p.team); if (f.length !== 1) continue;
        const r = act[id]; if (!r || r[1] < 60) continue;
        const fdr = f[0].h === p.team ? f[0].hd : f[0].ad;
        if (fdr <= 2) easy.push(r[0]); else if (fdr >= 4) hard.push(r[0]);
      }
      const s = welch(easy, hard, 2), l = level(s.t, easy.length, hard.length, 3);
      if (l) out.push({ kind: 'player_fixture', id, level: l, effect: r2(s.d), easy: r1(s.ma), hard: r1(s.mb), n: [easy.length, hard.length], t: r1(s.t) });
    }
  }
  return out.sort((a, b) => (a.level === b.level ? Math.abs(b.t) - Math.abs(a.t) : a.level === 'confirmed' ? -1 : 1));
}

/** أيام الراحة قبل مباراة الفريق بالجولة الجاية (من الجدول المعلن — مو بيانات مستقبلية) */
export function upcomingRest(G, team, gw = G.next) {
  const L = teamGames(G.fx)[team] || [], m = (G.fx[gw] || []).find((x) => x.h === team || x.a === team);
  if (!m) return null;
  const x = L.find((y) => y.ko === m.ko); return x?.rest != null ? r1(x.rest) : null;
}
