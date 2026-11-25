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
  /* ---- من موسم المدرب نفسه: كل مدرب أرقامه تختلف ---- */
  // نقاط ضاعت بالدكة
  () => { const H = ST.E?.hist?.current || []; if (H.length < 4) return [];
    const tot = H.reduce((a, h) => a + (h.points_on_bench || 0), 0), l3 = H.slice(-3).reduce((a, h) => a + (h.points_on_bench || 0), 0), avg = tot / H.length;
    return tot >= 15 ? [{ id: `bench:${H.length}`, fam: 'bench', sc: 0.4 + Math.min(0.5, avg / 14), tone: 'dn', t: tt('نقاط ضاعت بدكتك', 'Points left on your bench'), x: tt(`${tot} نقطة بالموسم (${n1(avg)} بالجولة)، منها ${l3} بآخر 3 جولات. رتّب دكتك قبل الإغلاق ولا تخلي أساسي مضمون برا`, `${tot} pts this season`), big: String(tot) }] : []; },
  // الخصومات
  () => { const H = ST.E?.hist?.current || []; const c = H.reduce((a, h) => a + (h.event_transfers_cost || 0), 0), n = H.filter((h) => h.event_transfers_cost > 0).length;
    return c >= 8 ? [{ id: `hits:${c}`, fam: 'hits', sc: 0.4 + Math.min(0.5, c / 40), tone: 'dn', t: tt('خصوماتك بالموسم', 'Your hits this season'), x: tt(`دفعت ${c} نقطة خصم بـ ${n} جولات. الخصم يستاهل بس إذا اللاعب الجديد متوقع يجيب أكثر من 4 نقاط زيادة`, `${c} pts in hits`), big: `-${c}` }] : []; },
  // اعتمادك على لاعب واحد
  ({ sq }) => { const tot = sq.reduce((a, p) => a + (p.total || 0), 0), top = [...sq].sort((a, b) => b.total - a.total)[0]; if (!top || tot < 100) return [];
    const sh = top.total / tot; return sh >= 0.16 ? [{ id: `rely:${top.id}`, fam: 'rely', sc: 0.35 + sh, tone: '', t: tt(`فريقك يعتمد على ${top.name}`, `Your team leans on ${top.name}`), x: tt(`جاب ${top.total} نقطة من مجموع لاعبيك ${tot}، يعني ${Math.round(sh * 100)}%. إذا تأثر ينضرب فريقك، فخلي الكابتن البديل جاهز`, `${Math.round(sh * 100)}% of your squad points`), big: `${Math.round(sh * 100)}%` }] : []; },
  // أضعف خط بالقيمة (فلوس مقابل نقاط)
  ({ sq }) => { const L = ['DEF', 'MID', 'FWD'].map((pos) => { const ps = sq.filter((p) => p.pos === pos); const m = ps.reduce((a, p) => a + p.price, 0), t = ps.reduce((a, p) => a + p.total, 0); return { pos, m, t, r: m ? t / m : 0 }; }).filter((x) => x.m > 0);
    if (L.length < 3) return []; const s = [...L].sort((a, b) => a.r - b.r), w = s[0], b = s[s.length - 1]; if (b.r < w.r * 1.35) return [];
    const nm = { DEF: tt('دفاعك', 'Defence'), MID: tt('وسطك', 'Midfield'), FWD: tt('هجومك', 'Attack') }, nb = { DEF: tt('بالدفاع', 'in defence'), MID: tt('بالوسط', 'in midfield'), FWD: tt('بالهجوم', 'in attack') };
    return [{ id: `value:${w.pos}`, fam: 'value', sc: 0.45, tone: 'dn', t: tt(`${nm[w.pos]} أقل قيمة مقابل فلوسه`, `${nm[w.pos]} gives least value`), x: tt(`كل مليون ${nb[w.pos]} جاب ${n1(w.r)} نقطة، مقابل ${n1(b.r)} ${nb[b.pos]}. حوّل فلوس من هنا للخط الأقوى`, `${n1(w.r)} pts per £m vs ${n1(b.r)}`), big: n1(w.r) }]; },
  // تكديس نادي واحد
  ({ g, sq }) => { const by = {}; sq.forEach((p) => (by[p.team] = by[p.team] || []).push(p)); return Object.entries(by).filter(([, ps]) => ps.length >= 3).map(([tid, ps]) => { const f = fixturesFor(+tid, g)[0];
    return f ? { id: `stack:${tid}:${g}`, fam: 'stack', sc: 0.5 + (f.fdr <= 2 ? 0.25 : f.fdr >= 4 ? 0.3 : 0), tone: f.fdr <= 2 ? 'up' : f.fdr >= 4 ? 'dn' : '', t: tt(`عندك 3 من ${tName(+tid)}`, `3 players from ${tName(+tid)}`), x: tt(`${ps.map((p) => p.name).join('، ')}. والجولة الجاية ضد ${tName(f.opp)} ${f.home ? 'بأرضه' : 'برا'} وصعوبتها ${f.fdr} من 5، ${f.fdr <= 2 ? 'فرصة كبيرة لفريقك' : f.fdr >= 4 ? 'جولة صعبة على ثلث فريقك' : 'جولة متوسطة'}`, `vs ${tName(f.opp)}, FDR ${f.fdr}`), big: `${f.fdr}/5` } : null; }).filter(Boolean); },
  // اتجاه ترتيبك
  () => { const H = (ST.E?.hist?.current || []).filter((h) => h.overall_rank); if (H.length < 5) return []; const a = H[H.length - 5].overall_rank, b = H[H.length - 1].overall_rank, d = a - b;
    if (Math.abs(d) < a * 0.08) return []; return [{ id: `rtrend:${H.length}`, fam: 'rtrend', sc: 0.45, tone: d > 0 ? 'up' : 'dn', t: d > 0 ? tt('ترتيبك صاعد', 'Your rank is climbing') : tt('ترتيبك نازل', 'Your rank is slipping'), x: tt(`من ${a.toLocaleString('en')} قبل 4 جولات إلى ${b.toLocaleString('en')} هسه، يعني ${d > 0 ? 'تقدمت' : 'رجعت'} ${Math.abs(d).toLocaleString('en')} مركز`, `${a} → ${b}`), big: `${d > 0 ? '▲' : '▼'}${Math.round((Math.abs(d) / a) * 100)}%` }]; },
];

