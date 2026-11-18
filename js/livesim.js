/* =========================================================
   محاكاة مباراة مباشرة بفريقك — للمعاينة فقط (?livesim=1 ، والإنهاء ?livesim=0)
   تعيد تشغيل مباراة وحدة من الجولة الحالية «مباشر» بلاعبين فريقك:
   دقيقة كل 3 ثواني، أهداف وصناعة وتصديات وكروت ومساهمات دفاعية، وكل الأقسام
   (فريقي، المباشر، الرئيسية، النبض) تشوفها مثل المباراة الحقيقية.
   باقي المباريات تبقى بياناتها الحقيقية. تنطفي لحالها لما تسد التطبيق.
========================================================= */
const ON = (() => { try { return sessionStorage.getItem('fp_livesim') === '1'; } catch { return false; } })();
export const simOn = () => ON;

const SEC_PER_MIN = 3;
const S = { boot: null, picks: null, fx: null, cur: 0, cast: null };
const t0 = () => { try { let t = +sessionStorage.getItem('fp_livesim_t0'); if (!t) { t = Date.now(); sessionStorage.setItem('fp_livesim_t0', String(t)); } return t; } catch { return Date.now(); } };
// الدقيقة: 1→45، استراحة 5 «دقايق» ثابتة، 46→90، وبعدها 4 دقايق وقت بدل ضائع ثم تنتهي
function clock() {
  const m = 1 + Math.floor((Date.now() - t0()) / 1000 / SEC_PER_MIN);
  if (m <= 45) return { min: m, ht: false, done: false };
  if (m <= 50) return { min: 45, ht: true, done: false };
  const mm = m - 5;
  return { min: Math.min(mm, 94), ht: false, done: mm >= 95 };
}

const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const GOAL = { GK: 10, DEF: 6, MID: 5, FWD: 4 }, CSP = { GK: 4, DEF: 4, MID: 1, FWD: 0 }, GBPS = { GK: 12, DEF: 12, MID: 18, FWD: 24 };

function pickFixture() {
  if (!S.fx || !S.boot) return null;
  const list = S.fx.filter((f) => f.event === S.cur); if (!list.length) return null;
  let saved = null; try { saved = +sessionStorage.getItem('fp_livesim_fx'); } catch {}
  if (saved) { const f = list.find((x) => x.id === saved); if (f) return f; }
  if (!S.picks) return list[0]; // مؤقتاً لحد ما يوصل فريقك، بعدها نختار مباراة بيها لاعبينك ونثبتها
  const E = S.byId, mine = S.picks.picks || [];
  const cap = mine.find((p) => p.is_captain), capTeam = cap && E[cap.element]?.team;
  const cnt = (f) => mine.filter((p) => p.multiplier > 0 && [f.team_h, f.team_a].includes(E[p.element]?.team)).length;
  const f = (capTeam && list.find((x) => x.team_h === capTeam || x.team_a === capTeam)) || list.slice().sort((a, b) => cnt(b) - cnt(a))[0];
  try { sessionStorage.setItem('fp_livesim_fx', String(f.id)); } catch {}
  return f;
}

