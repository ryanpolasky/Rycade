(() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    window.rycadeAudio = { play() {}, setVolumes() {}, setSoundSet() {}, async playBootAudio() {}, stopBootAudio() {} };
    return;
  }

  const events = [
    'move', 'letter', 'confirm', 'launch', 'back',
    'tab', 'toggle', 'error', 'notification', 'open', 'close'
  ];
  const categoriesByEvent = {
    move: 'navigation',
    letter: 'navigation',
    tab: 'navigation',
    open: 'navigation',
    close: 'navigation',
    back: 'confirm',
    toggle: 'navigation',
    confirm: 'confirm',
    launch: 'confirm',
    error: 'confirm',
    notification: 'notifications'
  };
  const sets = ['cabinet', 'chip', 'neo'];

  const ctxAssets = new WeakMap();
  function assets(ctx) {
    let cached = ctxAssets.get(ctx);
    if (cached) return cached;
    const noiseLen = ctx.sampleRate * 2;
    const noise = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noise.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const impulses = new Map();
    const pulses = new Map();
    cached = {
      noise,
      impulse(seconds, curve) {
        const key = `${seconds}:${curve}`;
        if (impulses.has(key)) return impulses.get(key);
        const length = Math.ceil(seconds * ctx.sampleRate);
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = buffer.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, curve);
          }
        }
        impulses.set(key, buffer);
        return buffer;
      },
      pulse(duty) {
        if (pulses.has(duty)) return pulses.get(duty);
        const real = new Float32Array(64);
        const imaginary = new Float32Array(64);
        for (let harmonic = 1; harmonic < real.length; harmonic++) {
          real[harmonic] = Math.sin(2 * Math.PI * harmonic * duty) / (Math.PI * harmonic);
          imaginary[harmonic] = (1 - Math.cos(2 * Math.PI * harmonic * duty)) / (Math.PI * harmonic);
        }
        const wave = ctx.createPeriodicWave(real, imaginary);
        pulses.set(duty, wave);
        return wave;
      }
    };
    ctxAssets.set(ctx, cached);
    return cached;
  }

  function env(ctx, destination, t, { a = .004, hold = 0, dec = .12, peak = 1 }) {
    const gain = ctx.createGain();
    const releaseAt = t + a + hold;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.setTargetAtTime(0, releaseAt, dec / 5);
    gain.connect(destination);
    return { gain, end: releaseAt + dec * 1.4 };
  }

  function tone(ctx, destination, t, options, sources) {
    const osc = ctx.createOscillator();
    if (options.wave) osc.setPeriodicWave(options.wave);
    else osc.type = options.type || 'sine';
    const pitch = options.pitch || 1;
    osc.frequency.setValueAtTime(Math.max(1, options.f * pitch), t);
    if (options.f1) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.f1 * pitch), t + (options.slide || .06));
    }
    if (options.detune) osc.detune.value = options.detune;
    const envelope = env(ctx, destination, t, options);
    osc.connect(envelope.gain);
    osc.start(t);
    osc.stop(envelope.end + .05);
    sources.push(osc);
    return envelope.end;
  }

  function hiss(ctx, destination, t, options, sources) {
    const source = ctx.createBufferSource();
    source.buffer = assets(ctx).noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = options.type || 'bandpass';
    filter.frequency.setValueAtTime(options.f, t);
    if (options.f1) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.f1), t + (options.slide || .08));
    }
    filter.Q.value = options.q || .9;
    const envelope = env(ctx, destination, t, options);
    source.connect(filter);
    filter.connect(envelope.gain);
    source.start(t);
    source.stop(envelope.end + .05);
    sources.push(source);
    return envelope.end;
  }

  function fm(ctx, destination, t, options, sources) {
    const pitch = options.pitch || 1;
    const carrierFreq = options.f * pitch;
    const carrier = ctx.createOscillator();
    carrier.type = options.carType || 'sine';
    carrier.frequency.setValueAtTime(Math.max(1, carrierFreq), t);
    if (options.f1) {
      carrier.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.f1 * pitch), t + (options.slide || .12));
    }
    if (options.detune) carrier.detune.value = options.detune;
    const modulator = ctx.createOscillator();
    modulator.type = options.modType || 'sine';
    modulator.frequency.setValueAtTime(Math.max(1, carrierFreq * (options.ratio || 2)), t);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(Math.max(.01, (options.index ?? 1) * carrierFreq), t);
    depth.gain.exponentialRampToValueAtTime(
      Math.max(.01, (options.indexEnd ?? .05) * carrierFreq),
      t + (options.indexDec || options.dec || .18));
    modulator.connect(depth);
    depth.connect(carrier.frequency);
    const envelope = env(ctx, destination, t, options);
    carrier.connect(envelope.gain);
    carrier.start(t);
    carrier.stop(envelope.end + .05);
    modulator.start(t);
    modulator.stop(envelope.end + .05);
    sources.push(carrier, modulator);
    return envelope.end;
  }

  function pan(ctx, destination, value) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = value;
    panner.connect(destination);
    return panner;
  }

  const designs = {
    cabinet: {
      move: {
        tail: .14,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { f: 2900, q: 1.4, a: .0015, dec: .018, peak: .5 }, s);
          return tone(c, bus, t, { f: 640 * p, f1: 430 * p, slide: .04, type: 'triangle', a: .0015, dec: .045, peak: .85 }, s);
        }
      },
      letter: {
        tail: .26,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { f: 2600, q: 1.3, a: .0015, dec: .02, peak: .4 }, s);
          tone(c, bus, t, { f: 620 * p, f1: 470 * p, slide: .05, type: 'triangle', a: .0015, dec: .05, peak: .7 }, s);
          hiss(c, bus, t + .058, { f: 3400, q: 1.3, a: .0015, dec: .024, peak: .45 }, s);
          return tone(c, bus, t + .058, { f: 880 * p, f1: 690 * p, slide: .05, a: .0015, dec: .07, peak: .8 }, s);
        }
      },
      tab: {
        tail: .22,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'lowpass', f: 1400, a: .002, dec: .05, peak: .3 }, s);
          return tone(c, bus, t, { f: 440 * p, f1: 570 * p, slide: .08, a: .006, dec: .11, peak: .75 }, s);
        }
      },
      toggle: {
        tail: .12,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 4800, a: .0008, dec: .016, peak: .28 }, s);
          return tone(c, bus, t, { f: 1150 * p, f1: 840 * p, slide: .025, type: 'triangle', a: .001, dec: .045, peak: .6 }, s);
        }
      },
      open: {
        tail: 1.15,
        wet: true,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { f: 700, f1: 2600, slide: .28, q: .8, a: .03, hold: .08, dec: .28, peak: .2 }, s);
          fm(c, bus, t + .16, { f: 1568, ratio: 4.2, index: .8, indexEnd: .05, indexDec: .3, a: .002, dec: .4, peak: .14 }, s);
          return tone(c, bus, t, { f: 392 * p, f1: 784 * p, slide: .2, a: .012, hold: .04, dec: .32, peak: .5 }, s);
        }
      },
      close: {
        tail: .55,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { f: 2300, f1: 600, slide: .26, q: .8, a: .012, dec: .28, peak: .18 }, s);
          return tone(c, bus, t, { f: 784 * p, f1: 392 * p, slide: .2, a: .01, dec: .3, peak: .5 }, s);
        }
      },
      confirm: {
        tail: 1.35,
        wet: true,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { f: 659.25, a: .004, dec: .5, peak: .5 }, s);
          fm(c, bus, t, { f: 659.25, ratio: 3.01, index: .9, indexEnd: .04, indexDec: .24, a: .003, dec: .5, peak: .13 }, s);
          tone(c, bus, t + .085, { f: 880, a: .004, dec: .55, peak: .55 }, s);
          fm(c, bus, t + .085, { f: 880, ratio: 2.01, index: 1.1, indexEnd: .05, indexDec: .3, a: .003, dec: .5, peak: .11 }, s);
          return tone(c, bus, t + .17, { f: 1318.5, a: .004, dec: .5, peak: .16 }, s);
        }
      },
      back: {
        tail: .8,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { f: 880, a: .004, dec: .42, peak: .5 }, s);
          fm(c, bus, t, { f: 880, ratio: 2.01, index: .9, indexEnd: .04, indexDec: .22, a: .003, dec: .4, peak: .1 }, s);
          tone(c, bus, t + .085, { f: 659.25, a: .004, dec: .48, peak: .5 }, s);
          return tone(c, bus, t + .17, { f: 523.25, a: .004, dec: .4, peak: .14 }, s);
        }
      },
      launch: {
        tail: 1.9,
        wet: true,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'lowpass', f: 400, f1: 3400, slide: .4, a: .05, hold: .15, dec: .5, peak: .14 }, s);
          tone(c, bus, t + .1, { f: 130.8, a: .006, dec: .6, peak: .3 }, s);
          tone(c, bus, t + .1, { f: 523.25, a: .005, dec: .65, peak: .4 }, s);
          fm(c, bus, t + .1, { f: 523.25, ratio: 2.99, index: 1, indexEnd: .06, indexDec: .3, a: .004, dec: .55, peak: .1 }, s);
          tone(c, bus, t + .19, { f: 659.25, a: .005, dec: .7, peak: .45 }, s);
          fm(c, bus, t + .19, { f: 659.25, ratio: 3.02, index: .9, indexEnd: .05, indexDec: .3, a: .004, dec: .6, peak: .1 }, s);
          tone(c, bus, t + .28, { f: 783.99, a: .005, dec: .8, peak: .48 }, s);
          fm(c, bus, t + .28, { f: 783.99, ratio: 2.01, index: 1.1, indexEnd: .05, indexDec: .35, a: .004, dec: .65, peak: .12 }, s);
          tone(c, bus, t + .4, { f: 1046.5, a: .005, dec: .85, peak: .3 }, s);
          return fm(c, bus, t + .4, { f: 1568, ratio: 4.01, index: .7, indexEnd: .04, indexDec: .5, a: .004, dec: .8, peak: .09 }, s);
        }
      },
      error: {
        tail: .55,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'lowpass', f: 260, a: .002, dec: .06, peak: .28 }, s);
          tone(c, bus, t, { f: 150, f1: 62, slide: .1, a: .003, dec: .16, peak: .85 }, s);
          hiss(c, bus, t + .15, { type: 'lowpass', f: 220, a: .002, dec: .06, peak: .22 }, s);
          return tone(c, bus, t + .15, { f: 120, f1: 55, slide: .1, a: .003, dec: .18, peak: .75 }, s);
        }
      },
      notification: {
        tail: 1.35,
        wet: true,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { f: 987.77, a: .004, dec: .45, peak: .3 }, s);
          fm(c, bus, t, { f: 987.77, ratio: 3.5, index: 1.1, indexEnd: .06, indexDec: .3, a: .003, dec: .5, peak: .3 }, s);
          tone(c, bus, t + .12, { f: 1318.5, a: .004, dec: .5, peak: .28 }, s);
          return fm(c, bus, t + .12, { f: 1318.5, ratio: 3.5, index: 1, indexEnd: .05, indexDec: .32, a: .003, dec: .55, peak: .27 }, s);
        }
      }
    },
    chip: {
      move: {
        tail: .09,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 5200, a: .0005, dec: .013, peak: .32 }, s);
          return tone(c, bus, t, { wave: assets(c).pulse(.25), f: 1180 * p, a: .001, hold: .012, dec: .028, peak: .5 }, s);
        }
      },
      letter: {
        tail: .22,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 5000, a: .0005, dec: .015, peak: .3 }, s);
          tone(c, bus, t, { wave: assets(c).pulse(.5), f: 659.25 * p, a: .001, hold: .02, dec: .04, peak: .5 }, s);
          return tone(c, bus, t + .05, { wave: assets(c).pulse(.25), f: 987.77 * p, a: .001, hold: .03, dec: .1, peak: .55 }, s);
        }
      },
      tab: {
        tail: .17,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 6000, a: .0005, dec: .012, peak: .22 }, s);
          return tone(c, bus, t, { wave: assets(c).pulse(.5), f: 587.33 * p, a: .001, hold: .03, dec: .09, peak: .5 }, s);
        }
      },
      toggle: {
        tail: .1,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 6000, a: .0005, dec: .012, peak: .28 }, s);
          return tone(c, bus, t, { wave: assets(c).pulse(.125), f: 1568 * p, a: .001, hold: .008, dec: .04, peak: .45 }, s);
        }
      },
      open: {
        tail: .34,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { wave: assets(c).pulse(.5), f: 523.25, a: .001, hold: .025, dec: .05, peak: .5 }, s);
          tone(c, bus, t + .045, { wave: assets(c).pulse(.25), f: 659.25, a: .001, hold: .025, dec: .05, peak: .5 }, s);
          return tone(c, bus, t + .09, { wave: assets(c).pulse(.125), f: 783.99, a: .001, hold: .05, dec: .14, peak: .55 }, s);
        }
      },
      close: {
        tail: .34,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { wave: assets(c).pulse(.125), f: 783.99, a: .001, hold: .025, dec: .05, peak: .5 }, s);
          tone(c, bus, t + .045, { wave: assets(c).pulse(.25), f: 659.25, a: .001, hold: .025, dec: .05, peak: .5 }, s);
          return tone(c, bus, t + .09, { wave: assets(c).pulse(.5), f: 523.25, a: .001, hold: .04, dec: .12, peak: .55 }, s);
        }
      },
      confirm: {
        tail: .45,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { wave: assets(c).pulse(.5), f: 659.25, a: .001, hold: .03, dec: .06, peak: .5 }, s);
          tone(c, bus, t + .055, { wave: assets(c).pulse(.25), f: 987.77, a: .001, hold: .03, dec: .06, peak: .5 }, s);
          return tone(c, bus, t + .11, { wave: assets(c).pulse(.125), f: 1318.5, a: .001, hold: .06, dec: .24, peak: .55 }, s);
        }
      },
      back: {
        tail: .4,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { wave: assets(c).pulse(.25), f: 987.77, a: .001, hold: .03, dec: .06, peak: .5 }, s);
          return tone(c, bus, t + .06, { wave: assets(c).pulse(.5), f: 659.25, a: .001, hold: .05, dec: .22, peak: .55 }, s);
        }
      },
      launch: {
        tail: .75,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 5500, a: .0005, dec: .02, peak: .22 }, s);
          tone(c, bus, t, { wave: assets(c).pulse(.25), f: 700, f1: 987.77, slide: .06, a: .001, hold: .05, dec: .06, peak: .45 }, s);
          tone(c, bus, t + .07, { type: 'triangle', f: 329.63, a: .002, hold: .12, dec: .32, peak: .25 }, s);
          return tone(c, bus, t + .07, { wave: assets(c).pulse(.125), f: 1318.5, a: .001, hold: .14, dec: .45, peak: .55 }, s);
        }
      },
      error: {
        tail: .5,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'lowpass', f: 320, a: .001, dec: .05, peak: .2 }, s);
          tone(c, bus, t, { type: 'triangle', f: 165, f1: 82, slide: .09, a: .002, dec: .14, peak: .85 }, s);
          hiss(c, bus, t + .14, { type: 'lowpass', f: 280, a: .001, dec: .05, peak: .18 }, s);
          return tone(c, bus, t + .14, { type: 'triangle', f: 147, f1: 73, slide: .09, a: .002, dec: .17, peak: .8 }, s);
        }
      },
      notification: {
        tail: .5,
        build(c, bus, t, p, s) {
          tone(c, bus, t, { wave: assets(c).pulse(.5), f: 1046.5, a: .001, hold: .02, dec: .05, peak: .45 }, s);
          tone(c, bus, t + .04, { wave: assets(c).pulse(.25), f: 1318.5, a: .001, hold: .02, dec: .05, peak: .45 }, s);
          return tone(c, bus, t + .08, { wave: assets(c).pulse(.125), f: 1568, a: .001, hold: .08, dec: .3, peak: .5 }, s);
        }
      }
    },
    neo: {
      move: {
        tail: .13,
        build(c, bus, t, p, s) {
          hiss(c, bus, t, { type: 'highpass', f: 4200, a: .0008, dec: .015, peak: .22 }, s);
          return fm(c, pan(c, bus, -.12), t, { f: 700 * p, ratio: 2, index: 1.2, indexEnd: .1, indexDec: .035, a: .001, dec: .04, peak: .5 }, s);
        }
      },
      letter: {
        tail: .3,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, -.2), t, { f: 660 * p, ratio: 2, index: 1.4, indexEnd: .15, indexDec: .05, a: .001, dec: .05, peak: .5 }, s);
          return fm(c, pan(c, bus, .2), t + .06, { f: 990 * p, ratio: 3, index: 1.6, indexEnd: .1, indexDec: .09, a: .001, dec: .13, peak: .5 }, s);
        }
      },
      tab: {
        tail: .24,
        build(c, bus, t, p, s) {
          return fm(c, pan(c, bus, .1), t, { f: 880 * p, ratio: 3.5, index: 1.5, indexEnd: .08, indexDec: .12, a: .002, dec: .14, peak: .5 }, s);
        }
      },
      toggle: {
        tail: .15,
        build(c, bus, t, p, s) {
          return fm(c, pan(c, bus, -.1), t, { f: 1318 * p, ratio: 4, index: .9, indexEnd: .1, indexDec: .05, a: .001, dec: .06, peak: .45 }, s);
        }
      },
      open: {
        tail: .6,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, -.3), t, { f: 392 * p, f1: 587.33 * p, slide: .2, ratio: 2, index: 1.2, indexEnd: .3, indexDec: .3, a: .004, dec: .35, peak: .5 }, s);
          return fm(c, pan(c, bus, .3), t + .09, { f: 587.33 * p, ratio: 2.5, index: 1.4, indexEnd: .1, indexDec: .2, a: .002, dec: .3, peak: .3 }, s);
        }
      },
      close: {
        tail: .6,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, .3), t, { f: 587.33 * p, f1: 392 * p, slide: .2, ratio: 2, index: 1.2, indexEnd: .3, indexDec: .3, a: .004, dec: .35, peak: .5 }, s);
          return fm(c, pan(c, bus, -.3), t + .09, { f: 392 * p, ratio: 2.5, index: 1.4, indexEnd: .1, indexDec: .2, a: .002, dec: .3, peak: .3 }, s);
        }
      },
      confirm: {
        tail: .95,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, -.3), t, { f: 523.25, detune: -8, ratio: 3, index: 2, indexEnd: .08, indexDec: .35, a: .003, dec: .4, peak: .4 }, s);
          fm(c, pan(c, bus, .3), t, { f: 523.25, detune: 8, ratio: 2.02, index: 1.6, indexEnd: .06, indexDec: .3, a: .003, dec: .4, peak: .3 }, s);
          fm(c, pan(c, bus, -.3), t + .11, { f: 783.99, detune: -8, ratio: 3, index: 1.8, indexEnd: .07, indexDec: .35, a: .003, dec: .45, peak: .45 }, s);
          return fm(c, pan(c, bus, .3), t + .11, { f: 783.99, detune: 8, ratio: 2.02, index: 1.5, indexEnd: .05, indexDec: .3, a: .003, dec: .45, peak: .32 }, s);
        }
      },
      back: {
        tail: .9,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, -.3), t, { f: 783.99, detune: -8, ratio: 3, index: 1.8, indexEnd: .07, indexDec: .3, a: .003, dec: .38, peak: .42 }, s);
          fm(c, pan(c, bus, .3), t, { f: 783.99, detune: 8, ratio: 2.02, index: 1.4, indexEnd: .05, indexDec: .28, a: .003, dec: .38, peak: .3 }, s);
          return fm(c, pan(c, bus, 0), t + .11, { f: 523.25, detune: -6, ratio: 3, index: 2, indexEnd: .08, indexDec: .32, a: .003, dec: .42, peak: .42 }, s);
        }
      },
      launch: {
        tail: 1.3,
        build(c, bus, t, p, s) {
          fm(c, bus, t, { f: 400, f1: 1600, slide: .28, ratio: 1.5, index: 2.2, indexEnd: .4, indexDec: .4, a: .003, dec: .5, peak: .45 }, s);
          fm(c, pan(c, bus, -.4), t + .05, { f: 800, f1: 3200, slide: .3, ratio: 2, index: 1, indexEnd: .05, indexDec: .3, a: .002, dec: .4, peak: .16 }, s);
          hiss(c, bus, t + .3, { type: 'highpass', f: 5000, a: .01, dec: .3, peak: .07 }, s);
          return fm(c, pan(c, bus, .4), t + .12, { f: 2093, ratio: 3, index: 1.2, indexEnd: .06, indexDec: .4, a: .002, dec: .6, peak: .14 }, s);
        }
      },
      error: {
        tail: .55,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, -.25), t, { f: 98, detune: -14, ratio: 1.49, index: 3, indexEnd: .4, indexDec: .2, a: .003, dec: .24, peak: .65 }, s);
          fm(c, pan(c, bus, .25), t, { f: 98, detune: 14, ratio: 1.49, index: 2.6, indexEnd: .35, indexDec: .2, a: .003, dec: .24, peak: .55 }, s);
          return fm(c, pan(c, bus, 0), t + .16, { f: 82, detune: -10, ratio: 1.52, index: 2.4, indexEnd: .3, indexDec: .18, a: .003, dec: .22, peak: .5 }, s);
        }
      },
      notification: {
        tail: 1,
        build(c, bus, t, p, s) {
          fm(c, pan(c, bus, -.2), t, { f: 987.77, ratio: 3.5, index: 1.6, indexEnd: .1, indexDec: .3, a: .002, dec: .45, peak: .4 }, s);
          fm(c, pan(c, bus, .2), t + .1, { f: 1318.5, ratio: 3.5, index: 1.4, indexEnd: .08, indexDec: .3, a: .002, dec: .5, peak: .35 }, s);
          return fm(c, bus, t + .2, { f: 1975.5, ratio: 3, index: .9, indexEnd: .05, indexDec: .3, a: .002, dec: .55, peak: .18 }, s);
        }
      }
    }
  };

  const normalization = {
    cabinet: {
      move: 1.69429, letter: .47069, confirm: .51806, launch: .56701,
      back: .60426, tab: .78401, toggle: 2.24327, error: .6184,
      notification: .6436, open: .57913, close: .7403
    },
    chip: {
      move: 1.33646, letter: .34284, confirm: .56783, launch: .57695,
      back: .34589, tab: .40509, toggle: 2.88068, error: .59519,
      notification: .80931, open: .36098, close: .22053
    },
    neo: {
      move: 4.2648, letter: .86564, confirm: .84033, launch: 1.49125,
      back: 1.1743, tab: 1.58995, toggle: 3.179, error: .7781,
      notification: 1.33745, open: .84687, close: .84388
    }
  };

  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 0;
  compressor.ratio.value = 12;
  compressor.attack.value = .003;
  compressor.release.value = .08;
  const categories = Object.fromEntries(['navigation', 'confirm', 'notifications'].map(name => {
    const gain = context.createGain();
    gain.connect(master);
    return [name, gain];
  }));
  master.connect(compressor);
  compressor.connect(context.destination);

  let volumes = { master: 70, navigation: 50, confirm: 60, notifications: 60, muted: false };
  let soundSet = 'cabinet';
  let currentNavigation = null;
  let resumeRequested = false;
  let bootBuffers = null;
  let bootGeneration = 0;
  let bootVoices = [];
  const navigationVoices = [];
  const audioDebug = new URLSearchParams(location.search).get('audiodebug') === '1'
    ? {
      navStarts: 0,
      navSteps: 0,
      stepsTaken: 0,
      letterJumps: 0,
      maxConcurrentNavVoices: 0,
      eventsPlayed: Object.fromEntries(events.map(event => [event, 0]))
    }
    : null;
  if (audioDebug) window.__rycadeAudioDebug = audioDebug;

  function scheduleSound(audioContext, destination, set, eventName, {
    startAt = audioContext.currentTime,
    pitchMultiplier = 1,
    detunePercent = 0,
    normalization: gain = normalization[set][eventName]
  } = {}) {
    const spec = designs[set][eventName];
    const voiceGain = audioContext.createGain();
    voiceGain.gain.setValueAtTime(gain, startAt);
    voiceGain.connect(destination);
    if (spec.wet) {
      const convolver = audioContext.createConvolver();
      convolver.buffer = assets(audioContext).impulse(.55, 2.4);
      const wetGain = audioContext.createGain();
      wetGain.gain.value = .15;
      voiceGain.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(destination);
    }
    const sources = [];
    const pitch = pitchMultiplier * (1 + detunePercent / 100);
    const endAt = spec.build(audioContext, voiceGain, startAt, pitch, sources);
    return { gain: voiceGain, sources, startAt, endAt };
  }

  function setVolumes(next) {
    volumes = { ...volumes, ...next };
    master.gain.setTargetAtTime(volumes.muted ? 0 : volumes.master / 100, context.currentTime, .01);
    Object.entries(categories).forEach(([name, gain]) => {
      gain.gain.setTargetAtTime(volumes[name] / 100, context.currentTime, .01);
    });
  }

  function stopBootAudio() {
    bootGeneration++;
    bootVoices.forEach(({ source, gain }) => {
      source.stop();
      source.disconnect();
      gain.disconnect();
    });
    bootVoices = [];
  }

  async function playBootAudio() {
    stopBootAudio();
    const generation = bootGeneration;
    const resumed = context.resume();
    if (!bootBuffers) {
      bootBuffers = Promise.all(['/boot/rycade.wav', '/boot/rycadeping.wav'].map(async path => {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Boot audio unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      })).catch(error => {
        bootBuffers = null;
        throw error;
      });
    }
    const [buffers] = await Promise.all([bootBuffers, resumed]);
    if (generation !== bootGeneration) return null;
    const startAt = context.currentTime + .02;
    bootVoices = buffers.map((buffer, index) => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const offset = index === 1 ? 4.465 : 0;
      const level = index === 1 ? .32 : 1;
      source.buffer = buffer;
      gain.gain.setValueAtTime(level, startAt);
      if (index === 1) {
        gain.gain.setValueAtTime(level, startAt + buffer.duration - 8);
        gain.gain.linearRampToValueAtTime(0, startAt + buffer.duration);
      }
      source.connect(gain);
      gain.connect(master);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start(startAt + offset, offset);
      return { source, gain };
    });
    return startAt - context.currentTime + (context.outputLatency || context.baseLatency || 0);
  }

  function setSoundSet(nextSet) {
    if (sets.includes(nextSet)) soundSet = nextSet;
  }

  function stopCurrentNavigation(now) {
    if (!currentNavigation) return now;
    const voice = currentNavigation;
    if (voice.endAt <= now) {
      currentNavigation = null;
      return now;
    }

    const stopAt = Math.max(now, voice.startAt) + .005;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, stopAt);
    voice.sources.forEach(source => source.stop(stopAt));
    voice.endAt = stopAt;
    currentNavigation = null;
    return stopAt;
  }

  function play(eventName, options = {}) {
    if (!events.includes(eventName) || (context.state !== 'running' && !resumeRequested) || volumes.muted) return;
    const category = categoriesByEvent[eventName];
    const now = context.currentTime;
    const isNavigation = category === 'navigation';
    const startAt = isNavigation ? stopCurrentNavigation(now) : now;
    const detunePercent = eventName === 'move'
      ? (Math.random() * 4 - 2)
      : 0;
    const voice = scheduleSound(context, categories[category], soundSet, eventName, {
      startAt,
      pitchMultiplier: options.pitchMultiplier || 1,
      detunePercent
    });

    if (audioDebug) {
      audioDebug.eventsPlayed[eventName]++;
      if (isNavigation) {
        audioDebug.navStarts++;
        if (eventName === 'move') audioDebug.navSteps++;
        if (eventName === 'letter') audioDebug.letterJumps++;
      }
    }
    if (!isNavigation) return;

    const overlappingVoices = navigationVoices.filter(active => active.startAt < voice.endAt && startAt < active.endAt).length;
    if (audioDebug) {
      audioDebug.maxConcurrentNavVoices = Math.max(audioDebug.maxConcurrentNavVoices, overlappingVoices + 1);
    }
    navigationVoices.push(voice);
    currentNavigation = voice;
    let remainingSources = voice.sources.length;
    voice.sources.forEach(source => {
      source.addEventListener('ended', () => {
        remainingSources--;
        if (remainingSources > 0) return;
        const voiceIndex = navigationVoices.indexOf(voice);
        if (voiceIndex !== -1) navigationVoices.splice(voiceIndex, 1);
        if (currentNavigation === voice) currentNavigation = null;
      }, { once: true });
    });
  }

  async function renderWav(set, eventName, gainOverride) {
    if (!sets.includes(set) || !events.includes(eventName)) throw new Error('Unknown sound set or event');
    const sampleRate = 48000;
    const frameCount = Math.ceil(designs[set][eventName].tail * sampleRate) + 64;
    const offline = new OfflineAudioContext(1, frameCount, sampleRate);
    const offlineMaster = offline.createGain();
    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 12;
    limiter.attack.value = .003;
    limiter.release.value = .08;
    offlineMaster.gain.value = 1;
    offlineMaster.connect(limiter);
    limiter.connect(offline.destination);
    const offlineCategories = Object.fromEntries(['navigation', 'confirm', 'notifications'].map(name => {
      const gain = offline.createGain();
      gain.gain.value = 1;
      gain.connect(offlineMaster);
      return [name, gain];
    }));
    scheduleSound(offline, offlineCategories[categoriesByEvent[eventName]], set, eventName, {
      startAt: 0,
      pitchMultiplier: 1,
      detunePercent: 0,
      ...(gainOverride !== undefined ? { normalization: gainOverride } : {})
    });
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    let peak = 0;
    let sumSquares = 0;
    samples.forEach(sample => {
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
    });
    const rms = Math.sqrt(sumSquares / samples.length);
    const dbfs = value => value > 0 ? 20 * Math.log10(value) : -Infinity;
    const wav = encodeWav(samples, sampleRate);
    return {
      wav: base64Encode(wav),
      duration: rendered.duration,
      peakDbfs: dbfs(peak),
      rmsDbfs: dbfs(rms)
    };
  }

  function base64Encode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  }

  function encodeWav(samples, sampleRate) {
    const bytes = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(bytes);
    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    samples.forEach(sample => {
      const value = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
      offset += 2;
    });
    return bytes;
  }

  if (audioDebug) audioDebug.renderWav = renderWav;

  const resume = () => {
    if (context.state === 'suspended') {
      resumeRequested = true;
      context.resume().then(
        () => { resumeRequested = false; },
        () => { resumeRequested = false; }
      );
    }
  };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
  setVolumes(volumes);
  window.rycadeAudio = { play, setVolumes, setSoundSet, playBootAudio, stopBootAudio };
})();