/* =========================================================
   التعلّم: كل مدرب إله ذاكرة خاصة بجهازه
   - نسجّل كل معلومة قابلة للتحقق (لاعب راح يسجّل، فريق راح يفوز، لاعب راح ينقعد…)
   - بعد ما تخلص الجولة نتحقق منها من البيانات الحقيقية، ونحسب دقة كل نوع
   - ونسجّل تفاعل المدرب ويا كل شريحة (فتحها، تجاوزها بسرعة، تابعها)
   - الأنواع اللي تصح أكثر وتهمّ المدرب أكثر تتقدم، واللي تخطّي أو تتجاهل تتأخر
========================================================= */
const BK = () => `fp_sy_brain_${ST.E?.entry?.id || 0}`;
const bLoad = () => { try { return JSON.parse(localStorage.getItem(BK())) || { claims: [], fam: {}, eng: {} }; } catch { return { claims: [], fam: {}, eng: {} }; } };
const bSave = (b) => { try { b.claims = b.claims.slice(-80); localStorage.setItem(BK(), JSON.stringify(b)); } catch {} };
const lastFin = () => Math.max(0, ...ST.G.events.filter((e) => e.fin).map((e) => e.id));
// نحوّل هوية المعلومة لادعاء قابل للتحقق
function claimOf(c, g) {
  const [k, a] = c.id.split(':'), id = +a; const P = PM(id);
  if (k === 'luck-' && P) return { k: 'goal', id, g, b: P.gls };
  if (k === 'luck+' && P) return { k: 'nogoal', id, g, b: P.gls };
  if (['gem', 'dcon', 'dcm', 'bon', 'bonm', 'pen', 'penm'].includes(k) && P) return { k: 'haul', id, g, b: P.total };
  if (k === 'rot' && P) return { k: 'lowmin', id, g, b: P.min };
  if (k === 'ven+') return { k: 'win', id, g };
  if (k === 'ven-') return { k: 'nowin', id, g };
  if (k === 'stack' && c.tone) return { k: c.tone === 'up' ? 'win' : 'nowin', id, g };
  return null;
}
function judge(cl) {
  const P = PM(cl.id), F = (ST.G.fx[cl.g] || []).filter((f) => f.fin && (f.h === cl.id || f.a === cl.id));
  switch (cl.k) {
    case 'goal': return P ? P.gls > cl.b : null;
    case 'nogoal': return P ? P.gls <= cl.b : null;
    case 'haul': return P ? P.total - cl.b >= 5 : null;
    case 'lowmin': return P ? P.min - cl.b < 60 : null;
    case 'win': case 'nowin': { if (!F.length) return null; const w = F.some((f) => (f.h === cl.id ? f.hs > f.as : f.as > f.hs)); return cl.k === 'win' ? w : !w; }
  }
  return null;
}
function learnStep() {
  const b = bLoad(), lf = lastFin(); let ch = false;
  b.claims.forEach((cl) => { if (cl.r != null || cl.g > lf) return; const r = judge(cl); if (r == null) return; cl.r = r ? 1 : 0; const f = (b.fam[cl.f] = b.fam[cl.f] || { h: 0, n: 0 }); f.h += cl.r; f.n++; ch = true; });
  if (ch) bSave(b); return b;
}
// وزن مُتعلَّم لكل نوع: الدقة (مع تمهيد حتى ما تتطرف من جولة وحدة) × اهتمام المدرب
function famK(b, fam) {
  const f = b.fam[fam], acc = f ? (f.h + 1) / (f.n + 2) : 0.5;
  const e = b.eng['f:' + fam] || { s: 0, t: 0, q: 0 }, eng = e.s ? Math.max(0.7, Math.min(1.35, 1 + (e.t * 1.5 - e.q * 0.6) / (e.s + 3))) : 1;
  return Math.max(0.55, Math.min(1.5, (0.6 + acc * 0.8) * eng));
}
/** يسجّل تفاعل المدرب ويا شريحة: view (تابعها لحد النهاية)، skip (تجاوزها بسرعة)، tap (فتح زرها) */
export function engage(k, type, fams = []) {
  if (!k || !ST.E?.entry) return; const b = bLoad();
  [k.startsWith('dsc') ? null : 'k:' + k, ...fams.map((f) => 'f:' + f)].filter(Boolean).forEach((key) => { const e = (b.eng[key] = b.eng[key] || { s: 0, t: 0, q: 0 }); e.s++; if (type === 'tap') e.t++; if (type === 'skip') e.q++; });
  bSave(b);
}
/** وزن شريحة حسب تفاعل المدرب وياها */
export function slideK(k) { const e = bLoad().eng['k:' + k]; return e && e.s ? Math.max(0.6, Math.min(1.4, 1 + (e.t * 1.5 - e.q * 0.6) / (e.s + 3))) : 1; }
/** دقة توقعات المربع بالجولات الفاتتة */
export function accuracy() { const b = learnStep(); const r = b.claims.filter((c) => c.r != null); return r.length >= 3 ? { h: r.reduce((a, c) => a + c.r, 0), n: r.length } : null; }

