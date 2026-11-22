/* مركز المباريات والنقاط المباشرة */
import { ST, PM, tName, tShort, officialRank } from '../store.js';
import { t, tt } from '../i18n.js';
import { esc, I, crest, fmtTime, openSheet, sheetHead, toast, fmt, scoreHTML, KITS, fxMin, isHT, morphHTML } from '../ui.js';
import * as FPL from '../fpl.js';
import { scanLive } from '../notify.js';
import { pShirt } from './common.js';
import { liveTeamPoints } from './home.js';
import { liveCalc, rankImpact, whatIf, WHATIF, fxStats } from '../live-engine.js';
import { liveRankEstimate } from '../predict.js';

let gwSel = null, gwUser = false, poll = null, lastFetch = 0;
window.__lvReset = () => { gwUser = false; };
const isLiveGW = (g) => (ST.G.fx[g] || []).some((f) => f.started && !f.fin);
let liveBusy = false, liveSig = '', liveErrAt = 0;
/* الفانتازي ينشر الحدث بمصدرين (event/live و fixtures) وأحياناً واحد يسبق الثاني — ناخذ الأعلى لكل لاعب */
const FAST_KEYS = ['goals_scored', 'assists', 'own_goals', 'penalties_saved', 'penalties_missed', 'yellow_cards', 'red_cards', 'saves'];
function fastMerge(next, fxs) {
  const cnt = {}; fxs.forEach((f) => { cnt[f.h] = (cnt[f.h] || 0) + 1; cnt[f.a] = (cnt[f.a] || 0) + 1; });
  fxs.forEach((f) => { if (!f.started) return; (f.stats || []).forEach((st) => { if (!FAST_KEYS.includes(st.identifier)) return;
    [...(st.h || []), ...(st.a || [])].forEach((x) => { const p = PM(x.element), s = next[x.element]; if (!p || !s || cnt[p.team] !== 1) return; if ((s[st.identifier] || 0) < x.value) next[x.element] = { ...s, [st.identifier]: x.value, _fx: 1 }; }); }); });
}
async function refreshLive(force = false) {
  const g = ST.G.cur; if (!g || liveBusy) return;
  liveBusy = true;
  try {
    const [l, fx, sc] = await Promise.all([FPL.loadLive(g, force), FPL.loadFixturesGW(g, force), FPL.loadScores(ST.G.fx[g]).catch(() => [])]);
    const fxNorm = FPL.espnMerge(fx.map((x) => FPL.fxBest({ id: x.id, ev: x.event, h: x.team_h, a: x.team_a, hd: x.team_h_difficulty, ad: x.team_a_difficulty, ko: x.kickoff_time, fin: !!(x.finished || (x.finished_provisional && (x.minutes || 0) >= 90)), started: x.started, hs: x.team_h_score, as: x.team_a_score, min: x.minutes, stats: x.stats || [] })), sc, ST.G.teams);
    // إذا ما تغيّر شي من آخر مرة: نحدّث وقت الجلب بس، بدون إعادة رسم
    const sig = g + JSON.stringify(l.elements) + JSON.stringify(fxNorm);
    if (sig === liveSig && ST.liveRawGW === g) { lastFetch = Date.now(); freshness(); return; }
    liveSig = sig;
    const next = Object.fromEntries(l.elements.map((x) => [x.id, x.stats]));
    fastMerge(next, fxNorm); // أي حدث ينزل بأي مصدر من الفانتازي (اللاعبين أو المباريات) يظهر فوراً
    scanLive(ST.live, next, ST.G.fx[g], fxNorm);
    // حركات الأحداث المباشرة للاعبينك (هدف، صناعة، كرت، بونص، نقاط)
    try { if (ST.live && ST.liveRawGW === g && ST.E?.picks) { const ev = []; ST.E.picks.picks.forEach((pk) => { const a = ST.live[pk.element], b = next[pk.element]; if (!a || !b) return; const d = (k) => (b[k] || 0) - (a[k] || 0); if (d('goals_scored') > 0) ev.push({ id: pk.element, k: 'goal' }); if (d('assists') > 0) ev.push({ id: pk.element, k: 'assist' }); if (d('red_cards') > 0) ev.push({ id: pk.element, k: 'red' }); else if (d('yellow_cards') > 0) ev.push({ id: pk.element, k: 'yellow' }); if (d('bonus') > 0) ev.push({ id: pk.element, k: 'bonus', n: d('bonus') }); if (d('penalties_saved') > 0) ev.push({ id: pk.element, k: 'save' }); if (d('own_goals') > 0 || d('penalties_missed') > 0) ev.push({ id: pk.element, k: 'bad' }); { const pp = PM(pk.element); if (pp && (pp.pos === 'GK' || pp.pos === 'DEF') && d('goals_conceded') > 0 && !(a.goals_conceded > 0) && (b.minutes || 0) >= 1) ev.push({ id: pk.element, k: 'leak' }); } const dp = d('total_points'); if (dp) ev.push({ id: pk.element, k: 'pts', n: dp * Math.max(1, pk.multiplier || 1) }); }); if (ev.length) setTimeout(() => window.__fxEvents?.(ev), 400); } } catch {}
    if (ST.liveRawGW === g) window.__pulseDiff?.(ST.live, next);
    ST.live = next; ST.liveRaw = l.elements; ST.liveRawGW = g; ST.G.fx[g] = fxNorm; lastFetch = Date.now(); freshness();
    mcTick(g); // صفحة المباراة المفتوحة تتحدّث فوراً مع كل تحديث (مو كل 20 ثانية)
    if (Date.now() - (window.__entryAt || 0) > 110e3) { window.__entryAt = Date.now(); FPL.fetchEntry(ST.profile.teamId, true).then((en) => { if (en?.id) ST.E.entry = { ...ST.E.entry, ...en }; }).catch(() => {}); }
    if (!document.querySelector('.ov') && ['live', 'home', 'team', 'season', 'pulse'].includes(ST.view)) window.render();
  } catch (e) { if (force && Date.now() - liveErrAt > 60e3) { liveErrAt = Date.now(); toast(e.message); } } finally { liveBusy = false; }
}
/* تحديث لحظي ذكي: كل 30 ثانية وقت المباريات، كل 10 دقائق بباقي الأوقات، ويتوقف إذا التطبيق بالخلفية */
const nearKickoff = () => { const now = Date.now(); return [ST.G.cur, ST.G.next].some((g) => (ST.G.fx[g] || []).some((f) => f.ko && !f.fin && Math.abs(new Date(f.ko) - now) < 2.5 * 3600e3 && new Date(f.ko) - now < 15 * 60e3)); };
export const liveMode = () => !!ST.G && (isLiveGW(ST.G.cur) || nearKickoff());
let idleAt = Date.now(), freshT = null;
async function idleRefresh() {
  try {
    const { setGame } = await import('../engine.js'); const { scanStatic } = await import('../notify.js');
    const G2 = await FPL.loadGame(false); if (!G2.next) G2.next = G2.cur || 1;
    if (G2.cur !== ST.G.cur) return window.loadAll(true);
    const E2 = await FPL.loadEntry(ST.profile.teamId).catch(() => null);
    const sig = (E) => `${E?.gw}|${(E?.pending || []).map((t) => t.element_in + ':' + t.element_out).join(',')}`;
    if (E2 && sig(E2) !== sig(ST.E)) return window.loadAll(true);
    if (E2) { ST.E.entry = E2.entry; ST.E.hist = E2.hist; }
    ST.G = G2; setGame(G2); scanStatic(); idleAt = Date.now();
    if (!document.querySelector('.ov') && ['home', 'players', 'season', 'team'].includes(ST.view)) window.render();
  } catch {}
}
export function freshness() {
  const el = document.getElementById('fresh'); if (!el || !ST.G) return;
  const embed = window.__EMBED?.label?.();
  const lm = liveMode(), ts = lm ? lastFetch || ST.G.fetchedAt : Math.max(idleAt, ST.G.fetchedAt), s = Math.round((Date.now() - ts) / 1000);
  const ago = s < 60 ? tt(`قبل ${s} ث`, `${s}s ago`) : s < 3600 ? tt(`قبل ${Math.round(s / 60)} د`, `${Math.round(s / 60)}m ago`) : tt(`قبل ${Math.round(s / 3600)} س`, `${Math.round(s / 3600)}h ago`);
  if (FPL.staleState.on) { el.className = 'fresh stale'; el.querySelector('span').textContent = tt('الفانتازي يتحدّث', 'FPL updating'); return; }
  el.className = 'fresh ' + (embed ? '' : lm ? 'live' : 'ok');
  el.querySelector('span').textContent = embed || (lm ? tt('مباشر · ', 'Live · ') + ago : tt('محدّث ', 'Updated ') + ago);
}
export function startLivePolling() {
  clearInterval(poll); clearInterval(freshT); lastFetch = lastFetch || Date.now(); idleAt = Date.now();
  const step = () => { if (!ST.G || document.hidden) return; if (liveMode()) { if (Date.now() - lastFetch >= 1.5e3) refreshLive(true); } else if (Date.now() - idleAt >= 2 * 60e3) idleRefresh(); };
  poll = setInterval(step, 1000); freshT = setInterval(freshness, 5000); freshness();
  if (!window.__visBound) { window.__visBound = 1; document.addEventListener('visibilitychange', () => { if (!document.hidden && ST.G) { if (liveMode()) refreshLive(true); else if (Date.now() - idleAt > 20e3) idleRefresh(); } }); }
  if (liveMode()) refreshLive(true);
}

