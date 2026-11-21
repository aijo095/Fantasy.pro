/* =========================================================
   /api/notify — محرك الإشعارات (يشتغل كل ~5 دقايق من GitHub Actions)
   يقارن بيانات الفانتازي بآخر لقطة محفوظة ويرسل لكل مشترك:
   • قرب الإغلاق (24 ساعة / ساعة وحدة)   • إصابة أو غياب لاعب من فريقه
   • تغيّر سعر لاعب عنده أو بقائمة مراقبته • توقع صعود/نزول السعر الليلة
   • هدف / صناعة / طرد للاعبينه مباشرة  • بداية مباريات لاعبينه
   • نهاية الجولة: نقاطه وترتيبه
   • التشكيلة الرسمية لمباريات لاعبينه (منو أساسي/دكة/برا) أول ما تنعلن
   الطلب آمن للتكرار: كل تنبيه له مفتاح ما يتكرر، وفي قفل يمنع التشغيل المتزامن
========================================================= */
import { kv, getJ, setJ, kvEnabled, send } from './_kv.js';
import { sendPush } from './_webpush.js';
import { newsAr } from '../js/newsar.js';
import { fetchFeeds, h as trHash } from './news.js';
import crypto from 'node:crypto';
import { getLineup } from './lineups.js';

export const config = { maxDuration: 60 };
const BASE = 'https://fantasy.premierleague.com/api/';
const UA = 'Mozilla/5.0 (compatible; FantasyPro/2.0)';
const fpl = async (p) => { const r = await fetch(BASE + p, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) throw new Error(`fpl ${r.status} ${p}`); return r.json(); };

/* ربط لاعبي ESPN بلاعبي الفانتازي بالاسم (نفس منطق صفحة المباشر) */
const nrm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const lastTok = (x) => nrm(String(x || '').trim().split(/\s+/).pop());
function mapFPL(players, pool) {
  const used = new Set(), out = {};
  const full = (p) => `${p.first_name} ${p.second_name}`;
  const tests = [
    (e, p) => nrm(full(p)) === nrm(e.name),
    (e, p) => nrm(p.web_name) === nrm(e.name) || nrm(p.web_name) === nrm(e.last) || nrm(p.web_name) === nrm(e.short),
    (e, p) => lastTok(full(p)) === lastTok(e.name) && nrm(full(p))[0] === nrm(e.name)[0],
    (e, p) => nrm(e.name).endsWith(nrm(p.web_name)) && nrm(p.web_name).length >= 4,
    (e, p) => lastTok(full(p)) === lastTok(e.name),
    (e, p) => nrm(e.name).includes(nrm(p.web_name)) && nrm(p.web_name).length >= 4,
  ];
  tests.forEach((t) => players.forEach((e) => { if (out[e.id]) return; const m = pool.filter((p) => !used.has(p.id) && t(e, p)); if (m.length === 1) { out[e.id] = m[0].id; used.add(m[0].id); } }));
  return out;
}
const ST_AR = { i: 'مصاب', s: 'موقوف', d: 'مشكوك بمشاركته', u: 'غير متاح', n: 'غير مؤهل' };


/* بيانات اللعبة الثقيلة (كل اللاعبين والأسعار) تنحفظ 10 دقايق بدل ما تنحمل بكل فحص — الفحص المباشر يصير خفيف وسريع */
let BOOT = null;
const SLIM_E = ['id', 'web_name', 'first_name', 'second_name', 'team', 'element_type', 'status', 'chance_of_playing_next_round', 'now_cost', 'news', 'selected_by_percent', 'price_change_percent', 'price_change_projections', 'price_change_locked_until', 'transfers_in_event', 'transfers_out_event', 'cost_change_event'];
const pickO = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
async function getBoot() {
  const now = Date.now();
  if (BOOT && now - BOOT.at < 600e3) return { b: BOOT.b, fresh: false };
  const k = await getJ('cache:boot2').catch(() => null);
  if (k?.b && now - k.at < 600e3) { BOOT = k; return { b: k.b, fresh: false }; }
  const raw = await fpl('bootstrap-static/');
  const b = { elements: raw.elements.map((e) => pickO(e, SLIM_E)), teams: raw.teams.map((t) => ({ id: t.id, short_name: t.short_name })), events: raw.events.map((e) => pickO(e, ['id', 'is_current', 'is_next', 'deadline_time', 'finished', 'data_checked'])), total_players: raw.total_players };
  BOOT = { at: now, b }; await setJ('cache:boot2', BOOT, 900).catch(() => {});
  return { b, fresh: true };
}

