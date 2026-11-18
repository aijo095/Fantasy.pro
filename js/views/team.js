/* فريقي: ملخص احترافي + ملعب تفاعلي + أدوات (تشكيل، أوراق، تحليل الفريق) */
import { ST, PM, tShort, tName, savePlan } from '../store.js';
import { t, tt } from '../i18n.js';
import { esc, I, toast, fmt, r1, LS, crest, fmtTime, fxMin } from '../ui.js';
import { xp, xpN, validXI, formation, bestXI, bestXIFormation, projected, hits, avail, fixturesFor, analyze, avgFdr } from '../engine.js';
import * as CO from '../coach.js';
import { pShirt, EVX } from './common.js';
import { pricePredict, liveRankEstimate } from '../predict.js';
import { officialRank } from '../store.js';
import { liveCalc, rankImpact } from '../live-engine.js';
import * as FPL from '../fpl.js';
import { basePlan } from '../app.js';

const FORMS = ['3-4-3', '3-5-2', '4-4-2', '4-3-3', '4-5-1', '5-3-2', '5-4-1'];
let swapFrom = null, tab = null, chipPrev = '', liveLoading = false, teamGW = null;
const gwCache = {};
const LABELS = () => [['fx', tt('المباراة', 'Fixture'), 'i-cal'], ['next', tt('القادمة', 'Next 3'), 'i-season'], ['xp', tt('المتوقع', 'xP'), 'i-target'], ['pts', tt('النقاط', 'Points'), 'i-star'], ['price', t('price'), 'i-coin']];
const mode = () => LS.get('fp_label', 'fx');

function label(p) {
  const m = mode(), G = ST.G;
  if (m === 'price') { const r = pricePredict(p); return `<div class="lb">${p.price.toFixed(1)}${r.prog >= 70 ? ' <span style="color:#059669">▲</span>' : r.prog <= -70 ? ' <span style="color:#DC2626">▼</span>' : ''}</div>`; }
  if (m === 'xp') { const v = xp(p); return `<div class="lb" style="background:${v >= 6 ? '#34D399' : v >= 4 ? '#A7F3D0' : '#F1F5F9'}">${v}</div>`; }
  if (m === 'pts') { const v = ST.live?.[p.id]?.total_points; return `<div class="lb" style="background:${v == null ? '#E2E8F0' : v >= 8 ? '#34D399' : v >= 4 ? '#A7F3D0' : v >= 1 ? '#FED7AA' : '#FECACA'}">${v ?? '—'}</div>`; }
  if (m === 'next') { const cells = [0, 1, 2].map((i) => { const f = fixturesFor(p.team, G.next + i); return f.length ? `<i class="f${Math.round(f.reduce((a, x) => a + x.fdr, 0) / f.length)}" title="${f.map((x) => tShort(x.opp)).join('+')}">${f.length > 1 ? '2' : tShort(f[0].opp).slice(0, 3)}</i>` : '<i style="background:#475569;color:#fff">—</i>'; }).join(''); return `<div class="lb nx3" dir="ltr">${cells}</div>`; }
  const f = fixturesFor(p.team, G.next);
  if (!f.length) return `<div class="lb fxl blank">${tt('ما يلعب', 'Blank')}</div>`;
  // H = بملعبه، A = بملعب الخصم (مثل الفانتازي الرسمي)
  const one = (x, sm) => `<span class="fxo"><b>${tShort(x.opp)}</b><i class="ha ${x.home ? 'h' : 'a'}${sm ? ' sm' : ''}">${x.home ? 'H' : 'A'}</i></span>`;
  return `<div class="lb fxl f${f[0].fdr}${f.length > 1 ? ' dbl' : ''}">${f.map((x) => one(x, f.length > 1)).join('')}</div>`;
}
function canSwap(a, b) {
  const P = ST.plan, ia = P.xi.includes(a), ib = P.xi.includes(b);
  if (ia === ib) return !ia && PM(a).pos !== 'GK' && PM(b).pos !== 'GK';
  const s = ia ? a : b, bn = ia ? b : a; if ((PM(s).pos === 'GK') !== (PM(bn).pos === 'GK')) return false;
  return validXI(P.xi.map((x) => (x === s ? bn : x)));
}
function card(id, i = 0) {
  const p = PM(id), P = ST.plan, sel = swapFrom === id, a = avail(p);
  let cls = 'pl'; if (sel) cls += ' sel'; else if (swapFrom) cls += canSwap(swapFrom, id) ? ' can' : ' dim';
  if (P.transfers.some((x) => x.in === id)) cls += ' new';
  if (P.cap === id) cls += ' capt';
  const badge = a < 1 || p.st === 's' ? `<span class="rk inj ${a === 0 || p.st === 's' ? 'r2' : 'r1'}" title="${esc(p.news || '')}">${a > 0 && a < 1 ? Math.round(a * 100) : '!'}</span>` : '';
  return `<div class="${cls}" data-pid="${id}" style="--d:${i * 35}ms" onclick="pitchTap(${id})" role="button" aria-label="${esc(p.name)}">${P.cap === id ? `<span class="cb">${P.chip === '3xc' ? '3×' : 'C'}</span>` : P.vc === id ? '<span class="cb v">V</span>' : ''}${badge}<div class="sh">${pShirt(p)}</div><div class="nm">${esc(p.name)}</div>${label(p)}</div>`;
}
const LINES = `<svg class="lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width=".45"><rect x="4" y="3" width="92" height="134" rx="1.5"/><line x1="4" y1="70" x2="96" y2="70"/><ellipse cx="50" cy="70" rx="12" ry="8.6"/><rect x="26" y="3" width="48" height="18"/><rect x="38" y="3" width="24" height="7"/><path d="M41 21 Q50 27 59 21"/><rect x="26" y="119" width="48" height="18"/><rect x="38" y="130" width="24" height="7"/><path d="M41 119 Q50 113 59 119"/></g><circle cx="50" cy="70" r=".9" fill="#fff"/></svg>`;