export function vLive() {
  // الجولة الافتراضية: الجولة الحالية لحد ما تخلص كل مبارياتها، وبعدها الجولة الجاية (إلا إذا المستخدم اختار جولة بنفسه)
  const G = ST.G, curFx = G.fx[G.cur] || [], curOpen = !curFx.length || curFx.some((f) => !f.fin);
  if (!gwUser || gwSel == null) gwSel = curOpen || !G.next ? G.cur : G.next;
  const fx = (G.fx[gwSel] || []).slice().sort((a, b) => (a.ko || '').localeCompare(b.ko || ''));
  const live = gwSel === G.cur && isLiveGW(G.cur);
  const squad = ST.plan ? new Set([...ST.plan.xi, ...ST.plan.bench]) : new Set();
  const myTeams = new Set([...squad].map((id) => PM(id)?.team));
  const lp = gwSel === G.cur ? liveTeamPoints() : null;
  const byDay = {}; fx.forEach((f) => { const k = f.ko ? new Date(f.ko).toDateString() : 'tbd'; (byDay[k] = byDay[k] || []).push(f); });
  return `<div class="stadium"><div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;gap:10px"><div><div style="font-size:12.5px;opacity:.85">${tt('مركز المباريات', 'Match centre')}</div><div style="font-size:28px;font-weight:700">${t('gw')} ${gwSel}</div>${live ? `<span class="livebadge">${tt('مباشر', 'LIVE')}</span>` : ''}</div>
    ${lp != null ? `<div style="text-align:end"><div style="font-size:12px;opacity:.85">${tt('نقاط فريقك', 'Your points')}</div><div class="score" style="font-size:40px;color:#34D399">${lp}</div></div>` : ''}</div></div>
   <div class="seg" id="lvseg" style="margin:12px 0">${Array.from({ length: G.lastGW }, (_, i) => i + 1).map((g) => `<button class="${g === gwSel ? 'on' : ''}" onclick="lvGW(${g})">${g}</button>`).join('')}</div>
   ${live ? `<div class="mut" style="font-size:11.5px;text-align:center;margin-bottom:8px">${tt('يتحدّث تلقائياً كل ثواني', 'Auto-refreshes every few seconds')} · <button class="more" style="display:inline" onclick="lvRefresh()">${I('i-refresh', 'i', 'width:13px;height:13px')} ${t('refresh')}</button></div>` : ''}
   ${LU2() && gwSel >= (G.cur || 0) && (LU2DEMO() || fx.some(luPre)) ? lu2Section(fx, gwSel) : ''}
   ${Object.values(byDay).map((list) => `<div class="sec" style="margin:12px 2px 8px"><h2 style="font-size:14px">${I('i-cal', 'i', 'width:16px;height:16px')}${list[0].ko ? new Date(list[0].ko).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' }) : tt('غير محدد', 'TBD')}</h2></div>${list.map((f) => fxCard(f, myTeams)).join('')}`).join('') || `<div class="empty"><b>${t('noData')}</b></div>`}
   ${gwSel === G.cur && ST.E.picks && ST.live ? `<div class="sec" style="margin:16px 2px 8px"><h2 style="font-size:14px">${I('i-pitch', 'i', 'width:16px;height:16px')}${tt('فريقك مباشر', 'Your team live')}</h2></div>${myLiveBlock()}` : ''}
   <p class="mut" style="font-size:11.5px;text-align:center;margin-top:10px">${tt('النتائج والنقاط والبونص من الفانتازي الرسمي مباشرة — بدون توقعات.', 'Scores, points and bonus straight from official FPL — no estimates.')}</p>`;
}
function fxCard(f, myTeams) {
  const st = f.fin ? tt('انتهت', 'FT') : f.started ? fxMin(f) : f.ko ? new Date(f.ko).toLocaleTimeString(document.documentElement.lang === 'en' ? 'en-GB' : 'ar-IQ', { hour: 'numeric', minute: '2-digit' }) : '—';
  const mine = myTeams.has(f.h) || myTeams.has(f.a);
  return `<div class="card tap" style="margin-bottom:8px;${mine ? 'border-color:rgba(var(--acc-rgb),.3)' : ''}" onclick="openMatchC(${f.id},${f.ev})"><div class="fx-card"><div class="tm">${crest(tShort(f.h), 38)}${tName(f.h)}</div><div class="mid">${f.started ? `<div>${scoreHTML(f.hs, f.as)}</div>` : ''}<span class="${f.started && !f.fin ? 'livebadge' : 'mut'}" style="font-size:11.5px">${st}</span></div><div class="tm">${crest(tShort(f.a), 38)}${tName(f.a)}</div></div></div>`;
}
function myLiveBlock() {
  const calc = liveCalc(ST.E.picks, ST.G.cur); if (!calc) return '';
  const R = rankImpact(calc), lr = officialRank();
  const subs = calc.subs.map((x) => `<span class="mv" dir="ltr">${esc(PM(x.out)?.name)}<i class="mv-a">→</i>${esc(PM(x.in)?.name)}</span>`).join('، ');
  const pbN = calc.rows.filter((r) => r.bonus && r.m).reduce((a, r) => a + r.bonus * r.m, 0);
  const row = (r) => { const p = PM(r.id); if (!p) return ''; const s = ST.live[r.id] || {}; const g = R.gains.find((x) => x.p.id === r.id);
    const ev = [s.goals_scored ? `${I('i-goal', 'i', 'width:12px;height:12px;vertical-align:-2px')}×${s.goals_scored}` : '', s.assists ? `A×${s.assists}` : '', s.yellow_cards ? '<i style="display:inline-block;width:8px;height:11px;background:#FACC15;border-radius:2px;vertical-align:-1px"></i>' : '', s.red_cards ? '<i style="display:inline-block;width:8px;height:11px;background:#EF4444;border-radius:2px;vertical-align:-1px"></i>' : '', r.bonus ? `<span class="tag cyan" style="padding:0 5px">+${r.bonus} ${tt('بونص', 'bonus')}</span>` : ''].filter(Boolean).join(' ');
    return `<div class="row tap" onclick="playerGW(${p.id},${ST.G.cur},${Math.max(1, r.m)})" style="${r.m === 0 ? 'opacity:.55' : ''}"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)}${r.m > 1 ? ` <span class="tag" style="background:var(--gold);color:#1C1404">×${r.m}</span>` : ''}${r.subIn ? ` <span class="tag lime">${tt('دخل تلقائياً', 'auto-in')}</span>` : ''}${r.subOut ? ` <span class="tag red">${tt('طلع', 'out')}</span>` : ''}</b><span>${r.min}′ ${ev} · EO ${g ? g.eo : '—'}%</span></div>${g ? `<div class="col" style="min-width:52px"><span class="${g.gain >= 0 ? 'up' : 'down'}">${g.gain >= 0 ? '▲' : '▼'}${Math.abs(g.gain)}</span><small>${tt('مقابل الكل', 'vs field')}</small></div>` : ''}<div class="col" style="font-size:17px;color:var(--acc)">${r.pts * Math.max(1, r.m)}<small>${tt('نقطة', 'pts')}</small></div></div>`; };
  return `<div class="card" style="margin-bottom:12px"><div class="kv" style="margin-top:0"><div><b style="color:var(--acc);font-size:22px">${calc.total}</b><span>${tt('نقاطك المباشرة', 'Live points')}${calc.hit ? ` (−${calc.hit})` : ''}</span></div><div><b>${lr.rank ? fmt(lr.rank) : '—'}</b><span>${tt('الترتيب العام', 'Overall rank')}${lr.move ? ` <em class="${lr.move >= 0 ? 'up' : 'down'}" style="font-style:normal">${lr.move >= 0 ? '▲' : '▼'}${fmt(Math.abs(lr.move))}</em>` : ''}</span></div><div><b>${R.safety}</b><span>${tt('نقاط الأمان', 'Safety score')}</span></div></div>
    ${pbN ? `<div class="note" style="margin-top:0">${I('i-star', 'i', 'color:var(--info)')}<span>${tt(`ضمن نقاطك ${pbN} نقطة بونص حسب الفانتازي المباشر.`, `Includes ${pbN} live FPL bonus points.`)}</span></div>` : ''}
    ${subs ? `<div class="note">${I('i-swap', 'i', 'color:var(--acc)')}<span>${tt('تبديلات تلقائية', 'Auto-subs')}: ${subs}</span></div>` : ''}
    ${calc.capOut ? `<div class="note">${I('i-crown', 'i', 'color:var(--gold)')}<span>${tt('الكابتن ما لعب، فالنائب صار كابتن.', 'Captain did not play — vice captain doubled.')}</span></div>` : ''}
    <div class="flex" style="gap:8px;margin-top:10px"><button class="btn btn-g btn-sm" style="flex:1" onclick="openWhatIf()">${I('i-lab', 'i', 'width:16px;height:16px')}${tt('ماذا لو؟', 'What if?')}</button><button class="btn btn-g btn-sm" style="flex:1" onclick="openThreats()">${I('i-alert', 'i', 'width:16px;height:16px')}${tt('التهديدات', 'Threats')}</button></div></div>
   <div class="list" style="margin-bottom:12px">${calc.rows.slice().sort((a, b) => b.m - a.m || b.pts - a.pts).map(row).join('')}</div>
   <p class="mut" style="font-size:11.5px;margin:-4px 2px 12px">${tt('EO = الملكية الفعلية التقديرية (الملكية + الكابتن). السهم الأخضر يعني اللاعب يصعّد ترتيبك لأنك مستفيد منه أكثر من باقي المدربين.', 'EO = estimated effective ownership. Green arrow = player is gaining you rank.')}</p>`;
}
window.openThreats = () => {
  const calc = liveCalc(ST.E.picks, ST.G.cur); if (!calc) return; const R = rankImpact(calc);
  openSheet(`${sheetHead(I('i-alert'), tt('التهديدات حول ترتيبك', 'Threats around your rank'), tt('لاعبين ما عندك وملكيتهم عالية — كل نقطة يجيبونها تنزّلك', 'High-EO players you don\'t own'))}
   <div class="list">${R.threats.map((x) => `<div class="row tap" onclick="openPlayer(${x.p.id})"><div class="mini">${pShirt(x.p)}</div><div class="info"><b>${esc(x.p.name)}</b><span>EO ${x.eo}% · ${x.pts} ${tt('نقطة', 'pts')}</span></div><div class="col"><span class="down">▼${Math.abs(x.gain)}</span><small>${tt('مقابل الكل', 'vs field')}</small></div></div>`).join('') || `<p class="mut">${t('noData')}</p>`}</div>`);
};
let wiP = null;
window.openWhatIf = () => {
  const calc = liveCalc(ST.E.picks, ST.G.cur); if (!calc) return;
  const cand = [...calc.rows.filter((r) => r.m > 0).map((r) => PM(r.id)), ...rankImpact(calc).threats.slice(0, 6).map((x) => x.p)].filter(Boolean);
  if (!wiP) wiP = cand[0]?.id;
  const EV = [['goal', tt('هدف', 'Goal')], ['assist', tt('صناعة', 'Assist')], ['cs', tt('شباك نظيفة', 'Clean sheet')], ['bonus3', tt('3 بونص', '3 bonus')], ['yellow', tt('صفراء', 'Yellow')], ['red', tt('حمراء', 'Red')]];
  const lp = calc.total, R = rankImpact(calc), base = liveRankEstimate(lp, R.safety);
  openSheet(`${sheetHead(I('i-lab'), tt('ماذا لو؟', 'What if?'), tt('شوف شلون يتغير ترتيبك إذا صار حدث', 'See how an event would move your rank'))}
   <div class="seg" style="margin-bottom:10px">${cand.map((p) => `<button class="${wiP === p.id ? 'on' : ''}" onclick="wiSet(${p.id})">${esc(p.name)}</button>`).join('')}</div>
   <div class="list">${EV.map(([k, l]) => { const w = whatIf(calc, wiP, k); const nr = base ? liveRankEstimate(lp + w.me, R.safety + w.field) : null; return `<div class="row"><div class="info"><b>${l}</b><span>${tt('نقاطك', 'You')} ${w.me >= 0 ? '+' : ''}${w.me} · ${tt('المعدل', 'Field')} ${w.field >= 0 ? '+' : ''}${w.field}</span></div><div class="col" style="min-width:90px"><span class="${w.net >= 0 ? 'up' : 'down'}">${w.net >= 0 ? '+' : ''}${w.net}</span><small>${nr && base ? `${tt('ترتيب', 'rank')} ${nr.rank < base.rank ? '▲' : nr.rank > base.rank ? '▼' : ''}${fmt(Math.abs(base.rank - nr.rank))}` : ''}</small></div></div>`; }).join('')}</div>
   <p class="mut" style="font-size:11.5px;margin-top:8px">${tt('تقديري: محسوب من الملكية الفعلية التقديرية وتوزيع النقاط.', 'Estimate based on estimated EO.')}</p>`);
};
window.wiSet = (id) => { wiP = id; window.openWhatIf(); };
/* =========================================================
   صفحة المباراة — تصميم احترافي:
   لوحة النتيجة بألوان الفريقين · أحداث المباراة لكل فريق بأيقونات
   · البونص ونقاط BPS · المساهمات الدفاعية · ترتيب نقاط الفانتازي بالمباراة · لاعبينك
========================================================= */
const mcLive = {}; let mcTimer = 0;
function mcTick(g) {
  const el = document.getElementById('mcBody'); if (!el) return;
  const fid = +el.dataset.fid, f = (ST.G.fx[g] || []).find((x) => x.id === fid); if (!f) return;
  mcLive[g] = ST.live; morphHTML(el, mcBody(f, g));
}
const DCT = (id) => ({ DEF: 10, MID: 12, FWD: 12 })[PM(id)?.pos] || 99;
const nmOf = (id) => esc(PM(id)?.name || '#' + id);
/* ---------- مركز المباراة بالتصميم الجديد : كل لاعب بعمود فريقه بكل الخانات ---------- */
/* أيقونات خانات مركز المباراة — مرسومة خصيصاً وكل وحدة بلون مميز */
const M2I = {
  goal: ['#34D399', '<circle cx="12" cy="12" r="9.3" fill="#fff"/><path d="M12 7.4l3 2.2-1.1 3.6h-3.8L9 9.6z" fill="#0B1220"/><path d="M12 2.7v4.7M15 9.6l4.5-1.5M13.9 13.2l2.7 3.9M10.1 13.2l-2.7 3.9M9 9.6L4.5 8.1" stroke="#0B1220" stroke-width="1.2" fill="none"/><circle cx="12" cy="12" r="9.3" fill="none" stroke="#0B1220" stroke-width=".8" opacity=".35"/>'],
  assist: ['#22D3EE', '<path d="M6.5 15.5C9 9 13.5 6.2 19 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="2.2 2.6"/><path d="M15.6 3.3L19.4 6l-2.9 3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5.6" cy="18" r="3.2" fill="#fff"/><path d="M5.6 15.9l1.4 1-.5 1.7H4.7l-.5-1.7z" fill="#0B1220"/>'],
  cards: ['#FBBF24', '<rect x="4.2" y="4.6" width="9.4" height="13.4" rx="1.8" transform="rotate(-12 8.9 11.3)" fill="#FACC15"/><rect x="10.4" y="6.4" width="9.4" height="13.4" rx="1.8" transform="rotate(10 15.1 13.1)" fill="#EF4444" stroke="#0B1220" stroke-width=".8"/>'],
  pens: ['#F87171', '<path d="M3 17.5V5.5h18v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 9.5h18M3 13.5h18M7.5 5.5v12M12 5.5v12M16.5 5.5v12" stroke="currentColor" stroke-width=".8" opacity=".5"/><circle cx="12" cy="20.6" r="1.9" fill="#fff"/>'],
  saves: ['#60A5FA', '<path d="M8.2 21.2v-3.6l-2.9-3.9a1.6 1.6 0 0 1 2.5-2l1.3 1.5V5.6a1.5 1.5 0 0 1 3 0v5.1V4.2a1.5 1.5 0 0 1 3 0v6.5V5.4a1.5 1.5 0 0 1 3 0v9.4c0 3.6-2.1 6.4-5.4 6.4z" fill="currentColor"/><path d="M8.2 18.4h8.6" stroke="#0B1220" stroke-width="1.3"/>'],
  bonus: ['#FBBF24', '<path d="M7.6 2.5l2.6 6M16.4 2.5l-2.6 6" stroke="#F472B6" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="14.4" r="7" fill="currentColor"/><path d="M12 10.3l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="#0B1220"/>'],
  dc: ['#FB923C', '<path d="M12 2.6l7.8 2.9v5.9c0 5-3.4 8.6-7.8 10-4.4-1.4-7.8-5-7.8-10V5.5z" fill="currentColor"/><path d="M8.5 12.2l2.4 2.4 4.7-5" fill="none" stroke="#0B1220" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>'],
  pts: ['#A78BFA', '<rect x="3" y="12.5" width="5.2" height="8.5" rx="1" fill="currentColor" opacity=".7"/><rect x="9.4" y="8" width="5.2" height="13" rx="1" fill="currentColor"/><rect x="15.8" y="15" width="5.2" height="6" rx="1" fill="currentColor" opacity=".5"/><path d="M12 2.4l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="#FBBF24"/>'],
};
const m2i = (k) => `<span class="m2ic" style="--ic:${M2I[k][0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${M2I[k][1]}</svg></span>`;
let mc2F = '';
const MC2 = () => true; // صار للكل
function mc2(f, ev, st, L, live) {
  const open = (id) => `onclick="closeSheet();setTimeout(()=>playerGW(${id},${ev}),200)"`;
  const chip = (id, extra = '', cls = '') => `<button class="m2c ${cls}" ${open(id)}><span class="m2n">${nmOf(id)}</span>${extra}</button>`;
  const val = (v, cls = '') => `<b class="m2v ${cls}" dir="ltr">${v}</b>`;
  const none = '<span class="m2none">—</span>';
  const bpsOf = (id) => [...st('bps').h, ...st('bps').a].find((y) => y.element === id)?.value;
  const side = (fn) => ['h', 'a'].map((s) => `<div class="m2s ${s}">${fn(s) || none}</div>`).join('');
  const row = (icon, label, fn, cls = '') => { const H = fn('h'), A = fn('a'); if (!H && !A) return ''; return `<section class="m2row ${cls}"><h5>${icon}<span>${label}</span></h5><div class="m2cols">${side(fn)}</div></section>`; };
  // ركلات الجزاء من ESPN: نربط لاعب ESPN بلاعب الفانتازي
  const PEN = {}; { const ld = LU[f.id]?.d; (ld?.pens || []).forEach((k) => { const sd = k.side || 'h', pl = ld.sides?.[sd]?.players || []; const e = pl.find((x) => x.id === k.id); if (!e) return; const fp = mapFPL([e], sd === 'h' ? f.h : f.a)[e.id]; if (!fp) return; const o = PEN[fp.id] || (PEN[fp.id] = { s: 0, m: 0 }); k.scored ? o.s++ : o.m++; }); }
  const penTag = (id, n) => { const o = PEN[id]; if (!o?.s) return ''; return `<small class="m2t pen">(${o.s > 1 || n > 1 ? `${o.s} ` : ''}${tt('ركلة جزاء', 'pen')})</small>`; };
  const goals = (s) => st('goals_scored')[s].map((x) => chip(x.element, (x.value > 1 ? val('×' + x.value) : '') + penTag(x.element, x.value))).join('') + st('own_goals')[s === 'h' ? 'a' : 'h'].map((x) => chip(x.element, `<small class="m2t bad">${tt('عكسي', 'OG')}</small>`, 'og')).join('');
  const assists = (s) => st('assists')[s].map((x) => chip(x.element, x.value > 1 ? val('×' + x.value) : '')).join('');
  const cards = (s) => st('yellow_cards')[s].map((x) => chip(x.element, '<i class="m2card y"></i>')).join('') + st('red_cards')[s].map((x) => chip(x.element, '<i class="m2card r"></i>', 'red')).join('');
  const pens = (s) => st('penalties_missed')[s].map((x) => chip(x.element, `<small class="m2t bad">(${x.value > 1 ? x.value + ' ' : ''}${tt('أضاع ركلة جزاء', 'missed pen')})</small>`)).join('') + st('penalties_saved')[s].map((x) => chip(x.element, `<small class="m2t ok">${tt('صد', 'save')}</small>`)).join('');
  const saves = (s) => [...st('saves')[s]].sort((a, b) => b.value - a.value).map((x) => chip(x.element, val(x.value))).join('');
  const hasBonus = st('bonus').h.length || st('bonus').a.length;
  const bonus = (s) => hasBonus
    ? [...st('bonus')[s]].sort((a, b) => b.value - a.value).map((x) => `<button class="m2bn b${x.value}" ${open(x.element)}><i class="m2bi"><span>${x.value}</span></i><span class="m2bt"><span class="m2n">${nmOf(x.element)}</span></span>${bpsOf(x.element) != null ? `<span class="m2bp" dir="ltr"><b>${bpsOf(x.element)}</b><small>BPS</small></span>` : ''}</button>`).join('')
    : [...st('bps')[s]].sort((a, b) => b.value - a.value).slice(0, 3).map((x) => chip(x.element, val(x.value), 'bpsc')).join('');
  const dc = (s) => { const arr = st('defensive_contribution')[s]; const got = arr.filter((x) => x.value >= DCT(x.element)).sort((a, b) => b.value - a.value), near = arr.filter((x) => x.value < DCT(x.element) && x.value >= DCT(x.element) - 2).sort((a, b) => b.value - a.value);
    return got.map((x) => chip(x.element, val(x.value) + '<em class="m2plus">+2</em>', 'dc')).join('') + near.map((x) => chip(x.element, val(`${x.value}/${DCT(x.element)}`), 'near')).join(''); };
  const fp = (s) => { if (!L) return ''; const tm = s === 'h' ? f.h : f.a; const rows = ST.G.players.filter((p) => p.team === tm && L[p.id]?.minutes > 0).map((p) => ({ p, pts: L[p.id].total_points, min: L[p.id].minutes })).sort((a, b) => b.pts - a.pts).slice(0, 5); const mx = Math.max(1, ...rows.map((r) => r.pts));
    return rows.map((r) => `<button class="m2fp" ${open(r.p.id)}><span class="m2sh">${pShirt(r.p)}</span><span class="m2fn"><span class="m2n">${esc(r.p.name)}</span><span class="m2sub"><small dir="ltr">${r.min}′</small><span class="m2bar"><i style="width:${(Math.max(0, r.pts) / mx) * 100}%"></i></span></span></span>${val(r.pts, 'big')}</button>`).join(''); };
  const on = (x) => (mc2F === x ? 'on' : '');
  const head = `<div class="m2head"><button class="${on('')}" onclick="mc2Focus(this,'')">${tt('الكل', 'Both')}</button><button class="${on('h')}" onclick="mc2Focus(this,'h')">${crest(tShort(f.h), 16)}${tName(f.h)}</button><button class="${on('a')}" onclick="mc2Focus(this,'a')">${crest(tShort(f.a), 16)}${tName(f.a)}</button></div>`;
  const KH = KITS[tShort(f.h)]?.b || '#334155', KA = KITS[tShort(f.a)]?.b || '#334155';
  return `<div class="m2" data-f="${mc2F}" style="--kh:${KH};--ka:${KA}">${head}
    <div class="m2box">
      ${row(m2i('goal'), t('goals'), goals)}
      ${row(m2i('assist'), t('assists'), assists)}
      ${row(m2i('cards'), tt('البطاقات', 'Cards'), cards)}
      ${row(m2i('pens'), tt('ضربات جزاء', 'Penalties'), pens)}
      ${row(m2i('saves'), tt('تصديات', 'Saves'), saves)}
    </div>
    <div class="m2box neon-box">${row(m2i('bonus'), hasBonus ? tt('البونص', 'Bonus') : tt('ترتيب BPS', 'BPS leaders'), bonus, 'bonus') || `<section class="m2row bonus"><h5>${m2i('bonus')}<span>${tt('البونص', 'Bonus')}</span></h5><p class="m2wait">${tt('بانتظار بونص الفانتازي', 'Awaiting FPL bonus')}</p></section>`}${hasBonus && live ? `<p class="m2note">${tt('من الفانتازي مباشرة — ممكن يتغير لحد نهاية المباراة', 'Live from FPL — may change until full time')}</p>` : ''}</div>
    ${st('defensive_contribution').h.length || st('defensive_contribution').a.length ? `<div class="m2box">${row(m2i('dc'), tt('المساهمات الدفاعية', 'Defensive contributions'), dc)}<p class="m2note">${tt('مدافع 10 · وسط ومهاجم 12', 'DEF 10 · MID/FWD 12')}</p></div>` : ''}
    ${L ? `<div class="m2box">${row(m2i('pts'), tt('أعلى نقاط فانتازي', 'Top fantasy points'), fp, 'fp')}</div>` : ''}
  </div>`;
}
window.mc2Focus = (b, s) => { mc2F = s; const m = b.closest('.m2'); m.dataset.f = s; m.querySelectorAll('.m2head button').forEach((x) => x.classList.toggle('on', x === b)); };

