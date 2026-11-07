# avokuddle studio

A birthday photobooth: take a 4-pose photo strip alone or with a friend (live, over WebRTC), play a song on the vinyl, and, if you're a friend with the code, write the birthday person a letter that lands in their private mailbox.

- `index.html`: the booth. Friends tap **friend's exclusive**, enter the code, take a strip, then **write … a letter ♡**.
- `letters.html?key=…`: the birthday person's mailbox. It checks for new letters every 15 seconds.

## How it fits together

| Part | Where |
|---|---|
| Personal text (names, titles, labels, email wording) | `config.js` |
| Booth scripts (camera, strip, lilies, vinyl) | `public/js/*.js`, `public/styles.css`, `public/assets/` |
| Letter composer and mailbox | `src/friends.js`, `src/letters.js`, `src/letter-view.js`, `src/letter.css` |
| Serverless API (Node) | `api/verify-code.js`, `api/upload.js`, `api/letter.js`, `api/letters.js`, `api/strip.js` |
| Build | Vite (`vite.config.js`). Both HTML pages are build inputs, and `{{…}}` placeholders in them are filled from `config.js`. |

Storage:
- **Upstash Redis** holds the letters (the `letters` list) and rate-limit counters.
- **Vercel Blob (private store)** holds the photo strips. The browser uploads straight to Blob with a short-lived presigned URL, so strips never hit the 4.5 MB function limit. Photos are only readable through `/api/strip`, which needs the mailbox key.

### Environment variables (Vercel → Settings → Environment Variables)

| Name | What |
|---|---|
| `FRIENDSCODE` | the code friends type to unlock letters |
| `HAZELKEY` | the mailbox key (a long random string) |
| `SITEURL` | e.g. `https://your-site.vercel.app` (used for the email link) |
| `GMAILUSER` | Gmail address that sends the "new letter" email |
| `GMAILAPPPASSWORD` | a Gmail [app password](https://myaccount.google.com/apppasswords) for that address |
| `RECIPIENTEMAIL` | who receives the "new letter" email |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | created automatically when Upstash Redis is connected |
| `BLOB_STORE_ID` (+ OIDC) | created automatically when the Blob store is connected |

Secrets only ever live in these env vars, never in `config.js` or client code. The mailbox link is `SITEURL/letters.html?key=HAZELKEY`.

### Behaviour worth knowing

- Wrong codes and keys are rate limited to 10 per IP per 10 minutes. Only wrong attempts count, so a room full of friends on the same party Wi-Fi isn't locked out. If Redis is down, codes are still checked; only the rate limit is skipped.
- If the email fails, the letter is still saved and the error is logged (Vercel → Logs).
- Friends can never read letters. Only `/api/letters` and `/api/strip` with the right key can.

## Running locally

```bash
npm install
npx vercel link
npx vercel env pull .env.local --environment=production
ln -s .env.local .env   # this Vercel CLI version only reads .env for `vercel dev`
npx vercel dev
```

Then open http://localhost:3000. Use `vercel dev`, not `vite`, so the `/api` routes run.

- Secret-type variables don't download. Put local values into `.env.local` yourself.
- `LOCAL_DEV="1"` in `.env.local` makes local tests safe: letters go to the separate `dev:letters` list, and no email is sent (set `SEND_EMAIL_IN_DEV="1"` to send one).
- The Blob store and Redis must also be connected to the **Development** environment for local uploads to work.
- Re-running `vercel env pull` overwrites `.env.local`, so re-add your local values afterwards.

## Reusing for someone new

1. **Duplicate the repo.** On GitHub, use "Use this template" or create a new repo and push a copy of this code to it.
2. **Create a new Vercel project.** In Vercel, choose Add New → Project and import the new repo. The framework is detected as Vite from `vercel.json`.
3. **Connect new storage.** In the new project's **Storage** tab:
   - create a **Blob** store (private), and
   - create an **Upstash for Redis** database.
   Connect both to Production, Preview and Development. Don't reuse the old ones, or the letters would mix.
4. **Set the env vars** from the table above (`FRIENDSCODE`, `HAZELKEY`, `SITEURL`, `GMAILUSER`, `GMAILAPPPASSWORD`, `RECIPIENTEMAIL`). Pick a new code and a new long random key.
5. **Edit `config.js`.** Set `recipientName`, `occasion`, the titles, button labels and email wording. Swap images in `public/assets/` if you like.
6. **Deploy.** Push to `main` (Vercel deploys it), or run `npx vercel deploy --prod`. Then send friends the site link, and send the birthday person their mailbox link: `SITEURL/letters.html?key=HAZELKEY`.
