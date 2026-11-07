(function () {
  const URI = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/;
  const ARM = '<svg class="arm" viewBox="0 0 40 60" aria-hidden="true">'
    + '<circle cx="32" cy="6" r="4.5" fill="#2a0b12" stroke="#f3ead8" stroke-width="1.2"/>'
    + '<path d="M32 6 L30 30 L15 49" fill="none" stroke="#f3ead8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<rect x="9" y="47" width="10" height="6" rx="1.5" transform="rotate(-40 14 50)" fill="#cfa862" stroke="#2a0b12" stroke-width=".8"/>'
    + '</svg>';

  const apiReady = new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (IFrameAPI) => resolve(IFrameAPI);
  });

  function parse(text) {
    const s = String(text || '').trim();
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

  async function fetchMeta(uri) {
    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(openUrl(uri))}`);
      if (!res.ok) return null;
      const meta = await res.json();
      const thumb = typeof meta.thumbnail_url === 'string' && meta.thumbnail_url.startsWith('https://')
        ? meta.thumbnail_url.replace(/"/g, '') : '';
      return { title: String(meta.title || '').slice(0, 80), thumb };
    } catch {
      return null;
    }
  }

  // Every record on the page; starting one pauses the others.
  const players = new Set();

  // A record bound to a Spotify embed. root gets .playing while audio plays.
  function makePlayer({ root, label, embed, onChange }) {
    const s = { uri: null, title: '', controller: null, pendingPlay: false, playing: false, dead: false };

    function render() {
      root.classList.toggle('playing', s.playing);
      if (onChange) onChange(api);
    }

    function onUpdate(e) {
      const d = e && e.data;
      if (!d || s.dead) return;
      s.playing = !d.isPaused;
      if (s.playing) players.forEach((p) => { if (p !== api) p.pause(); });
      render();
    }

    async function load(uri, { play = false } = {}) {
      if (!URI.test(uri) || s.dead) return;
      if (uri === s.uri && s.controller) {
        if (play) s.controller.play();
        return;
      }
      s.uri = uri;
      s.title = '';
      s.playing = false;
      label.classList.remove('on');
      render();
      fetchMeta(uri).then((meta) => {
        if (!meta || s.uri !== uri || s.dead) return;
        s.title = meta.title;
        if (meta.thumb) {
          label.style.backgroundImage = `url("${meta.thumb}")`;
          label.classList.add('on');
        }
        render();
      });

      const IFrameAPI = await apiReady;
      if (s.uri !== uri || s.dead) return;
      if (!s.controller) {
        s.pendingPlay = play;
        IFrameAPI.createController(embed, { uri, width: '100%', height: 80 }, (controller) => {
          if (s.dead) { try { controller.destroy(); } catch {} return; }
          s.controller = controller;
          controller.addListener('ready', () => {
            if (s.pendingPlay) { s.pendingPlay = false; controller.play(); }
          });
          controller.addListener('playback_update', onUpdate);
        });
      } else {
        s.controller.loadUri(uri);
        if (play) setTimeout(() => s.controller && s.controller.play(), 700);
      }
    }

    const api = {
      load,
      get uri() { return s.uri; },
      get title() { return s.title; },
      get playing() { return s.playing; },
      toggle() {
        if (!s.uri) return false;
        if (s.controller) s.controller.togglePlay();
        else s.pendingPlay = !s.pendingPlay;
        return true;
      },
      pause() {
        if (s.controller && s.playing) s.controller.pause();
        s.pendingPlay = false;
      },
      destroy() {
        s.dead = true;
        players.delete(api);
        if (s.controller) { try { s.controller.destroy(); } catch {} }
        s.controller = null;
      },
    };
    players.add(api);
    return api;
  }

  // A standalone record (used on letters). Optionally put the Spotify embed in
  // embedHost; if tapping doesn't start audio (e.g. iOS), the embed is revealed
  // so the song can be played from its own button.
  function createVinyl({ embedHost } = {}) {
    const root = document.createElement('div');
    root.className = 'vinyl-solo';
    root.innerHTML = '<button type="button" class="vinyl" aria-label="play music">'
      + '<span class="disc"><img src="/assets/vinyl.webp" alt=""><span class="label"></span></span>'
      + ARM + '</button>';
    const host = document.createElement('div');
    host.className = 'vinyl-embed';
    const slot = document.createElement('div');
    host.appendChild(slot);
    (embedHost || root).appendChild(host);

    const button = root.querySelector('.vinyl');
    let revealTimer = null;
    const player = makePlayer({
      root,
      label: root.querySelector('.label'),
      embed: slot,
      onChange(p) {
        button.setAttribute('aria-label', p.playing ? 'pause music' : 'play music');
        root.classList.toggle('has-song', !!p.uri);
        if (p.playing) { clearTimeout(revealTimer); }
      },
    });

    button.addEventListener('click', () => {
      if (!player.toggle()) return;
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        if (!player.playing && player.uri) host.classList.add('show');
      }, 3500);
    });

    return {
      el: root,
      embed: host,
      player,
      load(uri, opts) { host.classList.remove('show'); return player.load(uri, opts); },
      clear() {
        player.pause();
        root.classList.remove('has-song');
      },
      destroy() { clearTimeout(revealTimer); player.destroy(); host.remove(); root.remove(); },
    };
  }

  /* ---------- the pinned record on the booth page ---------- */

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

  const store = {
    get() { try { return localStorage.getItem('avk-song'); } catch { return null; } },
    set(v) { try { localStorage.setItem('avk-song', v); } catch {} },
  };

  let main = null;

  if (el.player) {
    const caption = () => {
      el.track.textContent = main.uri ? (main.title || 'tap the record to play') : 'add a song';
      el.vinyl.setAttribute('aria-label', main.uri ? (main.playing ? 'pause music' : 'play music') : 'add a song');
    };
    main = makePlayer({ root: el.player, label: el.label, embed: el.embed, onChange: () => caption() });

    const openPanel = (open) => {
      el.panel.classList.toggle('closed', !open);
      el.track.setAttribute('aria-expanded', String(open));
      if (open && !main.uri) setTimeout(() => el.input.focus(), 50);
    };

    const loadMain = (uri, { play, share }) => {
      if (!URI.test(uri)) return;
      if (uri !== main.uri) {
        store.set(uri);
        if (share && window.booth) window.booth.send({ t: 'song', uri });
      }
      main.load(uri, { play });
    };

    el.vinyl.addEventListener('click', () => {
      if (!main.toggle()) openPanel(true);
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
      loadMain(uri, { play: true, share: true });
    });

    document.addEventListener('click', (e) => {
      if (!el.panel.classList.contains('closed') && !el.player.contains(e.target)) openPanel(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') openPanel(false);
    });

    main.receive = (uri) => {
      if (typeof uri === 'string' && URI.test(uri) && uri !== main.uri) loadMain(uri, { play: false, share: false });
    };

    const saved = store.get();
    if (saved && URI.test(saved)) loadMain(saved, { play: false, share: false });
    else caption();
  }

  window.music = {
    current: () => (main ? main.uri : null),
    receive: (uri) => { if (main) main.receive(uri); },
    pauseAll: () => players.forEach((p) => p.pause()),
    parse,
    openUrl,
    createVinyl,
  };
})();
