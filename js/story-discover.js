/* =========================================================
   محرّك الاكتشافات للمربع المتغير: الشجرة تطوّر نفسها
   - مولّدات كثيرة من سياقات مختلفة (حظ اللاعبين، الجواهر المخفية، المساهمات الدفاعية،
     منفّذي الجزاء، الأرض والبرا، تغيّرات الأندية، الجولات المزدوجة/الفارغة، خطر الدوران،
     البونص، والتحليل الذكي للأندية)
   - كل معلومة إلها هوية ثابتة وعائلة. الشجرة تتذكر شنو عرضت وبأي جولة (بالجهاز)،
     فتقلل وزن المعلومة اللي انعرضت قريب والعائلة اللي طلعت الجولة الفاتت،
     وترفع المعلومة الجديدة اللي ما انعرضت أبد. والنتيجة تتغير كل جولة وتتحدث بعد كل مباراة.
   - كل الأرقام حقيقية من بيانات الفانتازي ونتائج المباريات، ولا رقم مفترض.
========================================================= */
import { ST, PM, tName, tShort } from './store.js';
import { tt } from './i18n.js';
import { esc } from './ui.js';
import { fixturesFor, xp } from './engine.js';
import { sellPrice10 } from './solver.js';
import { analyse, league, memory, goalsW, ptsW } from './club-intel.js';

const SK = 'fp_sy_disc';
const ld = () => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } };
const sv = (o) => { try { localStorage.setItem(SK, JSON.stringify(o)); } catch {} };
const n1 = (v) => (Math.round(v * 10) / 10).toString();
const rt = (a, b) => (b ? a / b : 0);
const B = (v) => `<bdi dir="ltr">${v}</bdi>`;

const CIK = {};
const ci = (tid) => { const k = `${tid}:${ST.G.fxList.filter((f) => f.fin).length}`; if (!(k in CIK)) { try { CIK[k] = analyse(tid); } catch { CIK[k] = null; } } return CIK[k]; };
const wu = (x) => (x.big != null && x.unit && !/^عن/.test(x.unit) ? `${x.big} ${x.unit}. ${x.text}` : x.text);
// بديل من تشكيلتك نفسها: أضعف لاعب بنفس المركز، والميزانية (البنك + سعر بيعه) تكفي، وما يتجاوز 3 من نفس النادي
const swapFor = (c, sq, g) => { const bank = ST.plan?.bank || 0;
  const xs = sq.filter((p) => p.pos === c.pos && bank + sellPrice10(p.id) / 10 >= c.price && sq.filter((q) => q.team === c.team && q.id !== p.id).length < 3).sort((a, b) => xp(a, g) - xp(b, g));
  const w = xs[0]; return w && xp(w, g) < xp(c, g) ? w : null; };
const swapTxt = (w, c) => { const left = Math.round(((ST.plan?.bank || 0) + sellPrice10(w.id) / 10 - c.price) * 10) / 10;
  return tt(`. يناسب ميزانيتك بدل ${w.name}${left > 0 ? ` ويبقى عندك £${left}` : ''}`, `. Fits your budget for ${w.name}`); };
const nf = (p, g) => fixturesFor(p.team, g)[0];

