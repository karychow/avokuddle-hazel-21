import { checkSecret, env, readBody, send } from './_lib.js';

// POST { code } -> 200 { ok: true } | 401 | 429
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  const { code } = readBody(req);
  const ok = await checkSecret(req, res, { given: code, secret: env.friendsCode(), bucket: 'code' });
  if (ok) send(res, 200, { ok: true });
}
