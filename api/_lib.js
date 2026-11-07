// Shared helpers for the /api functions. Files starting with "_" are not routes.
import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

// Vercel env var names (set in the Vercel dashboard, never in client code).
export const env = {
  friendsCode: () => process.env.FRIENDSCODE || '',
  hazelKey: () => process.env.HAZELKEY || '',
  gmailUser: () => process.env.GMAILUSER || '',
  gmailPass: () => (process.env.GMAILAPPPASSWORD || '').replace(/\s+/g, ''),
  recipient: () => process.env.RECIPIENTEMAIL || '',
  siteUrl: () => (process.env.SITEURL || '').replace(/\/+$/, ''),
  blobStoreId: () => process.env.BLOB_STORE_ID || '',
};

// Local testing writes to separate keys/folders and never emails anyone.
export const LOCAL = process.env.LOCAL_DEV === '1';
export const key = (k) => (LOCAL ? `dev:${k}` : k);
// Photos always live in strips/. Test letters are kept apart by the Redis key,
// so a test photo can never show up in the real mailbox.
export const blobFolder = 'strips/';
export const LETTERS = key('letters');

let client;
export function redis() {
  if (!client) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error('Redis is not connected (missing KV_REST_API_URL / KV_REST_API_TOKEN)');
    client = new Redis({ url, token });
  }
  return client;
}

export function safeEqual(given, secret) {
  if (typeof given !== 'string' || !given || !secret) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '') || req.socket?.remoteAddress || 'unknown';
}

const LIMIT = 10;
const WINDOW = 600; // seconds

const rlKey = (req, bucket) => key(`rl:${bucket}:${clientIp(req)}`);

// Rate limiting fails open: if Redis is down, the secret is still checked.
export async function isLimited(req, bucket) {
  try {
    const n = Number(await redis().get(rlKey(req, bucket))) || 0;
    return n >= LIMIT;
  } catch (err) {
    console.error('rate limit read failed', err);
    return false;
  }
}

export async function hit(req, bucket) {
  try {
    const k = rlKey(req, bucket);
    const n = await redis().incr(k);
    if (n === 1) await redis().expire(k, WINDOW);
    return n;
  } catch (err) {
    console.error('rate limit write failed', err);
    return 0;
  }
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Checks a secret with rate limiting. Only failed attempts count, so friends
// who already have the right code are never locked out.
export async function checkSecret(req, res, { given, secret, bucket }) {
  if (!secret) {
    console.error(`secret for "${bucket}" is not configured`);
    send(res, 500, { error: 'not configured' });
    return false;
  }
  if (await isLimited(req, bucket)) {
    send(res, 429, { error: 'too many attempts' });
    return false;
  }
  if (!safeEqual(given, secret)) {
    await hit(req, bucket);
    send(res, 401, { error: 'wrong code' });
    return false;
  }
  return true;
}

export function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  return {};
}

// "https://<store>.private.blob.vercel-storage.com/strips/x.jpg" -> "strips/x.jpg"
export function stripPathFromUrl(url) {
  if (!url) return '';
  const id = env.blobStoreId().replace(/^store_/, '').toLowerCase();
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !id || u.hostname !== `${id}.private.blob.vercel-storage.com`) return null;
  const path = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  return isStripPath(path) ? path : null;
}

export function isStripPath(path) {
  return typeof path === 'string' && path.startsWith(blobFolder) && /^[\w/-]+\.jpg$/.test(path) && !path.includes('..');
}
