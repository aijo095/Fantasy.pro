/* بصمة المحتوى (ETag): إذا التطبيق عنده نفس النسخة، نرجّع 304 بدون أي بيانات */
import crypto from 'node:crypto';
export function endJSON(res, data, code = res.statusCode || 200) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  if (code === 200) {
    const tag = '"' + crypto.createHash('md5').update(body).digest('base64url').slice(0, 16) + '"';
    res.setHeader('ETag', tag);
    const inm = (res.req?.headers?.['if-none-match'] || '').split(',').map((x) => x.trim().replace(/^W\//, ''));
    if (inm.includes(tag)) { res.statusCode = 304; res.setHeader("Cache-Control", "private, no-store"); return res.end(); } // الـ 304 ما ينحفظ بالـ CDN
  }
  res.end(body);
}
