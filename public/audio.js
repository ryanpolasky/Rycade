(() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    window.rycadeAudio = { play() {}, setVolumes() {} };
    return;
  }

  const files = [
    'back_001', 'bong_001', 'click_001', 'confirmation_001', 'error_001',
    'glass_001', 'glitch_001', 'open_001', 'scroll_001', 'select_001',
    'tick_001', 'toggle_001'
  ];
  const themes = {
    lightbox: { move: 'scroll_001', letter: 'tick_001', tab: 'click_001', open: 'open_001', close: 'back_001', confirm: 'confirmation_001', launch: 'confirmation_001', back: 'back_001', toggle: 'toggle_001', error: 'error_001', notification: 'select_001' },
    'rycade-tv': { move: 'click_001', letter: 'tick_001', tab: 'glitch_001', open: 'open_001', close: 'back_001', confirm: 'confirmation_001', launch: 'confirmation_001', back: 'back_001', toggle: 'click_001', error: 'error_001', notification: 'select_001' },
    'neo-gold': { move: 'click_001', letter: 'bong_001', tab: 'bong_001', open: 'open_001', close: 'back_001', confirm: 'bong_001', launch: 'confirmation_001', back: 'back_001', toggle: 'glass_001', error: 'error_001', notification: 'select_001' },
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
  let volumes = { master: 100, navigation: 75, confirm: 80, notifications: 85, muted: false };
  const buffers = new Map();
  const audioProbe = new Audio();
  const extension = audioProbe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
  let lastMove = 0;

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

  Promise.all(files.map(async name => buffers.set(name, await decode(name))));

  function setVolumes(next) {
    volumes = { ...volumes, ...next };
    master.gain.setTargetAtTime(volumes.muted ? 0 : volumes.master / 100, context.currentTime, .01);
    Object.entries(categories).forEach(([name, gain]) => {
      gain.gain.setTargetAtTime(volumes[name] / 100, context.currentTime, .01);
    });
  }

  function play(eventName) {
    if (eventName === 'move') {
      const now = performance.now();
      if (now - lastMove < 70) return;
      lastMove = now;
    }
    const theme = themes[document.body.dataset.theme] || themes.lightbox;
    const buffer = buffers.get(theme[eventName]);
    if (!buffer || context.state !== 'running' || volumes.muted) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const category = eventName === 'notification' ? 'notifications' :
      ['launch', 'confirm', 'back', 'open', 'close', 'error'].includes(eventName) ? 'confirm' : 'navigation';
    source.connect(categories[category]);
    source.start();
  }

  const resume = () => {
    if (context.state === 'suspended') context.resume();
  };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
  setVolumes(volumes);
  window.rycadeAudio = { play, setVolumes };
})();
