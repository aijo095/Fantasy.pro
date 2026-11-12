/* =========================================================
   /api/pulse — سجل «نبض الجولة» بالسيرفر
   POST {team, rival}  ← يسجّل الفريق ومنافسه حتى السيرفر يراقب أحداثهم حتى لو التطبيق مسكّر
   GET  ?team=&gw=     ← أحداث الجولة المسجّلة
========================================================= */
import { kv, getJ, kvEnabled, send, readBody } from './_kv.js';
const id = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 1e8 ? n : null; };
export default async function handler(req, res) {
  if (!kvEnabled) return send(res, 200, { ok: false, ev: [] });
  if (req.method === 'POST') {
    let b = {}; try { b = (await readBody(req)) || {}; } catch {}
    const team = id(b.team), rival = id(b.rival), rname = String(b.rname || '').slice(0, 60);
    if (!team) return send(res, 400, { error: 'team' });
    await kv('HSET', 'pulse:cfg', String(team), JSON.stringify({ rival, rname, at: Date.now() }));
    return send(res, 200, { ok: true });
  }
  const u = new URL(req.url, 'http://x'), team = id(u.searchParams.get('team')), gw = id(u.searchParams.get('gw'));
  if (!team || !gw) return send(res, 400, { error: 'params' });
  return send(res, 200, { ok: true, ev: (await getJ(`pulse:ev:${team}:${gw}`)) || [] });
}
