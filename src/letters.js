import { formatDate, h, letterStage } from './letter-view.js';

const CFG = window.SITE_CONFIG || {};
const L = CFG.labels || {};
const POLL_MS = 15000;
const $ = (id) => document.getElementById(id);

const el = {
  private: $('private'),
  main: $('mailboxMain'),
  list: $('mailbox'),
  empty: $('mailboxEmpty'),
  view: $('letterView'),
};

const key = new URLSearchParams(location.search).get('key') || '';

const readStore = {
  load() {
    try { return new Set(JSON.parse(localStorage.getItem('avk-read') || '[]')); } catch { return new Set(); }
  },
  save(set) {
    try { localStorage.setItem('avk-read', JSON.stringify([...set])); } catch {}
  },
};
const read = readStore.load();

const letters = new Map(); // id -> { letter, item }
let timer = null;
let current = null;

function showPrivate() {
  clearTimeout(timer);
  el.main.hidden = true;
  el.private.hidden = false;
}

function envelope(letter, animate) {
  const item = h('li', `mail-item${animate ? ' arrive' : ''}`);
  const btn = h('button', 'envelope-btn', { type: 'button', 'aria-label': `${L.from || 'from'} ${letter.name}` });
  const env = h('span', 'envelope');
  env.appendChild(h('span', 'envelope-seal', { text: '♡', 'aria-hidden': 'true' }));
  const dot = h('span', 'envelope-dot', { 'aria-label': 'unread' });
  dot.hidden = read.has(letter.id);
  env.appendChild(dot);
  btn.appendChild(env);
  btn.appendChild(h('span', 'envelope-name ink', { text: letter.name }));
  btn.addEventListener('click', () => openLetter(letter.id));
  item.appendChild(btn);
  return item;
}

function render(list, animate) {
  // list is newest first; add unseen letters to the top, keeping order.
  const fresh = list.filter((l) => !letters.has(l.id));
  for (let i = fresh.length - 1; i >= 0; i--) {
    const letter = fresh[i];
    const item = envelope(letter, animate);
    item.style.animationDelay = animate ? `${(fresh.length - 1 - i) * 120}ms` : '';
    el.list.prepend(item);
    letters.set(letter.id, { letter, item });
  }
  el.empty.hidden = letters.size > 0;
}

async function poll(first) {
  try {
    const res = await fetch(`/api/letters?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (res.status === 401) { showPrivate(); return; }
    if (res.ok) {
      const { letters: list } = await res.json();
      el.private.hidden = true;
      el.main.hidden = false;
      render(Array.isArray(list) ? list : [], !first);
    } else if (first) {
      el.main.hidden = false;
    }
  } catch {
    if (first) el.main.hidden = false;
  }
  timer = setTimeout(() => poll(false), POLL_MS);
}

function openLetter(id) {
  const entry = letters.get(id);
  if (!entry || current) return;
  const { letter, item } = entry;

  read.add(id);
  readStore.save(read);
  const dot = item.querySelector('.envelope-dot');
  if (dot) dot.hidden = true;

  el.view.textContent = '';
  const inner = h('div', 'letter-view-inner');
  const top = h('div', 'overlay-top');
  top.appendChild(h('p', 'overlay-title ink', { text: `${L.from || 'from'} ${letter.name}` }));
  const closeBtn = h('button', 'overlay-close', { type: 'button', 'aria-label': L.close || 'close' });
  closeBtn.textContent = '×';
  top.appendChild(closeBtn);
  inner.appendChild(top);

  const stage = letterStage({
    mode: 'read',
    message: letter.message,
    name: letter.name,
    date: formatDate(letter.createdAt),
    stripSrc: letter.hasStrip ? `/api/strip?key=${encodeURIComponent(key)}&id=${encodeURIComponent(letter.id)}` : '',
  });
  inner.appendChild(stage.el);
  el.view.appendChild(inner);

  const uri = letter.songUrl && window.music ? window.music.parse(letter.songUrl) : null;
  if (uri && stage.vinyl) stage.vinyl.load(uri, { play: false });

  const close = () => {
    stage.destroy();
    el.view.hidden = true;
    el.view.textContent = '';
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    current = null;
    item.querySelector('button').focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  el.view.hidden = false;
  el.view.scrollTop = 0;
  document.body.classList.add('modal-open');
  current = { close };
  closeBtn.focus({ preventScroll: true });
}

if (!key) showPrivate();
else poll(true);
