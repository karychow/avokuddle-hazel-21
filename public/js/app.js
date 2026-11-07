(function () {
  const $ = (id) => document.getElementById(id);
  const el = {
    modes: document.querySelector('.modes'),
    modeBtns: document.querySelectorAll('.mode'),
    name: $('name'),
    invite: $('invite'),
    booth: $('booth'),
    frame: $('frame'),
    videoMe: $('videoMe'),
    videoThem: $('videoThem'),
    tagMe: $('tagMe'),
    tagThem: $('tagThem'),
    waiting: $('waiting'),
    cameraOn: $('cameraOn'),
    count: $('count'),
    flashFx: $('flashFx'),
    slots: [...document.querySelectorAll('#slots li')],
    start: $('start'),
    retake: $('retake'),
    stopCam: $('stopCam'),
    flash: $('flash'),
    tone: $('toneBtn'),
    status: $('status'),
    result: $('result'),
    strip: $('strip'),
    save: $('save'),
    again: $('again'),
  };

  const CFG = window.SITE_CONFIG || {};
  const SHOTS = 4;
  const joinId = new URLSearchParams(location.search).get('join');

  const state = {
    mode: 'solo',
    role: joinId ? 'guest' : 'host',
    stream: null,
    flash: true,
    bw: false,
    shooting: false,
    shootId: null,
    mine: [],
    theirs: [],
    fallback: [],
    peer: null,
    conn: null,
    call: null,
    remoteLive: false,
    themName: '',
    stripBlob: null,
    stripCanvas: null,
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    sdel(k) { try { sessionStorage.removeItem(k); } catch {} },
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const myName = () => el.name.value.trim();
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  function say(text) { el.status.textContent = text || ''; }

  /* ---------- black & white vintage ---------- */

  function setTone(bw, broadcast) {
    state.bw = !!bw;
    el.tone.classList.toggle('is-on', state.bw);
    el.tone.setAttribute('aria-pressed', String(state.bw));
    el.frame.classList.toggle('bw', state.bw);
    store.set('avk-bw', state.bw ? '1' : '0');
    if (broadcast) send({ t: 'tone', bw: state.bw });
  }

  function send(msg) {
    if (state.conn && state.conn.open) state.conn.send(msg);
  }
  window.booth = { send, strip: () => state.stripCanvas };

  /* ---------- mode ---------- */

  function setMode(mode) {
    if (state.shooting) resetShoot(true);
    state.mode = mode;
    el.modeBtns.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    el.frame.classList.toggle('solo', mode === 'solo');
    el.frame.classList.toggle('together', mode === 'together');
    el.invite.hidden = !(mode === 'together' && state.role === 'host');
    if (mode === 'together') {
      if (state.role === 'host') hostPeer(); else guestPeer();
    } else {
      teardownPeer();
      say('');
    }
    resetShoot(false);
    refresh();
  }

  el.modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (state.role === 'guest' || b.dataset.mode === state.mode) return;
    setMode(b.dataset.mode);
  }));

  /* ---------- names ---------- */

  el.name.value = store.get('avk-name') || '';
  let nameTimer;
  el.name.addEventListener('input', () => {
    store.set('avk-name', myName());
    el.tagMe.textContent = myName() || 'you';
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => send({ t: 'name', name: myName() }), 300);
  });
  el.tagMe.textContent = myName() || 'you';

  function setThemName(n) {
    state.themName = (n || '').slice(0, 20);
    el.tagThem.textContent = state.themName || 'your person';
    el.waiting.textContent = state.conn && state.conn.open && !state.remoteLive
      ? `${state.themName || 'your person'} is here`
      : 'waiting for your person';
  }

  /* ---------- camera ---------- */

  async function startCamera() {
    if (state.stream) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      say('the camera needs this page opened over https');
      return;
    }
    el.cameraOn.disabled = true;
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
    } catch (err) {
      el.cameraOn.disabled = false;
      say(err && err.name === 'NotAllowedError'
        ? 'camera blocked: allow it in your browser’s site settings, then try again'
        : 'no camera found');
      return;
    }
    el.cameraOn.disabled = false;
    el.videoMe.srcObject = state.stream;
    await el.videoMe.play().catch(() => {});
    el.videoMe.classList.add('live');
    el.cameraOn.hidden = true;
    el.stopCam.hidden = false;
    say('');
    if (state.role === 'guest') callHost();
    else send({ t: 'recall' });
    refresh();
  }

  function stopCamera() {
    if (state.shooting) resetShoot(true);
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    el.videoMe.srcObject = null;
    el.videoMe.classList.remove('live');
    el.cameraOn.hidden = false;
    el.stopCam.hidden = true;
    if (state.call) { state.call.close(); state.call = null; }
    refresh();
  }

  el.cameraOn.addEventListener('click', startCamera);
  el.stopCam.addEventListener('click', stopCamera);

  /* ---------- peers ---------- */

  function hostPeer() {
    if (state.peer || typeof Peer === 'undefined') {
      if (typeof Peer === 'undefined') say('invites aren’t available right now, check your connection');
      return;
    }
    el.invite.disabled = true;
    el.invite.textContent = 'making link…';
    const id = store.sget('avk-host') || `avokuddle-${rand(10)}`;
    const peer = new Peer(id, { debug: 0 });
    state.peer = peer;

    peer.on('open', (pid) => {
      store.sset('avk-host', pid);
      el.invite.disabled = false;
      el.invite.textContent = 'copy invite';
    });
    peer.on('connection', (conn) => {
      if (state.conn && state.conn.open) {
        conn.on('open', () => { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 500); });
        return;
      }
      bindConn(conn);
    });
    peer.on('call', answerCall);
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        store.sdel('avk-host');
        teardownPeer();
        hostPeer();
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        el.invite.textContent = 'copy invite';
        say('couldn’t reach the invite server, try again in a moment');
      }
    });
  }

  function guestPeer() {
    if (state.peer) return;
    if (typeof Peer === 'undefined') { say('couldn’t connect, check your connection and reopen the invite'); return; }
    const peer = new Peer({ debug: 0 });
    state.peer = peer;
    say('joining…');
    peer.on('open', () => {
      bindConn(peer.connect(joinId, { reliable: true }));
    });
    peer.on('call', answerCall);
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') say('this invite has ended. ask for a new link');
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) say('connection lost, reopen the invite');
    });
  }

  function teardownPeer() {
    if (state.call) state.call.close();
    if (state.conn) state.conn.close();
    if (state.peer) state.peer.destroy();
    state.peer = state.conn = state.call = null;
    hideRemote();
    setThemName('');
  }

  function bindConn(conn) {
    state.conn = conn;
    let lastSeen = Date.now();
    let beat = null;
    conn.on('open', () => {
      conn.send({ t: 'hello', name: myName() });
      if (state.role === 'host') conn.send({ t: 'tone', bw: state.bw });
      const song = window.music && window.music.current();
      if (song) conn.send({ t: 'song', uri: song });
      say('');
      setThemName(state.themName);
      if (state.role === 'guest') callHost();
      refresh();
      lastSeen = Date.now();
      beat = setInterval(() => {
        if (Date.now() - lastSeen > 15000) { dropped(); return; }
        if (conn.open) conn.send({ t: 'ping' });
      }, 3000);
    });
    conn.on('data', (msg) => { lastSeen = Date.now(); onData(msg); });
    conn.on('close', dropped);
    conn.on('error', dropped);

    function dropped() {
      clearInterval(beat);
      if (state.conn !== conn) return;
      state.conn = null;
      try { conn.close(); } catch {}
      if (state.call) { state.call.close(); state.call = null; }
      hideRemote();
      if (state.shooting) resetShoot(false);
      setThemName('');
      say(state.role === 'guest' ? 'the booth closed. reopen the invite to join again' : 'your person left');
      refresh();
    }
  }

  function answerCall(call) {
    if (state.call) state.call.close();
    state.call = call;
    call.answer(state.stream || undefined);
    bindCall(call);
  }

  function callHost() {
    if (!state.peer || !state.conn || !state.conn.open || !state.stream) return;
    if (state.call) state.call.close();
    const call = state.peer.call(state.conn.peer, state.stream);
    state.call = call;
    bindCall(call);
  }

  function bindCall(call) {
    call.on('stream', (s) => {
      if (state.call !== call) return;
      el.videoThem.srcObject = s;
      el.videoThem.muted = true;
      el.videoThem.play().catch(() => {});
      state.remoteLive = true;
      el.videoThem.classList.add('live');
      el.waiting.hidden = true;
      refresh();
    });
    call.on('close', () => {
      if (state.call !== call) return;
      state.call = null;
      hideRemote();
      refresh();
    });
  }

  function hideRemote() {
    state.remoteLive = false;
    el.videoThem.srcObject = null;
    el.videoThem.classList.remove('live');
    el.waiting.hidden = false;
    setThemName(state.themName);
  }

  function onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hello':
      case 'name':
        setThemName(String(msg.name || ''));
        break;
      case 'recall':
        if (state.role === 'guest') callHost();
        break;
      case 'start':
        if (typeof msg.bw === 'boolean') setTone(msg.bw, false);
        if (!state.shooting && state.stream) runShoot(String(msg.id), false);
        break;
      case 'shot':
        if (msg.id === state.shootId && Number.isInteger(msg.i) && msg.i >= 0 && msg.i < SHOTS && typeof msg.img === 'string' && msg.img.startsWith('data:image/jpeg')) {
          const img = new Image();
          img.onload = () => { state.theirs[msg.i] = img; };
          img.src = msg.img;
        }
        break;
      case 'retake':
        resetShoot(false);
        break;
      case 'tone':
        if (!state.shooting) setTone(!!msg.bw, false);
        break;
      case 'busy':
        say('this booth already has two people');
        break;
      case 'song':
        if (window.music) window.music.receive(String(msg.uri || ''));
        break;
    }
  }

  el.invite.addEventListener('click', async () => {
    if (!state.peer || !state.peer.id) return;
    const link = `${location.origin}${location.pathname}?join=${encodeURIComponent(state.peer.id)}`;
    if (coarse && navigator.share) {
      try { await navigator.share({ url: link, title: CFG.occasion || document.title }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(link);
      el.invite.textContent = 'copied';
      setTimeout(() => { el.invite.textContent = 'copy invite'; }, 1800);
    } catch {
      say(link);
    }
  });

  /* ---------- shooting ---------- */

  function ready() {
    if (!state.stream || state.shooting) return false;
    if (state.mode === 'solo') return true;
    return !!(state.conn && state.conn.open && state.remoteLive);
  }

  function refresh() {
    el.start.disabled = !ready();
    el.retake.disabled = state.shooting ? false : !state.mine.length;
  }

  function resetShoot(broadcast) {
    state.shooting = false;
    state.shootId = null;
    state.mine = []; state.theirs = []; state.fallback = [];
    el.count.textContent = '';
    el.slots.forEach((s, i) => { s.classList.remove('filled'); s.style.backgroundImage = ''; s.textContent = String(i + 1); });
    const hadStrip = !el.result.hidden;
    el.result.hidden = true;
    el.booth.hidden = false;
    state.stripCanvas = null;
    if (hadStrip) document.dispatchEvent(new CustomEvent('booth:strip-reset'));
    if (broadcast) send({ t: 'retake' });
    refresh();
  }

  function flash() {
    if (!state.flash) return;
    el.flashFx.classList.remove('go');
    void el.flashFx.offsetWidth;
    el.flashFx.classList.add('go');
  }

  async function runShoot(id, initiator) {
    resetShoot(false);
    const together = state.mode === 'together';
    state.shooting = true;
    state.shootId = id;
    refresh();
    if (initiator && together) send({ t: 'start', id, bw: state.bw });
    const alive = () => state.shooting && state.shootId === id;
    const aspect = together ? 3 / 4 : 4 / 3;

    for (let i = 0; i < SHOTS; i++) {
      for (let n = 3; n > 0; n--) {
        if (!alive()) return;
        el.count.textContent = String(n);
        el.count.classList.remove('pop'); void el.count.offsetWidth; el.count.classList.add('pop');
        await wait(1000);
      }
      if (!alive()) return;
      el.count.textContent = '';
      flash();
      const me = Strip.captureFrame(el.videoMe, aspect, true, state.bw);
      state.mine[i] = me;
      if (together) {
        state.fallback[i] = Strip.captureFrame(el.videoThem, aspect, true, state.bw);
        send({ t: 'shot', id, i, img: me.toDataURL('image/jpeg', 0.86) });
      }
      const slot = el.slots[i];
      slot.style.backgroundImage = `url(${me.toDataURL('image/jpeg', 0.6)})`;
      slot.classList.add('filled');
      await wait(i < SHOTS - 1 ? 1100 : 400);
    }

    if (together) {
      for (let t = 0; t < 40 && alive() && state.theirs.filter(Boolean).length < SHOTS; t++) await wait(100);
    }
    if (!alive()) return;
    await finish(together);
  }

  async function finish(together) {
    try { await document.fonts.load("76px 'Great Vibes'"); } catch {}
    const hostLeft = state.role === 'host';
    const rows = state.mine.map((me, i) => {
      if (!together) return [me];
      const them = state.theirs[i] || state.fallback[i];
      return hostLeft ? [me, them] : [them, me];
    });
    const names = together
      ? (hostLeft ? [myName(), state.themName] : [state.themName, myName()])
      : [myName()];
    const canvas = await Strip.compose({ rows, names });
    state.stripBlob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (el.strip.src.startsWith('blob:')) URL.revokeObjectURL(el.strip.src);
    el.strip.src = URL.createObjectURL(state.stripBlob);
    state.stripCanvas = canvas;
    el.booth.hidden = true;
    el.result.hidden = false;
    state.shooting = false;
    refresh();
    document.dispatchEvent(new CustomEvent('booth:strip-ready', { detail: { canvas } }));
  }

  el.start.addEventListener('click', () => {
    if (!ready()) return;
    runShoot(rand(8), true);
  });
  el.retake.addEventListener('click', () => resetShoot(true));
  el.again.addEventListener('click', () => resetShoot(true));
  el.tone.addEventListener('click', () => {
    if (state.shooting) return;
    setTone(!state.bw, true);
  });
  el.flash.addEventListener('click', () => {
    state.flash = !state.flash;
    el.flash.textContent = state.flash ? 'flash on' : 'flash off';
    el.flash.setAttribute('aria-pressed', String(state.flash));
  });

  el.save.addEventListener('click', async () => {
    if (!state.stripBlob) return;
    const file = new File([state.stripBlob], `${CFG.stripFilename || 'photo-strip'}.png`, { type: 'image/png' });
    if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(state.stripBlob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  window.addEventListener('pagehide', () => { if (state.peer) state.peer.destroy(); });

  /* ---------- boot ---------- */

  setTone(store.get('avk-bw') === '1', false);

  if (state.role === 'guest') {
    el.modes.classList.add('locked');
    setMode('together');
  } else {
    setMode('solo');
  }
})();
