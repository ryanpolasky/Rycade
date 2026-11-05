(() => {
  const W = 1280;
  const H = 960;
  const LW = 320;
  const LH = 240;
  const REVEAL = 4.44;
  const IDLE = 12;
  const PX = '"Press Start 2P", monospace';
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const span = (t, start, end) => clamp((t - start) / (end - start));
  const lerp = (a, b, k) => a + (b - a) * k;
  const outCubic = x => 1 - (1 - x) ** 3;
  const blink = (t, start, period, still) => still || (t >= start && Math.floor((t - start) / period) % 2 === 0);
  const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const images = new Map();
  let vignetteCanvas = null;
  let noiseFrames = null;
  let run = null;
  let pixelScale = 1;

  function canvas(width, height) {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  }

  function image(src, onLoad) {
    let element = images.get(src);
    if (!element) {
      element = new Image();
      element.decoding = 'async';
      element.src = src;
      images.set(src, element);
    }
    if (onLoad && !element.complete) element.addEventListener('load', onLoad, { once: true });
    return element;
  }

  const loaded = element => element.complete && element.naturalWidth > 0;

  function glowOf(source, color, blur) {
    const pad = blur * 2;
    const result = canvas(source.width + pad * 2, source.height + pad * 2);
    const g = result.getContext('2d');
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.shadowOffsetX = 10000;
    g.drawImage(source, pad - 10000, pad);
    g.drawImage(source, pad - 10000, pad);
    return result;
  }

  function tinted(source, color) {
    const result = canvas(source.width, source.height);
    const g = result.getContext('2d');
    g.drawImage(source, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, result.width, result.height);
    return result;
  }

  function centered(g, source, x, y, scale = 1, alpha = 1) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= clamp(alpha);
    g.translate(x, y);
    g.scale(scale, scale);
    g.drawImage(source, -source.width / 2, -source.height / 2);
    g.restore();
  }

  function text(g, value, x, y, size, color, { align = 'center', glow = 0, glowColor = color, alpha = 1 } = {}) {
    if (alpha <= 0 || !value) return;
    g.save();
    g.globalAlpha *= clamp(alpha);
    g.font = `${size}px ${PX}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    if (glow) {
      g.shadowColor = glowColor;
      g.shadowBlur = glow;
    }
    g.fillText(value, x, y);
    g.restore();
  }

  function roundRect(g, x, y, width, height, radius) {
    g.beginPath();
    g.roundRect(x, y, width, height, radius);
  }

  function shade(hex, level, base = [7, 5, 12]) {
    const value = parseInt(hex.slice(1), 16);
    const rgb = [value >> 16, (value >> 8) & 255, value & 255];
    return `rgb(${rgb.map((channel, index) => Math.round(lerp(base[index], channel, clamp(level)))).join(',')})`;
  }

  function vignette(g) {
    if (!vignetteCanvas) {
      vignetteCanvas = canvas(W, H);
      const v = vignetteCanvas.getContext('2d');
      const gradient = v.createRadialGradient(W / 2, H / 2, H * .38, W / 2, H / 2, H * .86);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,.6)');
      v.fillStyle = gradient;
      v.fillRect(0, 0, W, H);
    }
    g.drawImage(vignetteCanvas, 0, 0);
  }

  function scanlines(g, alpha) {
    g.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  }

  function noise(index) {
    if (!noiseFrames) {
      const rnd = seeded(99);
      noiseFrames = Array.from({ length: 8 }, () => {
        const frame = canvas(320, 240);
        const g = frame.getContext('2d');
        const data = g.createImageData(320, 240);
        for (let i = 0; i < data.data.length; i += 4) {
          const value = rnd() * 255;
          data.data[i] = value;
          data.data[i + 1] = value;
          data.data[i + 2] = value * 1.04;
          data.data[i + 3] = 255;
        }
        g.putImageData(data, 0, 0);
        return frame;
      });
    }
    return noiseFrames[index % noiseFrames.length];
  }

  function drawNoise(g, t, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.imageSmoothingEnabled = false;
    g.drawImage(noise(Math.floor(t * 30)), 0, 0, W, H);
    g.restore();
  }

  function shake(g, r, amount) {
    if (r < 0 || r > .4) return;
    const k = amount * (1 - r / .4);
    g.translate(Math.sin(r * 95) * k, Math.cos(r * 71) * k * .6);
  }

  function flash(g, alpha, color = '255,255,255') {
    if (alpha <= .005) return;
    g.fillStyle = `rgba(${color},${clamp(alpha)})`;
    g.fillRect(-40, -40, W + 80, H + 80);
  }

  function pixelEllipse(g, cx, cy, rx, ry, color) {
    g.fillStyle = color;
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + .5)) ** 2)));
      g.fillRect(Math.round(cx) - half, Math.round(cy) + y, half * 2 + 1, 1);
    }
  }

  function pixelLine(g, x0, y0, x1, y1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) g.fillRect(Math.round(lerp(x0, x1, i / steps)), Math.round(lerp(y0, y1, i / steps)), 1, 1);
  }

  function pixelRing(g, cx, cy, radius, color, size = 1) {
    g.fillStyle = color;
    const steps = Math.max(12, Math.ceil(radius * 6.3));
    for (let i = 0; i < steps; i++) {
      const angle = i / steps * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius), size, size);
    }
  }

  function drawCoinLogo(s, l, y, q, r) {
    const fg = s.face.getContext('2d');
    const palette = ['#fff6a8', '#ffe14a', '#ffc21a', '#ff9a1f', '#ff6a1f', '#ff9a1f', '#ffc21a', '#ffe14a'];
    const shift = Math.floor(q * (r >= 0 && r < 1.2 ? 24 : 8));
    fg.globalCompositeOperation = 'source-over';
    for (let row = 0; row < s.face.height; row += 2) {
      fg.fillStyle = palette[(row / 2 + shift) % palette.length];
      fg.fillRect(0, row, s.face.width, 2);
    }
    fg.globalCompositeOperation = 'destination-in';
    fg.drawImage(s.mask, 0, 0);
    const x = LW / 2 - 96;
    l.drawImage(s.blue, x + 4, y + 4);
    l.drawImage(s.red, x + 2, y + 2);
    l.drawImage(s.face, x, y);
  }

  function crtLogo() {
    const logo = canvas(820, 190);
    const g = logo.getContext('2d');
    g.font = `120px ${PX}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f4fff6';
    g.fillText('RYCADE', 410, 95);
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < logo.height; y += 8) g.fillRect(0, y, logo.width, 3);
    return logo;
  }

  const scenes = {
    coin: {
      init(rnd) {
        const low = canvas(LW, LH);
        const mask = canvas(200, 40);
        const mg = mask.getContext('2d');
        mg.font = `32px ${PX}`;
        mg.textBaseline = 'top';
        mg.fillStyle = '#fff';
        mg.fillText('RYCADE', 0, 4);
        return {
          low,
          lg: low.getContext('2d'),
          mask,
          face: canvas(200, 40),
          red: tinted(mask, '#e8213a'),
          blue: tinted(mask, '#2a4cff'),
          stars: Array.from({ length: 220 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: .05 + rnd() * .95, k: rnd() })),
          sparks: Array.from({ length: 90 }, () => ({
            angle: rnd() * Math.PI * 2,
            speed: 70 + rnd() * 240,
            size: rnd() < .3 ? 2 : 1,
            life: .5 + rnd() * .9,
            color: ['#ffe14a', '#ff2f45', '#3f7bff', '#2fdc6a', '#ffffff'][Math.floor(rnd() * 5)]
          })),
          rnd,
          last: null
        };
      },
      draw(g, t, s, still) {
        const q = still ? t : Math.floor(t * 30) / 30;
        const r = q - REVEAL;
        const l = s.lg;
        l.fillStyle = '#000';
        l.fillRect(0, 0, LW, LH);

        const dt = still || s.last === null ? 0 : clamp(q - s.last, 0, .1);
        s.last = q;
        const speed = r < 0 ? .045 + 1.8 * span(q, 3.2, REVEAL) ** 2.2 : .045 + 1.8 * Math.exp(-r * 2.8);
        const starAlpha = span(q, .4, 1.8);
        for (const star of s.stars) {
          star.z -= speed * dt;
          if (star.z <= .03) {
            star.z = 1;
            star.x = s.rnd() * 2 - 1;
            star.y = s.rnd() * 2 - 1;
          }
          if (star.k > starAlpha) continue;
          const px = LW / 2 + star.x / star.z * 95;
          const py = LH / 2 + star.y / star.z * 95;
          if (px < 0 || px >= LW || py < 0 || py >= LH) continue;
          const near = 1 - star.z;
          l.fillStyle = near > .6 ? '#ffffff' : near > .3 ? '#a8b4ff' : '#4a4f8a';
          if (speed > .3) {
            const tailZ = Math.min(1, star.z + speed * .07);
            pixelLine(l, LW / 2 + star.x / tailZ * 95, LH / 2 + star.y / tailZ * 95, px, py);
          } else {
            const size = near > .75 ? 2 : 1;
            l.fillRect(Math.round(px), Math.round(py), size, size);
          }
        }

        if (q > .9) {
          text(l, 'CREDIT', 262, 14, 8, '#ffffff', { align: 'right' });
          text(l, still || q >= 3.62 ? '01' : '00', 270, 14, 8, still || q >= 3.62 ? '#ffe14a' : '#ffffff', { align: 'left' });
        }

        const logoY = r < 0 ? Math.round(lerp(-44, 68, span(q, 4.2, REVEAL) ** 2)) : 68 - (still || r >= .5 ? 0 : Math.round(Math.abs(Math.sin(r * Math.PI * 4)) * 8 * (1 - r / .5)));
        if (r < 0) {
          if (q > .8 && q < 3.62 && blink(q, .8, .4)) text(l, 'INSERT COIN', LW / 2, 62, 8, '#ffe14a');
          if (q > 1) {
            l.fillStyle = '#4a4a58';
            l.fillRect(151, 149, 18, 31);
            l.fillStyle = '#24242c';
            l.fillRect(152, 150, 16, 29);
            const glow = span(q, 3.25, 3.62) - span(q, 3.62, 4.2);
            l.fillStyle = glow > .66 ? '#ffd21f' : glow > .33 ? '#ff9a1f' : q > 3.62 ? '#7a3a10' : '#5a2a0c';
            l.fillRect(158, 154, 5, 21);
            l.fillStyle = '#000';
            l.fillRect(159, 155, 3, 19);
          }
          if (q > 2 && q < 3.62) {
            const drop = span(q, 2, 3.1);
            const y = lerp(-10, 164, drop * drop);
            const rx = Math.round(lerp(1 + 5 * Math.abs(Math.cos(q * 11)), 1, span(q, 2.85, 3.3)));
            const ry = Math.round(7 * (1 - span(q, 3.35, 3.6)));
            if (ry > 0) {
              const deep = span(q, 3.35, 3.6) > .5;
              pixelEllipse(l, 160, y, rx > 1 ? rx + 1 : rx, ry + 1, deep ? '#5a3a00' : '#a86a00');
              pixelEllipse(l, 160, y, rx, ry, deep ? '#b88a10' : '#ffc21a');
              if (rx > 2) {
                l.fillStyle = '#fff6a8';
                l.fillRect(160 - Math.floor(rx / 2), Math.round(y) - 3, 1, 3);
              }
            }
          }
          if (q >= 4.2) drawCoinLogo(s, l, logoY, q, r);
        } else {
          if (!still) {
            [0, .1, .2].forEach((delay, index) => {
              const ring = r - delay;
              if (ring > 0 && ring < .9) pixelRing(l, LW / 2, logoY + 18, ring * 260, ['#ffe14a', '#ff2f45', '#3f7bff'][index], 2);
            });
            for (const spark of s.sparks) {
              if (r >= spark.life) continue;
              const distance = spark.speed * r * (1 - r * .3);
              l.fillStyle = spark.color;
              l.fillRect(Math.round(LW / 2 + Math.cos(spark.angle) * distance), Math.round(logoY + 18 + Math.sin(spark.angle) * distance + 70 * r * r), spark.size, spark.size);
            }
          }
          drawCoinLogo(s, l, logoY, q, r);
          if (blink(q, 6.7, .55, still)) text(l, 'PRESS START', LW / 2, 166, 8, '#ffe14a');
          if (still || q >= 7.2) text(l, '(C) 2026 RYAN POLASKY', LW / 2, 220, 8, '#7c7c7c');
          if (!still && r < 2 / 30) {
            l.fillStyle = '#fff';
            l.fillRect(0, 0, LW, LH);
          } else if (!still && r < .3) {
            l.fillStyle = `rgba(255,255,255,${[.5, .3, .15][Math.floor((r - 2 / 30) / .08)] || 0})`;
            l.fillRect(0, 0, LW, LH);
          }
        }

        g.fillStyle = '#000';
        g.fillRect(-40, -40, W + 80, H + 80);
        const jolt = !still && r >= 0 && r < .3 ? (Math.floor(q * 30) % 2 ? 8 : -8) * Math.round(3 * (1 - r / .3)) / 3 : 0;
        g.imageSmoothingEnabled = false;
        g.drawImage(s.low, Math.round(jolt / 4) * 4, Math.round(jolt / 8) * 4, W, H);
        g.imageSmoothingEnabled = true;
      }
    },

    lights: {
      init(rnd, onLoad) {
        return {
          screens: image('/boot/lights_screens.png', onLoad),
          dust: Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd(), speed: .3 + rnd() * .9, phase: rnd() * 6.28, size: 1 + Math.floor(rnd() * 3) })),
          sparkles: Array.from({ length: 70 }, () => ({ x: rnd() * W, y: 790 + rnd() * 165, phase: rnd() * 6.28, color: ['#ff3f8a', '#ffd94a', '#3fae5a', '#5a8cff', '#ffffff'][Math.floor(rnd() * 5)] }))
        };
      },
      draw(g, t, s, still) {
        const r = t - REVEAL;
        const full = still ? 1 : outCubic(span(t, REVEAL, REVEAL + .4));
        const colors = ['#e0961a', '#8a6634', '#2163c9', '#5a35a0', '#2f9a34'];
        if (!still) shake(g, r, 5);

        g.fillStyle = '#040309';
        g.fillRect(-40, -40, W + 80, H + 80);
        const wall = g.createLinearGradient(0, 0, 0, 760);
        wall.addColorStop(0, '#120a24');
        wall.addColorStop(1, '#22143c');
        g.globalAlpha = .25 + .75 * full;
        g.fillStyle = wall;
        g.fillRect(0, 0, W, 760);
        g.globalAlpha = 1;

        const level = colors.map((_, index) => {
          const on = .85 + index * .62;
          let pre = 0;
          if (t >= on) pre = t < on + .32 && !still ? (Math.sin((t - on) * 70 + index * 3) > -.15 && Math.sin((t - on) * 23 + index) > -.55 ? .5 : .06) : .5;
          return lerp(pre, 1, full);
        });

        colors.forEach((color, index) => {
          const cx = 38 + index * 248 + 106;
          const halo = g.createRadialGradient(cx, 300, 10, cx, 300, 260);
          halo.addColorStop(0, shade(color, 1).replace('rgb', 'rgba').replace(')', `,${.32 * level[index]})`));
          halo.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = halo;
          g.fillRect(cx - 280, 20, 560, 560);
        });

        if (full > 0) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          colors.forEach((_, index) => {
            const cx = 38 + index * 248 + 106;
            const breathe = still ? .85 : .75 + .25 * Math.sin(t * .8 + index * 1.3);
            const beam = g.createLinearGradient(0, 0, 0, 760);
            beam.addColorStop(0, `rgba(255,220,255,${.07 * full * breathe})`);
            beam.addColorStop(1, 'rgba(255,220,255,0)');
            g.fillStyle = beam;
            g.beginPath();
            g.moveTo(cx - 34, 0);
            g.lineTo(cx + 34, 0);
            g.lineTo(cx + 150, 760);
            g.lineTo(cx - 150, 760);
            g.fill();
          });
          g.restore();
        }

        const blipCycle = Math.floor(t / 6.3);
        const blipLetter = !still && full === 1 && t % 6.3 < .1 && blipCycle % 2 === 0 ? (blipCycle * 7) % 6 : -1;
        const signFrame = still ? 1 : lerp(.1, 1, full);
        g.save();
        g.lineWidth = 6;
        g.strokeStyle = shade('#ff3fa4', signFrame);
        g.shadowColor = '#ff2f9a';
        g.shadowBlur = 30 * signFrame;
        roundRect(g, 420, 42, 440, 124, 6);
        g.stroke();
        g.restore();
        [...'RYCADE'].forEach((letter, index) => {
          let lit = full;
          if (!still && full < 1 && t > 2.3 + index * .14) lit = Math.max(lit, Math.sin(t * 37 + index * 11) + Math.sin(t * 53 + index * 5) > .25 ? .55 : .14);
          if (index === blipLetter) lit = .2;
          text(g, letter, 480 + index * 64, 106, 64, lit > .3 ? shade('#ff3fa4', lit, [58, 16, 48]) : '#3a1030', { glow: lit > .3 ? 34 * lit : 0, glowColor: '#ff2f9a' });
        });

        colors.forEach((color, index) => {
          const x = 38 + index * 248;
          const top = 236;
          const light = level[index];
          g.fillStyle = shade(color, .12 + .88 * light);
          g.fillRect(x, top, 212, 524);
          const body = g.createLinearGradient(x, top, x + 60, top + 524);
          body.addColorStop(0, `rgba(255,255,255,${.12 * light})`);
          body.addColorStop(.45, 'rgba(0,0,0,0)');
          body.addColorStop(1, 'rgba(0,0,0,.38)');
          g.fillStyle = body;
          g.fillRect(x, top, 212, 524);
          g.fillStyle = 'rgba(0,0,0,.28)';
          g.fillRect(x, top, 10, 524);
          g.fillRect(x + 202, top, 10, 524);
          const marquee = g.createLinearGradient(x, top + 8, x, top + 54);
          marquee.addColorStop(0, shade(color, light * 1.2, [10, 8, 14]));
          marquee.addColorStop(1, shade(color, light * .5, [10, 8, 14]));
          g.fillStyle = '#060508';
          g.fillRect(x + 8, top + 8, 196, 46);
          g.globalAlpha = light;
          g.fillStyle = marquee;
          g.fillRect(x + 12, top + 12, 188, 38);
          g.globalAlpha = 1;
          g.fillStyle = '#050505';
          g.fillRect(x + 18, top + 66, 176, 150);

          const sx = x + 26;
          const sy = top + 74;
          const sw = 160;
          const sh = 134;
          if (r >= 0 || still) {
            const open = still ? 1 : outCubic(span(r, index * .07, index * .07 + .3));
            const height = sh * open;
            g.save();
            g.beginPath();
            g.rect(sx, sy + (sh - height) / 2, sw, height);
            g.clip();
            if (loaded(s.screens)) {
              const count = [18, 18, 16, 11, 6][index];
              const frame = still ? count - 1 : Math.floor(Math.max(0, r) / .14 + index * 5) % count;
              g.imageSmoothingEnabled = false;
              g.drawImage(s.screens, frame * 86 + 6, index * 62, 74, 62, sx, sy, sw, sh);
              g.imageSmoothingEnabled = true;
            }
            g.fillStyle = 'rgba(0,0,0,.25)';
            for (let y = sy; y < sy + sh; y += 3) g.fillRect(sx, y, sw, 1);
            if (!still && open < 1) {
              g.fillStyle = `rgba(255,255,255,${1 - open})`;
              g.fillRect(sx, sy, sw, sh);
            }
            g.restore();
          } else if (light > 0) {
            g.fillStyle = `rgba(30,40,70,${light * .5})`;
            g.fillRect(sx, sy, sw, sh);
          }

          g.fillStyle = shade('#2c2c38', .3 + .7 * light);
          g.fillRect(x, top + 232, 212, 42);
          g.fillStyle = shade('#ff3f3f', light);
          g.beginPath();
          g.arc(x + 52, top + 253, 9, 0, Math.PI * 2);
          g.fill();
          ['#ffd21f', '#ff3f3f', '#3f7bff'].forEach((button, buttonIndex) => {
            g.fillStyle = shade(button, light);
            g.beginPath();
            g.arc(x + 112 + buttonIndex * 26, top + 253, 7, 0, Math.PI * 2);
            g.fill();
          });

          g.fillStyle = 'rgba(0,0,0,.18)';
          g.fillRect(x + 66, top + 318, 80, 130);
          const coinPulse = still ? 1 : .75 + .25 * Math.sin(t * 2.4 + index);
          g.save();
          g.shadowColor = '#ff3f8a';
          g.shadowBlur = 18 * light * coinPulse;
          g.fillStyle = shade('#ff3f8a', light * coinPulse);
          g.fillRect(x + 78, top + 344, 22, 32);
          g.fillRect(x + 112, top + 344, 22, 32);
          g.restore();
        });

        const floor = g.createLinearGradient(0, 760, 0, H);
        floor.addColorStop(0, '#0f0d24');
        floor.addColorStop(1, '#05040c');
        g.fillStyle = floor;
        g.fillRect(0, 760, W, 200);
        g.save();
        g.globalAlpha = .2 * (.25 + .75 * full);
        g.translate(0, 1520);
        g.scale(1, -1);
        g.drawImage(g.canvas, 0, 560 * pixelScale, W * pixelScale, 200 * pixelScale, 0, 560, W, 200);
        g.restore();
        const fade = g.createLinearGradient(0, 760, 0, 940);
        fade.addColorStop(0, 'rgba(8,7,20,0)');
        fade.addColorStop(1, 'rgba(5,4,12,.95)');
        g.fillStyle = fade;
        g.fillRect(0, 760, W, 200);

        s.sparkles.forEach(sparkle => {
          const a = full * (still ? .5 : .3 + .7 * Math.max(0, Math.sin(t * 1.6 + sparkle.phase)));
          g.globalAlpha = a * .7;
          g.fillStyle = sparkle.color;
          g.fillRect(sparkle.x, sparkle.y, 10, 4);
        });
        g.globalAlpha = 1;

        s.dust.forEach(mote => {
          const x = mote.x * W + (still ? 0 : Math.sin(t * .35 + mote.phase) * 24);
          const y = ((mote.y * 760 - (still ? 0 : t * mote.speed * 18)) % 760 + 760) % 760;
          g.fillStyle = `rgba(255,225,250,${full * (still ? .35 : .25 + .3 * Math.sin(t * 1.8 + mote.phase))})`;
          g.fillRect(x, y, mote.size, mote.size);
        });

        const welcome = still ? 1 : span(t, 5.3, 6);
        text(g, 'WELCOME BACK', W / 2, 870 - 14 * (1 - outCubic(welcome)), 34, '#ffd94a', { glow: still ? 18 : 14 + 8 * Math.sin(t * 1.4), alpha: welcome });
        if (!still && r >= 0) {
          flash(g, .55 * Math.exp(-r * 6));
          flash(g, .3 * Math.exp(-r * 2.5), '255,63,164');
        }
      }
    },

    crt: {
      init() {
        const logo = crtLogo();
        return {
          logo,
          red: tinted(logo, '#ff0000'),
          green: tinted(logo, '#00ff00'),
          blue: tinted(logo, '#0000ff'),
          glow: glowOf(logo, 'rgba(150,255,190,.85)', 40)
        };
      },
      draw(g, t, s, still) {
        const r = t - REVEAL;
        g.fillStyle = '#000';
        g.fillRect(-40, -40, W + 80, H + 80);
        if (!still) shake(g, r, 7);
        const channel = t < 2.65 ? 1 : t < 3.35 ? 2 : 3;

        if (!still && r < 0) {
          if (t >= .55 && t < .8) {
            g.save();
            g.shadowColor = '#dfe9ff';
            g.shadowBlur = 40;
            g.fillStyle = '#f4f8ff';
            g.beginPath();
            g.arc(W / 2, H / 2, 3 + 6 * span(t, .55, .8), 0, Math.PI * 2);
            g.fill();
            g.restore();
          } else if (t >= .8 && t < 1.25) {
            const width = W * outCubic(span(t, .8, 1.25));
            g.save();
            g.shadowColor = '#cfe0ff';
            g.shadowBlur = 30;
            g.fillStyle = '#f4f8ff';
            g.fillRect(W / 2 - width / 2, H / 2 - 2, width, 4);
            g.restore();
          } else if (t >= 1.25 && t < 1.7) {
            const height = lerp(4, H, outCubic(span(t, 1.25, 1.7)));
            g.save();
            g.beginPath();
            g.rect(0, H / 2 - height / 2, W, height);
            g.clip();
            drawNoise(g, t, 1);
            flash(g, (1 - span(t, 1.25, 1.7)) * .75, '235,242,255');
            g.restore();
          } else if (t >= 1.7) {
            const blank = [1.95, 2.65, 3.35].some(at => t >= at && t < at + .07);
            if (!blank) {
              drawNoise(g, t, lerp(.85, .5, span(t, 1.7, 4.3)));
              const bar = ((t - 1.7) * 420) % (H + 160) - 160;
              g.fillStyle = 'rgba(0,0,0,.4)';
              g.fillRect(0, bar, W, 120);
              g.fillStyle = 'rgba(255,255,255,.08)';
              g.fillRect(0, bar + 120, W, 3);
              if (t > 3.35) {
                const settle = span(t, 3.35, REVEAL);
                const tear = 70 * (1 - settle);
                const slip = Math.sin(t * 9) * 36 * (1 - settle);
                const top = 420 - s.logo.height / 2 + slip;
                g.globalAlpha = .15 + .55 * settle;
                for (let y = 0; y < s.logo.height; y += 6) {
                  const offset = Math.sin(y * .11 + t * 23) * tear;
                  g.drawImage(s.logo, 0, y, s.logo.width, 6, W / 2 - s.logo.width / 2 + offset, top + y, s.logo.width, 6);
                }
                g.globalAlpha = 1;
              }
            }
            if (t >= 1.95) text(g, `CH 0${channel}`, 1180, 62, 32, '#3cf27e', { align: 'right', glow: 12 });
          }
          return;
        }

        const breathe = still ? .6 : .52 + .14 * Math.sin(t * 1.3);
        centered(g, s.glow, W / 2, 420, 1, still || r >= .5 ? breathe : lerp(1.2, breathe, r / .5));
        const jitter = !still && r > 3 && t % 9 < .12;
        const split = still ? 0 : 48 * Math.exp(-r * 6) + (jitter ? 7 : 0);
        g.globalCompositeOperation = 'lighter';
        centered(g, s.red, W / 2 - split, 420);
        centered(g, s.green, W / 2, 420 + split * .15);
        centered(g, s.blue, W / 2 + split, 420);
        g.globalCompositeOperation = 'source-over';
        if (!still && r < .25) drawNoise(g, t, .55 * (1 - r / .25));

        text(g, 'CH 03', 1180, 62, 32, '#3cf27e', { align: 'right', glow: 12 });
        text(g, 'PRESS START', W / 2, 640, 30, '#ffffff', { glow: 18, glowColor: '#3cf27e', alpha: blink(t, 6.8, .55, still) ? 1 : 0 });

        if (!still) {
          const roll = ((t * 90) % (H + 260)) - 260;
          const band = g.createLinearGradient(0, roll, 0, roll + 200);
          band.addColorStop(0, 'rgba(160,255,190,0)');
          band.addColorStop(.6, 'rgba(160,255,190,.03)');
          band.addColorStop(1, 'rgba(160,255,190,0)');
          g.fillStyle = band;
          g.fillRect(0, roll, W, 200);
          if (jitter) g.drawImage(g.canvas, 0, 380 * pixelScale, W * pixelScale, 80 * pixelScale, 16, 380, W, 80);
          flash(g, .85 * Math.exp(-r * 9));
        }
      }
    }
  };

  const fontsReady = () => Promise.all([document.fonts?.load(`32px ${PX}`), document.fonts?.ready]).catch(() => {});

  function render(g, id, state, t, still, withScanlines) {
    pixelScale = g.canvas.width / W;
    g.save();
    g.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    g.save();
    scenes[id].draw(g, t, state, still);
    g.restore();
    vignette(g);
    if (withScanlines) scanlines(g, id === 'crt' ? .26 : .16);
    g.restore();
  }

  async function play(element, id, { clock, still = false, scanlines: withScanlines = true }) {
    stop();
    const token = { raf: 0 };
    run = token;
    const g = element.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, element.width, element.height);
    await fontsReady();
    if (run !== token) return;
    const frame = () => {
      if (run !== token) return;
      const t = still ? IDLE : clock();
      if (t === null || t < 0) {
        g.fillStyle = '#000';
        g.fillRect(0, 0, element.width, element.height);
      } else {
        render(g, id, state, t, still, withScanlines);
      }
      if (!still) token.raf = requestAnimationFrame(frame);
    };
    const state = scenes[id].init(seeded((Date.now() % 2147483645) + 1), () => still && frame());
    frame();
  }

  function stop() {
    if (run) cancelAnimationFrame(run.raf);
    run = null;
  }

  async function thumb(element, id) {
    await fontsReady();
    const full = canvas(W, H);
    const fg = full.getContext('2d');
    const tg = element.getContext('2d');
    const draw = () => {
      if (!element.isConnected) return;
      render(fg, id, state, IDLE, true, true);
      tg.drawImage(full, 0, 0, element.width, element.height);
    };
    const state = scenes[id].init(seeded(7), draw);
    draw();
  }

  window.rycadeBoot = { play, stop, thumb, REVEAL };
})();
