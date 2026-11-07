import { uploadPresigned } from '@vercel/blob/client';
import { h, letterStage } from './letter-view.js';

const CFG = window.SITE_CONFIG || {};
const L = CFG.labels || {};
const $ = (id) => document.getElementById(id);

const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

const el = {
  friendsBtn: $('friendsBtn'),
  dialog: $('codeDialog'),
  form: $('codeForm'),
  input: $('codeInput'),
  msg: $('codeMsg'),
  submit: $('codeSubmit'),
  close: $('codeClose'),
  write: $('writeLetter'),
  composer: $('composer'),
  name: $('name'),
};

let friendCode = session.get('avk-friend') || '';
let stripReady = false;
let sentCanvas = null;
const draft = { message: '', name: '', song: '' };

function render() {
  const isFriend = !!friendCode;
  el.friendsBtn.textContent = isFriend ? L.friendsVerified : L.friendsButton;
  el.friendsBtn.classList.toggle('is-friend', isFriend);
  const canvas = window.booth && window.booth.strip();
  el.write.hidden = !(isFriend && stripReady && canvas && canvas !== sentCanvas);
}

/* ---------- friends code ---------- */

function openDialog() {
  el.msg.textContent = '';
  el.input.value = '';
  if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
  else el.dialog.setAttribute('open', '');
  setTimeout(() => el.input.focus(), 30);
}

function closeDialog() {
  if (typeof el.dialog.close === 'function') el.dialog.close();
  else el.dialog.removeAttribute('open');
}

function sayCode(text) {
  el.msg.textContent = text;
  el.msg.classList.remove('shake');
  void el.msg.offsetWidth;
  el.msg.classList.add('shake');
}

el.friendsBtn.addEventListener('click', openDialog);
el.close.addEventListener('click', closeDialog);
el.dialog.addEventListener('click', (e) => { if (e.target === el.dialog) closeDialog(); });

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = el.input.value.trim();
  if (!code) return;
  el.submit.disabled = true;
  el.submit.textContent = L.codeChecking;
  try {
    const res = await fetch('/api/verify-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      friendCode = code;
      session.set('avk-friend', code);
      closeDialog();
      render();
    } else if (res.status === 401) {
      sayCode(L.codeWrong);
      el.input.select();
    } else if (res.status === 429) {
      sayCode(L.codeLimited);
    } else {
      sayCode(L.codeOffline);
    }
  } catch {
    sayCode(L.codeOffline);
  } finally {
    el.submit.disabled = false;
    el.submit.textContent = L.codeSubmit;
  }
});

/* ---------- strip state from app.js ---------- */

document.addEventListener('booth:strip-ready', () => { stripReady = true; render(); });
document.addEventListener('booth:strip-reset', () => { stripReady = false; render(); });

/* ---------- composer ---------- */

function exportJpeg(canvas) {
  const maxW = 1200;
  let src = canvas;
  if (canvas.width > maxW) {
    src = document.createElement('canvas');
    src.width = maxW;
    src.height = Math.round(canvas.height * (maxW / canvas.width));
    src.getContext('2d').drawImage(canvas, 0, 0, src.width, src.height);
  }
  return new Promise((resolve, reject) => {
    src.toBlob((b) => (b ? resolve(b) : reject(new Error('could not export strip'))), 'image/jpeg', 0.85);
  });
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));

let open = null;

