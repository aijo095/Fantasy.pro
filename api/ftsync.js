/* =========================================================
   /api/ftsync — مزامنة الانتقالات المجانية من موقع الفانتازي الرسمي
   الاختصار (bookmarklet) يشتغل داخل fantasy.premierleague.com وأنت مسجّل دخول،
   يقرا my-team هناك، ويبعث هنا الأرقام فقط (بدون أي توكن أو كلمة سر).
   كتابة:  GET /api/ftsync?team=ID&ft=N&limit=&made=&bank=&status=&chips=   ← يحفظ ويعرض صفحة تأكيد
   قراءة:  GET /api/ftsync?team=ID&read=1                                  ← JSON
========================================================= */
import { getJ, setJ, kvEnabled, send } from './_kv.js';

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const page = (title, body, ok = true) => `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0F17;color:#E8EDF5;font-family:-apple-system,'IBM Plex Sans Arabic',sans-serif}
.c{max-width:340px;margin:20px;padding:24px;border-radius:20px;background:#121826;border:1px solid #1F2937;text-align:center}
.i{width:56px;height:56px;border-radius:50%;margin:0 auto 12px;display:grid;place-items:center;font-size:28px;background:${ok ? 'rgba(52,211,153,.15);color:#34D399' : 'rgba(248,113,113,.15);color:#F87171'}}
h1{font-size:19px;margin:0 0 8px}p{color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 14px}b{color:#E8EDF5}
a{display:block;padding:12px;border-radius:12px;background:#34D399;color:#06281c;font-weight:700;text-decoration:none}</style></head>
<body><div class="c"><div class="i">${ok ? '✓' : '!'}</div><h1>${title}</h1>${body}<a href="/">افتح فانتازي برو</a></div></body></html>`;

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x'), q = u.searchParams;
  const team = num(q.get('team'), 1, 99999999);
  if (!team) return send(res, 400, { error: 'team' });
  if (!kvEnabled) return send(res, 503, { error: 'storage not configured' });
  const key = `ftsync:${team}`;

  if (q.get('read')) {
    const d = await getJ(key).catch(() => null);
    return send(res, 200, d || {});
  }

  const ft = num(q.get('ft'), 0, 99);
  if (ft == null) { res.statusCode = 400; res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page('ما وصلت البيانات', '<p>جرّب الاختصار مرة ثانية من موقع الفانتازي.</p>', false)); }
  const d = {
    ft, limit: num(q.get('limit'), 0, 99), made: num(q.get('made'), 0, 99), bank: num(q.get('bank'), 0, 2000),
    status: String(q.get('status') || '').slice(0, 20), chips: String(q.get('chips') || '').slice(0, 60), at: Date.now(),
  };
  await setJ(key, d, 21 * 86400);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const ftTxt = ft >= 99 ? 'غير محدودة (ورقة مفعّلة)' : `<b>${ft}</b> انتقال مجاني`;
  res.end(page('تم تحديث الانتقالات', `<p>حسب الفانتازي الرسمي عندك ${ftTxt}${d.bank != null ? ` · بالبنك <b>${(d.bank / 10).toFixed(1)}</b>` : ''}.<br>التطبيق راح ياخذها أول ما تفتحه.</p>`));
}