function hero(P) {
  const G = ST.G, value = r1(P.squad.reduce((a, id) => a + PM(id).price, 0)), proj = projected({ ...P, chip: chipPrev || P.chip });
  const a = analyze(P, esc), ring = Math.round(a.overall), C = 2 * Math.PI * 26;
  return `<section class="team-hero">
    <div class="flex between" style="align-items:flex-start">
      <div><div class="mut" style="font-size:12.5px">${t('gw')} ${G.next} · ${tt('الإغلاق', 'Deadline')} ${G.deadline && new Date(G.deadline) > new Date() ? fmtTime(G.deadline) : tt('انتهى', 'passed')}</div>
        <div class="flex" style="gap:8px;align-items:baseline"><span class="big-num count" data-v="${proj}" style="font-size:40px">${proj}</span><span class="mut" style="font-size:13px">${tt('نقطة متوقعة', 'projected pts')}</span></div>
        ${a.opt - a.cur >= 0.5 ? `<button class="hint-chip" onclick="bestLineup()">${I('i-sparkle', 'i', 'width:13px;height:13px')}${tt(`+${(a.opt - a.cur).toFixed(1)} نقطة بالتشكيلة الأفضل`, `+${(a.opt - a.cur).toFixed(1)} with best XI`)}</button>` : `<span class="hint-chip ok">${I('i-check', 'i', 'width:13px;height:13px')}${tt('تشكيلتك هي الأفضل', 'Optimal lineup')}</span>`}
      </div>
      <button class="score-ring" onclick="teamTab('insight')" aria-label="rating"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,.08)" stroke-width="6" fill="none"/><circle cx="32" cy="32" r="26" stroke="url(#rg)" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ring / 100)}" style="--c:${C}" class="ring-arc" transform="rotate(-90 32 32)"/><defs><linearGradient id="rg"><stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#60A5FA"/></linearGradient></defs></svg><b>${ring}</b><small>${tt('تقييم', 'Rating')}</small></button>
    </div>
    <div class="tstrip"><div><small>${tt('التشكيل', 'Formation')}</small><b>${formation(P.xi)}</b></div><div><small>${t('bank')}</small><b>${P.bank.toFixed(1)}</b></div><div><small>${t('value')}</small><b>${value.toFixed(1)}</b></div>${hits(P) ? `<div><small>${tt('خصم', 'Hits')}</small><b class="down">−${hits(P)}</b></div>` : ''}</div>
  </section>`;
}
function toolbar(P) {
  return `<div class="tbar">
    <div class="seg" style="flex:1">${LABELS().map((l) => `<button class="${mode() === l[0] ? 'on' : ''}" onclick="setLabel('${l[0]}')">${I(l[2], 'i', 'width:15px;height:15px')}${l[1]}</button>`).join('')}</div>
    <label class="form-sel">${I('i-layers', 'i', 'width:15px;height:15px')}<select onchange="setForm(this.value)" aria-label="formation">${FORMS.map((f) => `<option ${formation(P.xi) === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
  </div>`;
}
function pitch(P) {
  const rows = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => P.xi.filter((id) => PM(id).pos === pos));
  let k = 0;
  const benchXp = P.bench.reduce((a, id) => a + xp(PM(id)), 0);
  return `${swapFrom ? `<div class="banner"><span>${I('i-swap', 'i', 'width:16px;height:16px;vertical-align:-3px')} ${tt('اختر لاعب يتبادل مع', 'Pick a player to swap with')} <b>${esc(PM(swapFrom).name)}</b></span><button class="btn btn-g btn-sm" onclick="cancelSwap()">${t('cancel')}</button></div>` : ''}
   <div class="pitch${walkPlay ? ' walk-pre' : ''}">${LINES}${rows.map((r) => `<div class="prow">${r.map((id) => card(id, k++)).join('')}</div>`).join('')}</div>
   <div class="benchbox${walkPlay ? ' walk-pre' : ''}"><div class="t"><span>${I('i-bench', 'i', 'width:16px;height:16px;vertical-align:-3px')} ${t('bench')} <span class="mut" style="font-size:12px">· ${r1(benchXp)} xP</span></span><button class="btn btn-g btn-sm" onclick="autoBench()">${I('i-sparkle', 'i', 'width:14px;height:14px')}${tt('رتّب الدكة', 'Order bench')}</button></div>
    <div class="prow" dir="ltr">${P.bench.map((id, i) => `<div class="slot"><small>${i === 0 ? t('gk') : i}</small>${card(id, 11 + i)}</div>`).join('')}</div></div>
   <div class="chip-prev"><span class="mut" style="font-size:12.5px">${tt('جرّب ورقة', 'Preview chip')}:</span>${[['', tt('بدون', 'None')], ['bboost', tt('بنش بوست', 'Bench Boost')], ['3xc', tt('كابتن ثلاثي', 'Triple C')]].map(([c, l]) => `<button class="${chipPrev === c ? 'on' : ''}" onclick="chipPreview('${c}')">${l}${c ? ` <b>+${r1(projected({ ...P, chip: c }) - projected({ ...P, chip: '' }))}</b>` : ''}</button>`).join('')}</div>`;
}
/* ---------- المدرب الذكي: أسلوبك وقراراتك  ---------- */
const COACH = () => true; // صار للكل
let coachProg = 0, coachErr = false;
// رموز Fantasy Pro التحليلية — نفس المعنى بكل التطبيق
const MS = { '🔍': 'ms-risk', '💎': 'ms-opp', '📈': 'ms-up', '⚠️': 'ms-risk', '📅': 'ms-opp', '✌️': 'ms-opp', '∅': 'ms-nodata', '⇅': 'ms-vol', '🎈': 'ms-vol', '🧊': 'ms-stable', '▼': 'ms-down', '📉': 'ms-down' };
const MSL = () => ({ 'ms-risk': tt('خطورة', 'Risk'), 'ms-opp': tt('فرصة', 'Opportunity'), 'ms-up': tt('تطور', 'Rising'), 'ms-down': tt('تراجع', 'Declining'), 'ms-vol': tt('تذبذب', 'Volatile'), 'ms-stable': tt('استقرار', 'Stable'), 'ms-nodata': tt('بيانات ناقصة', 'Incomplete data') });
const confChip = (c) => `<span class="cz-conf ${c}">${c === 'high' ? tt('ثقة عالية', 'High confidence') : c === 'low' ? tt('ثقة قليلة', 'Low confidence') : tt('ثقة متوسطة', 'Medium confidence')}</span>`;
const gnum = (g) => `<em class="num ${g > 0 ? 'up' : g < 0 ? 'down' : ''}" dir="ltr">${g > 0 ? '+' : ''}${g}</em>`;
const mvLine = (o, n) => `<span class="cz-ml" dir="ltr"><s>${esc(o)}</s><i>→</i><b>${esc(n)}</b></span>`;
/** (9) خطط 5 جولات: كل خطة كرت مستقل، وكل جولة بيها تغيير بسطر واضح */
function seqHTML(C) {
  const S = C.seq; if (!S?.cls?.best) return '';
  const L = { best: tt('الأعلى توقعاً', 'Highest expected'), balanced: tt('الأكثر توازناً', 'Most balanced'), stable: tt('الأكثر استقراراً', 'Most stable'), risky: tt('الأعلى مخاطرة', 'Riskiest') };
  const seen = new Set(), rows = ['best', 'balanced', 'stable', 'risky'].map((k) => [k, S.cls[k]]).filter(([, p]) => p && p.steps?.length && !seen.has(p) && seen.add(p));
  if (!rows.length) return '';
  const nm = (id) => ST.G.PM?.[id]?.name || '';
  const plan = ([k, p]) => {
    const act = p.steps.filter((x) => x.tr.length), quiet = p.steps.filter((x) => !x.tr.length).map((x) => x.gw);
    return `<div class="cz-plan${k === 'best' ? ' on' : ''}"><div class="cz-ph"><b>${L[k]}</b><span>${gnum(p.gain)}${p.sd != null ? `<small class="num" dir="ltr">±${p.sd}</small>` : ''}</span></div>
      <div class="cz-gws">${p.steps.map((x) => `<i class="${x.tr.length ? 'a' : ''}${x.hit ? ' h' : ''}"><span class="num">${x.gw}</span></i>`).join('')}</div>
      ${act.map((x) => `<div class="cz-gw"><span class="cz-gn num">${x.gw}</span><div>${x.tr.map(([o, n]) => mvLine(nm(o), nm(n))).join('')}</div>${x.hit ? `<em class="cz-hit num" dir="ltr">−${x.hit}</em>` : ''}</div>`).join('')}
      ${quiet.length ? `<p class="cz-q">${tt(`احتفظ بالجولات: <bdi class="num">${quiet.join('، ')}</bdi>`, `Roll in GW ${quiet.join(', ')}`)}</p>` : ''}</div>`;
  };
  return `<div class="cz-sub"><h5>${I('i-cal', 'i')}${tt('خطة الجولات الخمس الجاية', 'Next 5 GWs plan')}</h5><div class="cz-plans">${rows.map(plan).join('')}</div><p class="cz-fn">${tt('الربح مقارنة بالاحتفاظ بالفريق بعد خصم الضربات · ± مقدار عدم اليقين', 'Gain vs holding, after hits · ± = uncertainty')}</p></div>`;
}
function scenHTML(C) {
  if (!C.scen || C.scen.length < 2) return seqHTML(C);
  const lbl = (k) => (k === 'roll' ? tt('احتفظ', 'Roll') : k === 'one' ? tt('انتقال واحد', 'One move') : tt('انتقالين', 'Two moves'));
  const opt = (x) => { const hit = x.m ? Math.round(x.m.reduce((a, m) => a + m.g, 0) - x.g) : 0;
    return `<div class="cz-opt${x === C.bestScen ? ' on' : ''}"><div class="cz-oh"><b>${lbl(x.k)}</b>${x === C.bestScen ? `<span class="cz-rec">${tt('الأفضل', 'Best')}</span>` : ''}${gnum(x.g)}</div>
      <div class="cz-ob">${x.m ? x.m.map((m) => mvLine(m.o.name, m.c.name)).join('') : `<span class="cz-q">${esc(x.t.replace(/^[^(]*\(|\)$/g, ''))}</span>`}${hit > 0 ? `<em class="cz-hit num" dir="ltr">−${hit}</em>` : ''}</div></div>`; };
  return `<div class="cz-sub"><h5>${I('i-layers', 'i')}${tt('خياراتك هالجولة', 'Your options this GW')}</h5><div class="cz-opts">${C.scen.map(opt).join('')}</div>
    ${C.timing ? `<div class="cz-note">${I('i-clock', 'i')}<p>${esc(C.timing.t)}</p></div>` : ''}<p class="cz-fn">${tt('الأرقام = الربح المتوقع بخمس جولات بعد خصم الضربات', 'Expected gain over 5 GWs after hits')}</p></div>${seqHTML(C)}`;
}
/** (11) اختبار المقاومة — داخل نفس قسم الكابتن */
function stressHTML(C) {
  const S = C.stress; if (!S?.rows?.length || S.rows.length < 2) return '';
  const nm = (id) => ST.G.PM?.[id]?.name || '';
  const K = { current: tt('خطتك الحالية', 'Your current plan'), engine: tt('توصية المدرب', 'Coach plan'), safeCap: tt('كابتن آمن', 'Safe captain'), riskCap: tt('كابتن جريء', 'Bold captain') };
  const L = { best: tt('الأعلى توقعاً', 'Highest expected'), stable: tt('الأكثر استقراراً', 'Most stable'), balanced: tt('الأكثر توازناً', 'Most balanced'), risky: tt('الأعلى مخاطرة', 'Riskiest') };
  const W = { keyOut: tt('غياب أهم لاعب', 'key player out'), capOut: tt('غياب الكابتن', 'captain out'), capBlank: tt('الكابتن ما يسجل', 'captain blanks'), shortMin: tt('دقائق قليلة', 'short minutes'), doubtOut: tt('غياب المشكوكين', 'doubtful players out'), tough: tt('مباريات أصعب', 'tougher matches') };
  const tag = (r) => Object.entries(L).filter(([k]) => S[k] === r).map(([, l]) => l).join(' · ');
  return `<div class="cz-sub"><h5>${I('i-shield', 'i')}${tt('اختبار المقاومة', 'Stress test')}</h5><div class="cz-opts">${S.rows.map((r) => `<div class="cz-opt${S.balanced === r ? ' on' : ''}"><div class="cz-oh"><b>${K[r.k]}</b>${tag(r) ? `<span class="cz-rec">${tag(r)}</span>` : ''}<em class="num" dir="ltr">${r.s.weighted}</em></div><div class="cz-ob"><span class="cz-ml"><b>${esc(nm(r.cap))}</b><span class="cz-c">C</span></span><span class="cz-q">${tt('أسوأ حالة', 'Worst')}: ${W[r.s.worstK]} <bdi class="num" dir="ltr">${r.s.worst}</bdi></span></div></div>`).join('')}</div><p class="cz-fn">${tt('الرقم = النقاط المتوقعة مرجّحة باحتمال المشاركة · أسوأ حالة = أضعف سيناريو ويا التبديل التلقائي', 'Expected points weighted by availability · worst = weakest scenario with autosubs')}</p></div>`;
}
function capRiskHTML(C) {
  if (!C.capSafe) return '';
  const box = (x, k) => x ? `<div class="cz-cr ${k}"><small>${k === 'safe' ? tt('الخيار الآمن', 'Safe pick') : tt('الخيار الجريء', 'High-risk pick')}</small><b>${esc(x.p.name)}</b><span><bdi dir="ltr">${x.v} xP</bdi> · ${tt('سقف', 'ceiling')} <bdi dir="ltr">${x.ceil}</bdi> · ${tt('ملكية', 'owned')} <bdi dir="ltr">${x.own}%</bdi></span><p>${k === 'safe' ? tt(`مخاطرة <bdi dir="ltr">${x.risk}%</bdi> — دقائقه مضمونة وأغلب المدربين عنده، يحمي ترتيبك`, `Risk ${x.risk}% — nailed and popular`) : tt(`ملكيته <bdi dir="ltr">${x.own}%</bdi> وسقفه عالي — إذا جاب نقاط تتقدم على الأغلبية، بس مخاطرة <bdi dir="ltr">${x.risk}%</bdi>`, `Low-owned with a high ceiling, risk ${x.risk}%`)}</p></div>` : '';
  return `<div class="cz-crs">${box(C.capSafe, 'safe')}${C.capRisk ? box(C.capRisk, 'risk') : ''}</div>`;
}
function learnHTML(L, D, GU) {
  if (!L) return '';
  const notes = L.notes.map((n) => n[0] === 'form-' ? tt(`قللت وزن الفورمة ${n[1]}% لأن التوقعات المبنية عليها طلعت مبالغ بيها`, `Lowered form weight ${n[1]}%`) : n[0] === 'form+' ? tt(`زدت وزن الفورمة ${n[1]}% لأنها طلعت مؤشر صحيح`, `Raised form weight ${n[1]}%`) : n[0] === 'pos-' ? tt(`خفضت توقعات ${n[1]} ${n[2]}% لأنها جانت أعلى من الواقع`, `Lowered ${n[1]} by ${n[2]}%`) : tt(`رفعت توقعات ${n[1]} ${n[2]}% لأنها جانت أقل من الواقع`, `Raised ${n[1]} by ${n[2]}%`));
  const body = L.n ? tt(`قيّمت ${L.n} جولات: ${L.acc}% من توقعاتي جانت ضمن ±2 نقطة${L.capRate != null ? ` · الكابتن اللي اقترحته جان صح ${L.capRate}%` : ''}`, `Evaluated ${L.n} GWs`)
    : L.err ? tt(`من تاريخك: التوقع من الفورمة وحدها يخطي ${L.err.form} نقطة باللاعب، والمعدل الطويل ${L.err.long} — عدّلت الأوزان على هالأساس`, `From your history: form-only error ${L.err.form}, long-run ${L.err.long}`)
    : tt('أحفظ توقعاتي لكل جولة وأقارنها بالنتيجة حتى أتعلم وأعدّل', 'Saving predictions each GW to learn from results');
  const last = L.last?.cap ? tt(`الجولة ${L.last.gw}: اقترحت ${(ST.G.PM?.[L.last.cap.id] || {}).name || ''} كابتن وجاب ${L.last.cap.pts}${L.last.cap.followed != null ? (L.last.cap.followed ? ' (نفذتها)' : ' (ما نفذتها)') : ''}`, `GW${L.last.gw}: captain pick scored ${L.last.cap.pts}`) : '';
  const dm = dmLines(D, { ...(GU || {}), __learn: L });
  return `<div class="cz-learn"><small>${I('i-sparkle', 'i')}${tt('ذاكرة المدرب والتعلّم', 'Memory & learning')}</small><p>${body}</p>${last ? `<p>${esc(last)}</p>` : ''}${dm.map((x) => `<p>${esc(x)}</p>`).join('')}${notes.length ? `<ul>${notes.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}
/** ذاكرة القرارات: جودة القرار بعيداً عن الحظ، دقة التوقع مقابل خط أساس، الأخطاء المتكررة، والتوصيات اللي استبعدها كاشف التضارب */
const RG_T = () => ({ captain: tt('الكابتن', 'captain'), transfer: tt('الانتقالات', 'transfers'), hold: tt('تجاهل انتقال مقترح', 'ignored transfer'), roll: tt('الاحتفاظ بالانتقال', 'rolling'), missed_hit: tt('رفض انتقال بخصم', 'skipped hit'), sold_before_haul: tt('بيع لاعب قبل جولة قوية', 'selling before a haul'), ft_wasted: tt('ضياع انتقال مجاني', 'wasted free transfer') });
function dmLines(D, GU) {
  const out = [];
  const nm = (id) => ST.G.PM?.[id]?.name || '';
  const bl = (GU?.issues || []).filter((x) => x.sev === 'block' && x.ids?.length);
  if (bl.length) out.push(tt(`استبعدت ${[...new Set(bl.map((x) => nm(x.ids[0])))].filter(Boolean).slice(0, 3).join('، ')} من التوصيات: ${bl[0].msg}`, `Excluded ${bl.length} option(s) that broke a rule or were doubtful`));
  if (!D) return out;
  if (D.cap && D.cap.n >= 2) { const c = D.cap.cells; out.push(tt(`جودة قرارات الكابتن بعيداً عن الحظ (${D.cap.n} جولات): ${c.earned} قرار صحيح ونجح، ${c.unlucky} صحيح بس الحظ ما خدم، ${c.lucky} نجح بالحظ، ${c.mistake} خطأ`, `Captain decision quality: ${c.earned} sound & good, ${c.unlucky} unlucky, ${c.lucky} lucky, ${c.mistake} mistakes`)); }
  if (D.pred && D.n >= 2) out.push(tt(`دقة توقعاتي: الخطأ بالمعدل ${D.pred.mae} نقطة للاعب، مقابل ${D.pred.ppg} لو اعتمدنا معدل النقاط وحده`, `Prediction error ${D.pred.mae} pts/player vs ${D.pred.ppg} for points-per-game alone`));
  if (D.follow && D.follow.ignoredN >= 2) out.push(tt(`من ${D.follow.ignoredN} مرات اخترت كابتن غير المقترح، المقترح جاب أكثر ${D.follow.ignoredWorse} مرات`, `When you picked a different captain (${D.follow.ignoredN}x), the suggested one scored more ${D.follow.ignoredWorse}x`));
  const rc = D.recurring?.[0]; if (rc) out.push(tt(`خطأ يتكرر: ${RG_T()[rc.type] || rc.type} — ${rc.recentN} مرات بآخر 8 جولات، خسارة ${rc.size} نقطة`, `Recurring: ${rc.type} (${rc.recentN}x, ${rc.size} pts)`));
  const SEGT = { popular: tt('اللاعبين الشعبيين', 'popular players'), unpopular: tt('اللاعبين قليلين الملكية', 'low-owned players'), premium: tt('اللاعبين الغاليين', 'premium players'), budget: tt('اللاعبين الرخاص', 'budget players'), hotForm: tt('اللي فورمتهم أعلى من مستواهم', 'players in hot form'), coldForm: tt('اللي فورمتهم أقل من مستواهم', 'players in cold form'), afterHaul: tt('اللاعب بعد جولة كبيرة', 'players after a haul'), easyFix: tt('المباريات السهلة', 'easy fixtures'), hardFix: tt('المباريات الصعبة', 'hard fixtures'), lowQuality: tt('معدل نقاط عالي بفرص ضعيفة', 'high points, low chance quality') };
  const bf = D.bias?.flags?.[0];
  if (bf) out.push(tt(`اكتشفت انحياز بتوقعاتي: ${SEGT[bf.seg] || bf.seg} — أتوقعلهم ${bf.dir === 'over' ? 'أكثر' : 'أقل'} من الواقع بـ${Math.abs(bf.d)} نقطة (${bf.n} حالة، ${bf.gws} جولات)${bf.proposal ? (bf.proposal.passed ? `. جربت تعديل ×${bf.proposal.m} على الجولات الأحدث وحسّن الدقة — محفوظ لحد ما يعدّي فحص الحماية` : '. التعديل المقترح ما حسّن الدقة بالاختبار، فما اعتمدته') : ''}`, `Bias found: ${bf.seg} (${bf.d} pts)`));
  if (D.bias?.capRepeat) out.push(tt(`لاحظت إني اقترحت ${nm(D.bias.capRepeat.id)} كابتن ${D.bias.capRepeat.n} جولات ورا بعض والبديل جان قريب جداً — راح أراقب هالتكرار`, `Same captain suggested ${D.bias.capRepeat.n} weeks in a row with a close alternative`));
  const pw = D.pos?.wins;
  if (pw?.list?.length) { const c = pw.counts, sk = c.skill + c.expected, lk = c.luck; out.push(tt(`من لاعبينك اللي جابوا 10+ نقاط مؤخراً: ${sk} نجاح متوقع بالأرقام${lk ? `، و${lk} حظ (أداء حقيقي ضعيف)` : ''}${pw.surprise.length ? ` — ${nm(pw.surprise[0].id)} ما جان متوقع بس أداؤه الحقيقي يسند، فهذا اختيار ذكي مو حظ` : ''}`, `Recent hauls: ${sk} expected, ${lk} lucky`)); }
  const sp = D.pos?.patterns?.list?.[0];
  if (sp) out.push(tt(`نمط نجاح مثبت: ${SEGT[sp.k] || sp.k} يجيبون جولات كبيرة (8+) بنسبة ${Math.round(sp.rate * 100)}% مقابل ${Math.round(sp.base * 100)}% للباقين`, `Success pattern: ${sp.k} haul ${Math.round(sp.rate * 100)}% vs ${Math.round(sp.base * 100)}%`));
  // (14) الحماية من التراجع: شنو اعتمد المحرك أو رفض أو رجع عنه
  const LG = GU?.__learn;
  if (LG) {
    const g = LG.gate?.[LG.gate.length - 1];
    if (g?.type === 'adopt') out.push(tt(`اعتمدت تعديل على أوزاني بعد ما ثبت على ${g.g} جولات جديدة (الخطأ قل ${Math.round((1 - g.rel) * 100)}%)`, `Adopted a weight update after ${g.g} new GWs`));
    else if (g?.type === 'reject') out.push(tt(`رفضت تعديل على أوزاني لأنه ما حسّن التوقعات على ${g.g} جولات جديدة — بقيت على الإعداد السابق`, `Rejected a weight update that did not improve on new GWs`));
    else if (g?.type === 'rollback') out.push(tt(`رجعت للإعداد السابق: التعديل الأخير صار أسوأ بـ${Math.round((g.rel - 1) * 100)}% على ${g.g} جولات`, `Rolled back the last update (worse by ${Math.round((g.rel - 1) * 100)}%)`));
    else if (g?.type === 'version_rollback') out.push(tt('هذا الإصدار من المحرك طلع أسوأ من السابق، فطفيت القدرة الجديدة اللي تغيّر التوقعات لحد ما تنصلح', 'This engine version regressed; the new prediction feature was switched off'));
    else if (LG.cand) out.push(tt(`عندي تعديل مقترح على أوزاني يتجرب على الجولات الجديدة (${LG.cand.g} من 2) — ما ينعتمد قبل ما يثبت`, `A weight update is being tested (${LG.cand.g}/2)`));
    const sl = LG.segLog?.[LG.segLog.length - 1];
    if (sl?.type === 'adopt') out.push(tt(`اعتمدت تصحيح الانحياز لـ${SEGT[sl.seg] || sl.seg} (×${sl.m}) بعد ما حسّن الدقة على ${sl.g} جولات جديدة`, `Adopted bias correction for ${sl.seg}`));
    else if (sl?.type === 'reject') out.push(tt(`تصحيح الانحياز لـ${SEGT[sl.seg] || sl.seg} ما ثبت على الجولات الجديدة، فما اعتمدته`, `Bias correction for ${sl.seg} rejected`));
  }
  if (!D.n && D.pending?.length) out.push(tt(`حفظت توصيات الجولة ${D.pending[D.pending.length - 1]} ويا البدائل اللي درستها، وراح أقيّمها بعد ما تخلص`, `Saved GW${D.pending[D.pending.length - 1]} decisions with alternatives; will review after the GW`));
  return out;
}
/** نص النصيحة بالعربي: يبدّل المصطلحات الإنكليزية ورموز الأندية، ويثبّت مكان الأرقام والأسماء جوه الجملة العربية */
function arTip(raw) {
  const T = ST.G?.teams || {}, SH = {}; Object.keys(T).forEach((id) => { if (T[id]?.short) SH[T[id].short] = tName(+id); });
  let s = String(raw)
    .replace(/\(?xG\/xA\)?/g, (m) => (m.startsWith('(') ? '(الفرص الحقيقية)' : 'الفرص الحقيقية'))
    .replace(/\(xGI\)|xGI/g, (m) => (m.startsWith('(') ? '(الفرص الحقيقية)' : 'الفرص الحقيقية'))
    .replace(/\(xG\)/g, '(الأهداف المتوقعة)').replace(/\bxG\b/g, 'الأهداف المتوقعة').replace(/\bxA\b/g, 'الصناعة المتوقعة').replace(/\bxP\b/g, 'نقطة متوقعة')
    .replace(/\b([A-Z]{3})\b/g, (m) => SH[m] || m)
    .replace(/(\d+(?:\.\d+)?)م(?![\u0621-\u064A])/g, '$1 مليون');
  const RX = /(\p{Script=Latin}[\p{Script=Latin}\p{M}.'\-]*(?:\s+\p{Script=Latin}[\p{Script=Latin}\p{M}.'\-]*)*)|([+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?)/gu;
  let out = '', i = 0, m;
  while ((m = RX.exec(s))) { out += esc(s.slice(i, m.index)) + (m[1] ? `<bdi>${esc(m[1])}</bdi>` : `<bdi dir="ltr" class="num">${m[2]}</bdi>`); i = m.index + m[0].length; }
  s = out + esc(s.slice(i));
  return s;
}
function coachCard(P) {
  const M = CO.coachReady();
  if (!M) {
    if (!coachErr) CO.ensureCoach((x) => { coachProg = x; const b = document.querySelector('.cz-load i'); if (b) b.style.width = Math.round(x * 100) + '%'; })
      .then(() => { if (ST.view === 'team' && tab === 'insight') window.render(); }).catch(() => { coachErr = true; if (ST.view === 'team') window.render(); });
    return `<div class="card cz"><div class="cz-h"><span class="cz-ic">${I('i-sparkle', 'i')}</span><div><b>${tt('مدربك الذكي', 'Your smart coach')}</b><small>${coachErr ? tt('ما كدرنا نجيب جولاتك هسه، جرّب بعد شوية', 'Could not load your gameweeks') : tt('ديحلل جولاتك واختياراتك حتى يبني أسلوبك…', 'Reading your gameweeks to learn your style…')}</small></div></div>${coachErr ? '' : `<div class="cz-load"><i style="width:${Math.round(coachProg * 100)}%"></i></div>`}</div>`;
  }
  const C = CO.coachPlan(P), [an, ad] = CO.ARCH()[M.arch], T = M.T, S = M.S;
  const TR = [['captain', tt('الكابتن', 'Captain choices'), tt('كم مرة الكابتن كان أفضل لاعب عندك أو قريب منه', 'How often your captain was your best or close')], ['transfers', tt('الانتقالات', 'Transfers'), tt('اللاعب اللي دخل جاب أكثر من اللي طلع بالجولات الثلاث بعد الانتقال', 'Player in vs player out over the next 3 GWs')], ['bench', tt('الدكة', 'Bench'), tt('كل ما قلت النقاط اللي تضيع على الدكة يرتفع الرقم', 'Higher = fewer points left on the bench')], ['discipline', tt('قلة الخصومات', 'Few hits'), tt('كل ما قلت خصومات الانتقال أو رجعت نقاطها يرتفع الرقم', 'Higher = fewer hits or hits that paid off')], ['patience', tt('الصبر', 'Patience'), tt('تحتفظ بالانتقال وباللاعبين بدل التغيير كل جولة', 'Keeping transfers and players instead of changing every week')], ['risk', tt('الفروقات', 'Differentials'), tt('كل ما ابتعدت عن لاعبين الأغلبية يرتفع الرقم', 'Higher = further from what most managers own')]];
  const col = (v) => (v == null ? 'var(--mut)' : v >= 70 ? 'var(--acc)' : v >= 45 ? 'var(--warn)' : 'var(--bad)');
  const t = C.transfer, nm = (id) => ST.G.PM?.[id]?.name || '';
  const pn = (p) => `<button class="cz-p" onclick="openPlayer(${p.id})"><span class="mini">${pShirt(p)}</span><span><b>${esc(p.name)}</b><small><bdi>${tShort(p.team)}</bdi> · <bdi>£${p.price}</bdi></small></span></button>`;
  // الانتقال: البطاقة الرئيسية + الخيارات الثلاث بأرقام بس
  const best = C.bestScen, lbl = (k) => (k === 'roll' ? tt('احتفظ', 'Roll') : k === 'one' ? tt('انتقال', '1 move') : tt('انتقالين', '2 moves'));
  const main = t.kind === 'go'
    ? `<div class="cz-mv" dir="ltr">${pn(t.m.o)}<span class="cz-ar">${I('i-arrow', 'i flipx')}</span>${pn(t.m.c)}</div>`
    : `<div class="cz-hold"><b>${t.kind === 'roll' ? tt('احتفظ بالانتقال هالجولة', 'Roll this week') : tt('لا تسوي انتقال بخصم هالجولة', 'Skip the hit')}</b></div>`;
  const opts = C.scen?.length > 1 ? `<div class="cz-o3">${C.scen.map((x) => `<div class="${x === best ? 'on' : ''}"><small>${lbl(x.k)}</small>${gnum(x.g)}</div>`).join('')}</div>${best?.k === 'two' ? `<div class="cz-line">${tt('الانتقال الثاني', '2nd move')}${mvLine(best.m[1].o.name, best.m[1].c.name)}</div>` : ''}` : '';
  const urgent = C.timing?.k === 'now' ? `<div class="cz-line warn">${I('i-clock', 'i')}<span>${esc(C.timing.t)}</span></div>` : '';
  const sp = C.seq?.cls?.best, plan = sp?.steps?.some((x) => x.tr.length) ? `<div class="cz-sub"><h5>${tt('خطة 5 جولات', '5-GW plan')}<span class="cz-h5v">${gnum(sp.gain)}</span></h5><div class="cz-plan">${sp.steps.map((x) => `<div class="cz-gw${x.tr.length ? '' : ' q'}"><span class="cz-gn num">${x.gw}</span><div>${x.tr.length ? x.tr.map(([o, n]) => mvLine(nm(o), nm(n))).join('') : `<span class="cz-q">${tt('احتفظ', 'Roll')}</span>`}</div>${x.hit ? `<em class="cz-hit num" dir="ltr">−${x.hit}</em>` : ''}</div>`).join('')}</div></div>` : '';
  // الكابتن: 3 خيارات + الآمن والجريء بسطر
  const capHTML = `<div class="cz-cap">${C.capL.map((x) => `<button class="cz-cp ${x.p.id === C.cap.p.id ? 'on' : ''}" onclick="setCap(${x.p.id})"><span class="mini">${pShirt(x.p)}</span><b>${esc(x.p.name)}</b><small>${tt(`<bdi class="num">${x.v}</bdi> نقطة`, `${x.v} pts`)}</small>${x.p.id === C.cap.p.id ? `<i>C</i>` : ''}</button>`).join('')}</div>${C.capSafe && C.capRisk && C.capRisk.p.id !== C.capSafe.p.id ? `<div class="cz-pair"><span><small>${tt('الآمن', 'Safe')}</small><b>${esc(C.capSafe.p.name)}</b></span><span class="r"><small>${tt('الجريء', 'Bold')}</small><b>${esc(C.capRisk.p.name)}</b></span></div>` : ''}`;
  const L = C.learn, learn = L?.n ? tt(`دقة توقعاتي <bdi class="num">${L.acc}%</bdi> بآخر <bdi class="num">${L.n}</bdi> جولات`, `Accuracy ${L.acc}% over ${L.n} GWs`) : '';
  return `<div class="card cz">
    <div class="cz-h"><span class="cz-ic">${I('i-sparkle', 'i')}</span><div><b>${tt('مدربك الذكي', 'Your smart coach')}</b><small>${tt(`أسلوبك: ${an}`, `Style: ${an}`)}</small></div></div>
    ${C.focus ? `<div class="cz-line focus"><small>${tt('ركّز على', 'Focus')}</small><span>${esc(C.focus.t)}</span></div>` : ''}
    <div class="cz-st"><span><b class="${S.vsAvg >= 0 ? 'up' : 'down'}" dir="ltr">${S.vsAvg >= 0 ? '+' : ''}${S.vsAvg}</b><small>${tt('عن المعدل', 'Vs avg')}</small></span><span><b dir="ltr">${S.hitsN}</b><small>${tt('انتقالات بخصم', 'Hits')}</small></span><span><b dir="ltr">${S.benchPts}</b><small>${tt('ضاعت بالدكة', 'Bench lost')}</small></span><span><b>${S.favF || '—'}</b><small>${tt('تشكيلك', 'Formation')}</small></span></div>
    <div class="cz-sec"><h4>${I('i-gauge', 'i')}${tt('تقييمك', 'Your scores')}${learn ? `<span class="cz-h4s">${learn}</span>` : ''}</h4><div class="cz-tr">${TR.map(([k, l]) => `<div class="cz-t"><span>${l}</span><div class="meter"><i style="width:${T[k] ?? 0}%;background:${col(T[k])}"></i></div><b class="num" style="color:${col(T[k])}">${T[k] ?? '—'}</b></div>`).join('')}</div></div>
    <div class="cz-sec"><h4>${I('i-swap', 'i')}${tt('الانتقال', 'Transfer')}${confChip(C.trConf)}</h4>${main}${opts}${urgent}${plan}</div>
    <div class="cz-sec"><h4>${I('i-star', 'i')}${tt('الكابتن', 'Captain')}${confChip(C.capConf)}</h4>${capHTML}</div>
    ${C.ideas.length ? `<div class="cz-sec"><h4>${I('i-sparkle', 'i')}${tt('نصائح', 'Tips')}</h4><div class="cz-ideas">${C.ideas.map((x) => `<div class="cz-idea${x.act ? ' tap' : ''}"${x.act ? ` onclick="${x.act}"` : ''}><span class="ms ${MS[x.ic] || 'ms-opp'}" role="img" aria-label="${MSL()[MS[x.ic] || 'ms-opp']}"></span><p>${arTip(x.t)}</p></div>`).join('')}</div></div>` : ''}
  </div>`;
}
function insight(P) {
  const G = ST.G, gw = G.next, a = analyze(P, esc), sq = P.squad.map(PM);
  const coachHTML = COACH() ? coachCard(P) : '';
  const posXp = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => { const L = sq.filter((p) => p.pos === pos); return [pos, r1(L.reduce((s, p) => s + xpN(p, gw, 5), 0) / (L.length || 1))]; });
  const mx = Math.max(...posXp.map((x) => x[1]), 1);
  const clubs = {}; sq.forEach((p) => (clubs[p.team] = (clubs[p.team] || 0) + 1));
  const risks = sq.map((p) => { const r = []; if (avail(p) < 1) r.push([avail(p) === 0 ? 'red' : 'amber', avail(p) === 0 ? tt('غير متاح', 'Out') : `${Math.round(avail(p) * 100)}%`]); if (!fixturesFor(p.team, gw).length) r.push(['amber', tt('ما يلعب', 'Blank')]); const pp = pricePredict(p); if (pp.prog <= -70) r.push(['red', tt('سعره ينزل', 'Price drop')]); return [p, r]; }).filter((x) => x[1].length);
  const M = [['attack', tt('الهجوم', 'Attack')], ['defense', tt('الدفاع', 'Defence')], ['fixt', tt('المباريات', 'Fixtures')], ['form', tt('الفورم', 'Form')], ['availability', tt('الجاهزية', 'Availability')], ['lineup', tt('التشكيلة', 'Lineup')]];
  const gws = [0, 1, 2, 3, 4].map((i) => gw + i).filter((g) => g <= G.lastGW);
  return coachHTML + `<div class="card"><div class="flex between" style="margin-bottom:10px"><b>${I('i-gauge', 'i', 'width:17px;height:17px;vertical-align:-3px;color:var(--acc)')} ${tt('تقييم الفريق', 'Team rating')}</b><span class="big-num" style="font-size:22px">${a.overall}<span class="mut" style="font-size:12px">/100</span></span></div>
    ${M.map(([k, l]) => `<div class="mrow"><span>${l}</span><div class="meter" style="flex:1;margin:0"><i style="width:${Math.round(a.metrics?.[k] ?? 0)}%;background:${(a.metrics?.[k] ?? 0) >= 70 ? 'var(--acc)' : (a.metrics?.[k] ?? 0) >= 45 ? 'var(--warn)' : 'var(--bad)'}"></i></div><b class="num">${Math.round(a.metrics?.[k] ?? 0)}</b></div>`).join('')}</div>
   <div class="sec"><h2>${I('i-season')}${tt('مباريات فريقك القادمة', 'Squad fixture run')}</h2></div>
   <div class="card scroll-x" dir="ltr" style="padding:10px"><table class="mx" style="width:100%"><thead><tr><th style="text-align:left">${tt('اللاعب', 'Player')}</th>${gws.map((g) => `<th>${tt(`ج${g}`, `GW${g}`)}</th>`).join('')}<th>xP5</th></tr></thead><tbody>${[...P.xi, ...P.bench].map(PM).map((p) => `<tr><td class="tn" onclick="openPlayer(${p.id})"><span class="pos ${p.pos}">${p.pos}</span>${esc(p.name)}</td>${gws.map((g) => { const f = fixturesFor(p.team, g); return f.length ? `<td class="c f${Math.round(f.reduce((s, x) => s + x.fdr, 0) / f.length)}">${f.map((x) => `${tShort(x.opp)}<small>${x.home ? 'H' : 'A'}</small>`).join('')}</td>` : '<td class="c blank">—</td>'; }).join('')}<td class="c" style="background:var(--s2)">${xpN(p, gw, 5)}</td></tr>`).join('')}</tbody></table></div>
   <div class="grid g2 one-sm" style="margin-top:12px">
    <div class="card"><b style="font-size:14px">${I('i-layers', 'i', 'width:16px;height:16px;vertical-align:-3px;color:var(--acc)')} ${tt('قوة الخطوط (xP/5)', 'Line strength (xP/5)')}</b>${posXp.map(([pos, v]) => `<div class="mrow"><span class="pos ${pos}">${pos}</span><div class="meter" style="flex:1;margin:0"><i style="width:${(v / mx) * 100}%;background:var(--acc)"></i></div><b class="num">${v}</b></div>`).join('')}</div>
    <div class="card"><b style="font-size:14px">${I('i-shield', 'i', 'width:16px;height:16px;vertical-align:-3px;color:var(--acc)')} ${tt('توزيع الأندية', 'Club exposure')}</b><div class="flex wrap" style="gap:6px;margin-top:10px">${Object.entries(clubs).sort((x, y) => y[1] - x[1]).map(([tm, n]) => `<span class="club-chip ${n >= 3 ? 'full' : ''}" onclick="openClub(${tm})">${crest(tShort(+tm), 18)}${tShort(+tm)} <b>${n}/3</b></span>`).join('')}</div></div>
   </div>
   <div class="sec"><h2>${I('i-alert')}${tt('مخاطر بفريقك', 'Squad risks')}</h2></div>
   ${risks.length ? `<div class="list">${risks.map(([p, r]) => `<div class="row tap" onclick="openPlayer(${p.id})"><div class="mini">${pShirt(p)}</div><div class="info"><b>${esc(p.name)}</b><span style="white-space:normal">${esc(p.news || tShort(p.team))}</span></div><div class="flex" style="gap:4px">${r.map(([c, l]) => `<span class="tag ${c}">${l}</span>`).join('')}</div></div>`).join('')}</div>` : `<div class="card flex" style="gap:10px">${I('i-check', 'i', 'color:var(--acc)')}<span>${tt('ما في مخاطر واضحة بفريقك هالجولة', 'No obvious risks this GW')}</span></div>`}`;
}
/* ---------- نقاط الجولة الحالية لحظياً ---------- */
const curEv = () => ST.G.events.find((e) => e.id === ST.G.cur);
export const gwRunning = () => { const e = curEv(); return !!e && new Date(e.deadline) < new Date() && !e.fin && !e.checked; };
const hasCurPicks = () => ST.E.picks && ST.E.gw === ST.G.cur;
function ensureLive() {
  const gw = ST.G.cur; if (liveLoading || (ST.live && ST.liveRawGW === gw)) return;
  liveLoading = true;
  FPL.loadLive(gw).then((l) => { ST.live = Object.fromEntries(l.elements.map((x) => [x.id, x.stats])); ST.liveRaw = l.elements; ST.liveRawGW = gw; }).catch(() => {}).finally(() => { liveLoading = false; if (ST.view === 'team') window.render(); });
}
function pState(p, gw) {
  const f = (ST.G.fx[gw] || []).filter((x) => x.h === p.team || x.a === p.team);
  if (!f.length) return ['blank', tt('ما يلعب', 'No match')];
  { const lv = f.filter((x) => x.started && !x.fin); if (lv.length) { const g = lv.reduce((a, x) => ((x.min || 0) > (a.min || 0) ? x : a)); return ['live', fxMin(g, true)]; } }
  if (f.every((x) => x.fin)) return ['done', tt('انتهت', 'FT')];
  const k = f.find((x) => !x.started)?.ko; return ['soon', k ? new Date(k).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'ar-IQ', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : tt('لاحقاً', 'Later')];
}
/* ---------- النبض الضوئي حول بطاقة اللاعب أثناء المباراة (تجربة بدون مباريات: ?glow=demo) ---------- */
const GLOW = () => true; // صار للكل
const GLOW_DEMO = () => { try { return GLOW() && sessionStorage.getItem('fp_glow_demo') === '1'; } catch { return false; } };
// اللون والسرعة لكل حالة
// ألوان متباعدة حتى ما يتشابه حدثين: أبيض للهدف، سماوي، أزرق، بنفسجي، وردي، أصفر، برتقالي، أحمر، أسود، وأخضر للي يلعب بدون أحداث
const PZ = { on: ['#22C55E', 2.6], goal: ['#FFFFFF', 1.1], assist: ['#00E5FF', 1.5], cs: ['#2962FF', 2.8], save: ['#8B3DFF', 2], bonus: ['#FF2BD6', 1.8], yellow: ['#FFEA00', 2], leak: ['#FF7A00', 2.2], bad: ['#111111', 1.4], red: ['#FF1744', 0.9] };
const PZ_L = () => ({ on: tt('يلعب', 'Playing'), goal: tt('هدف', 'Goal'), assist: tt('صناعة', 'Assist'), cs: tt('شباك نظيفة', 'Clean sheet'), save: tt('تصديات', 'Saves'), bonus: tt('بونص', 'Bonus'), yellow: tt('أصفر', 'Yellow'), leak: tt('يستقبل أهداف', 'Conceding'), bad: tt('هدف عكسي/ضربة جزاء ضايعة', 'OG / pen miss'), red: tt('أحمر', 'Red') });
const PZ_F = [['goals_scored', 'goal'], ['assists', 'assist'], ['red_cards', 'red'], ['yellow_cards', 'yellow'], ['own_goals', 'bad'], ['penalties_missed', 'bad'], ['penalties_saved', 'save'], ['bonus', 'bonus'], ['goals_conceded', 'leak']];
const pzSnap = {}, pzLast = {};
function pzSteady(p, s, r) {
  const gd = p.pos === 'GK' || p.pos === 'DEF';
  if (s.red_cards) return 'red';
  if (s.goals_scored) return 'goal';
  if (s.assists) return 'assist';
  if (s.own_goals || s.penalties_missed) return 'bad';
  if (s.yellow_cards) return 'yellow';
  if (s.penalties_saved || (p.pos === 'GK' && (s.saves || 0) >= 3)) return 'save';
  if (r.bonus) return 'bonus';
  if (gd && (s.goals_conceded || 0) >= 2) return 'leak';
  if (gd && (s.minutes || 0) >= 60 && !s.goals_conceded) return 'cs';
  return 'on';
}
function pzTrack(id, gw, s) {
  // نلقط آخر حدث صار للاعب بمقارنة إحصاءاته بآخر مرة شفناها
  const key = gw + '|' + id, prev = pzSnap[key]; pzSnap[key] = { ...s };
  if (!prev) return;
  for (const [f, k] of PZ_F) if ((s[f] || 0) > (prev[f] || 0)) { pzLast[key] = { k, t: Date.now() }; return; }
}
const PZ_DEMO = ['goal', 'cs', 'assist', 'on', 'yellow', 'bonus', 'save', 'leak', 'on', 'red', 'goal'];
function pzRing(p, r, st, gw, i) {
  if (!GLOW() || st !== 'live') return '';
  const demo = GLOW_DEMO(), s = (gw === ST.G.cur && ST.live?.[p.id]) || {};
  if (!demo) pzTrack(p.id, gw, s);
  let k = demo ? PZ_DEMO[i % PZ_DEMO.length] : pzSteady(p, s, r);
  const shown = r.pts * Math.max(1, r.m), last = demo ? null : pzLast[gw + '|' + p.id];
  let [c, sp] = PZ[k]; if (k === 'goal' && (s.goals_scored || 0) >= 2) sp = 0.9;
  const lvl = Math.max(0.4, Math.min(1, (demo ? 6 : shown) / 10));
  const age = last ? (Date.now() - last.t) / 1000 : 99, fresh = age < 7;
  return `<i class="pz${fresh ? ' new' : ''}" data-k="${k}" title="${esc(PZ_L()[k])}" style="--c:${c};--sp:${sp}s;--pz-i:${lvl};--bc:${fresh ? PZ[last.k][0] : c};--pz-age:-${fresh ? age.toFixed(2) : 0}s" aria-hidden="true"></i>`;
}
function pzLegend() {
  const L = PZ_L();
  return `<div class="pz-leg"><b>${tt('النبض الضوئي', 'Light pulse')}</b>${['on', 'goal', 'assist', 'cs', 'save', 'bonus', 'yellow', 'leak', 'bad', 'red'].map((k) => `<span><i style="--c:${PZ[k][0]}"></i>${L[k]}</span>`).join('')}</div>`;
}
let pzDemoT = null;
function pzDemoLoop() {
  // وضع التجربة: كل كم ثانية يصير "حدث" عشوائي على لاعب حتى تشوف الوميض
  if (pzDemoT || !GLOW_DEMO()) return;
  const ev = ['goal', 'assist', 'yellow', 'red', 'bonus', 'save', 'goal'];
  let tick = 0;
  pzDemoT = setInterval(() => {
    if (document.hidden || !ST.G || !ST.E) return;
    if (!onTeamLive()) {
      // بصفحة ثانية: إشعار حدث تجريبي كل ~6 ثواني
      if (tick++ % 2) return;
      const xi = (ST.E.picks?.picks || []).filter((x) => x.position <= 11); if (!xi.length) return;
      const pk = xi[Math.floor(Math.random() * xi.length)], p = PM(pk.element); if (!p) return;
      const ks = ['goal', 'assist', 'bonus', 'yellow', 'goal', 'save', 'red', 'leak'], k = ks[Math.floor(Math.random() * ks.length)];
      const base = { goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 }[p.pos], assist: 3, yellow: -1, red: -3, save: 5, leak: p.pos === 'GK' || p.pos === 'DEF' ? -4 : 0, bonus: 3 }[k];
      const n = k === 'bonus' ? 3 : undefined, list = [{ id: p.id, k, n }];
      if (k !== 'bonus' && base) list.push({ id: p.id, k: 'pts', n: base * Math.max(1, pk.multiplier || 1) });
      glowNotify(list); return;
    }
    const all = [...document.querySelectorAll('#view .pl .pz')]; if (!all.length) return;
    const el = all[Math.floor(Math.random() * all.length)], k = ev[Math.floor(Math.random() * ev.length)];
    el.dataset.k = k; el.title = PZ_L()[k];
    el.style.setProperty('--c', PZ[k][0]); el.style.setProperty('--sp', PZ[k][1] + 's'); el.style.setProperty('--bc', PZ[k][0]); el.style.setProperty('--pz-age', '0s');
    el.classList.remove('new'); void el.offsetWidth; el.classList.add('new');
    const id = +el.closest('.pl')?.dataset.pid; if (id && ['goal', 'assist', 'yellow', 'red', 'bonus'].includes(k)) window.__fxEvents?.([{ id, k, n: k === 'bonus' ? 3 : undefined }]);
  }, 3200);
}
setTimeout(() => { if (GLOW_DEMO()) pzDemoLoop(); }, 2500);

/* ---------- إشعار الحدث داخل التطبيق لما تكون بصفحة ثانية  ---------- */
const NT = () => ({
  goal: ['⚽', tt('هدف!', 'Goal!'), tt('سجّل', 'scored')], assist: ['🅰️', tt('صناعة!', 'Assist!'), tt('صنع هدف', 'assisted')],
  yellow: ['🟨', tt('كرت أصفر', 'Yellow card'), tt('أخذ إنذار', 'booked')], red: ['🟥', tt('طرد!', 'Red card!'), tt('انطرد', 'sent off')],
  bonus: ['⭐', tt('بونص', 'Bonus'), tt('دخل البونص', 'in the bonus')], save: ['🧤', tt('صدّ ضربة جزاء!', 'Penalty saved!'), tt('صدّ ضربة جزاء', 'saved a penalty')],
  bad: ['😬', tt('حدث سلبي', 'Setback'), tt('هدف عكسي أو ضيّع جزاء', 'own goal / missed pen')], leak: ['🥅', tt('استقبل هدف', 'Goal conceded'), tt('راحت الشباك النظيفة', 'clean sheet gone')],
});
const onTeamLive = () => ST.view === 'team' && tab === 'live' && !document.querySelector('.ov');
function ntMatch(p) {
  const f = (ST.G.fx[ST.G.cur] || []).find((x) => x.h === p.team || x.a === p.team); if (!f) return '';
  return `<span class="nt-m">${crest(tShort(f.h), 16)}<b dir="ltr">${f.hs ?? 0}–${f.as ?? 0}</b>${crest(tShort(f.a), 16)}${f.started ? `<em>${esc(fxMin(f, true))}</em>` : ''}</span>`;
}
let ntQ = [];
function glowNotify(list) {
  if (!GLOW() || onTeamLive()) return false;
  const pts = {}; list.forEach((e) => { if (e.k === 'pts') pts[e.id] = (pts[e.id] || 0) + e.n; });
  const evs = list.filter((e) => e.k !== 'pts' && NT()[e.k]); if (!evs.length) return true;
  let root = document.getElementById('ntRoot'); if (!root) { root = document.createElement('div'); root.id = 'ntRoot'; document.body.appendChild(root); }
  evs.forEach((e, k) => setTimeout(() => {
    const p = PM(e.id); if (!p) return;
    const [emo, title, verb] = NT()[e.k], pk = ST.E?.picks?.picks?.find((x) => x.element === e.id), mult = pk?.multiplier || 1;
    const d = pts[e.id] ?? (e.k === 'bonus' ? (e.n || 0) * mult : null);
    const el = document.createElement('div'); el.className = `nt ${e.k}`; el.style.setProperty('--c', PZ[e.k]?.[0] || '#34D399'); el.setAttribute('role', 'status');
    el.innerHTML = `<div class="nt-ic"><span>${EVX(e.k)}</span></div><div class="nt-sh">${pShirt(p)}</div>
      <div class="nt-b"><div class="nt-t"><b>${title}</b>${mult > 1 ? `<span class="nt-cap">${mult === 3 ? '3×' : 'C'}</span>` : ''}</div>
      <div class="nt-p"><b>${esc(p.name)}</b> ${verb}${e.k === 'bonus' && e.n ? ` +${e.n}` : ''}</div>${ntMatch(p)}</div>
      ${d ? `<div class="nt-pts ${d < 0 ? 'neg' : ''}"><b dir="ltr">${d > 0 ? '+' : ''}${d}</b><small>${tt('نقطة', 'pts')}</small></div>` : ''}
      <i class="nt-bar"></i>`;
    const close = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => { el.remove(); ntQ = ntQ.filter((x) => x !== el); }, 380); };
    el.onclick = () => { close(); tab = 'live'; teamGW = null; ST.view === 'team' ? window.render() : window.go('team'); };
    let y0 = null; el.addEventListener('touchstart', (ev) => (y0 = ev.touches[0].clientY), { passive: true });
    el.addEventListener('touchmove', (ev) => { if (y0 == null) return; const dy = Math.min(0, ev.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; el.style.opacity = 1 + dy / 120; if (dy < -45) { y0 = null; close(); } }, { passive: true });
    el.addEventListener('touchend', () => { if (y0 != null && !el.classList.contains('out')) { el.style.transform = ''; el.style.opacity = ''; } y0 = null; });
    root.prepend(el); ntQ.unshift(el); ntQ.slice(3).forEach((x) => x.classList.add('out'));
    try { navigator.vibrate?.(e.k === 'goal' || e.k === 'red' ? [18, 60, 18] : 12); } catch {}
    setTimeout(close, 6000);
  }, k * 450));
  return true;
}
window.__glowNotify = glowNotify;

/* ---------- دخول اللاعبين للملعب واحد ورا الثاني (معاينة ?walk=1) ---------- */
const WALK = () => { try { return localStorage.getItem('fp_walk') === '1'; } catch { return false; } };
let walkKey = '', walkPlay = false, walkT = [];
function walkDecide() {
  walkPlay = false; if (!WALK() || tab === 'insight') return;
  const fresh = document.getElementById('view')?.dataset.view !== 'team';
  const key = tab + '|' + (tab === 'live' ? teamGW || ST.G.cur : 'p');
  walkPlay = fresh || key !== walkKey; walkKey = key;
}
function walkRun() {
  const pitch = document.querySelector('#view .pitch.walk-pre'), bench = document.querySelector('#view .benchbox.walk-pre');
  walkT.forEach(clearTimeout); walkT = [];
  if (!pitch) return;
  const done = () => { pitch.classList.remove('walk-pre', 'walk-go'); bench?.classList.remove('walk-pre', 'walk-go'); pitch.querySelectorAll('.walk-fx').forEach((x) => x.remove()); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
  const pr = pitch.getBoundingClientRect(), rtl = document.documentElement.dir !== 'ltr';
  // النفق: بنص خط الوسط على جنب الملعب
  const tx = rtl ? pr.right - 10 : pr.left + 10, ty = pr.top + pr.height / 2;
  const cards = [...pitch.querySelectorAll('.pl')];
  // الكابتن يقود الفريق، بعده الحارس، الدفاع، الوسط، الهجوم
  cards.sort((a, b) => (b.classList.contains('capt') ? 1 : 0) - (a.classList.contains('capt') ? 1 : 0));
  const STEP = 190, DUR = 1050;
  cards.forEach((c, i) => {
    const r = c.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + 24;
    c.style.setProperty('--wx', `${tx - cx}px`); c.style.setProperty('--wy', `${ty - cy}px`); c.style.setProperty('--wd', `${300 + i * STEP}ms`);
  });
  const fx = document.createElement('div'); fx.className = 'walk-fx';
  fx.innerHTML = `<i class="walk-tun ${rtl ? 'r' : 'l'}"></i>${Array.from({ length: 16 }, (_, i) => `<b style="left:${(i * 37) % 100}%;top:${i % 2 ? 2 + (i * 7) % 10 : 88 + (i * 5) % 10}%;animation-delay:${200 + ((i * 263) % 1900)}ms"></b>`).join('')}`;
  pitch.appendChild(fx);
  if (bench) bench.querySelectorAll('.pl').forEach((c, i) => c.style.setProperty('--wd', `${300 + cards.length * STEP + 150 + i * 110}ms`));
  void pitch.offsetWidth;
  pitch.classList.replace('walk-pre', 'walk-go'); bench?.classList.replace('walk-pre', 'walk-go');
  const total = 300 + cards.length * STEP + DUR + (bench ? 4 * 110 + 700 : 0);
  walkT.push(setTimeout(done, total));
  try { navigator.vibrate?.(8); } catch {}
}
export function afterTeam() { if (walkPlay) { walkPlay = false; walkRun(); } }
window.walkAgain = () => { walkKey = ''; document.getElementById('view').dataset.view = ''; window.render(); window.scrollTo({ top: Math.max(0, (document.querySelector('#view .pitch')?.getBoundingClientRect().top || 0) + scrollY - 70), behavior: 'smooth' }); };

let mvpId = null;
function liveCard(r, i, gw = ST.G.cur) {
  const p = PM(r.id); if (!p) return '';
  let [st, stl] = pState(p, gw); const shown = r.pts * Math.max(1, r.m);
  if (GLOW_DEMO() && !r.subOut && (r.m > 0 || r.subIn)) { st = 'live'; stl = `${48 + ((i * 7) % 40)}′`; }
  const bg = r.m === 0 && !r.subIn ? '#CBD5E1' : st === 'soon' ? '#E2E8F0' : shown >= 10 ? '#34D399' : shown >= 5 ? '#A7F3D0' : shown >= 2 ? '#F1F5F9' : shown > 0 ? '#FED7AA' : '#FECACA';
  const mvp = mvpId === r.id;
  return `<div class="pl ${r.cap ? 'capt' : ''} ${r.subOut ? 'dim' : ''} ${mvp ? 'mvp' : ''}" data-pid="${p.id}" style="--d:${i * 35}ms" onclick="playerGW(${p.id},${gw},${Math.max(1, r.m)})" role="button">${mvp ? `<span class="mvp-b"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8Z"/></svg>${tt('نجم الجولة', 'Star')}</span>` : ''}${r.cap ? `<span class="cb">${r.m === 3 ? '3×' : 'C'}</span>` : r.vc ? `<span class="cb v">${r.m > 1 ? 'C' : 'V'}</span>` : ''}${r.subIn ? `<span class="rk" style="background:var(--acc);color:var(--on-acc)">⇅</span>` : r.subOut ? `<span class="rk r2">⇅</span>` : ''}${pzRing(p, r, st, gw, i)}<div class="sh">${pShirt(p)}</div><div class="nm">${esc(p.name)}</div><div class="lb lpts" style="background:${bg}">${st === 'soon' && !shown ? '—' : shown}${r.bonus ? `<sup>+${r.bonus}</sup>` : ''}</div><div class="pst ${st}">${st === 'live' ? '<i></i>' : ''}${stl}</div></div>`;
}
async function loadGW(g) {
  if (gwCache[g]) return;
  gwCache[g] = { loading: true };
  try {
    const [pk, lv] = await Promise.all([FPL.fetchPicks(ST.profile.teamId, g), FPL.loadLive(g)]);
    gwCache[g] = { picks: pk, live: Object.fromEntries(lv.elements.map((x) => [x.id, x.stats])) };
  } catch (e) { gwCache[g] = { err: e.message }; }
  if (ST.view === 'team' && teamGW === g) window.render();
}
function gwStrip(sel) {
  const G = ST.G, hist = ST.E.hist.current || [], chips = ST.E.hist.chips || [];
  return `<div class="gwstrip" id="tgwstrip" style="margin-top:12px">${G.events.filter((e) => e.id <= G.cur).map((e) => { const h = hist.find((x) => x.event === e.id); return `<button class="past ${e.id === G.cur ? 'cur' : ''} ${e.id === sel ? 'on' : ''}" onclick="teamGo(${e.id})" aria-label="GW${e.id}"><small>${e.id}</small><b>${h ? h.points : '—'}</b>${chips.some((c) => c.event === e.id) ? '<span class="flag"></span>' : ''}</button>`; }).join('')}</div>`;
}
function liveView() {
  const G = ST.G, cur = G.cur, gw = teamGW || cur;
  let picks, liveMap = null, bonus = null;
  if (gw === cur && hasCurPicks()) { ensureLive(); if (!ST.live || ST.liveRawGW !== cur) return gwStrip(gw) + `<div class="skel" style="height:420px;margin-top:12px"></div>`; picks = ST.E.picks; }
  else { const c0 = gwCache[gw]; if (!c0) { loadGW(gw); return gwStrip(gw) + `<div class="skel" style="height:420px;margin-top:12px"></div>`; } if (c0.loading) return gwStrip(gw) + `<div class="skel" style="height:420px;margin-top:12px"></div>`; if (c0.err) return gwStrip(gw) + `<div class="card mut" style="margin-top:12px">${esc(c0.err)}</div>`; picks = c0.picks; liveMap = c0.live; bonus = {}; }
  const c = liveCalc(picks, gw, bonus, liveMap); if (!c) return gwStrip(gw) + `<div class="empty">${t('noData')}</div>`;
  const on = c.rows.filter((r) => (r.m > 0 && !r.subOut) || r.subIn), off = c.rows.filter((r) => !on.includes(r));
  const rows = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => on.filter((r) => PM(r.id)?.pos === pos));
  const ev = G.events.find((e) => e.id === gw), running = gw === cur && gwRunning();
  const h = (ST.E.hist.current || []).find((x) => x.event === gw), hp = (ST.E.hist.current || []).find((x) => x.event === gw - 1);
  const R = running ? rankImpact(c) : null, lr = running ? officialRank() : null;
  const total = running ? c.total : h?.points ?? c.total;
  const playing = on.filter((r) => pState(PM(r.id), gw)[0] === 'live').length, left = on.filter((r) => pState(PM(r.id), gw)[0] === 'soon').length;
  const mv = h && hp && hp.overall_rank ? hp.overall_rank - h.overall_rank : 0;
  let k = 0;
  // نجم الجولة: أعلى لاعب جاب نقاط بالتشكيلة
  const best = on.reduce((a, r) => { const v = r.pts * Math.max(1, r.m); return v > (a ? a.v : 0) ? { id: r.id, v } : a; }, null);
  mvpId = best && best.v >= 3 ? best.id : null;
  return `${gwStrip(gw)}<section class="team-hero live-hero ${running ? '' : 'done'}" style="margin-top:10px">
    <div class="flex between" style="align-items:flex-start"><div><div class="mut" style="font-size:12.5px">${t('gw')} ${gw} ${running ? `<span class="livebadge">${tt('مباشر', 'Live')}</span>` : `· ${tt('منتهية', 'Finished')}`}</div>
      <div class="flex" style="gap:10px;align-items:baseline;flex-wrap:wrap"><span class="big-num" style="font-size:52px;color:var(--acc);line-height:1.05">${total}</span><span class="mut" style="font-size:13px">${tt('نقطة', 'pts')}${c.hit ? ` (−${c.hit})` : ''}</span>${ev?.avg ? `<span class="lh-avg ${total >= ev.avg ? 'up' : 'down'}">${total >= ev.avg ? '▲ +' : '▼ '}${total - ev.avg} <small>${tt('عن المعدل', 'vs avg')} ${ev.avg}</small></span>` : ''}</div></div>
     <div class="live-side">${running ? `<div><small>${tt('يلعبون هسه', 'Playing')}</small><b>${playing}</b></div><div><small>${tt('باقي', 'To play')}</small><b>${left}</b></div>${lr?.rank ? `<div class="wide"><small>${tt('الترتيب العام', 'Overall rank')}</small><b>${fmt(lr.rank)}</b>${lr.move ? `<em class="${lr.move > 0 ? 'mv-up' : 'mv-down'}">${lr.move > 0 ? '▲' : '▼'} ${fmt(Math.abs(lr.move))}</em>` : ''}</div>` : ''}` : `<div><small>${t('highest')}</small><b>${ev?.top ?? '—'}</b></div><div class="wide"><small>${t('overall')}</small><b>${h?.overall_rank ? fmt(h.overall_rank) : '—'}</b>${mv ? `<em class="${mv > 0 ? 'mv-up' : 'mv-down'}">${mv > 0 ? '▲' : '▼'} ${fmt(Math.abs(mv))}</em>` : ''}</div><div><small>${t('bench')}</small><b>${h?.points_on_bench ?? '—'}</b></div>`}</div></div>
    ${c.subs.length || c.capOut || c.chip || (running && c.rows.some((r) => r.bonus)) || h?.event_transfers ? `<div class="flex wrap" style="gap:6px;margin-top:10px">${c.chip ? `<span class="tag violet">${I('i-bolt')}${{ bboost: tt('بنش بوست', 'Bench Boost'), '3xc': tt('كابتن ثلاثي', 'Triple C'), freehit: tt('فري هيت', 'Free Hit'), wildcard: tt('وايلد كارد', 'Wildcard'), manager: tt('المدرب', 'Manager') }[c.chip] || c.chip}</span>` : ''}${h?.event_transfers ? `<span class="tag">${I('i-swap')}${h.event_transfers} ${tt('انتقال', 'transfers')}${h.event_transfers_cost ? ` (−${h.event_transfers_cost})` : ''}</span>` : ''}${c.subs.map((x) => `<span class="tag lime">${I('i-swap')}<span class="mv" dir="ltr">${esc(PM(x.out)?.name)}<i class="mv-a">→</i>${esc(PM(x.in)?.name)}</span></span>`).join('')}${c.capOut ? `<span class="tag amber">${I('i-crown')}${tt('النائب صار كابتن', 'Vice captain doubled')}</span>` : ''}${running && c.rows.some((r) => r.bonus && r.m) ? `<span class="tag cyan">${I('i-star')}${tt('ضمنها بونص الفانتازي', 'Incl. FPL bonus')} +${c.rows.reduce((a, r) => a + r.bonus * r.m, 0)}</span>` : ''}</div>` : ''}
   </section>
   <button class="btn btn-g btn-b btn-sm" style="margin-top:10px" onclick="openShareCard(${gw})">${I('i-send', 'i', 'width:15px;height:15px')}${tt(`شارك بطاقة الجولة ${gw}`, `Share GW${gw} card`)}</button>
   <div class="pitch${walkPlay ? ' walk-pre' : ''}" style="margin-top:12px">${LINES}${rows.map((r) => `<div class="prow">${r.map((x) => liveCard(x, k++, gw)).join('')}</div>`).join('')}</div>
   <div class="benchbox${walkPlay ? ' walk-pre' : ''}"><div class="t"><span>${I('i-bench', 'i', 'width:16px;height:16px;vertical-align:-3px')} ${t('bench')} <span class="mut" style="font-size:12px">· ${off.reduce((a, r) => a + r.pts, 0)} ${tt('نقطة', 'pts')}</span></span></div>
    <div class="prow" dir="ltr">${off.map((r) => `<div class="slot">${liveCard(r, k++, gw)}</div>`).join('')}</div></div>
   <div class="tactions"><button class="btn btn-g" ${gw <= 1 ? 'disabled' : ''} onclick="teamGo(${gw - 1})">${I('i-back', 'i', 'width:16px;height:16px')}${t('gw')} ${gw - 1}</button><button class="btn btn-g" ${gw >= cur ? 'disabled' : ''} onclick="teamGo(${gw + 1})">${t('gw')} ${gw + 1}${I('i-chev', 'i', 'width:16px;height:16px')}</button></div>
   ${GLOW() && (running || GLOW_DEMO()) ? (pzDemoLoop(), pzLegend()) : ''}
   ${running ? `<div class="flex wrap" style="gap:10px;font-size:11.5px;color:var(--mut);margin:10px 2px"><span class="pst live" style="position:static"><i></i>${tt('يلعب', 'Playing')}</span><span class="pst done" style="position:static">${tt('انتهت', 'FT')}</span><span class="pst soon" style="position:static">${tt('لسه', 'Upcoming')}</span><span><sup style="color:var(--info)">+2</sup> ${tt('بونص الفانتازي', 'FPL bonus')}</span><span>⇅ ${tt('تبديل تلقائي', 'auto-sub')}</span></div>` : ''}
   <p class="mut" style="font-size:11.5px;text-align:center;margin-top:8px">${running ? tt('النقاط تتحدث كل 30 ثانية أثناء المباريات.', 'Refreshes every 30s during matches.') : tt('اضغط أي لاعب حتى تشوف شنو سوّى بهالجولة.', 'Tap a player to see his match.')}</p>`;
}
export function vTeam() {
  const P = ST.plan; if (!P) return `<div class="empty">${I('i-pitch', 'i', 'width:44px;height:44px')}<b>${tt('فريقك ما لعب أي جولة بعد', 'Your team has not played yet')}</b></div>`;
  if (tab == null) tab = (gwRunning() && hasCurPicks()) || GLOW_DEMO() ? 'live' : 'pitch';
  walkDecide();
  const E = ST.E, pend = E.pending || [], preDeadline = E.gw && ST.G.next > E.gw;
  const info = preDeadline ? `<details class="tnote"><summary>${I('i-info', 'i', 'width:16px;height:16px;color:var(--info)')}<span>${tt(`تشكيلتك للجولة ${ST.G.next}`, `Your team for GW${ST.G.next}`)}${E.fhRevert ? tt(' · رجعت بعد الفري هيت', ' · reverted after FH') : ''}${P.transfers.length ? ` · ${P.transfers.length} ${tt('انتقال مسجّل', 'recorded')}` : ''}</span>${I('i-chev', 'chev')}</summary><p>${pend.length ? tt(`انتقالات من الفانتازي: ${pend.map((x) => `${PM(x.element_out)?.name} ← ${PM(x.element_in)?.name}`).join('، ')}. `, '') : ''}${tt('الفانتازي يخفي الانتقالات الجديدة والكابتن لحد الإغلاق. إذا سويت انتقال بتطبيق الفانتازي سجّله هنا مرة وحدة، وبعد الإغلاق كلشي يتحدث رسمياً وحده.', 'FPL hides new transfers & captain until the deadline — record your move here once; it syncs officially after.')}</p></details>` : '';
  const actions = `<div class="tactions"><button class="btn btn-p" onclick="bestLineup()">${I('i-sparkle')}${tt('أفضل تشكيلة', 'Best XI')}</button><button class="btn btn-g" onclick="go('market')">${I('i-swap')}${preDeadline ? tt('سجّل انتقال', 'Record transfer') : t('transfers')}</button><button class="icon-btn" onclick="syncTeam(this)" aria-label="refresh" title="${tt('تحديث من الفانتازي', 'Refresh from FPL')}">${I('i-refresh')}</button><button class="icon-btn" onclick="resetToOfficial()" aria-label="reset" title="${tt('رجّع الرسمي', 'Reset')}">${I('i-reset')}</button></div>`;
  return `<div class="tabs2" style="margin-top:2px">${ST.G.cur >= 1 ? `<button class="${tab === 'live' ? 'on' : ''}" onclick="teamTab('live')">${gwRunning() ? '<span class="dotlive"></span>' : I('i-history', 'i', 'width:16px;height:16px;vertical-align:-3px')} ${tt('نقاطي بالجولات', 'My gameweeks')}</button>` : ''}<button class="${tab === 'pitch' ? 'on' : ''}" onclick="teamTab('pitch')">${I('i-pitch', 'i', 'width:16px;height:16px;vertical-align:-3px')} ${tt(`خطة الجولة ${ST.G.next}`, `GW${ST.G.next} plan`)}</button><button class="${tab === 'insight' ? 'on' : ''}" onclick="teamTab('insight')">${I('i-gauge', 'i', 'width:16px;height:16px;vertical-align:-3px')} ${tt('تحليل الفريق', 'Insights')}</button></div>
   ${tab === 'live' ? '' : hero(P) + info}
   ${tab === 'live' ? liveView() : tab === 'pitch' ? toolbar(P) + pitch(P) + actions : insight(P)}
   ${WALK() && tab !== 'insight' ? `<button class="walk-again" onclick="walkAgain()">${I('i-pitch', 'i', 'width:15px;height:15px')}${tt('شوف دخول اللاعبين مرة ثانية', 'Replay the walkout')}</button>` : ''}
   ${P.transfers.length ? `<div class="sec"><h2>${I('i-swap')}${tt('انتقالات مسجّلة', 'Recorded transfers')}</h2></div><div class="list">${P.transfers.map((x, i) => `<div class="row"><div class="mini">${pShirt(PM(x.in))}</div><div class="info"><b class="mv" dir="ltr"><span class="down">${esc(PM(x.out).name)}</span><i class="mv-a">→</i><span class="up">${esc(PM(x.in).name)}</span></b><span>${x.cost ? '−4' : tt('مجاني', 'free')} · ${tt('فرق المتوقع', 'xP diff')} ${r1(xpN(PM(x.in), ST.G.next, 3) - xpN(PM(x.out), ST.G.next, 3))}/3</span></div><button class="icon-btn" onclick="undoT(${i})" aria-label="undo">${I('i-x')}</button></div>`).join('')}</div>` : ''}
   ${tab === 'live' ? '' : `<p class="mut" style="font-size:11.5px;text-align:center;margin-top:12px">${tt('حرف <b>H</b> يعني يلعب بملعبه، وحرف <b>A</b> يعني يلعب بملعب الخصم. اضغط لاعب لتفاصيله، أو اختار "بدّل" من صفحته حتى تبدّله. التغييرات تنحفظ كخطة، والتنفيذ بالتطبيق الرسمي.', 'H = home, A = away. Tap a player for details or swap. Changes save as a plan.')}</p>`}`;
}
function pitchTap(id) { if (swapFrom) { const a = swapFrom; swapFrom = null; if (a !== id) doSwap(a, id); return window.render(); } window.openPlayer(id); }
function doSwap(a, b) {
  const P = ST.plan; if (!canSwap(a, b)) return toast(tt('التبديل يكسر قواعد التشكيلة', 'Invalid formation'));
  const ia = P.xi.includes(a), ib = P.xi.includes(b);
  if (!ia && !ib) { const i = P.bench.indexOf(a), j = P.bench.indexOf(b); P.bench[i] = b; P.bench[j] = a; }
  else { const s = ia ? a : b, bn = ia ? b : a; P.xi = P.xi.map((x) => (x === s ? bn : x)); P.bench = P.bench.map((x) => (x === bn ? s : x)); if (P.cap === s) P.cap = bn; if (P.vc === s) P.vc = bn; }
  savePlan(); toast(tt('تم التبديل', 'Swapped'));
}
Object.assign(window, {
  pitchTap,
  teamTab: (x) => { tab = x; window.render(); if (x === 'live') setTimeout(() => document.querySelector('#tgwstrip .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 60); },
  teamGo: (g) => { teamGW = g; tab = 'live'; window.render(); setTimeout(() => document.querySelector('#tgwstrip .on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }), 60); },
  chipPreview: (c) => { chipPrev = c; window.render(); },
  setLabel: (m) => { LS.set('fp_label', m); window.render(); },
  setForm: (f) => { const r = bestXIFormation(ST.plan.squad, f); if (!r) { toast(tt('ما يمشي هذا التشكيل بلاعبينك', 'Not possible with your squad')); return window.render(); } Object.assign(ST.plan, r); savePlan(); window.render(); toast(f); },
  startSwap: (id) => { window.closeSheet(); swapFrom = id; tab = 'pitch'; if (ST.view !== 'team') window.go('team'); else window.render(); },
  cancelSwap: () => { swapFrom = null; window.render(); },
  autoBench: () => { const P = ST.plan; P.bench = [P.bench[0], ...P.bench.slice(1).sort((a, b) => xp(PM(b)) - xp(PM(a)))]; savePlan(); window.render(); toast(tt('رتّبت الدكة حسب المتوقع', 'Bench ordered by xP')); },
  bestLineup: () => { Object.assign(ST.plan, bestXI(ST.plan.squad)); savePlan(); tab = 'pitch'; window.render(); toast(tt('التشكيلة الأفضل للجولة القادمة', 'Best predicted XI')); },
  resetPlan: () => { ST.plan = basePlan(); savePlan(); window.render(); toast(tt('رجعنا للفريق الرسمي', 'Reverted to official team')); },
  undoT: (i) => { const P = ST.plan, x = P.transfers[i]; const rep = (a) => a.map((y) => (y === x.in ? x.out : y)); P.squad = rep(P.squad); P.xi = rep(P.xi); P.bench = rep(P.bench); if (P.cap === x.in) P.cap = x.out; if (P.vc === x.in) P.vc = x.out; P.bank = r1(P.bank - PM(x.out).price + PM(x.in).price); if (!x.cost && P.chip !== 'wildcard' && P.chip !== 'freehit') P.ft++; P.transfers.splice(i, 1); savePlan(); window.render(); },
  syncTeam: async (b) => { if (b) b.classList.add('spin'); await window.loadAll(true); window.go('team', { back: true }); },
  resetToOfficial: () => { if (ST.profile) ST.profile.plan = null; window.__saveProfile?.({ plan: null }); try { Object.keys(localStorage).filter((k) => k.startsWith('fp_plan_')).forEach((k) => localStorage.removeItem(k)); } catch {} window.loadAll(true).then(() => window.go('team', { back: true })); },
});