// التشكيلتين: لاعبينك بهالمباراة + الأفضل بكل مركز لحد 11 لكل فريق
function buildCast(f) {
  if (S.cast && S.cast.fid === f.id && S.cast.hasPicks === !!S.picks) return S.cast;
  const E = S.byId, mineIds = new Set((S.picks?.picks || []).map((p) => p.element));
  const capId = (S.picks?.picks || []).find((p) => p.is_captain)?.element;
  const side = (team) => {
    const pool = S.boot.elements.filter((e) => e.team === team && (e.status === 'a' || mineIds.has(e.id)));
    const need = { 1: 1, 2: 4, 3: 4, 4: 2 }, xi = [];
    pool.filter((e) => mineIds.has(e.id)).forEach((e) => { if (need[e.element_type] > 0) { need[e.element_type]--; xi.push(e); } });
    pool.filter((e) => !mineIds.has(e.id)).sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).forEach((e) => { if (need[e.element_type] > 0) { need[e.element_type]--; xi.push(e); } });
    return xi;
  };
  const H = side(f.team_h), A = side(f.team_a);
  const capTeam = capId && E[capId]?.team;
  const myHome = capTeam ? capTeam === f.team_h : H.filter((e) => mineIds.has(e.id)).length >= A.filter((e) => mineIds.has(e.id)).length;
  const MY = myHome ? H : A, OP = myHome ? A : H;
  const att = (L, ex = []) => L.filter((e) => e.element_type >= 3 && !ex.includes(e.id)).sort((a, b) => (mineIds.has(b.id) - mineIds.has(a.id)) || (b.element_type - a.element_type) || (b.total_points - a.total_points))[0];
  const a1 = (capId && MY.find((e) => e.id === capId && e.element_type >= 2)) || att(MY);
  const a2 = att(MY, [a1?.id]) || a1;
  const gk = (L) => L.find((e) => e.element_type === 1), defs = (L) => L.filter((e) => e.element_type === 2);
  const o1 = att(OP), o2 = att(OP, [o1?.id]) || o1;
  const id = (e) => e?.id;
  const myD = defs(MY), opD = defs(OP);
  // السيناريو: [دقيقة، لاعب، إحصاءات]
  const SC = [
    [7, id(o2), { yellow_cards: 1 }],
    [14, id(gk(MY)), { saves: 1 }],
    [18, id(a1), { goals_scored: 1 }], [18, id(a2), { assists: 1 }],
    [25, id(gk(OP)), { saves: 1 }], [33, id(gk(MY)), { saves: 1 }],
    [39, id(myD[0]), { yellow_cards: 1 }],
    [47, id(gk(OP)), { saves: 1 }],
    [52, id(o1), { goals_scored: 1 }], [52, id(o2), { assists: 1 }],
    [58, id(gk(MY)), { saves: 1 }],
    [63, id(a2), { goals_scored: 1 }], [63, id(a1), { assists: 1 }],
    [71, id(gk(OP)), { saves: 1 }], [80, id(gk(MY)), { saves: 1 }],
    [88, id(a1), { goals_scored: 1 }],
  ].filter((x) => x[1]);
  S.cast = { fid: f.id, hasPicks: !!S.picks, myHome, H, A, SC, dcFast: [myD[0], myD[1], opD[0]].filter(Boolean).map((e) => e.id) };
  return S.cast;
}

function simState(f) {
  const c = buildCast(f), { min, done } = clock(), E = S.byId;
  const all = [...c.H.map((e) => [e, 'h']), ...c.A.map((e) => [e, 'a'])];
  const st = {}; let hs = 0, as = 0;
  all.forEach(([e]) => (st[e.id] = { minutes: min, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, own_goals: 0, penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0, defensive_contribution: Math.floor((min / 90) * (c.dcFast.includes(e.id) ? 12 : 6)), starts: 1 }));
  const sideOf = Object.fromEntries(all.map(([e, s]) => [e.id, s]));
  c.SC.forEach(([m, pid, d]) => { if (m > min || !st[pid]) return; Object.entries(d).forEach(([k, v]) => (st[pid][k] += v)); if (d.goals_scored) { if (sideOf[pid] === 'h') hs++; else as++; } });
  all.forEach(([e, s]) => { st[e.id].goals_conceded = s === 'h' ? as : hs; });
  const out = {};
  all.forEach(([e]) => {
    const x = st[e.id], pos = POS[e.element_type];
    if (x.minutes >= 60 && !x.goals_conceded && CSP[pos]) x.clean_sheets = 1;
    const dcPts = (pos === 'DEF' && x.defensive_contribution >= 10) || ((pos === 'MID' || pos === 'FWD') && x.defensive_contribution >= 12) ? 2 : 0;
    const parts = [
      ['minutes', x.minutes >= 60 ? 2 : x.minutes > 0 ? 1 : 0, x.minutes],
      ['goals_scored', x.goals_scored * GOAL[pos], x.goals_scored], ['assists', x.assists * 3, x.assists],
      ['clean_sheets', x.clean_sheets * CSP[pos], x.clean_sheets],
      ['goals_conceded', pos === 'GK' || pos === 'DEF' ? -Math.floor(x.goals_conceded / 2) : 0, x.goals_conceded],
      ['saves', Math.floor(x.saves / 3), x.saves], ['yellow_cards', -x.yellow_cards, x.yellow_cards], ['red_cards', -3 * x.red_cards, x.red_cards],
      ['defensive_contribution', dcPts, x.defensive_contribution],
    ];
    x.bps = (x.minutes >= 60 ? 6 : x.minutes > 0 ? 3 : 0) + x.goals_scored * GBPS[pos] + x.assists * 9 + x.saves * 2 + (x.clean_sheets && (pos === 'GK' || pos === 'DEF') ? 12 : 0) - ((pos === 'GK' || pos === 'DEF') ? 4 * x.goals_conceded : 0) - 3 * x.yellow_cards + Math.floor(x.defensive_contribution / 2);
    x.total_points = parts.reduce((s, p) => s + p[1], 0);
    x.in_dreamteam = false;
    const ex = parts.filter((p) => p[1] || (p[0] === 'minutes' && p[2])).map(([identifier, points, value]) => ({ identifier, points, value, points_modification: 0 }));
    ex.push({ identifier: 'bps', points: 0, value: x.bps, points_modification: 0 });
    out[e.id] = { stats: x, explain: [{ fixture: f.id, stats: ex }] };
  });
  return { out, hs, as, min, done, all };
}