/* ---------- المولّدات: كل وحدة ترجع مرشّحين { id, fam, sc, t, x, big, tone } ---------- */
const GEN = [
  // حظ التشطيب: أهداف أكثر/أقل من الفرص الحقيقية
  ({ sq }) => sq.filter((p) => p.min >= 450 && p.xg >= 1.5).map((p) => ({ p, d: p.gls - p.xg })).filter((o) => Math.abs(o.d) >= 2).map(({ p, d }) => d > 0
    ? { id: `luck+:${p.id}`, fam: 'luck', sc: 0.5 + d / 8, tone: 'dn', t: tt(`${p.name} يسجّل أكثر من فرصه`, `${p.name} overperforming`), x: tt(`سجّل ${goalsW(p.gls)} من فرص تسوى ${n1(p.xg)} هدف متوقع، فممكن تهدأ أهدافه قريب`, `${p.gls} goals from ${n1(p.xg)} xG, may cool off`), big: `${p.gls}/${n1(p.xg)}` }
    : { id: `luck-:${p.id}`, fam: 'luck', sc: 0.5 - d / 8, tone: 'up', t: tt(`${p.name} أهدافه جاية`, `${p.name} due a goal`), x: tt(`فرصه تسوى ${n1(p.xg)} هدف متوقع بس سجّل ${goalsW(p.gls)}، يعني يوصل للمرمى والأهداف قريبة`, `${n1(p.xg)} xG but only ${p.gls} goals`), big: `${p.gls}/${n1(p.xg)}` }),
  // جوهرة مخفية: ملكية قليلة وفورمة عالية وخصم سهل، وتنشرى ببيع لاعب من تشكيلتك
  ({ g, own, sq }) => { const p = ST.G.players.filter((p) => !own.has(p.id) && p.own < 8 && p.form >= 4.5 && p.min >= 270 && p.st === 'a' && (nf(p, g)?.fdr || 5) <= 3).sort((a, b) => b.form - a.form).find((p) => swapFor(p, sq, g));
    if (!p) return []; const w = swapFor(p, sq, g);
    return [{ id: `gem:${p.id}`, fam: 'gem', sc: 0.55 + p.form / 25, tone: 'up', t: tt(`جوهرة مخفية: ${p.name}`, `Hidden gem: ${p.name}`), x: tt(`ملكيته ${p.own}% بس فورمته ${p.form}، والجولة الجاية ضد ${tName(nf(p, g).opp)}`, `${p.own}% owned, form ${p.form}`) + swapTxt(w, p), big: `£${p.price}` }]; },
  // المساهمات الدفاعية: إذا عندك مدافع يجمعها نذكره، وإلا نقترح واحد يناسب ميزانيتك
  ({ g, own, sq }) => { const mineD = sq.filter((p) => p.pos === 'DEF' && p.min >= 450 && p.dc90 >= 9).sort((a, b) => b.dc90 - a.dc90)[0];
    if (mineD) return [{ id: `dcm:${mineD.id}`, fam: 'defcon', sc: 0.5, tone: 'up', t: tt(`${mineD.name} يجمع المساهمات الدفاعية`, `${mineD.name} racks up defcon`), x: tt(`عنده ${mineD.dc} مساهمة بالموسم، يعني ${n1(mineD.dc90)} بكل 90 دقيقة، فقريب من نقطتين إضافيتين كل مباراة (الشرط 10)`, `${n1(mineD.dc90)} per 90`), big: n1(mineD.dc90) }];
    const p = ST.G.players.filter((p) => p.pos === 'DEF' && !own.has(p.id) && p.min >= 450 && p.dc90 >= 10 && p.st === 'a' && (nf(p, g)?.fdr || 5) <= 3).sort((a, b) => b.dc90 - a.dc90).find((p) => swapFor(p, sq, g));
    if (!p) return []; const w = swapFor(p, sq, g);
    return [{ id: `dcon:${p.id}`, fam: 'defcon', sc: 0.5 + (p.dc90 - 10) / 10, tone: 'up', t: tt(`مدافع يجمع المساهمات الدفاعية: ${p.name}`, `Defcon pick: ${p.name}`), x: tt(`يجمع ${n1(p.dc90)} تدخل وقطع وتشتيت بكل 90 دقيقة، فيوصل لنقطتين المساهمات (10 بالمباراة) أغلب الأحيان`, `${n1(p.dc90)} per 90`) + swapTxt(w, p), big: `£${p.price}` }]; },
  // منفّذ الجزاء: لاعبيك أولاً، وإلا أحسن منفّذ يواجه دفاع مفتوح ويناسب ميزانيتك
  ({ g, T, sq, own }) => { const rows = ST.G.players.filter((p) => p.pen === 1 && p.st === 'a' && p.min >= 270).map((p) => { const f = nf(p, g), O = f && T[f.opp]; return O && O.p >= 3 ? { p, f, ga: rt(O.ga, O.p), mine: own.has(p.id) } : null; }).filter(Boolean).sort((a, b) => b.mine - a.mine || b.ga - a.ga);
    const m = rows.find((r) => r.mine);
    if (m) return [{ id: `penm:${m.p.id}:${g}`, fam: 'pen', sc: 0.4 + m.ga / 6, tone: m.ga >= 1.4 ? 'up' : '', t: tt(`${m.p.name} منفّذ الجزاء عندك`, `${m.p.name} is your pen taker`), x: tt(`أول منفّذ جزاء لـ ${tName(m.p.team)}، وخصمه ${tName(m.f.opp)} يستقبل ${n1(m.ga)} بالمباراة. سجّل ${goalsW(m.p.gls)} لحد هسه`, `${tName(m.f.opp)} concede ${n1(m.ga)}/game`), big: n1(m.ga) }];
    const o = rows.find((r) => r.ga >= 1.5 && swapFor(r.p, sq, g)); if (!o) return []; const w = swapFor(o.p, sq, g);
    return [{ id: `pen:${o.p.id}:${g}`, fam: 'pen', sc: 0.45 + o.ga / 6, tone: 'up', t: tt(`منفّذ جزاء ضد دفاع مفتوح: ${o.p.name}`, `Pen taker vs leaky defence: ${o.p.name}`), x: tt(`أول منفّذ جزاء لـ ${tName(o.p.team)}، وخصمه ${tName(o.f.opp)} يستقبل ${n1(o.ga)} بالمباراة`, `${tName(o.f.opp)} concede ${n1(o.ga)}/game`) + swapTxt(w, o.p), big: `£${o.p.price}` }]; },
  // الأرض والبرا لفرق تشكيلتك
  ({ g, T, teams }) => teams.map((tid) => { const A = T[tid], f = fixturesFor(tid, g)[0]; if (!A || !f || A.H.p < 3 || A.W.p < 3) return null; const hp = A.H.pts / A.H.p, wp = A.W.pts / A.W.p;
    if (f.home && hp - wp >= 1) return { id: `ven+:${tid}`, fam: 'venue', sc: 0.45 + (hp - wp) / 5, tone: 'up', t: tt(`${tName(tid)} وحش بأرضه`, `${tName(tid)} strong at home`), x: tt(`يجمع ${n1(hp)} نقطة بالمباراة بأرضه و${n1(wp)} برا، والجولة الجاية بأرضه ضد ${tName(f.opp)}`, `${n1(hp)} ppg home vs ${n1(wp)} away; home next`), big: n1(hp) };
    if (!f.home && hp - wp >= 1) return { id: `ven-:${tid}`, fam: 'venue', sc: 0.45 + (hp - wp) / 5, tone: 'dn', t: tt(`${tName(tid)} يتعب برا أرضه`, `${tName(tid)} weak away`), x: tt(`برا أرضه يجمع ${n1(wp)} نقطة بالمباراة بس، والجولة الجاية برا ضد ${tName(f.opp)}`, `Only ${n1(wp)} ppg away; away next`), big: n1(wp) };
    return null; }).filter(Boolean),
  // شنو تغيّر بأندية تشكيلتك من آخر مرة
  ({ teams }) => teams.flatMap((tid) => { const R = ci(tid); if (!R?.A?.p) return []; const M = memory(tid, R); M.save([]);
    return M.changes.filter((c) => !c.ref).map((c) => ({ id: `trend:${tid}:${c.id}:${R.A.p}`, fam: 'trend', sc: 0.6 + c.w / 3, tone: c.tone === 'g' ? 'up' : 'dn', fresh: 1, t: `${tName(tid)}: ${c.title}`, x: c.text })); }),
  // جولات مزدوجة وفارغة قريبة لفرق تشكيلتك
  ({ g, sq }) => { const out = []; for (let w = g; w < g + 5 && w <= 38; w++) { const by = {}; sq.forEach((p) => { (by[p.team] = by[p.team] || []).push(p); });
      Object.entries(by).forEach(([tid, ps]) => { const n = fixturesFor(+tid, w).length, names = ps.map((p) => p.name).join('، ');
        if (n > 1) out.push({ id: `dgw:${tid}:${w}`, fam: 'gw', sc: 0.95 - (w - g) / 20, tone: 'up', t: tt(`جولة مزدوجة لـ ${tName(+tid)}`, `Double GW for ${tName(+tid)}`), x: tt(`يلعب مباراتين بالجولة ${w}، وعندك منه: ${names}`, `Plays twice in GW ${w}: ${names}`), big: `${tt('ج', 'GW')}${w}` });
        if (!n) out.push({ id: `bgw:${tid}:${w}`, fam: 'gw', sc: 0.95 - (w - g) / 20, tone: 'dn', t: tt(`جولة فارغة لـ ${tName(+tid)}`, `Blank GW for ${tName(+tid)}`), x: tt(`ما يلعب بالجولة ${w}، فجهّز بديل لـ ${names}`, `No game in GW ${w}: ${names}`), big: `${tt('ج', 'GW')}${w}` }); }); }
    return out; },
  // خطر الدوران: لاعب غالي بتشكيلتك ما يبدأ دائماً
  ({ sq, T }) => sq.filter((p) => p.starts != null && p.price >= 5.5 && p.st === 'a' && T[p.team]?.p >= 5).map((p) => ({ p, r: p.starts / T[p.team].p })).filter((o) => o.r < 0.65 && o.p.min > 0).map(({ p, r }) => ({ id: `rot:${p.id}:${T[p.team].p}`, fam: 'rot', sc: 0.5 + (0.65 - r), tone: 'dn', t: tt(`${p.name} مو أساسي دائماً`, `${p.name} rotation risk`), x: tt(`بدأ ${p.starts} من ${T[p.team].p} مباريات لفريقه، فخطر يقعد بالدكة`, `Started ${p.starts} of ${T[p.team].p}`), big: `${Math.round(r * 100)}%` })),
  // البونص: أكثر لاعب بتشكيلتك ياخذ بونص، أو صياد بونص يناسب ميزانيتك
  ({ g, own, sq }) => { const per = (p) => p.bonus / (p.min / 90);
    const m = sq.filter((p) => p.min >= 450).sort((a, b) => per(b) - per(a))[0];
    if (m && per(m) >= 0.6) return [{ id: `bonm:${m.id}:${m.bonus}`, fam: 'bonus', sc: 0.4 + per(m) / 4, tone: 'up', t: tt(`${m.name} صياد البونص بتشكيلتك`, `${m.name} your bonus magnet`), x: tt(`جمع ${ptsW(m.bonus)} بونص بالموسم، يعني ${n1(per(m))} بكل 90 دقيقة، وأكثر واحد بفريقك`, `${m.bonus} bonus, ${n1(per(m))}/90`), big: String(m.bonus) }];
    const p = ST.G.players.filter((p) => !own.has(p.id) && p.min >= 600 && p.st === 'a' && (nf(p, g)?.fdr || 5) <= 3).sort((a, b) => per(b) - per(a)).find((p) => per(p) >= 0.8 && swapFor(p, sq, g));
    if (!p) return []; const w = swapFor(p, sq, g);
    return [{ id: `bon:${p.id}`, fam: 'bonus', sc: 0.45 + per(p) / 4, tone: 'up', t: tt(`صياد البونص: ${p.name}`, `Bonus magnet: ${p.name}`), x: tt(`ياخذ ${n1(per(p))} نقطة بونص بكل 90 دقيقة (${p.bonus} بالموسم)`, `${n1(per(p))} bonus per 90`) + swapTxt(w, p), big: n1(per(p)) }]; },
  // التحليل الذكي: أبرز نقطة قوة بأندية تشكيلتك ونقطة ضعف بخصومهم
  ({ g, teams }) => teams.flatMap((tid) => { const R = ci(tid), f = fixturesFor(tid, g)[0], O = f ? ci(f.opp) : null, out = [];
    const best = (X, tone) => (X ? Object.values(X.branches).flat().filter((x) => x.tone === tone && !x.always && !['gf', 'ga', 'fdr', 'cs'].includes(x.id) && /\d/.test(x.text)).sort((a, b) => b.w - a.w)[0] : null);
    const s = best(R, 'g'); if (s) out.push({ id: `ci:${tid}:${s.id}`, fam: 'club', sc: 0.35 + s.w / 2.5, tone: 'up', t: `${tName(tid)}: ${s.title}`, x: wu(s), big: s.big != null ? String(s.big) : null });
    const w = best(O, 'b'); if (w) out.push({ id: `cio:${f.opp}:${w.id}`, fam: 'opp', sc: 0.35 + w.w / 2.5, tone: 'up', t: tt(`خصم ${tName(tid)}: ${w.title}`, `${tName(tid)}’s opponent: ${w.title}`), x: wu(w), big: w.big != null ? String(w.big) : null });
    return out; }),
];

