/* مركز الأوراق والاستراتيجية — يعتمد قوانين الموسم من الفانتازي نفسه */
import { ST, PM, tName, tShort } from '../store.js';
import { t, tt } from '../i18n.js';
import { esc, I, r1, openSheet, sheetHead, barChart } from '../ui.js';
import { pShirt } from './common.js';
import * as FPL from '../fpl.js';
import { xp, projected, dgwBgw, bestXI, counts } from '../engine.js';

const NAMES = () => ({ wildcard: [tt('وايلد كارد', 'Wildcard'), 'i-reset'], freehit: [tt('فري هيت', 'Free Hit'), 'i-bolt'], bboost: [tt('بنش بوست', 'Bench Boost'), 'i-bench'], '3xc': [tt('كابتن ثلاثي', 'Triple Captain'), 'i-star'], manager: [tt('المساعد', 'Assistant Manager'), 'i-users'] });
/** فريق فري هيت تقريبي: أفضل 15 حسب المتوقع ضمن الميزانية وقواعد اللعبة */
/* محاكاة الفري هيت لكل مدرب حسب فريقه: نبدأ من تشكيلته الحالية وميزانيته،
   ونسوي أفضل تبديلات (فردية وثنائية) ترفع المتوقع للجولة الجاية — فالنتيجة تختلف من مدرب لمدرب */
