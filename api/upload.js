import { handleUploadPresigned } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { blobFolder, checkSecret, env, readBody, send } from './_lib.js';

const MAX_BYTES = 8 * 1024 * 1024;
const NAME = /^[a-z0-9-]{8,64}\.jpg$/;

// Hands the browser a short-lived presigned URL so the strip goes straight to
// Vercel Blob (private store) without passing through this function.
// The friends code travels in the x-friends-code header.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  const body = readBody(req);
  if (body.type !== 'blob.generate-presigned-url') return send(res, 400, { error: 'unsupported event' });

  const code = req.headers['x-friends-code'];
  if (!(await checkSecret(req, res, { given: typeof code === 'string' ? code : '', secret: env.friendsCode(), bucket: 'code' }))) return;

  // The browser builds the upload URL from its own pathname, so it must already
  // be the final one: strips/<random id>.jpg. It is checked, never rewritten.
  const pathname = String(body.payload?.pathname || '');
  if (!pathname.startsWith(blobFolder) || !NAME.test(pathname.slice(blobFolder.length))) {
    return send(res, 400, { error: 'bad file name' });
  }

  try {
    const result = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname) => ({
        token: await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: ['image/jpeg'],
          maximumSizeInBytes: MAX_BYTES,
          validUntil: Date.now() + 10 * 60 * 1000,
        }),
        urlOptions: {
          allowedContentTypes: ['image/jpeg'],
          maximumSizeInBytes: MAX_BYTES,
        },
      }),
    });
    send(res, 200, result);
  } catch (err) {
    console.error('upload token failed', err);
    send(res, 500, { error: 'upload unavailable' });
  }
}
