import './letter.css';

const h = (tag, cls, attrs = {}) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  return el;
};

export { h };

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return [d.getDate(), d.getMonth() + 1, String(d.getFullYear()).slice(2)]
    .map((n) => String(n).padStart(2, '0')).join('.');
}

/**
 * The layered letter used by the composer (mode "compose") and Hazel's page
 * (mode "read"):
 *   paper (cursive-paper.png)  <  vinyl  <  card (letter-card.png)  <  strip in film-strip frame
 */
export function letterStage({ mode, message = '', name = '', date = '', stripSrc = '', labels = {} }) {
  const wrap = h('div', `lt lt-${mode}`);
  const stage = h('div', 'lt-stage');
  wrap.appendChild(stage);

  stage.appendChild(h('img', 'lt-paper', { src: '/assets/cursive-paper.png', alt: '', draggable: 'false' }));

  const embedSlot = h('div', 'lt-embed');
  const vinyl = window.music && window.music.createVinyl
    ? window.music.createVinyl({ embedHost: embedSlot })
    : null;
  const vinylBox = h('div', 'lt-vinyl');
  if (vinyl) vinylBox.appendChild(vinyl.el);
  stage.appendChild(vinylBox);

  const card = h('div', 'lt-card');
  card.appendChild(h('img', 'lt-card-img', { src: '/assets/letter-card.png', alt: '', draggable: 'false' }));
  const writing = h('div', 'lt-writing');
  card.appendChild(writing);
  stage.appendChild(card);

  let textarea = null;
  let nameInput = null;
  if (mode === 'compose') {
    textarea = h('textarea', 'lt-text', {
      maxlength: '2000',
      placeholder: labels.letterPlaceholder || '',
      'aria-label': 'your letter',
      spellcheck: 'true',
    });
    textarea.value = message;
    const sign = h('label', 'lt-sign');
    sign.appendChild(h('span', '', { text: '♡ ' }));
    nameInput = h('input', 'lt-name', {
      type: 'text',
      maxlength: '40',
      placeholder: labels.fromPlaceholder || 'your name',
      autocomplete: 'given-name',
      'aria-label': 'your name',
    });
    nameInput.value = name;
    sign.appendChild(nameInput);
    writing.append(textarea, sign);
  } else {
    const msg = h('div', 'lt-text lt-read', { tabindex: '0' });
    msg.textContent = message;
    const sign = h('p', 'lt-sign', { text: `♡ ${name}` });
    if (date) sign.appendChild(h('span', 'lt-date', { text: date }));
    writing.append(msg, sign);
  }

  const strip = h('div', 'lt-strip');
  strip.appendChild(h('img', 'lt-strip-frame', { src: '/assets/film-strip.png', alt: '', draggable: 'false' }));
  const photo = h('img', 'lt-strip-photo', { alt: name ? `photo strip from ${name}` : 'photo strip' });
  photo.addEventListener('load', () => strip.classList.add('has-photo'));
  photo.addEventListener('error', () => strip.classList.remove('has-photo'));
  if (stripSrc) photo.src = stripSrc;
  strip.appendChild(photo);
  stage.appendChild(strip);

  wrap.appendChild(embedSlot);

  return {
    el: wrap,
    vinyl,
    textarea,
    nameInput,
    destroy() {
      if (vinyl) vinyl.destroy();
      wrap.remove();
    },
  };
}