function fhObjective(squad, gw) {
  const b = bestXI(squad, gw), v = (id) => xp(PM(id), gw);
  return b.xi.reduce((a, id) => a + v(id), 0) + v(b.cap) + 0.1 * b.bench.reduce((a, id) => a + v(id), 0);
}
function freeHitFor(P, gw) {
  const budget = r1(P.squad.reduce((a, id) => a + PM(id).price, 0) + P.bank), own = new Set(P.squad);
  const POS = ['GK', 'DEF', 'MID', 'FWD'], NEED = { GK: 2, DEF: 5, MID: 5, FWD: 3 }, top = {};
  POS.forEach((pos) => { top[pos] = ST.G.players.filter((p) => p.pos === pos && (p.st === 'a' || own.has(p.id)) && (xp(p, gw) > 0 || own.has(p.id))).sort((a, b) => xp(b, gw) - xp(a, gw)).slice(0, 40); });
  const clubOk = (sq) => { const c = {}; for (const id of sq) { const t = PM(id).team; c[t] = (c[t] || 0) + 1; if (c[t] > 3) return false; } return true; };
  // نفضّل لاعبينك عند التساوي تقريباً: الخطة تبقى قريبة من فريقك وتختلف من مدرب لمدرب
  const obj = (sq) => fhObjective(sq, gw) + 0.12 * sq.filter((id) => own.has(id)).length;
  const cost = (sq) => sq.reduce((a, id) => a + PM(id).price, 0);
  function climb(start) {
    let squad = [...start], bank = r1(budget - cost(squad)), score = obj(squad);
    for (let it = 0; it < 60; it++) {
      let best = null;
      for (const o of squad) { const po = PM(o);
        for (const n of top[po.pos]) { if (squad.includes(n.id)) continue; const nb = r1(bank + po.price - n.price); if (nb < 0) continue;
          const sq = squad.map((x) => (x === o ? n.id : x)); if (!clubOk(sq)) continue;
          const sc = obj(sq); if (sc > score + 0.05 && (!best || sc > best.sc)) best = { sq, nb, sc }; } }
      if (!best) {
        const weak = [...squad].sort((a, b) => xp(PM(a), gw) / PM(a).price - xp(PM(b), gw) / PM(b).price).slice(0, 9);
        for (let x = 0; x < weak.length; x++) for (let y = x + 1; y < weak.length; y++) {
          const o1 = PM(weak[x]), o2 = PM(weak[y]), free = bank + o1.price + o2.price;
          for (const n1 of top[o1.pos].slice(0, 12)) { if (squad.includes(n1.id)) continue;
            for (const n2 of top[o2.pos].slice(0, 16)) { if (n2.id === n1.id || squad.includes(n2.id)) continue; const nb = r1(free - n1.price - n2.price); if (nb < 0) continue;
              const sq = squad.map((z) => (z === o1.id ? n1.id : z === o2.id ? n2.id : z)); if (!clubOk(sq)) continue;
              const sc = obj(sq); if (sc > score + 0.05 && (!best || sc > best.sc)) best = { sq, nb, sc }; } } }
      }
      if (!best) break; squad = best.sq; bank = best.nb; score = best.sc;
    }
    return { squad, bank, score };
  }
  // بداية ثانية: فريق جديد كلياً ضمن نفس ميزانيتك (أرخص لاعبين بكل مركز) حتى ما نعلق قريب من فريقك
  const cheap = []; POS.forEach((pos) => { const c = {}; cheap.forEach((id) => (c[PM(id).team] = (c[PM(id).team] || 0) + 1));
    ST.G.players.filter((p) => p.pos === pos && p.st === 'a').sort((a, b) => a.price - b.price || xp(b, gw) - xp(a, gw)).forEach((p) => { if (cheap.filter((id) => PM(id).pos === pos).length < NEED[pos] && (c[p.team] || 0) < 3) { cheap.push(p.id); c[p.team] = (c[p.team] || 0) + 1; } }); });
  const runs = [climb(P.squad)]; if (cheap.length === 15 && cost(cheap) <= budget) runs.push(climb(cheap));
  const R = runs.sort((a, b) => b.score - a.score)[0], squad = R.squad, b = bestXI(squad, gw);
  return { squad, ...b, chip: '', transfers: [], bank: R.bank, budget, outs: P.squad.filter((id) => !squad.includes(id)), ins: squad.filter((id) => !P.squad.includes(id)) };
}
export function vChips() {
  const G = ST.G, P = ST.plan, cs = FPL.chipStatus(G, ST.E.hist);
  const groups = {}; cs.forEach((c) => (groups[c.name] = groups[c.name] || []).push(c));
  const dg = dgwBgw(G.next, Math.min(G.lastGW, G.next + 9));
  const nextGWs = Array.from({ length: 8 }, (_, i) => G.next + i).filter((g) => g <= G.lastGW);
  const capBest = P ? nextGWs.map((g) => { const c = [...P.xi].map(PM).sort((a, b) => xp(b, g) - xp(a, g))[0]; return { g, p: c, v: xp(c, g) }; }) : [];
  const benchBest = P ? nextGWs.map((g) => ({ g, v: r1(P.bench.reduce((a, id) => a + xp(PM(id), g), 0)) })) : [];
  const base = P ? projected({ ...P, chip: '' }) : 0;
  const sim = P ? { bboost: r1(projected({ ...P, chip: 'bboost' }) - base), '3xc': r1(projected({ ...P, chip: '3xc' }) - base) } : {};
  return `<div class="grid g2 chipg">${Object.entries(groups).map(([n, arr]) => { const nm = NAMES()[n] || [n, 'i-bolt']; const left = arr.reduce((a, c) => a + (c.open ? c.left : 0), 0), total = arr.reduce((a, c) => a + c.number, 0);
    return `<div class="card tap" onclick="chipInfo('${n}')"><div style="display:flex;align-items:center;gap:10px"><span style="width:44px;height:44px;border-radius:14px;background:${left ? 'var(--g2)' : 'var(--glass2)'};display:grid;place-items:center">${I(nm[1])}</span><div style="flex:1"><b>${nm[0]}</b><div class="mut" style="font-size:12px">${arr.map((c) => `GW${c.start}–${c.stop}: ${c.used.length ? tt('استُخدمت ج', 'used GW') + c.used.map((u) => u.event).join(',') : c.expired ? tt('انتهت', 'expired') : tt('متاحة', 'available')}`).join(' · ')}</div></div><span class="tag ${left ? 'lime' : ''}">${left}/${total}</span></div>
     ${sim[n] != null ? `<div class="mut" style="font-size:12px;margin-top:8px">${tt('أثرها لو استخدمتها بالجولة', 'Impact if used in GW')} ${G.next}: <b style="color:#34D399">+${sim[n]}</b> ${tt('متوقع', 'xP')}</div>` : ''}</div>`; }).join('')}</div>
   <p class="mut" style="font-size:11.5px;margin:8px 2px">${tt('عدد الأوراق وفتراتها مأخوذة من قوانين الموسم بالفانتازي الرسمي نفسه، مو مفترضة.', 'Chip counts and windows come from the official game rules for this season.')}</p>
   <div class="sec"><h2>${I('i-cal')}${tt('جولات مزدوجة وفارغة قادمة', 'Upcoming double & blank GWs')}</h2></div>
   ${dg.length ? dg.map((x) => `<div class="row"><div class="mini" style="display:grid;place-items:center;font-weight:700;border-radius:14px;background:rgba(var(--acc-rgb),.14);color:#34D399">${x.gw}</div><div class="info"><b>${x.dbl.length ? tt('مزدوجة', 'Double') + ': ' + x.dbl.map(tShort).join('، ') : ''}${x.dbl.length && x.blank.length ? ' · ' : ''}${x.blank.length ? tt('فارغة', 'Blank') + ': ' + x.blank.map(tShort).join('، ') : ''}</b><span>${tt('من جدول المباريات الرسمي', 'From the official fixture list')}</span></div></div>`).join('') : `<div class="card mut" style="font-size:13px">${tt('ما في جولات مزدوجة أو فارغة معلنة بالـ 10 جولات الجاية. عادة تنعلن بعد مباريات الكؤوس.', 'No doubles or blanks announced in the next 10 GWs. They are usually confirmed after cup rounds.')}</div>`}
   ${P ? `<div class="sec"><h2>${I('i-star')}${tt('أفضل توقيت للكابتن الثلاثي', 'Best Triple Captain timing')}</h2></div><div class="card">${barChart(capBest.map((x) => 'GW' + x.g), capBest.map((x) => r1(x.v * 3)), { h: 130 })}<div class="mut" style="font-size:12px">${tt('أعلى قيمة', 'Peak')}: GW${[...capBest].sort((a, b) => b.v - a.v)[0].g} — ${esc([...capBest].sort((a, b) => b.v - a.v)[0].p.name)} (${r1([...capBest].sort((a, b) => b.v - a.v)[0].v * 3)} ${tt('متوقع ×3', 'xP ×3')})</div></div>
   <div class="sec"><h2>${I('i-bench')}${tt('أفضل توقيت للبنش بوست', 'Best Bench Boost timing')}</h2></div><div class="card">${barChart(benchBest.map((x) => 'GW' + x.g), benchBest.map((x) => x.v), { h: 130, color: 'linear-gradient(180deg,#60A5FA,#1D4ED8)' })}<div class="mut" style="font-size:12px">${tt('نقاط الدكة المتوقعة بكل جولة بفريقك الحالي', 'Projected bench points with current squad')}</div></div>
   <div class="sec"><h2>${I('i-bolt')}${tt('محاكاة الفري هيت', 'Free Hit simulation')}</h2></div><div class="card"><p class="mut" style="font-size:13px">${tt('يبني أفضل 15 لاعب للجولة القادمة ضمن قيمة فريقك وقواعد اللعبة، ويقارنه بفريقك.', 'Builds the best 15 for next GW within your team value and rules, compared to your team.')}</p><button class="btn btn-p btn-b" style="margin-top:8px" onclick="simFH()">${I('i-sparkle')}${tt('شغّل المحاكاة', 'Run simulation')}</button><div id="fhRes"></div></div>` : ''}`;
}
Object.assign(window, {
  chipInfo: (n) => { const nm = NAMES()[n] || [n, 'i-bolt']; const tips = { wildcard: tt('تغيير الفريق كله بدون خصم. أفضل وقت: لما يكثر عندك مصابين، أو قبل سلسلة مباريات سهلة لأندية ما عندك منها.', 'Unlimited free transfers. Best when injuries pile up or before a fixture swing.'), freehit: tt('فريق مؤقت لجولة وحدة ويرجع فريقك بعدها. الأنسب للجولات الفارغة أو المزدوجة الكبيرة.', 'One-week team; ideal for big blank or double GWs.'), bboost: tt('نقاط الدكة تنحسب. الأنسب بجولة مزدوجة لما يكون كل لاعبيك الـ15 يلعبون.', 'Bench points count; best in a double GW with 15 starters.'), '3xc': tt('الكابتن ياخذ ×3. الأنسب لهداف بمباراتين بجولة مزدوجة أو مباراة سهلة جداً بالأرض.', 'Captain scores ×3; best on a premium with a double or very easy home game.') }; openSheet(`${sheetHead(I(nm[1]), nm[0])}<p style="line-height:1.9">${tips[n] || ''}</p>`); },
  simFH: () => {
    const P = ST.plan, G = ST.G, el = document.getElementById('fhRes'); if (!P || !el) return;
    el.innerHTML = `<div class="aiload" style="padding:12px"><i></i><i></i><i></i><span>${tt('نحسب أفضل فريق إلك…', 'Building your best team…')}</span></div>`;
    setTimeout(() => {
      const fh = freeHitFor(P, G.next);
      const base = bestXI(P.squad, G.next), a = projected({ ...P, xi: base.xi, bench: base.bench, cap: base.cap, chip: '', transfers: [] }), b = projected(fh), d = r1(b - a);
      const pr = (id) => `<div class="fh-p"><div class="mini">${pShirt(PM(id))}</div><div><b>${esc(PM(id).name)}</b><small><bdi>${tShort(PM(id).team)}</bdi> · <bdi>${PM(id).price.toFixed(1)}م</bdi> · ${xp(PM(id), G.next)}</small></div></div>`;
      const ORD = ['GK', 'DEF', 'MID', 'FWD'], order = (ids) => [...ids].sort((x, y) => ORD.indexOf(PM(x).pos) - ORD.indexOf(PM(y).pos) || xp(PM(y), G.next) - xp(PM(x), G.next));
      const outs = order(fh.outs), ins = order(fh.ins);
      el.innerHTML = `<div class="kv" style="margin-top:10px"><div><b>${a}</b><span>${tt('فريقك', 'Your team')}</span></div><div><b class="up">${b}</b><span>${tt('فريق الفري هيت', 'Free Hit team')}</span></div><div><b class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</b><span>${tt('الفرق', 'Difference')}</span></div></div>
        <p class="fh-sum">${!ins.length ? tt('فريقك هو الأفضل لهالجولة — الفري هيت ما يضيفلك شي، خليه لجولة ثانية.', 'Your team is already optimal — save the chip.') : tt(`تحتفظ بـ ${15 - ins.length} من لاعبينك وتغيّر ${ins.length} · الميزانية ${fh.budget.toFixed(1)} · يبقى بالبنك ${fh.bank.toFixed(1)}`, `Keep ${15 - ins.length}, change ${ins.length} · budget ${fh.budget.toFixed(1)} · bank ${fh.bank.toFixed(1)}`)}${ins.length && d < 6 ? tt(' · الفرق قليل، فكّر تخلي الورقة لجولة مزدوجة أو فارغة.', ' · Small gain — consider saving it for a double/blank GW.') : ''}</p>
        ${ins.length ? `<div class="fh-sw"><div class="fh-col"><small class="down">${tt('يطلعون', 'Out')}</small>${outs.map(pr).join('')}</div><div class="fh-col"><small class="up">${tt('يدخلون', 'In')}</small>${ins.map(pr).join('')}</div></div>` : ''}
        <div class="fh-xi"><small>${tt('تشكيلة الفري هيت', 'Free Hit XI')}</small><div>${order(fh.xi).map((id) => `<span class="tag ${fh.ins.includes(id) ? 'lime' : ''}" style="margin:2px">${esc(PM(id).name)}${id === fh.cap ? ' ©' : ''}</span>`).join('')}</div></div>
        <p class="mut" style="font-size:11.5px;margin-top:6px">${tt('مبنية على فريقك وميزانيتك أنت (قيمة لاعبينك + البنك) والنقاط المتوقعة للجولة الجاية. الأسعار الحالية — سعر البيع الفعلي ممكن يكون أقل شوية.', 'Built from your own squad and budget. Uses current prices; actual selling prices may be slightly lower.')}</p>`;
    }, 30);
  },
});
