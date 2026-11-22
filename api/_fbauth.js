/* التحقق من توكن Firebase (ID token) بدون مكتبات: توقيع RS256 بمفاتيح كوكل العامة */
import crypto from 'node:crypto';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'fantasy-pro-b77e0';
const CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cache = { at: 0, ttl: 0, keys: null };

async function keys() {
  if (cache.keys && Date.now() - cache.at < cache.ttl) return cache.keys;
  const r = await fetch(CERTS);
  if (!r.ok) throw new Error('certs ' + r.status);
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  cache = { at: Date.now(), ttl: (m ? +m[1] : 3600) * 1000, keys: await r.json() };
  return cache.keys;
}

/** يرجع 'fb_<uid>' إذا التوكن صحيح، وإلا null */
export async function verifyFirebase(tok) {
  try {
    const [h, p, sig] = String(tok || '').split('.');
    if (!h || !p || !sig) return null;
    const H = JSON.parse(Buffer.from(h, 'base64url').toString());
    const P = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (H.alg !== 'RS256' || !H.kid) return null;
    const now = Math.floor(Date.now() / 1000);
    if (P.aud !== PROJECT || P.iss !== 'https://securetoken.google.com/' + PROJECT) return null;
    if (!(P.exp > now) || !(P.iat <= now + 300) || !P.sub) return null;
    const pem = (await keys())[H.kid];
    if (!pem) return null;
    const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p).verify(pem, Buffer.from(sig, 'base64url'));
    return ok ? 'fb_' + P.sub : null;
  } catch { return null; }
}