/* ---------- الاختيار: جديد + متنوّع + ما يتكرر ---------- */
let CACHE_K = '', CACHE = null;
export function discover(nPer = 3) {
  const g = ST.G.next, sqIds = ST.plan?.squad || []; if (!g || !sqIds.length) return [];
  const k = `${g}:${ST.G.fxList.filter((f) => f.fin).length}:${sqIds.join(',')}`;
  if (k === CACHE_K) return CACHE;
  const T = league(), sq = sqIds.map(PM).filter(Boolean), own = new Set(sqIds), teams = [...new Set(sq.map((p) => p.team))];
  const ctx = { g, T, sq, own, teams };
  let C = []; GEN.forEach((f) => { try { C.push(...f(ctx)); } catch {} });
  const S = ld(), ids = S.ids || {}, fams = S.fams || {};
  // الوزن النهائي: الأهمية × الجِدّة (المعلومة اللي انعرضت قبل جولة لجولتين تنزل، والعائلة اللي طلعت الجولة الفاتت تنزل شوية)
  C = C.map((c) => { const seenAt = ids[c.id], fa = fams[c.fam];
    const nov = seenAt == null ? 1.15 : seenAt === g ? 1 : Math.max(0.15, Math.min(1, (g - seenAt) / 4));
    const fp = fa != null && fa !== g && g - fa <= 1 ? 0.7 : 1;
    return { ...c, isNew: seenAt == null || c.fresh || (S.first?.gw === g && S.first.ids.includes(c.id)), v: c.sc * nov * fp }; }).sort((a, b) => b.v - a.v);
  // نفس الجولة = نفس الاختيار (يثبت بين فتحة وفتحة)، والأرقام نفسها تتحدث
  const prevP = S.pick?.gw === g ? S.pick.ids : [];
  const ordered = [...C.filter((c) => prevP.includes(c.id)).sort((a, b) => prevP.indexOf(a.id) - prevP.indexOf(b.id)), ...C.filter((c) => !prevP.includes(c.id))];
  const picked = [], usedF = new Set();
  for (const c of ordered) { if (usedF.has(c.fam)) continue; picked.push(c); usedF.add(c.fam); if (picked.length >= nPer * 2) break; }
  picked.forEach((c) => { if (ids[c.id] == null || ids[c.id] < g) ids[c.id] = g; fams[c.fam] = g; });
  // isNew يبقى صحيح طول الجولة اللي ظهرت بيها لأول مرة
  const keep = Object.fromEntries(Object.entries(ids).filter(([, w]) => g - w <= 10));
  sv({ ...S, ids: keep, fams, pick: { gw: g, ids: picked.map((c) => c.id) }, first: { ...(S.first?.gw === g ? S.first : { gw: g, ids: [] }), ids: [...new Set([...(S.first?.gw === g ? S.first.ids : []), ...picked.filter((c) => c.isNew).map((c) => c.id)])] } });
  CACHE_K = k; CACHE = picked; return picked;
}

/* ترتيب شرائح الأندية حسب آخر مرة انعرضت، حتى كل جولة تطلع اللي غابت أطول */
export function freshest(slides, n) {
  const g = ST.G.next || ST.G.cur, S = ld(), sl = S.sl || {};
  const prev = S.slp?.gw === g ? S.slp.ks : null;
  const out = prev ? [...slides.filter((s) => prev.includes(s.k)), ...slides.filter((s) => !prev.includes(s.k))].slice(0, n)
    : [...slides].sort((a, b) => (sl[a.k] ?? -99) - (sl[b.k] ?? -99)).slice(0, n);
  if (!prev || prev.join() !== out.map((s) => s.k).join()) { out.forEach((s) => (sl[s.k] = g)); sv({ ...ld(), sl, slp: { gw: g, ks: out.map((s) => s.k) } }); }
  return out;
}

export const discLi = (c, i) => `<li style="--d:${80 + i * 60}ms"><b>${esc(c.t)}${c.isNew ? `<em class="sy-new">${tt('جديد', 'New')}</em>` : ''}</b>${c.big ? `<span class="${c.tone}">${B(esc(c.big))}</span>` : ''}<small>${esc(c.x)}</small></li>`;
