(() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    window.rycadeAudio = { play() {}, setVolumes() {}, setSoundSet() {} };
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
  const baseNormalization = {
    cabinet: {
      move: .261556, letter: .170329, confirm: .162261, launch: .162261,
      back: .166635, tab: .227829, toggle: .309051, error: .156798,
      notification: .159867, open: .227829, close: .10514
    },
    chip: {
      move: .652258, letter: .434286, confirm: .377846, launch: .377846,
      back: .391055, tab: .560433, toggle: .789766, error: .230984,
      notification: .32792, open: .560433, close: .263777
    },
    neo: {
      move: .138617, letter: .086772, confirm: .110243, launch: .127655,
      back: .104525, tab: .122799, toggle: .157608, error: .084693,
      notification: .09716, open: .122799, close: .065121
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
  const navigationVoices = [];
  const pulseWaves = new WeakMap();
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

  function baseNotes(eventName) {
    switch (eventName) {
      case 'move': return [{ frequency: 1200, duration: .025 }];
      case 'letter': return [
        { frequency: 1600, duration: .0225 },
        { frequency: 2400, duration: .0225 }
      ];
      case 'confirm':
      case 'launch': return [
        { frequency: 988, duration: .06 },
        { frequency: 1319, duration: .06 }
      ];
      case 'back':
      case 'close': return [
        { frequency: 1319, duration: .055 },
        { frequency: 988, duration: .055 }
      ];
      case 'tab':
      case 'open': return [{ frequency: 900, duration: .03 }];
      case 'toggle': return [{ frequency: 1500, duration: .02 }];
      case 'error': return [{ frequency: 150, duration: .12 }];
      case 'notification': return [
        { frequency: 988, duration: .045 },
        { frequency: 1245, duration: .045 },
        { frequency: 1568, duration: .045 }
      ];
      default: return [];
    }
  }

  function notesFor(set, eventName) {
    if (set === 'neo' && eventName === 'launch') {
      return [{ frequency: 400, endFrequency: 1600, duration: .12 }];
    }
    const factor = set === 'chip' ? .75 : 1;
    return baseNotes(eventName).map(note => ({
      ...note,
      frequency: note.frequency * factor,
      ...(note.endFrequency ? { endFrequency: note.endFrequency * factor } : {})
    }));
  }

  function durationFor(set, eventName) {
    return notesFor(set, eventName).reduce((duration, note) => duration + note.duration, 0);
  }

  function pulseWave(audioContext) {
    if (pulseWaves.has(audioContext)) return pulseWaves.get(audioContext);
    const real = new Float32Array(64);
    const imaginary = new Float32Array(64);
    const duty = .125;
    for (let harmonic = 1; harmonic < real.length; harmonic++) {
      real[harmonic] = Math.sin(2 * Math.PI * harmonic * duty) / (Math.PI * harmonic);
      imaginary[harmonic] = (1 - Math.cos(2 * Math.PI * harmonic * duty)) / (Math.PI * harmonic);
    }
    const wave = audioContext.createPeriodicWave(real, imaginary);
    pulseWaves.set(audioContext, wave);
    return wave;
  }

  function oscillatorFor(audioContext, set, frequency, detune, filter) {
    const oscillator = audioContext.createOscillator();
    if (set === 'chip' && frequency >= 300) oscillator.setPeriodicWave(pulseWave(audioContext));
    else oscillator.type = set === 'chip' ? 'triangle' : 'square';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    oscillator.connect(filter);
    return oscillator;
  }

  function scheduleSound(audioContext, destination, set, eventName, {
    startAt = audioContext.currentTime,
    pitchMultiplier = 1,
    detunePercent = 0,
    normalization = baseNormalization[set][eventName]
  } = {}) {
    const notes = notesFor(set, eventName);
    const voiceGain = audioContext.createGain();
    voiceGain.gain.setValueAtTime(normalization, startAt);
    voiceGain.connect(destination);
    const sources = [];
    let noteStart = startAt;
    const neo = set === 'neo';

    notes.forEach(note => {
      const endAt = noteStart + note.duration;
      const envelope = audioContext.createGain();
      const attackEnd = noteStart + Math.min(.0015, note.duration * .15);
      const releaseDuration = Math.min(.008, note.duration * .2);
      const releaseStart = endAt - releaseDuration;
      const decayEnd = Math.min(releaseStart, attackEnd + Math.min(.006, note.duration * .25));
      envelope.gain.setValueAtTime(.0001, noteStart);
      envelope.gain.linearRampToValueAtTime(1, attackEnd);
      envelope.gain.exponentialRampToValueAtTime(.65, decayEnd);
      envelope.gain.setValueAtTime(.65, releaseStart);
      envelope.gain.exponentialRampToValueAtTime(.0001, endAt);
      envelope.connect(voiceGain);

      const filter = neo ? audioContext.createBiquadFilter() : null;
      if (filter) {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3500, noteStart);
        filter.Q.setValueAtTime(.707, noteStart);
        filter.connect(envelope);
      }
      const pitch = pitchMultiplier * (1 + detunePercent / 100);
      const frequencies = [note.frequency * pitch];
      const detunes = [neo ? -6 : 0];
      if (neo) {
        frequencies.push(note.frequency * pitch);
        detunes.push(6);
      }
      frequencies.forEach((frequency, index) => {
        const oscillator = oscillatorFor(audioContext, set, frequency, detunes[index], filter || envelope);
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        if (note.endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency * pitch, endAt);
        }
        oscillator.start(noteStart);
        oscillator.stop(endAt);
        sources.push(oscillator);
      });
      noteStart = endAt;
    });

    return { gain: voiceGain, sources, startAt, endAt: noteStart };
  }

  function setVolumes(next) {
    volumes = { ...volumes, ...next };
    master.gain.setTargetAtTime(volumes.muted ? 0 : volumes.master / 100, context.currentTime, .01);
    Object.entries(categories).forEach(([name, gain]) => {
      gain.gain.setTargetAtTime(volumes[name] / 100, context.currentTime, .01);
    });
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

  async function renderWav(set, eventName) {
    if (!sets.includes(set) || !events.includes(eventName)) throw new Error('Unknown sound set or event');
    const sampleRate = 48000;
    const frameCount = Math.ceil(durationFor(set, eventName) * sampleRate);
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
      detunePercent: 0
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
      wav: btoa(String.fromCharCode(...new Uint8Array(wav))),
      duration: rendered.duration,
      peakDbfs: dbfs(peak),
      rmsDbfs: dbfs(rms)
    };
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
  window.rycadeAudio = { play, setVolumes, setSoundSet };
})();