function mcBody(f, ev) {
  const FS = fxStats(f, ev); // أحداث المباراة من أحدث بيانات الفانتازي المباشرة
  const st = (k) => FS.find((x) => x.identifier === k) || { h: [], a: [] };
  const KH = KITS[tShort(f.h)]?.b || '#334155', KA = KITS[tShort(f.a)]?.b || '#334155';
  const L = mcLive[ev], live = f.started && !f.fin;
  const status = !f.started ? `<span class="mc-ko">${f.ko ? new Date(f.ko).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'VS'}</span>` : live ? `<span class="mc-live${isHT(f) ? ' ht' : ''}"><i></i>${fxMin(f)}</span>` : `<span class="mc-ft">${tt('انتهت', 'Full time')}</span>`;
  const board = `<div class="mc-board" style="--kh:${KH};--ka:${KA}">
    <div class="mc-team">${crest(tShort(f.h), 58)}<b>${tName(f.h)}</b>${f.hd ? `<span class="rate f${f.hd}">${tt('صعوبة', 'FDR')} ${f.hd}</span>` : ''}</div>
    <div class="mc-mid">${f.started ? scoreHTML(f.hs, f.as, 'mc-score') : ''}${status}</div>
    <div class="mc-team">${crest(tShort(f.a), 58)}<b>${tName(f.a)}</b>${f.ad ? `<span class="rate f${f.ad}">${tt('صعوبة', 'FDR')} ${f.ad}</span>` : ''}</div></div>`;
  if (!f.started) return board + `<div class="mc-empty">${I('i-clock', 'i', 'width:28px;height:28px')}<b>${tt('المباراة بعدها ما بدت', 'Not started yet')}</b><span>${fmtTime(f.ko)}</span></div>` + mineBlock(f, ev);
  if (MC2()) return board + mc2(f, ev, st, L, live) + ((L && f.started) || LU[f.id]?.d ? lineupBox(f, ev, L) : '') + mineBlock(f, ev);
  // صف حدث بعمودين
  const evRow = (icon, label, side) => { const H = side(st, 'h'), A = side(st, 'a'); if (!H && !A) return ''; return `<div class="mc-ev"><div class="mc-side h">${H || '<span class="mc-none">—</span>'}</div><div class="mc-lbl">${icon}<span>${label}</span></div><div class="mc-side a">${A || '<span class="mc-none">—</span>'}</div></div>`; };
  const list = (key, extra = (x) => (x.value > 1 ? `<small>×${x.value}</small>` : '')) => (S, side) => S(key)[side].map((x) => `<button class="mc-chip" onclick="closeSheet();setTimeout(()=>playerGW(${x.element},${ev}),200)">${nmOf(x.element)}${extra(x)}</button>`).join('');
  const goalsOwn = (S, side) => { const g = list('goals_scored')(S, side), og = S('own_goals')[side === 'h' ? 'a' : 'h'].map((x) => `<span class="mc-chip og">${nmOf(x.element)}<small>${tt('عكسي', 'OG')}</small></span>`).join(''); return g + og; };
  const cards = (S, side) => S('yellow_cards')[side].map((x) => `<span class="mc-chip"><i class="mc-card y"></i>${nmOf(x.element)}</span>`).join('') + S('red_cards')[side].map((x) => `<span class="mc-chip"><i class="mc-card r"></i>${nmOf(x.element)}</span>`).join('');
  const pens = (S, side) => S('penalties_missed')[side].map((x) => `<span class="mc-chip">${nmOf(x.element)}<small>${tt('أضاع جزاء', 'pen miss')}</small></span>`).join('') + S('penalties_saved')[side].map((x) => `<span class="mc-chip">${nmOf(x.element)}<small>${tt('صد جزاء', 'pen save')}</small></span>`).join('');
  const bonusSide = (S, side) => S('bonus')[side].sort((a, b) => b.value - a.value).map((x) => `<span class="mc-chip bn b${x.value}"><i>${x.value}</i>${nmOf(x.element)}</span>`).join('');
  const dcSide = (S, side) => { const arr = S('defensive_contribution')[side]; const got = arr.filter((x) => x.value >= DCT(x.element)).sort((a, b) => b.value - a.value), near = arr.filter((x) => x.value < DCT(x.element) && x.value >= DCT(x.element) - 2).sort((a, b) => b.value - a.value);
    return got.map((x) => `<span class="mc-chip dc">${nmOf(x.element)}<small dir="ltr">${x.value}</small><em>+2</em></span>`).join('') + near.map((x) => `<span class="mc-chip near">${nmOf(x.element)}<small dir="ltr">${x.value}/${DCT(x.element)}</small></span>`).join(''); };
  const events = `<div class="mc-card-box">
    ${evRow(I('i-goal', 'i', 'width:15px;height:15px'), t('goals'), goalsOwn)}
    ${evRow('<b class="mc-a">A</b>', t('assists'), list('assists'))}
    ${evRow('<i class="mc-card y" style="margin:0"></i>', tt('البطاقات', 'Cards'), cards)}
    ${evRow(I('i-target', 'i', 'width:15px;height:15px'), tt('ضربات جزاء', 'Penalties'), pens)}
    ${evRow(I('i-shield', 'i', 'width:15px;height:15px'), tt('تصديات', 'Saves'), list('saves', (x) => `<small>${x.value}</small>`))}
  </div>`;
  const bps = st('bps'), topB = [...bps.h.map((x) => ({ ...x, s: 'h' })), ...bps.a.map((x) => ({ ...x, s: 'a' }))].sort((a, b) => b.value - a.value).slice(0, 3);
  const hasBonus = st('bonus').h.length || st('bonus').a.length;
  const bonusBox = `<div class="mc-sec"><h4>${I('i-star', 'i', 'width:15px;height:15px')}${hasBonus ? tt('البونص', 'Bonus') : tt('ترتيب BPS', 'BPS leaders')}${hasBonus && live ? `<small>${tt('من الفانتازي مباشرة', 'live from FPL')}</small>` : !hasBonus && f.started ? `<small>${tt('بانتظار بونص الفانتازي', 'Awaiting FPL bonus')}</small>` : ''}</h4>
    ${hasBonus ? `<div class="mc-bps">${[...st('bonus').h.map((x) => ({ ...x, s: 'h' })), ...st('bonus').a.map((x) => ({ ...x, s: 'a' }))].sort((a, b) => b.value - a.value || (bps.h.concat(bps.a).find((y) => y.element === b.element)?.value || 0) - (bps.h.concat(bps.a).find((y) => y.element === a.element)?.value || 0)).map((x) => `<div><i class="b${x.value}">${x.value}</i><b>${nmOf(x.element)}</b><small dir="ltr">${tShort(x.s === 'h' ? f.h : f.a)}${(() => { const v = bps.h.concat(bps.a).find((y) => y.element === x.element)?.value; return v != null ? ` · BPS ${v}` : ''; })()}</small></div>`).join('')}</div>` : topB.length ? `<div class="mc-bps">${topB.map((x) => `<div><i class="bn">BPS</i><b>${nmOf(x.element)}</b><small><bdi>${tShort(x.s === 'h' ? f.h : f.a)}</bdi> · ${x.value}</small></div>`).join('')}</div>` : '<p class="mc-none">—</p>'}
  </div>`;
  const dcH = dcSide(st, 'h'), dcA = dcSide(st, 'a');
  const dcBox = st('defensive_contribution').h.length || st('defensive_contribution').a.length ? `<div class="mc-sec"><h4>${I('i-shield', 'i', 'width:15px;height:15px')}${tt('المساهمات الدفاعية', 'Defensive contributions')}<small>${tt('مدافع 10 · وسط ومهاجم 12', 'DEF 10 · MID/FWD 12')}</small></h4>
    <div class="mc-two"><div class="mc-side h">${dcH || '<span class="mc-none">—</span>'}</div><div class="mc-side a">${dcA || '<span class="mc-none">—</span>'}</div></div></div>` : '';
  // ترتيب نقاط الفانتازي بالمباراة
  let fpBox = '';
  if (L) {
    const rows = ST.G.players.filter((p) => (p.team === f.h || p.team === f.a) && L[p.id]?.minutes > 0).map((p) => ({ p, pts: L[p.id].total_points, min: L[p.id].minutes })).sort((a, b) => b.pts - a.pts).slice(0, 8);
    const mx = Math.max(1, ...rows.map((r) => r.pts));
    if (rows.length) fpBox = `<div class="mc-sec"><h4>${I('i-chart', 'i', 'width:15px;height:15px')}${tt('أعلى نقاط فانتازي بالمباراة', 'Top fantasy points')}</h4>
      ${rows.map((r, k) => `<button class="mc-fp" onclick="closeSheet();setTimeout(()=>playerGW(${r.p.id},${ev}),200)"><span class="mc-rk">${k + 1}</span><span class="mini-sh">${pShirt(r.p)}</span><span class="mc-fpn"><b>${esc(r.p.name)}</b><small><bdi>${tShort(r.p.team)}</bdi> · ${r.min}′</small></span><span class="mc-bar"><i style="width:${(Math.max(0, r.pts) / mx) * 100}%"></i></span><b class="num mc-pts">${r.pts}</b></button>`).join('')}</div>`;
  }
  return board + events + bonusBox + dcBox + fpBox + ((L && f.started) || LU[f.id]?.d ? lineupBox(f, ev, L) : '') + mineBlock(f, ev);
}