/* ---------- الاختيار: جديد + متنوّع + ما يتكرر ---------- */
let CACHE_K = '', CACHE = null;
export function discover(nPer = 3) {
  const g = ST.G.next, sqIds = ST.plan?.squad || []; if (!g || !sqIds.length) return [];
  const k = `${g}:${ST.G.fxList.filter((f) => f.fin).length}:${sqIds.join(',')}`;
  if (k === CACHE_K) return CACHE;
  const T = league(), sq = sqIds.map(PM).filter(Boolean), own = new Set(sqIds), teams = [...new Set(sq.map((p) => p.team))];
  const ctx = { g, T, sq, own, teams };
  let C = []; GEN.forEach((f) => { try { C.push(...f(ctx)); } catch {} });
  const S = ld(), ids = S.ids || {}, fams = S.fams || {}, BR = learnStep();
  // الوزن النهائي: الأهمية × الجِدّة (المعلومة اللي انعرضت قبل جولة لجولتين تنزل، والعائلة اللي طلعت الجولة الفاتت تنزل شوية)
  C = C.map((c) => { const seenAt = ids[c.id], fa = fams[c.fam];
    const nov = seenAt == null ? 1.15 : seenAt === g ? 1 : Math.max(0.15, Math.min(1, (g - seenAt) / 4));
    const fp = fa != null && fa !== g && g - fa <= 1 ? 0.7 : 1;
    return { ...c, isNew: seenAt == null || c.fresh || (S.first?.gw === g && S.first.ids.includes(c.id)), v: c.sc * nov * fp * famK(BR, c.fam) }; }).sort((a, b) => b.v - a.v);
  // نفس الجولة = نفس الاختيار (يثبت بين فتحة وفتحة)، والأرقام نفسها تتحدث
  const prevP = S.pick?.gw === g ? S.pick.ids : [];
  const ordered = [...C.filter((c) => prevP.includes(c.id)).sort((a, b) => prevP.indexOf(a.id) - prevP.indexOf(b.id)), ...C.filter((c) => !prevP.includes(c.id))];
  const picked = [], usedF = new Set();
  for (const c of ordered) { if (usedF.has(c.fam)) continue; picked.push(c); usedF.add(c.fam); if (picked.length >= nPer * 2) break; }
  picked.forEach((c) => { if (ids[c.id] == null || ids[c.id] < g) ids[c.id] = g; fams[c.fam] = g; });
  // نسجّل الادعاءات القابلة للتحقق مرة وحدة لكل جولة
  { let ch = false; picked.forEach((c) => { const cl = claimOf(c, g); if (cl && !BR.claims.some((x) => x.g === g && x.k === cl.k && x.id === cl.id)) { BR.claims.push({ ...cl, f: c.fam }); ch = true; } }); if (ch) bSave(BR); }
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
    : [...slides].sort((a, b) => ((sl[a.k] ?? -99) - (sl[b.k] ?? -99)) || (slideK(b.k) - slideK(a.k))).slice(0, n);
  if (!prev || prev.join() !== out.map((s) => s.k).join()) { out.forEach((s) => (sl[s.k] = g)); sv({ ...ld(), sl, slp: { gw: g, ks: out.map((s) => s.k) } }); }
  return out;
}

export const discLi = (c, i) => `<li style="--d:${80 + i * 60}ms"><b>${esc(c.t)}${c.isNew ? `<em class="sy-new">${tt('جديد', 'New')}</em>` : ''}</b>${c.big ? `<span class="${c.tone}">${B(esc(c.big))}</span>` : ''}<small>${esc(c.x)}</small></li>`;
