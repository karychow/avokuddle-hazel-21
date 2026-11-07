import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { checkSecret, env, isStripPath, send } from './_lib.js';
import { readLetters } from './letters.js';

// GET ?key=HAZELKEY&id=<letter id> -> the letter's photo strip (JPEG).
// The Blob store is private, so photos are only reachable through here.
export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  const q = new URL(req.url, 'http://x').searchParams;
  if (!(await checkSecret(req, res, { given: q.get('key') || '', secret: env.hazelKey(), bucket: 'key' }))) return;

  try {
    const letter = (await readLetters()).find((l) => l.id === q.get('id'));
    if (!letter || !isStripPath(letter.strip)) return send(res, 404, { error: 'not found' });
    const blob = await get(letter.strip, { access: 'private' });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return send(res, 404, { error: 'not found' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    Readable.fromWeb(blob.stream).pipe(res);
  } catch (err) {
    console.error('reading strip failed', err);
    send(res, 502, { error: 'could not load photo' });
  }
}