/* ---------- تشكيلة الفريقين بالمباراة (من دقائق اللعب والـ starts بالفانتازي) ---------- */
let mcSide = 'h';
function matchLineup(f, L, team) {
  const ps = ST.G.players.filter((p) => p.team === team && L[p.id]?.minutes > 0).map((p) => ({ p, s: L[p.id] }));
  if (!ps.length) return null;
  const hasStarts = ps.some((x) => x.s.starts != null);
  let st, sb;
  if (hasStarts) { st = ps.filter((x) => x.s.starts > 0); sb = ps.filter((x) => !(x.s.starts > 0)); }
  else { const srt = [...ps].sort((a, b) => b.s.minutes - a.s.minutes); st = srt.slice(0, 11); sb = srt.slice(11); }
  const total = f.fin ? 90 : Math.max(1, Math.min(90, f.min || 0));
  // نربط كل بديل باللاعب اللي طلع (نفس المركز ومجموع الدقائق أقرب للمباراة)
  const offs = st.filter((x) => x.s.minutes < total - 1 && !x.s.red_cards), pair = new Map(), used = new Set();
  [...sb].sort((a, b) => b.s.minutes - a.s.minutes).forEach((on) => {
    const score = (o) => Math.abs(o.s.minutes + on.s.minutes - total) + (o.p.pos === on.p.pos ? 0 : 25);
    const cand = offs.filter((o) => !used.has(o.p.id)).sort((a, b) => score(a) - score(b))[0];
    if (cand) { used.add(cand.p.id); pair.set(cand.p.id, on); }
  });
  // بدلاء ما انربطوا: غالباً دخلوا بالوقت بدل الضايع واللي طلع محسوبله 90 دقيقة — نربطهم بأقرب لاعب بنفس المركز (تقريبي)
  const approx = new Set();
  [...sb].filter((x) => ![...pair.values()].includes(x)).sort((a, b) => a.s.minutes - b.s.minutes).forEach((on) => {
    const pool = st.filter((o) => !used.has(o.p.id) && !o.s.red_cards);
    const cand = pool.sort((a, b) => (a.p.pos === on.p.pos ? 0 : 1) - (b.p.pos === on.p.pos ? 0 : 1) || (a.s.bps ?? 0) - (b.s.bps ?? 0))[0];
    if (cand) { used.add(cand.p.id); pair.set(cand.p.id, on); approx.add(cand.p.id); }
  });
  const leftover = sb.filter((x) => ![...pair.values()].includes(x));
  return { st, pair, leftover, approx, offs: st.filter((x) => pair.has(x.p.id)) };
}

