(function () {
  const SCRIPT = "'Great Vibes', 'Pinyon Script', cursive";
  const FABRIC = '#330505';
  const IVORY = '#f3ead8';
  const LACE = '#efe2c6';

  const lace = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/assets/lace.webp';
  });

  // Black & white vintage: warm-toned monochrome, punchy contrast, lifted
  // blacks and film grain, like an old photobooth print.
  function toneBW(d) {
    for (let i = 0; i < d.length; i += 4) {
      let l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      l = (l - 118) * 1.28 + 122;
      l = 22 + l * 0.86 + (Math.random() - 0.5) * 22;
      d[i] = l * 1.05 + 4;
      d[i + 1] = l * 0.98 + 1;
      d[i + 2] = l * 0.86;
    }
  }

  function tone(canvas, bw) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    if (bw) {
      toneBW(d);
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * 0.76 + sr * 0.24;
      g = g * 0.76 + sg * 0.24;
      b = b * 0.76 + sb * 0.24;
      r = (r - 128) * 1.07 + 128;
      g = (g - 128) * 1.07 + 128;
      b = (b - 128) * 1.07 + 128;
      const n = (Math.random() - 0.5) * 16;
      d[i] = 16 + r * 0.93 + n;
      d[i + 1] = 8 + g * 0.89 + n;
      d[i + 2] = 11 + b * 0.84 + n;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // Center-crops the video to the given aspect (w/h) and returns a toned canvas
  // (black & white vintage when bw is true).
  function captureFrame(video, aspect, mirror, bw) {
    const outW = aspect >= 1 ? 960 : 720;
    const outH = Math.round(outW / aspect);
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1f080e';
    ctx.fillRect(0, 0, outW, outH);
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      let sw = vw, sh = vw / aspect;
      if (sh > vh) { sh = vh; sw = vh * aspect; }
      const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
      if (mirror) { ctx.translate(outW, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    return tone(c, bw);
  }

  // Staggered ivory polka dots, spaced like the reference fabric (675px wide swatch).
  function drawDots(ctx, W, H) {
    const s = W / 675;
    const r = 6.5 * s, colGap = 72 * s, rowGap = 143 * s;
    ctx.fillStyle = IVORY;
    let k = 0;
    for (let x = 265 * s - colGap * 4; x < W + colGap; x += colGap, k++) {
      const y0 = (k % 2 ? 132 : 61) * s;
      for (let y = y0 - rowGap * 2; y < H + rowGap; y += rowGap) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLace(ctx, img, bandW, H) {
    if (!img) return;
    const k = bandW / img.naturalWidth;
    const tileH = img.naturalHeight * k;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    for (let y = 0, i = 0; y < H; y += tileH, i++) {
      ctx.save();
      if (i % 2) {
        ctx.translate(0, y + tileH);
        ctx.scale(k, -k);
      } else {
        ctx.translate(0, y);
        ctx.scale(k, k);
      }
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // A thin cream lace frame: scalloped outer edge with a pierced hole in each
  // scallop, a row of tiny eyelets, and a fine inner rule around the photo.
  function drawLaceBorder(ctx, x, y, w, h, b) {
    const ox = x - b, oy = y - b, ow = w + b * 2, oh = h + b * 2;
    const r = b * 0.42;
    const edge = (len) => Math.max(1, Math.round(len / (r * 2.05)));
    const scallops = [];
    const along = (x0, y0, x1, y1) => {
      const n = edge(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= n; i++) scallops.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    };
    along(ox + r, oy + r, ox + ow - r, oy + r);
    along(ox + ow - r, oy + r, ox + ow - r, oy + oh - r);
    along(ox + ow - r, oy + oh - r, ox + r, oy + oh - r);
    along(ox + r, oy + oh - r, ox + r, oy + r);

    const path = new Path2D();
    path.rect(ox + r * 0.6, oy + r * 0.6, ow - r * 1.2, oh - r * 1.2);
    scallops.forEach(([cx, cy]) => { path.moveTo(cx + r, cy); path.arc(cx, cy, r, 0, Math.PI * 2); });

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = LACE;
    ctx.fill(path, 'nonzero');
    ctx.restore();

    // pierced holes (fabric showing through) and eyelets
    ctx.save();
    ctx.fillStyle = 'rgba(51, 5, 5, .55)';
    scallops.forEach(([cx, cy]) => { ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(120, 92, 70, .35)';
    const er = Math.max(0.8, b * 0.09);
    const mid = b * 0.62;
    const ring = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / (b * 0.42)));
      for (let i = 0; i <= n; i++) {
        ctx.beginPath();
        ctx.arc(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, er, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ring(x - mid + b * 0.1, y - mid + b * 0.1, x + w + mid - b * 0.1, y - mid + b * 0.1);
    ring(x + w + mid - b * 0.1, y - mid + b * 0.1, x + w + mid - b * 0.1, y + h + mid - b * 0.1);
    ring(x + w + mid - b * 0.1, y + h + mid - b * 0.1, x - mid + b * 0.1, y + h + mid - b * 0.1);
    ring(x - mid + b * 0.1, y + h + mid - b * 0.1, x - mid + b * 0.1, y - mid + b * 0.1);
    ctx.strokeStyle = 'rgba(120, 92, 70, .45)';
    ctx.lineWidth = Math.max(0.8, b * 0.06);
    ctx.strokeRect(x - b * 0.22, y - b * 0.22, w + b * 0.44, h + b * 0.44);
    ctx.restore();
  }

  function drawPrint(ctx, src, x, y, w, h) {
    drawLaceBorder(ctx, x, y, w, h, Math.round(w * 0.04));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (src) {
      const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
      const s = Math.max(w / sw, h / sh);
      ctx.drawImage(src, x + (w - sw * s) / 2, y + (h - sh * s) / 2, sw * s, sh * s);
    } else {
      ctx.fillStyle = '#2a0b12';
      ctx.fillRect(x, y, w, h);
    }
    const v = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.4, x + w / 2, y + h / 2, Math.max(w, h) * 0.78);
    v.addColorStop(0, 'rgba(40,10,10,0)');
    v.addColorStop(1, 'rgba(40,10,10,.32)');
    ctx.fillStyle = v;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // Script lettering with a slightly sketched, stitched edge.
  function sketchText(ctx, text, x, y, size) {
    ctx.save();
    ctx.font = `${size}px ${SCRIPT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = IVORY;
    ctx.shadowColor = 'rgba(20,0,0,.85)';
    ctx.shadowBlur = size * 0.18;
    ctx.fillText(text, x, y);
    ctx.shadowColor = 'transparent';
    const j = Math.max(0.6, size * 0.012);
    ctx.globalAlpha = 0.35;
    for (const [dx, dy] of [[-j, j * 0.5], [j, -j * 0.6], [j * 0.4, j]]) ctx.fillText(text, x + dx, y + dy);
    ctx.restore();
  }

  // rows: array of 4 entries; each entry is [img] (solo) or [left, right] (together)
  async function compose({ rows, names }) {
    const laceImg = await lace;
    const pair = rows[0] && rows[0].length === 2;
    const W = pair ? 760 : 640;
    const left = Math.round(W * (pair ? 0.2 : 0.25));
    const inner = Math.round(W * (pair ? 0.66 : 0.6));
    const top = 72, gap = 46, colGap = pair ? 26 : 14, foot = 210;
    const cellW = pair ? (inner - colGap) / 2 : inner;
    const cellH = pair ? Math.round(cellW * 4 / 3) : Math.round(cellW * 3 / 4);
    const H = top + rows.length * cellH + (rows.length - 1) * gap + foot;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = FABRIC;
    ctx.fillRect(0, 0, W, H);
    drawDots(ctx, W, H);
    drawLace(ctx, laceImg, Math.round(W * (pair ? 0.3 : 0.38)), H);

    rows.forEach((row, i) => {
      const y = top + i * (cellH + gap);
      if (pair) {
        drawPrint(ctx, row[0], left, y, cellW, cellH);
        drawPrint(ctx, row[1], left + cellW + colGap, y, cellW, cellH);
      } else {
        drawPrint(ctx, row[0], left, y, cellW, cellH);
      }
    });

    const cx = left + inner / 2;
    const fy = H - foot;
    sketchText(ctx, (window.SITE_CONFIG && window.SITE_CONFIG.occasion) || '', cx, fy + 100, 76);

    const who = names.filter(Boolean).join(' & ');
    if (who) sketchText(ctx, who, cx, fy + 148, 38);

    const d = new Date();
    const date = [d.getDate(), d.getMonth() + 1, String(d.getFullYear()).slice(2)]
      .map((n) => String(n).padStart(2, '0')).join(' . ');
    sketchText(ctx, date, cx, fy + (who ? 186 : 150), 28);

    return c;
  }

  window.Strip = { captureFrame, compose };
})();
