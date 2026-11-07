(function () {
  const WEDGES = 26;
  const TAU = Math.PI * 2;

  const CORNERS = [
    {
      canvas: 'lilyLeft',
      src: 'assets/lily-left-2.webp',
      flowers: [
        { x: 77, y: 807, r: 140, axis: -110, delay: 0.1, crimson: true },
        { x: 65, y: 950, r: 124, axis: -105, delay: 0.04, crimson: true },
        { x: 280, y: 610, r: 300, axis: -100, delay: 0 },
        { x: 195, y: 215, r: 210, axis: -115, delay: 0.14 },
      ],
    },
    {
      canvas: 'lilyRight',
      src: 'assets/lily-right-4.webp',
      flowers: [
        { x: 439, y: 242, r: 140, axis: -70, delay: 0.22, crimson: true },
        { x: 451, y: 385, r: 124, axis: -75, delay: 0.12, crimson: true },
        { x: 419, y: 592, r: 112, axis: -80, delay: 0.06, crimson: true },
        { x: 272, y: 658, r: 192, axis: -100, delay: 0 },
      ],
    },
  ];

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const angDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Split the cutout into a static base layer (stems, vines, buds) and one layer per bloom.
  function splitLayers(img, flowers, darkToBase) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, w, h).data;

    const base = new ImageData(w, h);
    const layers = flowers.map(() => ({ px: new ImageData(w, h), minX: w, minY: h, maxX: 0, maxY: 0 }));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3];
        if (!a) continue;
        let best = -1, bestD = Infinity;
        for (let k = 0; k < flowers.length; k++) {
          const f = flowers[k];
          const d = Math.hypot(x - f.x, y - f.y) / f.r;
          if (d < bestD) { bestD = d; best = k; }
        }
        const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
        const wFlower = (best >= 0 ? 1 - smooth(0.9, 1.04, bestD) : 0) * (darkToBase ? 0.2 + 0.8 * smooth(10, 42, lum) : 1);
        const aF = Math.round(a * wFlower);
        const aB = a - aF;
        if (aB) {
          base.data[i] = data[i]; base.data[i + 1] = data[i + 1]; base.data[i + 2] = data[i + 2]; base.data[i + 3] = aB;
        }
        if (aF) {
          const L = layers[best];
          L.px.data[i] = data[i]; L.px.data[i + 1] = data[i + 1]; L.px.data[i + 2] = data[i + 2]; L.px.data[i + 3] = aF;
          if (x < L.minX) L.minX = x; if (x > L.maxX) L.maxX = x;
          if (y < L.minY) L.minY = y; if (y > L.maxY) L.maxY = y;
        }
      }
    }

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = w; baseCanvas.height = h;
    baseCanvas.getContext('2d').putImageData(base, 0, 0);

    const flowerLayers = layers.map((L, k) => {
      const c = document.createElement('canvas');
      const cw = Math.max(1, L.maxX - L.minX + 1), ch = Math.max(1, L.maxY - L.minY + 1);
      c.width = cw; c.height = ch;
      c.getContext('2d').putImageData(L.px, -L.minX, -L.minY, L.minX, L.minY, cw, ch);
      const f = flowers[k];
      const reach = Math.max(
        Math.hypot(L.minX - f.x, L.minY - f.y), Math.hypot(L.maxX - f.x, L.minY - f.y),
        Math.hypot(L.minX - f.x, L.maxY - f.y), Math.hypot(L.maxX - f.x, L.maxY - f.y)
      );
      return { canvas: c, ox: L.minX, oy: L.minY, reach, ...f, axisRad: (f.axis * Math.PI) / 180 };
    });

    return { w, h, base: baseCanvas, flowers: flowerLayers };
  }

  function drawBud(ctx, f, bud, alpha, grow) {
    const len = f.r * 0.92 * grow;
    const wid = len * (bud.width / bud.height);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.axisRad + Math.PI / 2);
    ctx.drawImage(bud, -wid / 2, -len * 0.94, wid, len);
    ctx.restore();
  }

  function drawFlower(ctx, f, e, bud) {
    if (e >= 0.999) {
      ctx.drawImage(f.canvas, f.ox, f.oy);
      return;
    }
    const u = smooth(0.12, 1, e);
    const fanAlpha = smooth(0.06, 0.4, e);
    const budAlpha = 1 - smooth(0.2, 0.55, e);
    if (fanAlpha > 0) drawFan(ctx, f, u, fanAlpha);
    if (bud && budAlpha > 0) drawBud(ctx, f, bud, budAlpha, 0.72 + 0.34 * smooth(0, 0.5, e));
  }

  function drawFan(ctx, f, e, alpha) {
    const step = TAU / WEDGES;
    const spread = 0.03 + 0.97 * e;
    const scale = 0.52 + 0.48 * e;
    const seam = 0.008;
    const order = [];
    for (let k = 0; k < WEDGES; k++) {
      const a0 = -Math.PI + k * step;
      const mid = a0 + step / 2;
      order.push({ a0, mid, d: angDiff(mid, f.axisRad) });
    }
    order.sort((p, q) => Math.abs(q.d) - Math.abs(p.d));

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const w of order) {
      const target = f.axisRad + w.d * spread;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(target - w.mid);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, f.reach + 2, w.a0 - seam, w.a0 + step + seam);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(f.canvas, f.ox - f.x, f.oy - f.y);
      ctx.restore();
    }
    ctx.restore();
  }

  function tintBud(img, color) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    if (color) {
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(img, 0, 0);
    }
    return c;
  }

  const budImage = loadImage('assets/bud.webp').catch(() => null);

  /* ---------- 3D renderer: each lily photo becomes a petal surface folded in a vertex shader ---------- */

  const FLOWER_VS = `
    attribute vec2 aPolar;
    uniform float uT, uR, uAxis, uD;
    uniform vec2 uC, uImg, uTexOff, uTexSize;
    varying vec2 vUv;
    varying float vShade, vFace, vDepth;

    vec3 rot(vec3 p, vec3 k, float g) {
      float c = cos(g), s = sin(g);
      return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c);
    }

    // Closed (uT = 0): petals curl forward and twist into a slender bud pointing along uAxis.
    // Open (uT = 1): the surface lies flat and matches the photo exactly.
    vec3 shape(float th, float rho) {
      float c = 1.0 - uT;
      float c2 = c * c * (3.0 - 2.0 * c);
      float beta = c2 * (1.08 + 0.62 * rho * rho);
      float twist = c2 * 0.7 * rho;
      float a = th + twist;
      float r = rho * uR * (0.84 + 0.16 * uT);
      vec3 p = vec3(cos(a) * cos(beta) * r, sin(a) * cos(beta) * r, sin(beta) * r);
      vec3 ad = vec3(cos(uAxis), sin(uAxis), 0.0);
      vec3 k = normalize(cross(vec3(0.0, 0.0, 1.0), ad));
      return rot(p, k, c * 1.38);
    }

    void main() {
      float th = aPolar.x;
      float rho = aPolar.y;
      vec3 p = shape(th, rho);
      float rr = max(rho, 0.04);
      vec3 dT = shape(th + 0.02, rr) - shape(th - 0.02, rr);
      vec3 dR = shape(th, rr + 0.02) - shape(th, rr);
      vec3 n = normalize(cross(dR, dT));
      vec3 L = normalize(vec3(-0.35, -0.55, 0.76));
      vShade = 0.38 + 0.62 * abs(dot(n, L));
      vFace = n.z;
      float f = uD / (uD - p.z);
      vec2 P = uC + p.xy * f;
      vec2 src = uC + vec2(cos(th), sin(th)) * rho * uR;
      vUv = (src - uTexOff) / uTexSize;
      vDepth = p.z;
      gl_Position = vec4(P.x / uImg.x * 2.0 - 1.0, 1.0 - P.y / uImg.y * 2.0, clamp(-p.z / (uD * 1.5), -1.0, 1.0), 1.0);
    }`;

  const FLOWER_FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uTex;
    uniform float uOpen;
    varying vec2 vUv;
    varying float vShade, vFace, vDepth;
    void main() {
      if (vUv.x < 0.0 || vUv.y < 0.0 || vUv.x > 1.0 || vUv.y > 1.0) discard;
      vec4 c = texture2D(uTex, vUv);
      if (c.a < 0.04) discard;
      vec3 rgb = c.rgb;
      float lum = dot(rgb, vec3(0.3, 0.59, 0.11));
      float back = 1.0 - smoothstep(-0.08, 0.08, vFace);
      vec3 under = mix(rgb, vec3(lum) * vec3(1.06, 0.9, 0.86), 0.35) * 0.8;
      vec3 lit = mix(rgb, under, back) * vShade;
      float flatAmt = smoothstep(0.84, 1.0, uOpen);
      gl_FragColor = vec4(mix(lit, rgb, flatAmt), c.a);
    }`;

  const SPRITE_VS = `
    attribute vec2 aXY;
    attribute vec2 aUV;
    uniform vec2 uImg;
    varying vec2 vUv;
    void main() { vUv = aUV; gl_Position = vec4(aXY.x / uImg.x * 2.0 - 1.0, 1.0 - aXY.y / uImg.y * 2.0, 0.0, 1.0); }`;

  const BASE_VS = `
    attribute vec2 aXY;
    varying vec2 vUv;
    void main() { vUv = aXY; gl_Position = vec4(aXY.x * 2.0 - 1.0, 1.0 - aXY.y * 2.0, 0.0, 1.0); }`;

  const BASE_FS = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform float uAlpha;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(uTex, vUv) * uAlpha; }`;

  function compile(gl, vs, fs) {
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const loc = {};
    const nu = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(prog, i).name; loc[n] = gl.getUniformLocation(prog, n); }
    const na = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(prog, i).name; loc[n] = gl.getAttribLocation(prog, n); }
    return { prog, loc };
  }

  function texture(gl, source) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function polarMesh(gl) {
    const NA = 120, NR = 36;
    const verts = [];
    for (let j = 0; j <= NR; j++) {
      for (let i = 0; i <= NA; i++) verts.push(-Math.PI + (i / NA) * TAU, j / NR);
    }
    const idx = [];
    for (let j = 0; j < NR; j++) {
      for (let i = 0; i < NA; i++) {
        const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { vb, ib, count: idx.length };
  }

  function makeRenderer3D(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    let flowerProg, baseProg, spriteProg;
    try {
      flowerProg = compile(gl, FLOWER_VS, FLOWER_FS);
      baseProg = compile(gl, BASE_VS, BASE_FS);
      spriteProg = compile(gl, SPRITE_VS, BASE_FS);
    } catch (err) {
      console.warn('lily 3D unavailable, using 2D', err);
      return null;
    }
    const mesh = polarMesh(gl);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const spriteBuf = gl.createBuffer();
    let model = null, baseTex = null, flowerTex = [], budTex = null;

    // The real photographed bud stands in for the first moments, then fades into the folding petals.
    function drawBud(f, t, tex) {
      const alpha = 1 - smooth(0.1, 0.42, t);
      if (alpha <= 0 || !tex) return;
      const grow = 0.86 + 0.3 * smooth(0, 0.38, t);
      const len = f.r * 0.98 * grow;
      const wid = len * (tex.w / tex.h) * (1 + 0.35 * smooth(0.05, 0.4, t));
      const ax = Math.cos(f.axisRad), ay = Math.sin(f.axisRad);
      const nx = -ay, ny = ax;
      const bx = f.x - ax * len * 0.06, by = f.y - ay * len * 0.06;
      const tx = bx + ax * len, ty = by + ay * len;
      const hw = wid / 2;
      const data = new Float32Array([
        bx - nx * hw, by - ny * hw, 0, 1,
        bx + nx * hw, by + ny * hw, 1, 1,
        tx - nx * hw, ty - ny * hw, 0, 0,
        tx + nx * hw, ty + ny * hw, 1, 0,
      ]);
      const L = spriteProg.loc;
      gl.useProgram(spriteProg.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(L.aXY);
      gl.enableVertexAttribArray(L.aUV);
      gl.vertexAttribPointer(L.aXY, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, 16, 8);
      gl.uniform2f(L.uImg, model.w, model.h);
      gl.uniform1f(L.uAlpha, alpha);
      gl.uniform1i(L.uTex, 0);
      gl.bindTexture(gl.TEXTURE_2D, tex.t);
      gl.disable(gl.DEPTH_TEST);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(L.aXY);
      gl.disableVertexAttribArray(L.aUV);
    }

    return {
      setModel(m, buds) {
        model = m;
        baseTex = texture(gl, m.base);
        flowerTex = m.flowers.map((f) => texture(gl, f.canvas));
        if (buds) {
          budTex = {
            crimson: { t: texture(gl, buds.crimson), w: buds.crimson.width, h: buds.crimson.height },
            pale: { t: texture(gl, buds.pale), w: buds.pale.width, h: buds.pale.height },
          };
        }
      },
      draw(b) {
        if (!model) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(baseProg.prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(baseProg.loc.aXY);
        gl.vertexAttribPointer(baseProg.loc.aXY, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseTex);
        gl.uniform1i(baseProg.loc.uTex, 0);
        gl.uniform1f(baseProg.loc.uAlpha, 0.6 + 0.4 * b);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(baseProg.loc.aXY);

        const L = flowerProg.loc;
        model.flowers.forEach((f, k) => {
          const p = Math.min(1, Math.max(0, (b - f.delay) / (1 - f.delay - 0.06)));
          const t = p * p * p * (p * (p * 6 - 15) + 10);
          gl.enable(gl.DEPTH_TEST);
          gl.depthFunc(gl.LEQUAL);
          gl.useProgram(flowerProg.prog);
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
          gl.enableVertexAttribArray(L.aPolar);
          gl.vertexAttribPointer(L.aPolar, 2, gl.FLOAT, false, 0, 0);
          gl.uniform2f(L.uImg, model.w, model.h);
          gl.uniform1i(L.uTex, 0);
          gl.clear(gl.DEPTH_BUFFER_BIT);
          gl.bindTexture(gl.TEXTURE_2D, flowerTex[k]);
          gl.uniform1f(L.uT, t);
          gl.uniform1f(L.uOpen, t);
          gl.uniform1f(L.uR, f.reach + 2);
          gl.uniform1f(L.uAxis, f.axisRad);
          gl.uniform1f(L.uD, f.r * 3.2);
          gl.uniform2f(L.uC, f.x, f.y);
          gl.uniform2f(L.uTexOff, f.ox, f.oy);
          gl.uniform2f(L.uTexSize, f.canvas.width, f.canvas.height);
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
          gl.disableVertexAttribArray(L.aPolar);
          if (budTex) drawBud(f, t, f.crimson ? budTex.crimson : budTex.pale);
        });
      },
    };
  }

  function makeCorner(cfg) {
    const canvas = document.getElementById(cfg.canvas);
    const r3d = makeRenderer3D(canvas);
    if (r3d) return makeCorner3D(cfg, canvas, r3d);
    // a canvas that already handed out a WebGL context can't give a 2D one
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    return makeCorner2D(cfg, fresh);
  }

  function makeCorner3D(cfg, canvas, r3d) {
    let ready = false;
    let last = -1;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      last = -1;
    }
    function draw(b) {
      if (!ready || b === last) return;
      last = b;
      r3d.draw(b);
    }
    Promise.all([loadImage(cfg.src), budImage]).then(([img, budImg]) => {
      const buds = budImg ? { crimson: tintBud(budImg, '#c23a55'), pale: tintBud(budImg, null) } : null;
      r3d.setModel(splitLayers(img, cfg.flowers, false), buds);
      ready = true;
      resize();
      onReady();
    });
    return { resize, draw };
  }

  function makeCorner2D(cfg, canvas) {
    const ctx = canvas.getContext('2d');
    let model = null;
    let bud = null;
    let budPale = null;
    let last = -1;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      last = -1;
    }

    function draw(b) {
      if (!model || b === last) return;
      last = b;
      const k = canvas.width / model.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.globalAlpha = 0.55 + 0.45 * b;
      ctx.drawImage(model.base, 0, 0);
      ctx.globalAlpha = 1;
      for (const f of model.flowers) {
        const p = Math.min(1, Math.max(0, (b - f.delay) / (1 - f.delay - 0.06)));
        drawFlower(ctx, f, ease(p), f.crimson ? bud : budPale);
      }
    }

    Promise.all([loadImage(cfg.src), budImage]).then(([img, budImg]) => {
      if (budImg) {
        bud = tintBud(budImg, '#c23a55');
        budPale = tintBud(budImg, null);
      }
      model = splitLayers(img, cfg.flowers, true);
      resize();
      onReady();
    });

    return { resize, draw };
  }

  const DURATION = 6500;
  const DELAY = 350;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let start = null;
  let loaded = 0;
  let raf = 0;

  function progress(now) {
    if (reduced) return 1;
    if (start === null) return 0;
    return Math.min(1, Math.max(0, (now - start) / DURATION));
  }

  function frame(now) {
    raf = 0;
    const b = progress(now);
    corners.forEach((c) => c.draw(b));
    if (b < 1) schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function onReady() {
    loaded += 1;
    if (loaded === CORNERS.length) start = performance.now() + DELAY;
    schedule();
  }

  const corners = CORNERS.map(makeCorner);
  window.addEventListener('resize', () => { corners.forEach((c) => c.resize()); schedule(); });})();