function simFixture(f) {
  const { out, hs, as, min, done, all } = simState(f);
  const list = (k) => {
    const h = [], a = [];
    all.forEach(([e, s]) => { const v = out[e.id].stats[k]; if (v) (s === 'h' ? h : a).push({ value: v, element: e.id }); });
    return { identifier: k, h, a };
  };
  return {
    ...f, started: true, finished: false, finished_provisional: done, minutes: min,
    kickoff_time: new Date(t0()).toISOString(), team_h_score: hs, team_a_score: as,
    stats: ['goals_scored', 'assists', 'yellow_cards', 'red_cards', 'saves', 'bps'].map(list),
  };
}

/* نقطة الربط الوحيدة: كل بيانات الفانتازي تمر من هنا قبل ما توصل للتطبيق */
export function simWrap(path, params, d) {
  if (!ON || !d) return d;
  try {
    if (path === 'bootstrap-static/' && Array.isArray(d.elements)) {
      S.boot = d; S.byId = Object.fromEntries(d.elements.map((e) => [e.id, e]));
      const cur = (d.events || []).find((e) => e.is_current) || (d.events || []).find((e) => e.is_next);
      S.cur = cur ? cur.id : 0;
      return { ...d, events: d.events.map((e) => (e.id === S.cur ? { ...e, is_current: true, is_next: false, finished: false, data_checked: false, deadline_time: new Date(e.deadline_time) < new Date() ? e.deadline_time : new Date(Date.now() - 36e5).toISOString() } : e)) };
    }
    const pk = path.match(/^entry\/\d+\/event\/(\d+)\/picks\/$/);
    if (pk && +pk[1] === S.cur) { S.picks = d; return d; }
    if (path === 'fixtures/' && Array.isArray(d)) {
      if (!params?.event) S.fx = d; else if (+params.event === S.cur) S.fx = (S.fx || []).filter((x) => x.event !== S.cur).concat(d);
      const f = pickFixture(); if (!f) return d;
      return d.map((x) => (x.id === f.id ? simFixture(x) : x));
    }
    const lv = path.match(/^event\/(\d+)\/live\/$/);
    if (lv && +lv[1] === S.cur && Array.isArray(d.elements)) {
      const f = pickFixture(); if (!f) return d;
      const { out } = simState(f), teams = new Set([f.team_h, f.team_a]), E = S.byId;
      const zero = d.elements[0] ? Object.fromEntries(Object.keys(d.elements[0].stats || {}).map((k) => [k, typeof d.elements[0].stats[k] === 'string' ? '0.0' : k === 'in_dreamteam' ? false : 0])) : {};
      return { ...d, elements: d.elements.map((e) => {
        if (out[e.id]) return { id: e.id, stats: { ...zero, ...out[e.id].stats }, explain: [...(e.explain || []).filter((x) => x.fixture !== f.id), ...out[e.id].explain] };
        if (teams.has(E[e.id]?.team)) return { id: e.id, stats: { ...zero }, explain: (e.explain || []).filter((x) => x.fixture !== f.id) };
        return e;
      }) };
    }
  } catch (err) { console.warn('livesim', err); }
  return d;
}

// شريط صغير يوضح إنها محاكاة، ويه زر إنهاء
if (ON && typeof document !== 'undefined') {
  const add = () => {
    if (document.getElementById('livesimBar')) return;
    const b = document.createElement('div'); b.id = 'livesimBar';
    b.setAttribute('style', 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:10px;align-items:center;padding:6px 8px 6px 14px;border-radius:999px;background:rgba(255,92,108,.16);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px rgba(255,92,108,.45);color:#FFD6DB;font:600 12px "IBM Plex Sans Arabic",sans-serif;direction:rtl;white-space:nowrap');
    b.innerHTML = '<span id="livesimClk">محاكاة مباراة · مو بيانات حقيقية</span><a href="/?livesim=0" style="color:#fff;background:rgba(255,92,108,.55);padding:3px 10px;border-radius:999px;text-decoration:none">إنهاء</a>';
    document.body.appendChild(b);
    setInterval(() => { const c = clock(), el = document.getElementById('livesimClk'); if (el) el.textContent = `محاكاة · ${c.done ? 'انتهت' : c.ht ? 'استراحة' : `<bdi>${c.min}′</bdi>`}`.replace(/<\/?bdi>/g, ''); }, 1000);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
}