export default async function handler(req, res) {
  if (!kvEnabled) return send(res, 200, { ok: false, reason: 'no kv' });
  const u = new URL(req.url, 'http://x');
  const force = u.searchParams.get('force') === process.env.NOTIFY_KEY && !!process.env.NOTIFY_KEY;
  if (!force && !(await kv('SET', 'lock:notify', '1', 'NX', 'EX', 55))) return send(res, 200, { ok: true, skipped: 'locked' });
  const log = { users: 0, sent: 0, gone: 0, events: [], mode: 'live' };
  try {
    const { b: boot, fresh: bootFresh } = await getBoot();
    const P = Object.fromEntries(boot.elements.map((e) => [e.id, e]));
    const T = Object.fromEntries(boot.teams.map((t) => [t.id, t.short_name]));
    const cur = boot.events.find((e) => e.is_current), next = boot.events.find((e) => e.is_next);
    const name = (id) => P[id]?.web_name || '#' + id;

    /* ---------- 1) تغيّرات اللاعبين (حالة + سعر) ---------- */
    const snapP = bootFresh ? await getJ('snap:players') : null; // نقارن الحالة والسعر بس لما تتحدث بيانات اللعبة (كل ~10 دقايق)
    const nh = (t) => (t ? crypto.createHash('md5').update(t).digest('hex').slice(0, 8) : '');
    const nowP = Object.fromEntries(boot.elements.map((e) => [e.id, [e.status, e.chance_of_playing_next_round ?? 100, e.now_cost, nh(e.news)]]));
    const statusCh = new Map(), priceCh = new Map();
    if (snapP) for (const [id, v] of Object.entries(nowP)) {
      const o = snapP[id]; if (!o) continue;
      if ((v[0] !== o[0] || v[1] < o[1]) && v[0] !== 'a') statusCh.set(+id, v);
      if (v[0] === 'a' && o[0] !== 'a') statusCh.set(+id, v); // رجع جاهز
      if (o[3] !== undefined && v[3] && v[3] !== o[3] && !statusCh.has(+id)) statusCh.set(+id, v); // تحديث نص الخبر (مثلاً موعد الرجوع)
      if (v[2] !== o[2]) priceCh.set(+id, v[2] - o[2]);
    }
    if (bootFresh) await setJ('snap:players', nowP);
    log.events.push(`status:${statusCh.size} price:${priceCh.size}`);

    /* ---------- 2) المباشر: أهداف/صناعات/طرد + بداية المباريات ---------- */
    let liveEv = new Map(), kick = [], gwDone = false; const pulseCh = [];
    if (cur) {
      const fx = await fpl(`fixtures/?event=${cur.id}`);
      const anyLive = fx.some((f) => f.started && !f.finished_provisional) || fx.some((f) => f.finished_provisional && !f.finished);
      // وضع الفحص: سريع وقت المباريات وقبلها بساعتين ونص (حتى ما يتأخر أي حدث)، وهادئ بباقي الأوقات
      const soonKO = fx.some((f) => !f.started && f.kickoff_time && new Date(f.kickoff_time) - Date.now() < 2.5 * 36e5);
      const soonDL = next && new Date(next.deadline_time) - Date.now() < 2 * 36e5 && new Date(next.deadline_time) > Date.now();
      log.mode = anyLive ? 'match' : soonKO || soonDL ? 'live' : 'idle';
      const fxSnap = (await getJ('snap:fx:' + cur.id)) || null;
      const fxNow = Object.fromEntries(fx.map((f) => [f.id, f.started ? 1 : 0]));
      if (fxSnap) kick = fx.filter((f) => f.started && !fxSnap[f.id] && !f.finished_provisional);
      await setJ('snap:fx:' + cur.id, fxNow, 9 * 86400);
      if (anyLive || kick.length) {
        const live = await fpl(`event/${cur.id}/live/`);
        const snapL = await getJ('snap:live:' + cur.id);
        const nowL = {};
        for (const el of live.elements) { const s = el.stats; if (s.minutes || s.goals_scored || s.assists || s.red_cards) nowL[el.id] = [s.goals_scored, s.assists, s.red_cards, s.total_points, s.clean_sheets || 0, s.bonus || 0]; }
        if (snapL) for (const [id, v] of Object.entries(nowL)) { const o = snapL[id] || [0, 0, 0, 0, 0, 0]; if (v[0] > o[0] || v[1] > o[1] || v[2] > o[2]) liveEv.set(+id, { g: v[0] - o[0], a: v[1] - o[1], r: v[2] - o[2], pts: v[3] });
          // لسجل «نبض الجولة» (حتى لو التطبيق مسكّر)
          const full = o.length >= 6 || !snapL[id];
          if (v[0] > o[0]) pulseCh.push({ id: +id, k: 'goal', v: v[0] }); if (v[1] > o[1]) pulseCh.push({ id: +id, k: 'assist', v: v[1] }); if (v[2] > o[2]) pulseCh.push({ id: +id, k: 'red', v: v[2] });
          if (full && v[4] > (o[4] || 0)) pulseCh.push({ id: +id, k: 'cs', v: v[4] }); if (full && o.length >= 6 && v[4] < o[4]) pulseCh.push({ id: +id, k: 'csl', v: v[4] }); if (full && v[5] > (o[5] || 0)) pulseCh.push({ id: +id, k: 'bonus', v: v[5], n: v[5] - (o[5] || 0) }); }
        await setJ('snap:live:' + cur.id, nowL, 9 * 86400);
      }
      const wasDone = await kv('GET', 'snap:done:' + cur.id);
      gwDone = cur.finished && !wasDone;
      if (cur.finished) await kv('SET', 'snap:done:' + cur.id, '1', 'EX', 30 * 86400);
      log.events.push(`live:${liveEv.size} kick:${kick.length} done:${gwDone}`);
    }


    /* ---------- 2ب) التشكيلات الرسمية: نفحص المباريات اللي باقي عليها ≤ 80 دقيقة لحد ما تنعلن ---------- */
    const luNew = [];
    try {
      const evs = [cur, next].filter(Boolean), seenF = new Set();
      for (const e of evs) {
        const fxs = await fpl(`fixtures/?event=${e.id}`).catch(() => []);
        for (const f of fxs) {
          if (seenF.has(f.id) || f.started || !f.kickoff_time) continue; seenF.add(f.id);
          const mins = (new Date(f.kickoff_time) - Date.now()) / 6e4; if (mins > 80 || mins < -15) continue;
          if (await kv('GET', 'lu:done:' + f.id)) continue;
          if (!(await kv('SET', 'lock:lu:' + f.id, '1', 'NX', 'EX', 100))) continue; // نفحص كل مباراة مرة كل ~دقيقتين بس
          const r = await getLineup(new Date(f.kickoff_time), T[f.team_h], T[f.team_a]).catch(() => null);
          const sd = r?.code === 200 ? r.d?.sides : null;
          if (!sd?.h?.players?.filter((x) => x.starter).length || sd.h.players.filter((x) => x.starter).length < 11 || (sd.a?.players || []).filter((x) => x.starter).length < 11) continue;
          const side = (k, team) => { const pl = sd[k].players, M = mapFPL(pl, boot.elements.filter((x) => x.team === team)); return { st: pl.filter((x) => x.starter).map((x) => M[x.id]).filter(Boolean), bn: pl.filter((x) => !x.starter).map((x) => M[x.id]).filter(Boolean), team }; };
          const L = { id: f.id, h: side('h', f.team_h), a: side('a', f.team_a), ko: f.kickoff_time };
          await kv('SET', 'lu:done:' + f.id, '1', 'EX', 3 * 86400);
          await setJ('lu:fx:' + f.id, L, 3 * 86400);
          luNew.push(L);
        }
      }
      if (luNew.length) log.events.push(`lineups:${luNew.length}`);
    } catch {}

    /* ---------- 3) توقع الأسعار الليلة (مرة باليوم، المسا) ---------- */
    const total = boot.total_players || 10e6;
    const hourUTC = new Date().getUTCHours();
    const predictTime = hourUTC >= 17 && hourUTC <= 22;
    const pred = new Map();
    if (predictTime) for (const e of boot.elements) {
      if (e.price_change_percent != null && e.price_change_percent !== '') { // توقع الفانتازي الرسمي
        const nx = (e.price_change_projections || []).find((x) => +x.offset === 0), v = nx ? +nx.projected_percent : +e.price_change_percent;
        if (!e.price_change_locked_until && v >= 100) pred.set(e.id, 1); else if (!e.price_change_locked_until && v <= -100) pred.set(e.id, -1);
        continue;
      }
      const owners = Math.max(1, (parseFloat(e.selected_by_percent) / 100) * total), net = (e.transfers_in_event || 0) - (e.transfers_out_event || 0);
      let thr = Math.max(15000, owners * 0.06); if (net < 0 && e.status !== 'a') thr *= 0.55; if (e.cost_change_event) thr *= 1.25;
      const prog = (net / thr) * 100; if (prog >= 95) pred.set(e.id, 1); else if (prog <= -95) pred.set(e.id, -1);
    }
    const day = new Date().toISOString().slice(0, 10);

    /* ---------- 3ب) أخبار المصادر (BBC/Guardian/Sky) كل ~10 دقايق ---------- */
    let freshNews = [], feedTotal = -1;
    if (await kv('SET', 'lock:feeds', '1', 'NX', 'EX', 170)) {
      try {
        const { items, ok } = await fetchFeeds(); feedTotal = items.length; log.feedSrc = ok;
        const seen = new Set((await getJ('snap:feeds')) || []), first = !seen.size;
        const names = boot.elements.filter((e) => (e.web_name || '').length >= 4).map((e) => [e.id, new RegExp(`\\b${e.web_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')]);
        for (const x of items) {
          if (seen.has(x.link)) continue; seen.add(x.link);
          if (first || x.cat === 'other' || Date.now() - x.at > 6 * 36e5) continue;
          const txt = `${x.title} ${x.desc}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          x.players = names.filter(([, re]) => re.test(txt)).map(([id]) => id);
          if (x.players.length) { try { const c = await kv('GET', 'tr:' + trHash(x.title)); if (c) x.titleAr = JSON.parse(c).t; } catch {} freshNews.push(x); }
        }
        await setJ('snap:feeds', [...seen].slice(-400), 7 * 86400);
      } catch {}
      log.events.push(`feeds:${freshNews.length}/${feedTotal}`);
    }

    /* ---------- 3ج) سجل «نبض الجولة» للفرق المسجّلة (يشتغل بالسيرفر حتى لو التطبيق مسكّر) ---------- */
    if (cur && pulseCh.length) {
      try {
        const cfg = (await kv('HGETALL', 'pulse:cfg')) || [], now = Date.now();
        const pairs = Array.isArray(cfg) ? cfg.reduce((a, x, i) => (i % 2 ? (a[a.length - 1].push(x), a) : [...a, [x]]), []) : Object.entries(cfg);
        const picksOf = async (team) => { const ck = `picks:${team}:${cur.id}`; let pk = await getJ(ck); if (!pk) { try { const d = await fpl(`entry/${team}/event/${cur.id}/picks/`); pk = d.picks.map((p) => [p.element, p.multiplier]); await setJ(ck, pk, 3 * 86400); } catch { pk = []; } } return pk; };
        for (const [team, raw] of pairs.slice(0, 300)) {
          let c; try { c = JSON.parse(raw); } catch { continue; }
          if (!c || now - (c.at || 0) > 12 * 86400) continue;
          const mine = new Set((await picksOf(team)).map((x) => x[0]));
          // كل خصوم المواجهات بكل دوريات الـ H2H لهالجولة (السيرفر يحسبهم بنفسه من بداية الجولة) + المنافس اللي اختاره
          const rk = `pulse:rv:${team}:${cur.id}`; let rivals = await getJ(rk);
          if (!rivals) { rivals = []; try { const en = await fpl(`entry/${team}/`);
            for (const l of en.leagues?.h2h || []) { let page = 1, more = true; while (more && page <= 5) { const d = await fpl(`leagues-h2h-matches/league/${l.id}/?event=${cur.id}&page=${page}`); const m = (d.results || []).find((x) => x.entry_1_entry === +team || x.entry_2_entry === +team); if (m) { const a = m.entry_1_entry === +team; const e = a ? m.entry_2_entry : m.entry_1_entry; if (e && !rivals.some((x) => x.e === e)) rivals.push({ e, n: a ? m.entry_2_name : m.entry_1_name }); more = false; } else more = !!d.has_next; page++; } }
            await setJ(rk, rivals, rivals.length ? 9 * 86400 : 3600); } catch {} }
          if (c.rival && !rivals.some((x) => x.e === c.rival)) rivals = [...rivals, { e: c.rival, n: c.rname || '' }];
          const rvSets = []; for (const r of rivals.slice(0, 12)) rvSets.push({ ...r, s: new Set((await picksOf(r.e)).map((x) => x[0])) });
          const key = `pulse:ev:${team}:${cur.id}`, list = (await getJ(key)) || [], have = new Set(list.map((e) => e.key)); let add = 0;
          const put = (ch, who, rv, rname) => { const k = `${ch.k}_${ch.id}_${ch.v}_${rv || 0}`; if (have.has(k)) return; have.add(k); const m = who === 'me'; list.unshift({ key: k, at: now, k: ch.k, id: ch.id, who, n: ch.n || 0, tone: (ch.k === 'red' || ch.k === 'csl') === m ? 'bad' : 'good', rival: rv || null, rname: rname || null }); add++; };
          for (const ch of pulseCh) {
            if (mine.has(ch.id)) { if (ch.k !== 'cs') put(ch, 'me'); continue; }
            if (ch.k === 'csl') continue;
            for (const r of rvSets) if (r.s.has(ch.id)) put(ch, 'rv', r.e, r.n);
          }
          if (add) await setJ(key, list.slice(0, 80), 9 * 86400);
        }
        log.events.push(`pulse:${pulseCh.length}`);
      } catch {}
    }

    /* ---------- 4) لكل مستخدم ---------- */
    const uids = (await kv('SMEMBERS', 'push:users')) || [];
    const pickGW = cur?.id;
    for (const uid of uids) {
      const U = await getJ('push:' + uid); if (!U?.subs?.length || !U.teamId) continue;
      log.users++;
      const pref = U.prefs || {}, on = (k) => pref[k] !== false;
      // تشكيلة آخر جولة بدأت (الانتقالات الجديدة تبين بعد الإغلاق)
      let picks = [];
      if (pickGW) {
        const ck = `picks:${U.teamId}:${pickGW}`;
        picks = await getJ(ck);
        if (!picks) { try { const d = await fpl(`entry/${U.teamId}/event/${pickGW}/picks/`); picks = d.picks.map((p) => [p.element, p.multiplier]); await setJ(ck, picks, 3 * 86400); } catch { picks = []; } }
      }
      const squad = new Set(picks.map((p) => p[0])), mult = Object.fromEntries(picks), watch = new Set(U.watch || []);
      const msgs = [];
      // الإغلاق
      if (next && on('deadline')) {
        const h = (new Date(next.deadline_time) - Date.now()) / 36e5;
        if (h > 0 && h <= 24) msgs.push({ k: `dl24_${next.id}`, title: `⏰ باقي أقل من يوم على إغلاق الجولة ${next.id}`, body: 'راجع تشكيلتك والكابتن والانتقالات قبل الإغلاق.', url: '/#check' });
        if (h > 0 && h <= 2.5 && h > 1.25) msgs.push({ k: `dl2_${next.id}`, title: `🔎 افحص فريقك قبل الديدلاين (الجولة ${next.id})`, body: 'باقي ساعتين — افتح «افحص الفريق قبل الديدلاين» وصلّح أي مصاب أو كابتن مشكوك.', url: '/#check' });
        if (h > 0 && h <= 1.25) msgs.push({ k: `dl1_${next.id}`, title: `🚨 باقي ساعة على إغلاق الجولة ${next.id}!`, body: 'آخر فرصة تثبت الكابتن والانتقالات.', url: '/#check', urg: 'high' });
      }
      // الإصابات
      if (on('injury')) for (const [id, v] of statusCh) if (squad.has(id) || watch.has(id)) {
        const back = v[0] === 'a';
        msgs.push({ k: `st_${id}_${v[0]}_${v[1]}_${v[3]}`, title: back ? `✅ ${name(id)} رجع جاهز` : `🩹 ${name(id)}: ${ST_AR[v[0]] || 'تحديث'}${v[0] === 'd' ? ` (${v[1]}%)` : ''}`, body: back ? 'صار متاح للمشاركة.' : (newsAr(P[id]?.news) || P[id]?.news || ''), url: `/#news` });
      }
      // الأسعار
      if (on('price')) {
        for (const [id, d] of priceCh) if (squad.has(id) || watch.has(id)) msgs.push({ k: `pc_${id}_${nowP[id][2]}`, title: `${d > 0 ? '📈' : '📉'} سعر ${name(id)} ${d > 0 ? 'صعد' : 'نزل'} إلى ${(nowP[id][2] / 10).toFixed(1)}م`, body: watch.has(id) && !squad.has(id) ? 'من قائمة المراقبة' : 'لاعب من فريقك', url: '/#prices' });
        const mine = [...pred].filter(([id]) => squad.has(id) || watch.has(id));
        if (mine.length) {
          const up = mine.filter(([, s]) => s > 0).map(([id]) => name(id)), dn = mine.filter(([, s]) => s < 0).map(([id]) => name(id));
          msgs.push({ k: `pp_${day}`, title: '💰 توقع الأسعار الليلة', body: [up.length ? `يصعد: ${up.join('، ')}` : '', dn.length ? `ينزل: ${dn.join('، ')}` : ''].filter(Boolean).join(' · '), url: '/#prices' });
        }
      }
      // أخبار المصادر عن لاعبينه
      if (on('injury')) for (const x of freshNews) if (x.players.some((id) => squad.has(id) || watch.has(id))) {
        const ic = { injury: '🩹', ban: '🟥', press: '🎙️', team: '📋' }[x.cat] || '📰';
        msgs.push({ k: `nw_${trHash(x.link)}`, title: `${ic} ${x.titleAr || x.title}`, body: `${x.src} · اضغط حتى تقرأ`, url: '/#news' });
      }
      // التشكيلة الرسمية لمباريات لاعبينه
      if (on('lineups') && luNew.length) {
        const mineAll = new Set([...squad, ...watch]);
        for (const L of luNew) {
          const inv = [...mineAll].filter((id) => P[id]?.team === L.h.team || P[id]?.team === L.a.team); if (!inv.length) continue;
          const sideOf = (id) => (P[id].team === L.h.team ? L.h : L.a);
          const st = inv.filter((id) => sideOf(id).st.includes(id)), bn = inv.filter((id) => sideOf(id).bn.includes(id)), out = inv.filter((id) => !st.includes(id) && !bn.includes(id));
          const capOut = out.concat(bn).some((id) => mult[id] >= 2);
          const body = [st.length ? `أساسي: ${st.map(name).join('، ')}` : '', bn.length ? `دكة: ${bn.map(name).join('، ')}` : '', out.length ? `برا القائمة: ${out.map(name).join('، ')}` : ''].filter(Boolean).join(' · ');
          msgs.push({ k: `lu_${L.id}`, title: `📋 التشكيلة الرسمية: ${T[L.h.team]}×${T[L.a.team]}${capOut ? ' ⚠️ كابتنك مو أساسي!' : ''}`, body, url: '/#live', urg: 'high' });
        }
      }
      // المباشر
      if (on('goals')) for (const [id, e] of liveEv) if (squad.has(id) && mult[id] > 0) {
        const cap = mult[id] >= 2 ? (mult[id] === 3 ? ' (تريبل كابتن ×3)' : ' (الكابتن ×2)') : '';
        if (e.g > 0) msgs.push({ k: `g_${pickGW}_${id}_${e.pts}_${e.g}`, title: `⚽ هدف! ${name(id)}${cap}`, body: `${e.pts * mult[id]} نقطة لحد هسة`, url: '/#live', urg: 'high' });
        else if (e.a > 0) msgs.push({ k: `a_${pickGW}_${id}_${e.pts}`, title: `🅰️ صناعة: ${name(id)}${cap}`, body: `${e.pts * mult[id]} نقطة لحد هسة`, url: '/#live', urg: 'high' });
        if (e.r > 0) msgs.push({ k: `r_${pickGW}_${id}`, title: `🟥 طرد: ${name(id)}`, body: 'خسارة نقاط للأسف', url: '/#live' });
      }
      if (on('start') && kick.length) {
        const games = kick.filter((f) => picks.some(([id, m]) => m > 0 && (P[id]?.team === f.team_h || P[id]?.team === f.team_a)));
        if (games.length) msgs.push({ k: `ko_${games.map((g) => g.id).join('_')}`, title: `▶️ بدأت: ${games.map((f) => `${T[f.team_h]}×${T[f.team_a]}`).join(' · ')}`, body: 'بيها لاعبين من تشكيلتك — تابع النقاط مباشرة.', url: '/#live' });
      }
      // نهاية الجولة
      if (gwDone && on('league')) {
        try { const h = await fpl(`entry/${U.teamId}/history/`); const g = h.current.find((x) => x.event === cur.id); if (g) msgs.push({ k: `done_${cur.id}`, title: `🏁 انتهت الجولة ${cur.id}: ${g.points} نقطة`, body: `ترتيبك العام ${Number(g.overall_rank).toLocaleString('en')} · المعدل ${cur.average_entry_score}`, url: '/#season' }); } catch {}
      }
      // الإرسال (بدون تكرار)
      for (const m of msgs.slice(0, 8)) {
        if (!(await kv('SET', `sent:${uid}:${m.k}`, '1', 'NX', 'EX', 14 * 86400))) continue;
        const gone = [];
        for (const s of U.subs) { try { const r = await sendPush(s, { title: m.title, body: m.body, url: m.url, tag: m.k }, { urgency: m.urg || 'normal' }); if (r.ok) log.sent++; if (r.gone) gone.push(s.endpoint); } catch {} }
        if (gone.length) { U.subs = U.subs.filter((s) => !gone.includes(s.endpoint)); log.gone += gone.length; await setJ('push:' + uid, U); if (!U.subs.length) { await kv('SREM', 'push:users', uid); break; } }
      }
    }
    await kv('SET', 'notify:last', JSON.stringify({ at: Date.now(), ...log }));
    await kv('DEL', 'lock:notify').catch(() => {});
    return send(res, 200, { ok: true, ...log });
  } catch (e) {
    await kv('DEL', 'lock:notify').catch(() => {});
    return send(res, 500, { ok: false, error: e.message, ...log });
  }
}
