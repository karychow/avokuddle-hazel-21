(function () {
  const $ = (id) => document.getElementById(id);
  const el = {
    player: $('player'),
    vinyl: $('vinyl'),
    label: $('label'),
    track: $('track'),
    panel: $('songPanel'),
    form: $('songForm'),
    input: $('songUrl'),
    error: $('songError'),
    embed: $('spotifyEmbed'),
  };

  const URI = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/;
  const state = { uri: null, title: '', controller: null, pendingPlay: false, playing: false };

  const apiReady = new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (IFrameAPI) => resolve(IFrameAPI);
  });

  const store = {
    get() { try { return localStorage.getItem('avk-song'); } catch { return null; } },
    set(v) { try { localStorage.setItem('avk-song', v); } catch {} },
  };

  function parse(text) {
    const s = text.trim();
    if (URI.test(s)) return s;
    try {
      const u = new URL(s);
      if (!/(^|\.)spotify\.com$/.test(u.hostname)) return null;
      const m = u.pathname.match(/\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/);
      return m ? `spotify:${m[1]}:${m[2]}` : null;
    } catch {
      return null;
    }
  }

  const openUrl = (uri) => {
    const [, type, id] = uri.split(':');
    return `https://open.spotify.com/${type}/${id}`;
  };

  function setCaption(text) {
    el.track.textContent = text;
    el.vinyl.setAttribute('aria-label', state.uri ? (state.playing ? 'pause music' : 'play music') : 'add a song');
  }

  function render() {
    el.player.classList.toggle('playing', state.playing);
    setCaption(state.uri ? (state.title || 'tap the record to play') : 'add a song');
  }

  function openPanel(open) {
    el.panel.classList.toggle('closed', !open);
    el.track.setAttribute('aria-expanded', String(open));
    if (open && !state.uri) setTimeout(() => el.input.focus(), 50);
  }

  async function fetchMeta(uri) {
    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(openUrl(uri))}`);
      if (!res.ok) return;
      const meta = await res.json();
      if (state.uri !== uri) return;
      state.title = String(meta.title || '').slice(0, 80);
      if (typeof meta.thumbnail_url === 'string' && meta.thumbnail_url.startsWith('https://')) {
        el.label.style.backgroundImage = `url("${meta.thumbnail_url.replace(/"/g, '')}")`;
        el.label.classList.add('on');
      }
      render();
    } catch {}
  }

  function onUpdate(e) {
    const d = e && e.data;
    if (!d) return;
    state.playing = !d.isPaused;
    render();
  }

  async function load(uri, { play, share }) {
    if (!URI.test(uri)) return;
    if (uri === state.uri && state.controller) {
      if (play) state.controller.play();
      return;
    }
    state.uri = uri;
    state.title = '';
    state.playing = false;
    el.label.classList.remove('on');
    store.set(uri);
    render();
    fetchMeta(uri);
    if (share && window.booth) window.booth.send({ t: 'song', uri });

    const IFrameAPI = await apiReady;
    if (state.uri !== uri) return;
    if (!state.controller) {
      state.pendingPlay = play;
      IFrameAPI.createController(el.embed, { uri, width: '100%', height: 80 }, (controller) => {
        state.controller = controller;
        controller.addListener('ready', () => {
          if (state.pendingPlay) { state.pendingPlay = false; controller.play(); }
        });
        controller.addListener('playback_update', onUpdate);
      });
    } else {
      state.controller.loadUri(uri);
      if (play) setTimeout(() => state.controller && state.controller.play(), 700);
    }
  }

  el.vinyl.addEventListener('click', () => {
    if (!state.uri) { openPanel(true); return; }
    if (state.controller) state.controller.togglePlay();
    else state.pendingPlay = true;
  });

  el.track.addEventListener('click', () => openPanel(el.panel.classList.contains('closed')));

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const uri = parse(el.input.value);
    if (!uri) {
      el.error.textContent = 'paste a link from spotify: share, then copy link';
      return;
    }
    el.error.textContent = '';
    el.input.value = '';
    load(uri, { play: true, share: true });
  });

  document.addEventListener('click', (e) => {
    if (!el.panel.classList.contains('closed') && !el.player.contains(e.target)) openPanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') openPanel(false);
  });

  window.music = {
    current: () => state.uri,
    receive(uri) {
      if (typeof uri === 'string' && URI.test(uri) && uri !== state.uri) load(uri, { play: false, share: false });
    },
  };

  const saved = store.get();
  if (saved && URI.test(saved)) load(saved, { play: false, share: false });
  else render();
})();