async function openComposer() {
  const canvas = window.booth && window.booth.strip();
  if (!canvas || !friendCode || open) return;

  let blob;
  try { blob = await exportJpeg(canvas); } catch { return; }
  const previewUrl = URL.createObjectURL(blob);
  let uploadedUrl = '';

  if (window.music) window.music.pauseAll();
  const box = el.composer;
  box.textContent = '';
  const inner = h('div', 'composer-inner');
  const top = h('div', 'overlay-top');
  top.appendChild(h('p', 'overlay-title ink', { text: L.writeLetter }));
  const closeBtn = h('button', 'overlay-close', { type: 'button', 'aria-label': L.close });
  closeBtn.textContent = '×';
  top.appendChild(closeBtn);
  inner.appendChild(top);

  const stage = letterStage({
    mode: 'compose',
    message: draft.message,
    name: draft.name || (el.name.value || '').trim(),
    stripSrc: previewUrl,
    labels: L,
  });
  inner.appendChild(stage.el);

  const fields = h('div', 'composer-fields');
  const song = h('input', 'song-field', {
    type: 'url',
    inputmode: 'url',
    spellcheck: 'false',
    autocomplete: 'off',
    placeholder: L.songPlaceholder,
    'aria-label': 'spotify link',
  });
  const msg = h('p', 'composer-msg ink', { 'aria-live': 'polite' });
  const sendBtn = h('button', 'chip solid composer-send ink', { type: 'button', text: L.send });
  fields.append(song, msg, sendBtn);
  inner.appendChild(fields);
  box.appendChild(inner);

  // Reuse the record: start with whatever is on the booth's vinyl.
  const current = draft.song || (window.music && window.music.current() ? window.music.openUrl(window.music.current()) : '');
  song.value = current;
  let songTimer;
  const syncSong = () => {
    const text = song.value.trim();
    draft.song = text;
    if (!text) { msg.textContent = ''; if (stage.vinyl) stage.vinyl.clear(); return null; }
    const uri = window.music && window.music.parse(text);
    if (!uri) { msg.textContent = L.songInvalid; return undefined; }
    msg.textContent = '';
    if (stage.vinyl) stage.vinyl.load(uri, { play: false });
    return uri;
  };
  song.addEventListener('input', () => { clearTimeout(songTimer); songTimer = setTimeout(syncSong, 400); });
  if (current) syncSong();

  stage.textarea.addEventListener('input', () => { draft.message = stage.textarea.value; });
  stage.nameInput.addEventListener('input', () => { draft.name = stage.nameInput.value; });

  const close = () => {
    clearTimeout(songTimer);
    stage.destroy();
    URL.revokeObjectURL(previewUrl);
    box.hidden = true;
    box.textContent = '';
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    open = null;
    render();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !sending) close(); };
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', () => { if (!sending) close(); });

  let sending = false;
  const setBusy = (busy) => {
    sending = busy;
    sendBtn.disabled = busy;
    sendBtn.textContent = busy ? L.sending : L.send;
    stage.textarea.readOnly = busy;
    stage.nameInput.readOnly = busy;
    song.readOnly = busy;
  };

  sendBtn.addEventListener('click', async () => {
    if (sending) return;
    const message = stage.textarea.value.trim();
    const name = stage.nameInput.value.replace(/\s+/g, ' ').trim();
    if (!message) { msg.textContent = L.needMessage; stage.textarea.focus(); return; }
    if (!name) { msg.textContent = L.needName; stage.nameInput.focus(); return; }
    const uri = syncSong();
    if (uri === undefined) return;
    const songUrl = uri ? window.music.openUrl(uri) : '';

    msg.textContent = '';
    setBusy(true);
    try {
      if (!uploadedUrl) {
        const result = await uploadPresigned(`strips/${uuid()}.jpg`, blob, {
          access: 'private',
          handleUploadUrl: '/api/upload',
          headers: { 'x-friends-code': friendCode },
          contentType: 'image/jpeg',
        });
        uploadedUrl = result.url;
      }
      const res = await fetch('/api/letter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: friendCode, name: name.slice(0, 40), message: message.slice(0, 2000), songUrl, stripUrl: uploadedUrl }),
      });
      if (res.status === 401) {
        friendCode = '';
        session.del('avk-friend');
        setBusy(false);
        close();
        openDialog();
        return;
      }
      if (!res.ok) throw new Error(`letter failed: ${res.status}`);
      sentCanvas = canvas;
      draft.message = '';
      draft.song = '';
      showSent();
    } catch (err) {
      console.error(err);
      msg.textContent = L.sendFailed;
      setBusy(false);
    }
  });

  function showSent() {
    sending = false;
    stage.destroy();
    inner.textContent = '';
    const sent = h('div', 'sent');
    sent.appendChild(h('div', 'sent-seal', { text: '♡', 'aria-hidden': 'true' }));
    sent.appendChild(h('p', 'sent-title ink', { text: L.sent }));
    sent.appendChild(h('p', 'sent-note ink', { text: L.sentNote }));
    const done = h('button', 'chip ink', { type: 'button', text: L.close });
    done.addEventListener('click', close);
    sent.appendChild(done);
    inner.appendChild(sent);
    done.focus();
  }

  box.hidden = false;
  box.scrollTop = 0;
  document.body.classList.add('modal-open');
  open = { close };
  if (!draft.message) setTimeout(() => stage.textarea.focus({ preventScroll: true }), 350);
}

el.write.addEventListener('click', openComposer);

render();
