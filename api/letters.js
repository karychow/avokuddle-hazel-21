import { LETTERS, checkSecret, env, redis, send } from './_lib.js';

export async function readLetters() {
  const raw = await redis().lrange(LETTERS, 0, -1);
  return raw
    .map((x) => {
      if (x && typeof x === 'object') return x;
      try { return JSON.parse(x); } catch { return null; }
    })
    .filter((l) => l && l.id);
}

// GET ?key=HAZELKEY -> 200 { letters: [...] } newest first | 401
export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  const given = new URL(req.url, 'http://x').searchParams.get('key') || '';
  if (!(await checkSecret(req, res, { given, secret: env.hazelKey(), bucket: 'key' }))) return;
  try {
    const letters = (await readLetters()).map(({ strip, ...l }) => ({ ...l, hasStrip: !!strip }));
    send(res, 200, { letters });
  } catch (err) {
    console.error('reading letters failed', err);
    send(res, 503, { error: 'could not read letters' });
  }
}