/* ---------- التشكيلة الرسمية والتبديلات الحقيقية (من /api/lineups) ---------- */
const LU = {};
const nrm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z]/g, '');
const lastTok = (x) => nrm(String(x || '').trim().split(/\s+/).pop());
function loadLU(f, ev, force = false) {
  const c = LU[f.id]; if (c?.busy) return; const empty = !c?.d || !Object.values(c.d.sides || {}).some((x) => x.players?.length);
  if (!force && c && (Date.now() - c.at < 40e3 || (!empty && !(f.started && !f.fin)))) return;
  LU[f.id] = { ...(c || {}), busy: true };
  fetch(`/api/lineups?ko=${encodeURIComponent(f.ko)}&h=${tShort(f.h)}&a=${tShort(f.a)}&v=2`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
    LU[f.id] = { d: d?.sides && Object.keys(d.sides).length ? d : c?.d || null, at: Date.now() };
    const el = document.getElementById('mcBody'); if (el && el.dataset.fid == f.id) morphHTML(el, mcBody(f, ev));
  });
}
/** ربط لاعبي ESPN بلاعبي الفانتازي بالاسم */
export function mapFPL(players, team) {
  const pool = ST.G.players.filter((p) => p.team === team), used = new Set(), out = {};
  const tests = [
    (e, p) => nrm(p.full) === nrm(e.name),
    (e, p) => nrm(p.name) === nrm(e.name) || nrm(p.name) === nrm(e.last) || nrm(p.name) === nrm(e.short),
    (e, p) => lastTok(p.full) === lastTok(e.name) && nrm(p.full)[0] === nrm(e.name)[0],
    (e, p) => nrm(e.name).endsWith(nrm(p.name)) && nrm(p.name).length >= 4,
    (e, p) => lastTok(p.full) === lastTok(e.name),
    (e, p) => nrm(e.name).includes(nrm(p.name)) && nrm(p.name).length >= 4,
  ];
  tests.forEach((t) => players.forEach((e) => { if (out[e.id]) return; const m = pool.filter((p) => !used.has(p.id) && t(e, p)); if (m.length === 1) { out[e.id] = m[0]; used.add(m[0].id); } }));
  return out;
}
const DEPTH = (pos) => { const p = pos.toUpperCase(); if (p === 'G' || p === 'GK') return 0; if (/^(CD|D|SW|LB|RB|CB)/.test(p)) return 1; if (/^(LWB|RWB|DM|CDM)/.test(p)) return 2; if (/^(CM|LM|RM|M)(-|$)/.test(p)) return 3; if (/^(AM|CF-|LW|RW|CAM)/.test(p)) return 4; return 5; };
const SIDE = (pos) => { const p = pos.toUpperCase(); if (/^(LB|LM|LW|LWB|LF)$/.test(p)) return 0; if (/^(RB|RM|RW|RWB|RF)$/.test(p)) return 4; if (/-L$/.test(p)) return 1; if (/-R$/.test(p)) return 3; return 2; };
function lineupBoxESPN(f, ev, L, d) {
  const sd = d.sides[mcSide]; const team = mcSide === 'h' ? f.h : f.a;
  const tabs = `<div class="mc-tabs"><button class="${mcSide === 'h' ? 'on' : ''}" onclick="mcSideSet('h',${f.id},${ev})">${tName(f.h)}</button><button class="${mcSide === 'a' ? 'on' : ''}" onclick="mcSideSet('a',${f.id},${ev})">${tName(f.a)}</button></div>`;
  if (!sd?.players?.length) return `<div class="mc-sec"><h4>${I('i-pitch', 'i', 'width:15px;height:15px')}${tt('التشكيلة', 'Lineups')}</h4>${tabs}<p class="mc-none">${tt('التشكيلة ما انعلنت بعد', 'Lineup not announced yet')}</p></div>`;
  const live = f.started && !f.fin, M = mapFPL(sd.players, team), byId = Object.fromEntries(sd.players.map((p) => [p.id, p]));
  const subs = (d.subs || []).filter((x) => byId[x.in] || byId[x.out]);
  const ptsOf = (e) => { const p = M[e.id]; const s = p && L?.[p.id]; return s ? s.total_points : f.started ? 0 : null; };
  const nameOf = (e) => M[e.id]?.name || e.last || e.name;
  const card = (e, kind, at) => { const p = M[e.id], pts = ptsOf(e), onPitch = kind !== 'out' && kind !== 'unused';
    const mins = p && L?.[p.id] ? L[p.id].minutes : null;
    const lab = kind === 'in' ? `${at?.txt || ''}↑` : kind === 'out' ? `${at?.txt || ''}↓` : kind === 'unused' ? tt('ما لعب', 'unused') : mins != null && f.started ? `${mins}′` : '';
    return `<button class="rvp-pl ${onPitch ? '' : 'out'}" ${p ? `onclick="closeSheet();setTimeout(()=>playerGW(${p.id},${ev}),200)"` : ''}>
      <div class="rvp-sh">${p ? pShirt(p) : pShirt({ team, pos: e.pos === 'G' ? 'GK' : 'MID' })}${kind === 'in' ? '<i class="rvp-b in">↑</i>' : kind === 'out' ? '<i class="rvp-b outb">↓</i>' : ''}${e.yc && !e.rc ? '<i class="mc-yc"></i>' : ''}${e.rc ? '<i class="mc-yc r"></i>' : ''}</div>
      <span class="rvp-nm">${esc(nameOf(e))}</span><span class="rvp-pt ${live && onPitch ? 'live' : ''}">${pts ?? '—'}</span>${lab ? `<small class="mc-min">${lab}</small>` : ''}</button>`; };
  // كل أساسي: إذا تبدّل نحط مكانه اللاعب اللي دخل (ونتبع سلسلة التبديلات)
  const starters = sd.players.filter((p) => p.starter);
  const slots = starters.map((e) => { let cur = e, at = null, k = ''; let sx; const seen = new Set(); while ((sx = subs.find((x) => x.out === cur.id)) && byId[sx.in] && !seen.has(sx.in)) { seen.add(sx.in); cur = byId[sx.in]; at = sx.at; k = 'in'; } return { e, cur, at, k }; });
  // مركز كل خانة حسب اللاعب اللي بالملعب هسة: البديل ياخذ مركزه هو (مو مركز اللي طلع)
  const GEN = { GK: 'G', DEF: 'CD', MID: 'CM', FWD: 'F' };
  slots.forEach((z) => {
    z.pos = z.e.pos;
    if (z.k === 'in') {
      const side = SIDE(z.e.pos), suf = side <= 1 ? '-L' : side >= 3 ? '-R' : '';
      const sp = /^(SUB|S|)$/i.test(z.cur.pos || '') ? (GEN[M[z.cur.id]?.pos] ? GEN[M[z.cur.id].pos] + (M[z.cur.id].pos === 'GK' ? '' : suf) : z.e.pos) : z.cur.pos;
      z.pos = DEPTH(sp) === DEPTH(z.e.pos) ? z.e.pos : sp;
    }
  });
  const changed = slots.some((z) => z.pos !== z.e.pos);
  const ordered = [...slots].sort((a, b) => DEPTH(a.pos) - DEPTH(b.pos));
  const nums = (sd.formation || '').split('-').map(Number).filter((n) => n > 0);
  let lines = [];
  if (!changed && nums.length && nums.reduce((a, b) => a + b, 0) === ordered.length - 1) {
    // نفس أماكن ESPN؛ هنا الفريق يهاجم لتحت فيسار الفريق يصير يمين الشاشة
    lines = espnLines(starters, sd.formation).map((row) => row.map((e) => slots.find((z) => z.e === e)).filter(Boolean).reverse());
  } else { const g = {}; ordered.forEach((z) => (g[DEPTH(z.pos)] = g[DEPTH(z.pos)] || []).push(z)); lines = Object.keys(g).sort((a, b) => a - b).map((k) => g[k]); lines = lines.map((l) => [...l].sort((a, b) => SIDE(b.pos) - SIDE(a.pos))); }
  const curForm = changed ? lines.slice(1).map((l) => l.length).join('-') : sd.formation;
  const offIds = new Set(subs.map((x) => x.out)), onIds = new Set(subs.map((x) => x.in));
  const offs = sd.players.filter((p) => offIds.has(p.id) && byId[p.id]).map((p) => card(p, 'out', subs.find((x) => x.out === p.id)?.at));
  const unused = sd.players.filter((p) => !p.starter && !onIds.has(p.id)).map((p) => card(p, 'unused'));
  const teamPts = f.started ? sd.players.reduce((a, e) => a + (ptsOf(e) || 0), 0) : null;
  return `<div class="mc-sec"><h4>${I('i-pitch', 'i', 'width:15px;height:15px')}${tt('التشكيلة والنقاط', 'Lineups & points')}${live ? `<small>${tt('مباشر', 'live')}</small>` : ''}</h4>${tabs}
    <div class="mc-lu-sum"><span>${curForm ? `${tt('الخطة', 'Formation')} <b dir="ltr" style="color:var(--txt);font-size:13px">${esc(curForm)}</b>${changed && sd.formation ? ` <small class="mut">(${tt('بدأ', 'started')} <span dir="ltr">${esc(sd.formation)}</span>)</small>` : ''}` : ''}</span>${teamPts != null ? `<span>${tt('مجموع النقاط', 'Team points')} <b class="num">${teamPts}</b></span>` : ''}</div>
    <div class="rvp mc-pitch"><div class="rvp-lines"><i class="box t"></i><i class="six t"></i><i class="mid"></i><i class="circle"></i><i class="box b"></i><i class="six b"></i></div>${lines.map((l) => `<div class="rvp-row" style="direction:ltr">${l.map((z) => card(z.cur, z.k, z.at)).join('')}</div>`).join('')}</div>
    ${offs.length ? `<div class="rvp-bench"><span class="rvp-bl">${tt('طلعوا من الملعب', 'Substituted off')}</span><div class="rvp-row" style="flex-wrap:wrap">${offs.join('')}</div></div>` : ''}
    ${unused.length ? `<div class="rvp-bench"><span class="rvp-bl">${tt('الدكة (ما لعبوا)', 'Unused subs')}</span><div class="rvp-row" style="flex-wrap:wrap">${unused.join('')}</div></div>` : ''}
    <div class="rvp-legend"><span><i class="rvp-b in" style="position:static">↑</i>${tt('دخل', 'On')}</span><span><i class="rvp-b outb" style="position:static">↓</i>${tt('طلع', 'Off')}</span></div></div>`;
}
function lineupBox(f, ev, L) {
  const luD = LU[f.id]?.d, has = luD?.sides?.[mcSide]?.players?.length;
  if (luD && (has || !(L && f.started))) return lineupBoxESPN(f, ev, L, luD);
  if (!L) return '';
  const team = mcSide === 'h' ? f.h : f.a, lu = matchLineup(f, L, team);
  const tabs = `<div class="mc-tabs"><button class="${mcSide === 'h' ? 'on' : ''}" onclick="mcSideSet('h',${f.id},${ev})">${tName(f.h)}</button><button class="${mcSide === 'a' ? 'on' : ''}" onclick="mcSideSet('a',${f.id},${ev})">${tName(f.a)}</button></div>`;
  if (!lu) return `<div class="mc-sec"><h4>${I('i-pitch', 'i', 'width:15px;height:15px')}${tt('التشكيلة', 'Lineups')}</h4>${tabs}<p class="mc-none">${tt('التشكيلة تظهر أول ما تبدي المباراة', 'Lineups appear at kick-off')}</p></div>`;
  const live = f.started && !f.fin;
  const card = (x, badge, onPitch = true, lone = false, ap = false) => `<button class="rvp-pl ${onPitch ? '' : 'out'}" onclick="closeSheet();setTimeout(()=>playerGW(${x.p.id},${ev}),200)">
      <div class="rvp-sh">${pShirt(x.p)}${badge === 'in' ? '<i class="rvp-b in">↑</i>' : badge === 'out' ? '<i class="rvp-b outb">↓</i>' : ''}${x.s.yellow_cards ? '<i class="mc-yc"></i>' : ''}${x.s.red_cards ? '<i class="mc-yc r"></i>' : ''}</div>
      <span class="rvp-nm">${esc(x.p.name)}</span><span class="rvp-pt ${live && onPitch ? 'live' : ''}">${x.s.total_points}</span><small class="mc-min">${badge === 'in' && ap ? `${T >= 90 ? '90+' : T}′↑~` : badge === 'in' && !lone ? `${total(x)}′↑` : badge === 'in' ? `${x.s.minutes}′` : badge === 'out' ? `${x.s.minutes}′↓${ap ? '~' : ''}` : `${x.s.minutes}′`}</small></button>`;
  const T = f.fin ? 90 : Math.min(90, f.min || 0), total = (x) => Math.max(0, T - x.s.minutes);
  const slots = lu.st.map((x) => (lu.pair.has(x.p.id) ? { x: lu.pair.get(x.p.id), pos: x.p.pos, b: 'in', ap: lu.approx.has(x.p.id) } : { x, pos: x.p.pos, b: '' }));
  const lines = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => slots.filter((z) => z.pos === pos)).filter((l) => l.length);
  const bench = [...lu.offs.map((x) => card(x, 'out', false, false, lu.approx.has(x.p.id))), ...lu.leftover.map((x) => card(x, 'in', false, true))];
  const pts = slots.reduce((a, z) => a + z.x.s.total_points, 0) + lu.offs.reduce((a, x) => a + x.s.total_points, 0) + lu.leftover.reduce((a, x) => a + x.s.total_points, 0);
  return `<div class="mc-sec"><h4>${I('i-pitch', 'i', 'width:15px;height:15px')}${tt('التشكيلة والنقاط', 'Lineups & points')}${live ? `<small>${tt('مباشر', 'live')}</small>` : ''}</h4>${tabs}
    <div class="mc-lu-sum"><span>${tt('مجموع نقاط الفريق', 'Team fantasy points')}</span><b class="num">${pts}</b></div>
    <div class="rvp mc-pitch"><div class="rvp-lines"><i class="box t"></i><i class="six t"></i><i class="mid"></i><i class="circle"></i><i class="box b"></i><i class="six b"></i></div>${lines.map((l) => `<div class="rvp-row">${l.map((z) => card(z.x, z.b, true, false, z.ap)).join('')}</div>`).join('')}</div>
    <div class="rvp-bench"><span class="rvp-bl">${tt('البدلاء — اللي طلعوا', 'Substituted')}</span>${bench.length ? `<div class="rvp-row" style="flex-wrap:wrap">${bench.join('')}</div>` : `<p class="mc-none" style="text-align:center">${tt('ماكو تبديلات لحد هسة', 'No substitutions yet')}</p>`}</div>
    <div class="rvp-legend"><span><i class="rvp-b in" style="position:static">↑</i>${tt('دخل', 'On')}</span><span><i class="rvp-b outb" style="position:static">↓</i>${tt('طلع', 'Off')}</span></div>
    <p class="mc-none" style="font-size:10.5px;text-align:center;margin-top:6px">${tt('التشكيلة والتبديلات مأخوذة من دقائق اللعب بالفانتازي. علامة ~ تعني تبديل بالوقت بدل الضايع والفانتازي يحسب للخارج 90 دقيقة، فاللاعب الخارج تقديري.', 'Built from FPL minutes. ~ = stoppage-time change; the player off is estimated.')}</p></div>`;
}
function mineBlock(f, ev) {
  const squad = ST.plan ? [...ST.plan.xi, ...ST.plan.bench].map(PM).filter((p) => p && (p.team === f.h || p.team === f.a)) : [];
  if (!squad.length) return '';
  const L = mcLive[ev];
  return `<div class="mc-sec mine"><h4>${I('i-users', 'i', 'width:15px;height:15px')}${tt('لاعبينك بهالمباراة', 'Your players')}</h4>${squad.map((p) => { const s = L?.[p.id]; return `<button class="mc-fp" onclick="closeSheet();setTimeout(()=>playerGW(${p.id},${ev}),200)"><span class="mini-sh">${pShirt(p)}</span><span class="mc-fpn"><b>${esc(p.name)}</b><small><bdi>${tShort(p.team)}</bdi> · ${s ? s.minutes + '′' : '—'}</small></span><b class="num mc-pts">${s ? s.total_points : '—'}</b></button>`; }).join('')}</div>`;
}
async function openMatchC(fid, ev) {
  mcSide = 'h';
  const f = (ST.G.fx[ev] || []).find((x) => x.id === fid); if (!f) return;
  if (ev === ST.G.cur && ST.live && ST.liveRawGW === ev) mcLive[ev] = ST.live;
  openSheet(`<div class="mc-head"><span>${t('gw')} ${ev} · ${fmtTime(f.ko)}</span><button class="icon-btn" onclick="closeSheet()" aria-label="close">${I('i-x')}</button></div><div id="mcBody" data-fid="${f.id}">${mcBody(f, ev)}</div>`);
  if (f.started || (f.ko && new Date(f.ko) - Date.now() < 90 * 60e3)) loadLU(f, ev);
  clearInterval(mcTimer); mcTimer = setInterval(async () => { const el = document.getElementById('mcBody'); if (!el || el.dataset.fid != f.id) return clearInterval(mcTimer); const ff = (ST.G.fx[ev] || []).find((x) => x.id === fid) || f; if (!(ff.started && !ff.fin) || document.hidden) return; if (ev === ST.G.cur && liveMode() && Date.now() - lastFetch < 15e3) return; try { const l = await FPL.loadLive(ev, true); mcLive[ev] = Object.fromEntries(l.elements.map((x) => [x.id, x.stats])); } catch {} loadLU(ff, ev, true); const e2 = document.getElementById('mcBody'); if (e2 && e2.dataset.fid == f.id) morphHTML(e2, mcBody(ff, ev)); }, 20e3);
  if (f.started && (!mcLive[ev] || ev === ST.G.cur)) {
    try { const l = await FPL.loadLive(ev); mcLive[ev] = Object.fromEntries(l.elements.map((x) => [x.id, x.stats])); const el = document.getElementById('mcBody'); if (el && el.dataset.fid == f.id) morphHTML(el, mcBody(f, ev)); } catch {}
  }
}
Object.assign(window, { mcSideSet: (sd, fid, ev) => { mcSide = sd; const f = (ST.G.fx[ev] || []).find((x) => x.id === fid), el = document.getElementById('mcBody'); if (f && el) morphHTML(el, mcBody(f, ev)); }, lvGW: (g) => { gwSel = g; gwUser = true; window.render(); setTimeout(() => document.querySelector('#lvseg .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 30); }, lvRefresh: () => refreshLive(true), openMatchC });
/* ---------- التشكيلات الرسمية (معاينة ?lu2=1) — من ESPN، تنعلن عادة قبل المباراة بساعة وقبل ما يحدثها الفانتازي ---------- */
const LU2 = () => true;
const luWin = (f) => { if (!f.ko) return false; const dt = new Date(f.ko) - Date.now(); return dt < 100 * 60e3 && (dt > -4 * 3600e3 || (f.started && !f.fin)); };
const luHas = (f) => Object.values(LU[f.id]?.d?.sides || {}).some((x) => x.players?.some((p) => p.starter));
const LU2DEMO = () => { try { return sessionStorage.getItem('fp_lu2demo') === '1'; } catch { return false; } };
function lu2DemoFill(fx) {
  // مثال تجريبي: نبني تشكيلة واقعية من لاعبين الفانتازي لأقرب مباراتين (مو تشكيلة رسمية)
  fx.filter((f) => f.ko && new Date(f.ko) > Date.now() - 3 * 3600e3).slice(0, 2).forEach((f) => {
    if (luHas(f)) return;
    const side = (tm, form, poss) => { const pl = ST.G.players.filter((p) => p.team === tm).sort((a, b) => (b.min || 0) - (a.min || 0)); const take = (pos, n) => pl.filter((p) => p.pos === pos).slice(0, n);
      const [d, m, fw] = form.split('-').length === 4 ? [4, 5, 1] : [4, 3, 3]; const xi = [...take('GK', 1), ...take('DEF', d), ...take('MID', m), ...take('FWD', fw)];
      const bench = pl.filter((p) => !xi.includes(p)).slice(0, 7);
      return { formation: form, players: xi.map((p, i) => ({ id: 'd' + p.id, name: p.full || p.name, last: p.name, short: p.name, jersey: String(i + 1), pos: poss[i] || 'CM', place: i + 1, starter: true })).concat(bench.map((p, k) => ({ id: 'd' + p.id, name: p.full || p.name, last: p.name, jersey: String(12 + k), pos: 'SUB', place: 0, starter: false }))) }; };
    LU[f.id] = { at: Date.now() + 1e9, d: { demo: true, sides: { h: side(f.h, '4-2-3-1', ['G', 'RB', 'CD-R', 'CD-L', 'LB', 'DM-R', 'DM-L', 'RM', 'AM', 'LM', 'F']), a: side(f.a, '4-3-3', ['G', 'RB', 'CD-R', 'CD-L', 'LB', 'CM-R', 'CM', 'CM-L', 'RW', 'CF', 'LW']) }, subs: [] } };
  });
}
function lu2Fetch(f, done) {
  const c = LU[f.id]; if (c?.busy || (c && Date.now() - c.at < 25e3)) return;
  LU[f.id] = { ...(c || {}), busy: true };
  fetch(`/api/lineups?ko=${encodeURIComponent(f.ko)}&h=${tShort(f.h)}&a=${tShort(f.a)}&v=2`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
    const had = luHas(f); LU[f.id] = { d: d?.sides && Object.keys(d.sides).length ? d : c?.d || null, at: Date.now() };
    if (luHas(f) !== had || !had) done && done();
  });
}
// إشعار تشكيلة وصل والتطبيق مفتوح: نجيبها فوراً بدل ما ننتظر الدورة الجاية
if (typeof window !== 'undefined') window.addEventListener('fp-push', (e) => {
  if (!/^lu_/.test(e.detail?.tag || '')) return;
  Object.keys(LU).forEach((k) => { if (LU[k] && !LU[k].d) delete LU[k]; else if (LU[k]) LU[k].at = 0; });
  if (ST.view === 'live') (ST.G.fx[gwSel] || []).filter((f) => luWin(f) && luPre(f)).forEach((f) => lu2Fetch(f, () => { if (ST.view === 'live') window.render(); }));
});
function lu2Poll() {
  const run = () => { if (ST.view !== 'live') return clearInterval(window.__lu2T); if (LU2DEMO()) return; (ST.G.fx[gwSel] || []).filter((f) => luWin(f) && luPre(f)).forEach((f) => lu2Fetch(f, () => { if (ST.view === 'live') window.render(); })); };
  run(); clearInterval(window.__lu2T); window.__lu2T = setInterval(() => { if (!document.hidden) run(); }, 30e3);
}
function lu2Section(fx, ev) {
  if (LU2DEMO()) lu2DemoFill(fx);
  const L = fx.filter((f) => luHas(f) && (LU2DEMO() || (luWin(f) && luPre(f))));
  const mine = ST.plan ? new Set([...ST.plan.xi, ...ST.plan.bench]) : new Set();
  return `<div class="lu2-box ${LU2OPEN() ? 'open' : ''}"><button class="lu2-hd" onclick="lu2Tog(this)">${I('i-pitch', 'i', 'width:16px;height:16px')}<b>${tt('التشكيلات الرسمية', 'Official line-ups')}</b>${L.length ? `<span class="lu2-n">${L.length}</span>` : ''}${I('i-chev', 'lu2-arr')}</button>
  <div class="lu2-body">${L.length ? `<div class="lu2-list">${L.map((f) => { const d = LU[f.id]?.d;
    const myN = ST.G.players.filter((p) => mine.has(p.id) && (p.team === f.h || p.team === f.a)).length;
    const ko = f.ko ? new Date(f.ko).toLocaleString(document.dir === 'ltr' ? 'en-GB' : 'ar-IQ', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    return `<button class="lu5-c" onclick="openLineup(${f.id},${ev})">
      <span class="lu5-t" dir="ltr">${crest(tShort(f.h), 20)}<b>${tShort(f.h)}</b><i>–</i><b>${tShort(f.a)}</b>${crest(tShort(f.a), 20)}</span>
      <span class="lu5-k">${ko}</span>
      ${myN ? `<span class="lu5-my">${I('i-users', 'i', 'width:11px;height:11px')}${myN}</span>` : ''}
      <span class="lu5-ok">${I('i-check', 'i', 'width:11px;height:11px')}</span></button>`; }).join('')}</div>` : `<p class="lu2-empty">${tt('ماكو تشكيلات معلنة هسة — أول ما تنعلن تشكيلة أي مباراة تنزل هنا تلقائياً.', 'No line-ups out yet — they appear here as soon as they are announced.')}</p>`}</div></div>`;
}
// التشكيلة تبقى لحد ما تبدي المباراة وبعدها تختفي
const luPre = (f) => !f.started && !f.fin && (!f.ko || new Date(f.ko) > Date.now());
const LU2OPEN = () => { try { return localStorage.getItem('fp_lu2open') === '1'; } catch { return false; } };
window.lu2Tog = (el) => { const b = el.closest('.lu2-box'); const o = !b.classList.contains('open'); b.classList.toggle('open', o); try { localStorage.setItem('fp_lu2open', o ? '1' : '0'); } catch {} };
const LUD = (pos) => { const p = String(pos || '').toUpperCase(); if (p === 'G' || p === 'GK') return 0; if (/^(RB|LB|CB|CD|SW|D)(-|$)/.test(p)) return 1; if (/^(RWB|LWB)/.test(p)) return 1.5; if (/^(DM|CDM)/.test(p)) return 2; if (/^(CM|RM|LM|M)(-|$)/.test(p)) return 3; if (/^(AM|CAM)/.test(p)) return 4; if (/^(RW|LW|RF|LF)/.test(p)) return 4.5; if (/^(CF|F|ST|FW|S)(-|$)/.test(p)) return 5; return 3; };
/* رقم المركز من ESPN (formationPlace) هو رمز مركز ثابت مو ترتيب: 1 حارس، 2 ظهير أيمن، 3 ظهير أيسر، 5/6 قلب دفاع أيمن/أيسر،
   4/8 ارتكاز أيسر/أيمن، 7/11 جناح أيمن/أيسر، 10 صانع لعب، 9 مهاجم. كل خط مكتوب من يسار الفريق ليمينه (الفريق يهاجم لفوق) */
const FORM = {
  '4-2-3-1': [[1], [3, 6, 5, 2], [4, 8], [11, 10, 7], [9]],
  '4-3-3': [[1], [3, 6, 5, 2], [10, 4, 8], [11, 9, 7]],
  '4-4-2': [[1], [3, 6, 5, 2], [11, 4, 8, 7], [10, 9]],
  '4-4-1-1': [[1], [3, 6, 5, 2], [11, 4, 8, 7], [10], [9]],
  '4-1-4-1': [[1], [3, 6, 5, 2], [4], [11, 10, 8, 7], [9]],
};
const PLX = { 3: 0, 11: 0.5, 6: 1, 4: 1.6, 10: 2, 9: 2, 8: 2.4, 5: 3, 7: 3.5, 2: 4 };
const PLD = { 2: 1, 3: 1, 5: 1, 6: 1, 4: 2, 8: 2.2, 7: 3, 11: 3, 10: 3.5, 9: 4 };
export function espnLines(st, formation) {
  const cnt = String(formation || '').split('-').map(Number).filter((n) => n > 0), places = st.map((e) => +e.place || 0);
  const T = FORM[cnt.join('-')];
  if (T && st.length === 11 && T.flat().every((pl) => places.includes(pl)) && new Set(places).size === 11) return T.map((row) => row.map((pl) => st.find((e) => +e.place === pl)));
  // باقي الخطط: نعتمد اسم المركز إذا ESPN كتبه بالتفصيل، وإلا رقم المركز
  const spec = st.some((e) => /-|^(LB|RB|LM|RM|LW|RW|DM|AM|CF|LWB|RWB)$/i.test(e.pos || ''));
  // دفاع ثلاثي/خماسي: 4/5/6 قلوب الدفاع (يمين/وسط/يسار) و2/3 الظهيرين الجناحين
  const b3 = cnt[0] === 3 || cnt[0] === 5, PD = b3 ? { ...PLD, 4: 1, 5: 1, 6: 1, 2: cnt[0] === 5 ? 1 : 2.6, 3: cnt[0] === 5 ? 1 : 2.6, 8: 2.8, 7: 3 } : PLD, PX = b3 ? { ...PLX, 6: 1, 5: 2, 4: 3 } : PLX;
  const depth = (e) => (spec ? LUD(e.pos) : +e.place === 1 ? 0 : PD[+e.place] ?? 3);
  const side = (e) => (spec ? SIDE(e.pos || '') : PX[+e.place] ?? 2);
  const gk = st.filter((e) => depth(e) === 0 || /^GK?$/i.test(e.pos || '')).slice(0, 1), rest = st.filter((e) => !gk.includes(e)).sort((a, b) => depth(a) - depth(b) || (+a.place || 0) - (+b.place || 0));
  let lines = [];
  if (cnt.length && cnt.reduce((a, b) => a + b, 0) === rest.length) { let k = 0; lines = cnt.map((n) => rest.slice(k, (k += n))); }
  else { const g = {}; rest.forEach((e) => (g[depth(e)] = g[depth(e)] || []).push(e)); lines = Object.keys(g).map(Number).sort((a, b) => a - b).map((k) => g[k]); }
  return [gk, ...lines.map((ln) => ln.sort((a, b) => side(a) - side(b)))].filter((l) => l.length);
}
function lu2Lines(sd, team, top) {
  // نوزع الأساسيين على خطوط الخطة الرسمية (مثلاً 4-2-3-1) بنفس أماكن ESPN
  const M = mapFPL(sd.players, team);
  const lines = espnLines(sd.players.filter((p) => p.starter), sd.formation);
  const n = lines.length, out = [];
  lines.forEach((ln, i) => {
    const y = i === 0 ? 93.5 : 81 - (i - 1) * (24 / Math.max(1, n - 2)), m = ln.length, step = m > 1 ? Math.min(26, 76 / (m - 1)) : 0;
    ln.forEach((e, j) => {
      let x = 50 + (j - (m - 1) / 2) * step; if (top) x = 100 - x;
      // مثل ESPN: الظهيرين بخط الدفاع متقدمين شوية عن قلبي الدفاع
      const lift = i === 1 && m >= 4 && (j === 0 || j === m - 1) ? 3 : 0;
      out.push({ e, p: M[e.id], x, y: top ? 100 - (y - lift) : y - lift, row: i, lift });
    });
  });
  return { out, M };
}
/* ورقة التشكيلة الرسمية: فريق واحد بالملعب (تبديل بين الفريقين) حتى الحجم يبقى متناسق ومقروء */
const LUS = {};
function lu2Half(sd, team) {
  // نفس توزيع الخطوط، بس على نص ملعب: الحارس تحت والهجوم فوق
  const { out, M } = lu2Lines(sd, team, false), n = new Set(out.map((z) => z.row)).size;
  const map = {}; for (let i = 0; i < n; i++) map[i] = i === 0 ? 88 : 70 - (i - 1) * (58 / Math.max(1, n - 2));
  const cnt = {}; out.forEach((z) => (cnt[z.row] = (cnt[z.row] || 0) + 1));
  return { out: out.map((z) => ({ ...z, w: Math.min(25, 96 / cnt[z.row]), t: cnt[z.row] >= 5, y: map[z.row] - z.lift * 1.6 })), M, n };
}
function lu2Sheet(f, ev, d) {
  const mine = ST.plan ? new Set([...ST.plan.xi, ...ST.plan.bench]) : new Set(), cap = ST.plan?.cap;
  const H = d.sides.h, A = d.sides.a;
  const myP = ST.G.players.filter((p) => mine.has(p.id) && (p.team === f.h || p.team === f.a));
  if (!LUS[f.id]) LUS[f.id] = myP.some((p) => p.team === f.a) && !myP.some((p) => p.team === f.h) ? 'a' : 'h';
  const k = LUS[f.id], sd = k === 'h' ? H : A, team = k === 'h' ? f.h : f.a;
  const hl = H ? lu2Lines(H, f.h, false) : { out: [], M: {} }, al = A ? lu2Lines(A, f.a, false) : { out: [], M: {} };
  const inXI = new Set([...hl.out, ...al.out].map((z) => z.p?.id).filter(Boolean));
  const benchIds = new Set([[H, hl.M], [A, al.M]].flatMap(([S, M]) => (S?.players || []).filter((e) => !e.starter).map((e) => M[e.id]?.id).filter(Boolean)));
  const half = sd ? lu2Half(sd, team) : { out: [], M: {} };
  const go = (p) => (p ? `onclick="closeSheet();setTimeout(()=>openPlayer(${p.id}),200)"` : '');
  const dot = (z) => { const p = z.p, my = p && mine.has(p.id), nm = esc(p?.name || z.e.last || z.e.short || z.e.name);
    return `<button class="lu3-pl${my ? ' my' : ''}${z.t ? ' tight' : ''}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%" ${go(p)}><span class="lu3-sh">${p ? pShirt(p, '', z.e.jersey || '') : pShirt({ team, pos: /^GK?$/i.test(z.e.pos || '') || +z.e.place === 1 ? 'GK' : 'MID' }, '', z.e.jersey || '')}${p && p.id === cap ? '<i class="lu3-cap">C</i>' : ''}${z.e.yc ? '<i class="mc-yc"></i>' : ''}</span><span class="lu3-nm">${nm}</span></button>`; };
  const subs = (sd?.players || []).filter((e) => !e.starter).map((e) => { const p = half.M[e.id], my = p && mine.has(p.id); return `<button class="lu3-sb${my ? ' my' : ''}" ${go(p)}><i>${esc(e.jersey || '')}</i><span>${esc(p?.name || e.last || e.name)}</span>${p ? `<small>${({ GK: tt('حارس', 'GK'), DEF: tt('مدافع', 'DEF'), MID: tt('وسط', 'MID'), FWD: tt('مهاجم', 'FWD') })[p.pos] || ''}</small>` : ''}${e.subIn && e.subAt ? `<em>↑ ${e.subAt.min}′</em>` : ''}</button>`; }).join('');
  const st = (p) => (inXI.has(p.id) ? 'xi' : benchIds.has(p.id) ? 'bench' : 'out');
  const LBL = { xi: tt('أساسي', 'Starting'), bench: tt('على الدكة', 'Bench'), out: tt('مو بالقائمة', 'Not in squad') };
  const my = myP.length ? `<div class="lu3-mine">${myP.map((p) => { const s2 = st(p); return `<button class="${s2}" ${go(p)}><span class="lu3-msh">${pShirt(p)}</span><b>${esc(p.name)}${p.id === cap ? ' <i class="lu3-capi">C</i>' : ''}</b><em>${LBL[s2]}</em></button>`; }).join('')}</div>` : '';
  const tm = (kk, t, S) => `<button class="lu3-tm${k === kk ? ' on' : ''}" onclick="lu3Side(${f.id},${ev},'${kk}')">${crest(tShort(t), 26)}<span><b>${esc(tName(t))}</b><small dir="ltr">${esc(S?.formation || '—')}</small></span></button>`;
  return `<div class="lu3-hd"><div><small>${tt('التشكيلة الرسمية', 'Official line-ups')} · ${fmtTime(f.ko)}</small><h3>${esc(tName(f.h))} <i>${tt('ضد', 'vs')}</i> ${esc(tName(f.a))}</h3></div><button class="icon-btn" onclick="closeSheet()" aria-label="close">${I('i-x')}</button></div>
    ${my ? `<h5 class="lu3-h5">${tt('لاعبينك بهالمباراة', 'Your players in this match')}</h5>${my}` : ''}
    <div class="lu3-tabs">${tm('h', f.h, H)}${tm('a', f.a, A)}</div>
    <div class="lu3-pitch" data-side="${k}">
      <svg viewBox="0 0 68 70" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="lu3g" width="68" height="14" patternUnits="userSpaceOnUse"><rect width="68" height="7" fill="#3B8F4C"/><rect y="7" width="68" height="7" fill="#41964F"/></pattern><linearGradient id="lu3v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".3" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
      <rect width="68" height="70" fill="url(#lu3g)"/><rect width="68" height="70" fill="url(#lu3v)"/>
      <g fill="none" stroke="rgba(255,255,255,.75)" stroke-width=".4"><rect x="1.5" y="1.5" width="65" height="67"/><path d="M24.85 1.5a9.15 9.15 0 0 0 18.3 0"/><rect x="13.85" y="52" width="40.3" height="16.5"/><rect x="24.85" y="63" width="18.3" height="5.5"/><path d="M26.7 52a9.15 9.15 0 0 1 14.6 0"/></g></svg>
      ${half.out.map(dot).join('')}
    </div>
    <h5 class="lu3-h5">${tt('البدلاء', 'Substitutes')} · ${esc(tName(team))}</h5>
    <div class="lu3-subs">${subs || `<p class="mut" style="font-size:12px">—</p>`}</div>
    ${d.demo ? `<p class="lu2-demo">${tt('مثال تجريبي مبني من لاعبين الفانتازي — مو التشكيلة الرسمية', 'Demo built from FPL players — not the official line-up')}</p>` : ''}
    <p class="lu2-note">${tt('المصدر: ESPN. التشكيلة تنعلن عادة قبل المباراة بحوالي ساعة. لاعبينك ملوّنين بالأخضر.', 'Source: ESPN. Usually announced ~1h before kick-off. Your players are highlighted.')}</p>`;
}
window.lu3Side = (fid, ev, k) => { LUS[fid] = k; const f = (ST.G.fx[ev] || []).find((x) => x.id === fid), d = LU[fid]?.d, el = document.getElementById('lu3'); if (f && d && el) el.innerHTML = lu2Sheet(f, ev, d); };
window.openLineup = (fid, ev) => {
  const f = (ST.G.fx[ev] || []).find((x) => x.id === fid), d = LU[fid]?.d; if (!f || !d) return;
  openSheet(`<div id="lu3" class="lu3">${lu2Sheet(f, ev, d)}</div>`);
};

export function afterLive() {
  if (LU2()) lu2Poll();
  setTimeout(() => document.querySelector('#lvseg .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 30);
  if (gwSel === ST.G.cur && (!ST.live || Date.now() - lastFetch > 60000)) refreshLive(false);
}
