(() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    window.rycadeAudio = { play() {}, setVolumes() {} };
    return;
  }

  const files = [
    'back_001', 'bong_001', 'click_001', 'confirmation_001', 'error_001',
    'glass_001', 'glitch_001', 'open_001', 'select_001',
    'tick_001', 'toggle_001'
  ];
  const themes = {
    lightbox: { move: 'tick_001', letter: 'tick_001', tab: 'click_001', open: 'open_001', close: 'back_001', confirm: 'confirmation_001', launch: 'confirmation_001', back: 'back_001', toggle: 'toggle_001', error: 'error_001', notification: 'select_001' },
    'rycade-tv': { move: 'tick_001', letter: 'tick_001', tab: 'glitch_001', open: 'open_001', close: 'back_001', confirm: 'confirmation_001', launch: 'confirmation_001', back: 'back_001', toggle: 'click_001', error: 'error_001', notification: 'select_001' },
    'neo-gold': { move: 'tick_001', letter: 'tick_001', tab: 'bong_001', open: 'open_001', close: 'back_001', confirm: 'bong_001', launch: 'confirmation_001', back: 'back_001', toggle: 'glass_001', error: 'error_001', notification: 'select_001' },
    'vector-phosphor': { move: 'tick_001', letter: 'tick_001', tab: 'glass_001', open: 'open_001', close: 'back_001', confirm: 'glass_001', launch: 'confirmation_001', back: 'back_001', toggle: 'toggle_001', error: 'error_001', notification: 'select_001' }
  };
  const context = new AudioContextClass();
  const master = context.createGain();
  const categories = Object.fromEntries(['navigation', 'confirm', 'notifications'].map(name => {
    const gain = context.createGain();
    gain.connect(master);
    return [name, gain];
  }));
  master.connect(context.destination);
  let volumes = { master: 100, navigation: 40, confirm: 80, notifications: 85, muted: false };
  const buffers = new Map();
  const audioProbe = new Audio();
  const extension = audioProbe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
  const audioDebug = new URLSearchParams(location.search).get('audiodebug') === '1'
    ? { navStarts: 0, maxConcurrentNavVoices: 0, letterJumps: 0, assetsLoaded: 0 }
    : null;
  if (audioDebug) window.__rycadeAudioDebug = audioDebug;
  let currentNavigation = null;
  let resumeRequested = false;
  const navigationVoices = [];

  async function decode(name) {
    const extensions = extension === 'ogg' ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
    for (const ext of extensions) {
      try {
        const response = await fetch(`/sfx/${ext}/${name}.${ext}`);
        if (!response.ok) continue;
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch {}
    }
    return null;
  }

  Promise.all(files.map(async name => {
    buffers.set(name, await decode(name));
    if (audioDebug) audioDebug.assetsLoaded++;
  }));

  function setVolumes(next) {
    volumes = { ...volumes, ...next };
    master.gain.setTargetAtTime(volumes.muted ? 0 : volumes.master / 100, context.currentTime, .01);
    Object.entries(categories).forEach(([name, gain]) => {
      gain.gain.setTargetAtTime(volumes[name] / 100, context.currentTime, .01);
    });
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
    voice.source.stop(stopAt);
    voice.endAt = stopAt;
    currentNavigation = null;
    return stopAt;
  }

  function play(eventName) {
    const theme = themes[document.body.dataset.theme] || themes.lightbox;
    const buffer = buffers.get(theme[eventName]);
    if (!buffer || (context.state !== 'running' && !resumeRequested) || volumes.muted) return;
    if (eventName === 'letter' && audioDebug) audioDebug.letterJumps++;

    const category = eventName === 'notification' ? 'notifications' :
      ['launch', 'confirm', 'back', 'open', 'close', 'error'].includes(eventName) ? 'confirm' : 'navigation';
    const isNavigation = category === 'navigation';
    const now = context.currentTime;
    const startAt = isNavigation ? stopCurrentNavigation(now) : now;
    const source = context.createBufferSource();
    source.buffer = buffer;
    if (eventName === 'letter') source.playbackRate.setValueAtTime(.85, startAt);
    if (isNavigation) {
      const voiceGain = context.createGain();
      source.connect(voiceGain);
      voiceGain.connect(categories[category]);
      const endAt = startAt + buffer.duration / source.playbackRate.value;
      const overlappingVoices = navigationVoices.filter(voice => voice.startAt < endAt && startAt < voice.endAt).length;
      if (audioDebug) {
        audioDebug.navStarts++;
        audioDebug.maxConcurrentNavVoices = Math.max(audioDebug.maxConcurrentNavVoices, overlappingVoices + 1);
      }
      const voice = { source, gain: voiceGain, startAt, endAt };
      navigationVoices.push(voice);
      currentNavigation = voice;
      source.addEventListener('ended', () => {
        const voiceIndex = navigationVoices.indexOf(voice);
        if (voiceIndex !== -1) navigationVoices.splice(voiceIndex, 1);
        if (currentNavigation === voice) currentNavigation = null;
      }, { once: true });
    } else {
      source.connect(categories[category]);
    }
    source.start(startAt);
  }

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
  window.rycadeAudio = { play, setVolumes };
})();
