import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import config from '../config.js';
import { LETTERS, LOCAL, checkSecret, env, readBody, redis, send, stripPathFromUrl } from './_lib.js';

const SPOTIFY = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/[A-Za-z0-9]{10,40}(?:\?[\w=&.-]*)?$/;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (tpl, name) => tpl.replace('{name}', name);

// POST { code, name, message, songUrl, stripUrl } -> 200 { ok, id, emailed }
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  const body = readBody(req);
  if (!(await checkSecret(req, res, { given: body.code, secret: env.friendsCode(), bucket: 'code' }))) return;

  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim();
  const message = String(body.message ?? '').replace(/\r\n/g, '\n').trim();
  const songUrl = String(body.songUrl ?? '').trim();
  const stripUrl = String(body.stripUrl ?? '').trim();

  if (!name || name.length > 40) return send(res, 400, { error: 'name must be 1-40 characters' });
  if (!message || message.length > 2000) return send(res, 400, { error: 'message must be 1-2000 characters' });
  if (songUrl && !SPOTIFY.test(songUrl)) return send(res, 400, { error: 'song must be an open.spotify.com link' });
  const strip = stripPathFromUrl(stripUrl);
  if (strip === null) return send(res, 400, { error: 'bad strip url' });

  const letter = {
    id: crypto.randomUUID(),
    name,
    message,
    songUrl: songUrl.split('?')[0],
    strip,
    createdAt: new Date().toISOString(),
  };

  try {
    await redis().lpush(LETTERS, JSON.stringify(letter));
  } catch (err) {
    console.error('saving letter failed', err);
    return send(res, 503, { error: 'could not save' });
  }

  let emailed = false;
  try {
    emailed = await notify(letter);
  } catch (err) {
    console.error('notification email failed (letter was saved)', err);
  }
  send(res, 200, { ok: true, id: letter.id, emailed });
}

async function notify(letter) {
  if (LOCAL && process.env.SEND_EMAIL_IN_DEV !== '1') {
    console.log(`[local] would email "${fill(config.email.subject, letter.name)}" to RECIPIENTEMAIL`);
    return false;
  }
  const user = env.gmailUser();
  const pass = env.gmailPass();
  const to = env.recipient();
  const site = env.siteUrl();
  const key = env.hazelKey();
  if (!user || !pass || !to || !site || !key) {
    console.error('email not configured (GMAILUSER, GMAILAPPPASSWORD, RECIPIENTEMAIL, SITEURL, HAZELKEY)');
    return false;
  }

  const link = `${site}/letters.html?key=${encodeURIComponent(key)}`;
  const c = config.colors;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${c.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:${c.panel};border:1px solid rgba(243,234,216,.25);border-radius:18px;">
<tr><td align="center" style="padding:36px 28px 34px;font-family:Georgia,'Times New Roman',serif;color:${c.ivory};">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.18em;text-transform:lowercase;opacity:.7;">${esc(config.occasion)}</p>
<p style="margin:0 0 14px;font-size:26px;font-style:italic;">${esc(config.email.heading)}</p>
<p style="margin:0 0 28px;font-size:16px;line-height:1.5;opacity:.85;">${esc(fill(config.email.line, letter.name))}</p>
<a href="${esc(link)}" style="display:inline-block;background:${c.wine};color:${c.ivory};text-decoration:none;font-size:16px;font-style:italic;padding:12px 28px;border-radius:999px;">${esc(config.email.button)}</a>
</td></tr></table>
</td></tr></table></body></html>`;

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  const info = await transport.sendMail({
    from: { name: config.siteName, address: user },
    to,
    subject: fill(config.email.subject, letter.name),
    text: `${fill(config.email.line, letter.name)}\n\n${config.email.button}: ${link}`,
    html,
  });
  console.log('notification email sent', info.response || '', `accepted=${(info.accepted || []).length}`);
  return true;
}
