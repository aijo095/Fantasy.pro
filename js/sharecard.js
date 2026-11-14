/* =========================================================
   بطاقة الجولة للمشاركة — صورة 1080×1350 (مناسبة للستوري والواتساب)
   ترسم بالـ Canvas بنفس هوية التطبيق وتنشارك بزر المشاركة بالآيفون
========================================================= */
import { ST, PM, tShort } from './store.js';
import { tt } from './i18n.js';
import { esc, I, openSheet, sheetHead, toast } from './ui.js';
import * as FPL from './fpl.js';
import { liveCalc } from './live-engine.js';
import { shirt } from './ui.js';

const W = 1080, H = 1920, AR = '"IBM Plex Sans Arabic", system-ui, sans-serif', EN = 'Inter, system-ui, sans-serif';
const CHIP = { wildcard: 'وايلد كارد', freehit: 'فري هت', bboost: 'بنش بوست', '3xc': 'تريبل كابتن' };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en'));

async function gather(gw) {
  const G = ST.G, id = ST.profile.teamId, hist = ST.E.hist.current || [];
  const h = hist.find((x) => x.event === gw) || {}, hp = hist.find((x) => x.event === gw - 1);
  const ev = G.events.find((e) => e.id === gw) || {};
  const picks = gw === ST.E.gw && ST.E.picks ? ST.E.picks : await FPL.fetchPicks(id, gw);
  const lv = await FPL.loadLive(gw); const live = Object.fromEntries(lv.elements.map((x) => [x.id, x.stats]));
  const calc = liveCalc(picks, gw, gw === G.cur ? null : {}, live);
  const rows = calc.rows.filter((r) => (r.m > 0 && !r.subOut) || r.subIn);
  const capRow = calc.rows.find((r) => r.cap), cap = capRow && PM(capRow.id);
  const best = [...rows].sort((a, b) => b.pts * Math.max(1, b.m) - a.pts * Math.max(1, a.m))[0];
  const pts = gw === G.cur && !ev.fin ? calc.total : h.points ?? calc.total;
  return {
    gw, team: ST.E.entry.name, mgr: `${ST.E.entry.player_first_name || ''} ${ST.E.entry.player_last_name || ''}`.trim(),
    pts, avg: ev.avg, top: ev.top, rank: h.overall_rank, rankPrev: hp?.overall_rank, gwRank: h.rank, total: h.total_points,
    cap: cap ? { name: cap.name, pts: capRow.pts * Math.max(1, capRow.m), mult: capRow.m } : null,
    best: best ? { name: PM(best.id)?.name, pts: best.pts * Math.max(1, best.m) } : null,
    region: (() => { const en = ST.E.entry || {}, rn = en.player_region_name; const l = (en.leagues?.classic || []).find((x) => x.league_type === 's' && rn && x.name === rn); return l ? { name: rn === 'Iraq' ? 'العراق' : rn, rank: l.entry_rank } : null; })(),
    chip: picks.active_chip, hit: h.event_transfers_cost || 0, bench: h.points_on_bench, live: gw === G.cur && !ev.fin,
    squad: calc.rows.map((r) => ({ id: r.id, name: PM(r.id)?.name || '', pos: PM(r.id)?.pos, team: tShort(PM(r.id)?.team), slot: r.pos, pts: r.m ? r.pts * r.m : r.pts, counted: r.m > 0, cap: r.cap, vc: r.vc, m: r.m, subIn: r.subIn, subOut: r.subOut, best: best && r.id === best.id })),
  };
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const shirtImg = new Map();
function loadShirt(team, pos) {
  const k = team + (pos === 'GK' ? 'G' : '');
  if (!shirtImg.has(k)) shirtImg.set(k, new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(shirt(team, pos).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" ')); }));
  return shirtImg.get(k);
}
const clip = (c, t, max) => { if (c.measureText(t).width <= max) return t; while (t.length > 2 && c.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
async function player(c, p, x, y, sz, dim) {
  const im = await loadShirt(p.team, p.pos);
  c.save(); if (dim) c.globalAlpha = 0.55;
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  if (im) c.drawImage(im, x - sz / 2, y - sz / 2, sz, sz);
  c.restore();
  // الاسم
  const nw = 168, ny = y + sz / 2 + 2; c.font = `600 25px ${EN}`; c.textAlign = 'center';
  rr(c, x - nw / 2, ny, nw, 38, 9); c.fillStyle = 'rgba(8,12,20,.88)'; c.fill();
  c.fillStyle = dim ? 'rgba(255,255,255,.6)' : '#fff'; c.fillText(clip(c, p.name, nw - 14), x, ny + 27);
  // النقاط
  const pc = p.cap ? '#FBBF24' : !p.counted ? '#94A3B8' : p.pts >= 10 ? '#34D399' : p.pts >= 4 ? '#F8FAFC' : p.pts >= 2 ? '#E2E8F0' : '#F87171';
  rr(c, x - nw / 2, ny + 40, nw, 42, 9); c.fillStyle = p.cap ? 'rgba(251,191,36,.22)' : p.best ? 'rgba(52,211,153,.22)' : 'rgba(255,255,255,.92)'; c.fill();
  c.fillStyle = p.cap || p.best ? pc : '#0B1222'; if (!p.counted && !p.cap && !p.best) c.fillStyle = '#64748B';
  c.font = `800 30px ${EN}`; c.fillText(String(p.pts), x, ny + 72);
  // شارات
  const badge = (txt, bx, bg, fg) => { c.beginPath(); c.arc(bx, y - sz / 2 + 22, 22, 0, Math.PI * 2); c.fillStyle = bg; c.fill(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; c.stroke(); c.fillStyle = fg; c.font = `800 22px ${EN}`; c.fillText(txt, bx, y - sz / 2 + 30); };
  if (p.cap) badge(p.m === 3 ? '3×' : 'C', x + sz / 2 - 8, '#FBBF24', '#1C1404'); else if (p.vc) badge('V', x + sz / 2 - 8, '#E2E8F0', '#0B1222');
  if (p.subIn) badge('↑', x - sz / 2 + 8, '#34D399', '#052E1C'); if (p.subOut) badge('↓', x - sz / 2 + 8, '#F87171', '#2A0606');
  if (p.best && !p.cap) badge('★', x - sz / 2 + 8, '#34D399', '#052E1C');
}
// صيغة عربية للعدد ويا كلمة نقطة
const nq = (n) => (n === 1 ? 'نقطة وحدة' : n === 2 ? 'نقطتين' : n >= 3 && n <= 10 ? `${n} نقاط` : `${n} نقطة`);
// نص مختلط (عربي + إنكليزي) بالكانفس: كل قطعة تنرسم باتجاهها حتى ما تتلخبط الأقواس
function mixed(c, segs, xRight, y) { let x = xRight; segs.forEach(([t, font, col, dir]) => { c.font = font; c.direction = dir || 'rtl'; c.textAlign = 'right'; if (dir === 'ltr') { c.textAlign = 'left'; const w = c.measureText(t).width; c.fillStyle = col; c.fillText(t, x - w, y); x -= w; } else { c.fillStyle = col; c.fillText(t, x, y); x -= c.measureText(t).width; } }); c.direction = 'rtl'; }
const segW = (c, segs) => segs.reduce((a, [t, font]) => { c.font = font; return a + c.measureText(t).width; }, 0);
async function draw(d) {
  try { await Promise.all([document.fonts.load(`700 60px ${AR}`), document.fonts.load(`800 60px ${EN}`), document.fonts.load(`500 30px ${AR}`), document.fonts.load(`600 25px ${EN}`)]); } catch {}
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.direction = 'rtl';
  // الخلفية: تدرج عميق + توهجين ناعمين
  c.fillStyle = '#080B12'; c.fillRect(0, 0, W, H);
  const g1 = c.createRadialGradient(W * 0.85, 120, 0, W * 0.85, 120, 900); g1.addColorStop(0, 'rgba(52,211,153,.30)'); g1.addColorStop(1, 'rgba(52,211,153,0)'); c.fillStyle = g1; c.fillRect(0, 0, W, H);
  const g2 = c.createRadialGradient(W * 0.1, 520, 0, W * 0.1, 520, 800); g2.addColorStop(0, 'rgba(139,124,255,.20)'); g2.addColorStop(1, 'rgba(139,124,255,0)'); c.fillStyle = g2; c.fillRect(0, 0, W, H);
  // الهيدر
  c.textAlign = 'right'; c.fillStyle = '#34D399'; c.font = `700 36px ${AR}`; c.fillText('فانتازي برو', W - 64, 92);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `500 28px ${AR}`; c.fillText(d.live ? `الجولة ${d.gw} · مباشر` : `الجولة ${d.gw}`, W - 64, 136);
  // شارة GW
  c.font = `800 30px ${EN}`; const gwT = 'GW' + d.gw, gwW = c.measureText(gwT).width + 40; rr(c, 64, 58, gwW, 52, 26); c.fillStyle = 'rgba(251,191,36,.14)'; c.fill(); c.strokeStyle = 'rgba(251,191,36,.45)'; c.lineWidth = 2; c.stroke();
  c.textAlign = 'center'; c.fillStyle = '#FBBF24'; c.fillText(gwT, 64 + gwW / 2, 95);
  if (d.mgr) { c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,.5)'; c.font = `500 26px ${EN}`; c.fillText(d.mgr, 66, 146); }
  // اسم الفريق
  c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `700 50px ${AR}`; c.fillText(d.team, W / 2, 222);
  // النقاط ويا هالة خلفها
  const halo = c.createRadialGradient(W / 2, 350, 10, W / 2, 350, 230); halo.addColorStop(0, 'rgba(52,211,153,.22)'); halo.addColorStop(1, 'rgba(52,211,153,0)'); c.fillStyle = halo; c.fillRect(W / 2 - 260, 120, 520, 460);
  const pg = c.createLinearGradient(0, 250, 0, 420); pg.addColorStop(0, '#A7F3D0'); pg.addColorStop(1, '#10B981');
  c.fillStyle = pg; c.font = `800 168px ${EN}`; c.fillText(String(d.pts ?? '—'), W / 2, 408);
  // سطر المقارنة بالمعدل (كبسولة)
  if (d.avg != null) {
    const df = d.pts - d.avg, up = df > 0, eq = df === 0;
    const txt = eq ? `نفس معدل الجولة (${d.avg})` : `${up ? 'أعلى' : 'أقل'} من المعدل بـ ${nq(Math.abs(df))}  ·  المعدل ${d.avg}`;
    c.font = `600 28px ${AR}`; const tw = c.measureText(txt).width + 56; rr(c, W / 2 - tw / 2, 432, tw, 52, 26);
    c.fillStyle = eq ? 'rgba(255,255,255,.08)' : up ? 'rgba(52,211,153,.14)' : 'rgba(248,113,113,.14)'; c.fill();
    c.fillStyle = eq ? 'rgba(255,255,255,.8)' : up ? '#6EE7B7' : '#FCA5A5'; c.textAlign = 'center'; c.fillText(txt, W / 2, 468);
  } else { c.font = `600 28px ${AR}`; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText('نقطة', W / 2, 468); }
  // الإحصائيات: 4 مربعات متساوية
  const arrow = d.rankPrev && d.rank ? (d.rank < d.rankPrev ? ['▲', '#34D399'] : d.rank > d.rankPrev ? ['▼', '#F87171'] : null) : null;
  const stats = [['الترتيب العام', fmt(d.rank), arrow], d.region ? [`ترتيب ${d.region.name}`, fmt(d.region.rank), null] : null, ['ترتيب الجولة', fmt(d.gwRank), null], ['أعلى نقاط', fmt(d.top), null]].filter(Boolean);
  const sg = 14, sw = (W - 128 - sg * (stats.length - 1)) / stats.length, sy = 512, sh = 118;
  stats.forEach(([l, v, ar], i) => { const x = W - 64 - sw - i * (sw + sg);
    rr(c, x, sy, sw, sh, 22); c.fillStyle = 'rgba(255,255,255,.06)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
    c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `500 22px ${AR}`; c.fillText(l, x + sw / 2, sy + 40);
    let fs = stats.length > 3 ? 36 : 42; c.font = `800 ${fs}px ${EN}`; while (c.measureText(v).width > sw - (ar ? 50 : 24) && fs > 24) { fs -= 2; c.font = `800 ${fs}px ${EN}`; }
    const vw = c.measureText(v).width; c.fillStyle = '#fff'; c.fillText(v, x + sw / 2 - (ar ? 12 : 0), sy + 90);
    if (ar) { c.fillStyle = ar[1]; c.font = `800 22px ${EN}`; c.fillText(ar[0], x + sw / 2 - 12 + vw / 2 + 18, sy + 88); } });
  // الملعب
  const px = 40, py = 652, pw = W - 80, ph = 930;
  rr(c, px, py, pw, ph, 34); const fg = c.createLinearGradient(0, py, 0, py + ph); fg.addColorStop(0, '#178A45'); fg.addColorStop(1, '#125E33'); c.fillStyle = fg; c.fill();
  c.save(); rr(c, px, py, pw, ph, 34); c.clip();
  for (let i = 0; i < 10; i++) { if (i % 2) { c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(px, py + (ph / 10) * i, pw, ph / 10); } }
  const vg = c.createRadialGradient(W / 2, py + ph / 2, ph * 0.3, W / 2, py + ph / 2, ph * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)'); c.fillStyle = vg; c.fillRect(px, py, pw, ph);
  c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 4; c.strokeRect(px + 36, py + 28, pw - 72, ph - 56);
  c.strokeRect(W / 2 - 200, py + 28, 400, 150); c.strokeRect(W / 2 - 95, py + 28, 190, 60);
  c.beginPath(); c.moveTo(px + 36, py + ph - 28); c.lineTo(px + pw - 36, py + ph - 28); c.stroke();
  c.beginPath(); c.arc(W / 2, py + ph - 28, 130, Math.PI, 0); c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 2; rr(c, px, py, pw, ph, 34); c.stroke();
  const xi = d.squad.filter((p) => p.slot <= 11), bench = d.squad.filter((p) => p.slot > 11);
  const lines = ['GK', 'DEF', 'MID', 'FWD'].map((pos) => xi.filter((p) => p.pos === pos)).filter((l) => l.length);
  // مسافات متساوية بين الخطوط: كل لاعب (تيشيرت + اسم + نقاط) ارتفاعه ثابت
  const sz = 118, blockH = sz + 84, inner = ph - 56, rowH = inner / lines.length;
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li], top = py + 28 + rowH * li + (rowH - blockH) / 2, cy = top + sz / 2, gap = Math.min(196, (pw - 80) / L.length);
    for (let k = 0; k < L.length; k++) { const cx = W / 2 + (k - (L.length - 1) / 2) * gap * -1; await player(c, L[k], cx, cy, sz, L[k].subOut); }
  }
  // الدكة
  const by = 1594, bh = 242; rr(c, px, by, pw, bh, 28); c.fillStyle = 'rgba(255,255,255,.05)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
  c.textAlign = 'right'; c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `600 24px ${AR}`; c.fillText(`الدكة${d.bench != null ? ` · ${nq(d.bench)}` : ''}`, W - 70, by + 38);
  const bgap = (pw - 40) / Math.max(1, bench.length);
  for (let k = 0; k < bench.length; k++) { const cx = W - px - 20 - bgap * (k + 0.5); await player(c, bench[k], cx, by + 104, 92, !bench[k].subIn && d.chip !== 'bboost'); }
  // التذييل: كبسولات (الكابتن، الشب، الخصم) — كل قطعة بالاتجاه الصح
  const tags = [];
  if (d.cap) tags.push({ col: '#FBBF24', segs: [['الكابتن: ', `600 26px ${AR}`, '#FBBF24'], [`${d.cap.name} (${d.cap.pts})`, `700 26px ${EN}`, '#FBBF24', 'ltr']] });
  if (d.chip) tags.push({ segs: [[CHIP[d.chip] || d.chip, `600 26px ${AR}`, '#C4B5FD']] });
  if (d.hit) tags.push({ segs: [['خصم ', `600 26px ${AR}`, '#FCA5A5'], [`−${d.hit}`, `700 26px ${EN}`, '#FCA5A5', 'ltr']] });
  const ty = 1842; let total = tags.reduce((a, t) => a + segW(c, t.segs) + 48, 0) + 14 * Math.max(0, tags.length - 1), tx = W / 2 + total / 2;
  tags.forEach((t) => { const w = segW(c, t.segs) + 48; rr(c, tx - w, ty, w, 50, 25); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); mixed(c, t.segs, tx - 24, ty + 34); tx -= w + 14; });
  c.textAlign = 'center'; c.direction = 'ltr'; c.fillStyle = 'rgba(255,255,255,.28)'; c.font = `500 20px ${EN}`; c.fillText('fantasy-pro-aijo0.vercel.app', W / 2, tags.length ? 1910 : 1880); c.direction = 'rtl';
  return cv;
}

let lastBlob = null;
export async function openShareCard(gw = ST.G.cur) {
  openSheet(`${sheetHead(I('i-send'), tt('بطاقة الجولة', 'Gameweek card'), tt(`الجولة ${gw}`, `GW${gw}`))}<div id="shc" class="aiload"><i></i><i></i><i></i><span>${tt('جارِ تجهيز البطاقة…', 'Preparing card…')}</span></div>`);
  try {
    const cv = await draw(await gather(gw));
    lastBlob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const url = URL.createObjectURL(lastBlob), box = document.getElementById('shc'); if (!box) return;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([lastBlob], 'x.png', { type: 'image/png' })] }));
    box.outerHTML = `<img src="${url}" alt="" class="shc-img"><div class="flex" style="gap:8px;margin-top:12px">${canShare ? `<button class="btn btn-p" style="flex:1" onclick="shcShare()">${I('i-send')}${tt('مشاركة', 'Share')}</button>` : ''}<a class="btn ${canShare ? 'btn-g' : 'btn-p'}" style="flex:1;text-align:center" href="${url}" download="fantasy-pro-gw${gw}.png">${I('i-download')}${tt('حفظ الصورة', 'Save image')}</a></div><p class="mut" style="font-size:11.5px;text-align:center;margin-top:8px">${tt('على الآيفون: «مشاركة» ← واتساب أو إنستغرام أو «حفظ الصورة»', 'On iPhone: Share → WhatsApp / Instagram / Save Image')}</p>`;
    window.__shcGw = gw;
  } catch (e) { const box = document.getElementById('shc'); if (box) box.outerHTML = `<p class="mut">${esc(e.message || 'خطأ')}</p>`; }
}
window.openShareCard = openShareCard;
window.shcShare = async () => {
  if (!lastBlob) return;
  const file = new File([lastBlob], `fantasy-pro-gw${window.__shcGw || ''}.png`, { type: 'image/png' });
  try { await navigator.share({ files: [file], title: 'فانتازي برو' }); } catch (e) { if (e?.name !== 'AbortError') toast(tt('ما گدرنا نشارك — استخدم «حفظ الصورة»', 'Share failed — use Save')); }
};
