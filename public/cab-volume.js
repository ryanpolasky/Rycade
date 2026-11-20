(function (root) {
  function parseCabLevel(value, fallback = 10) {
    const text = String(value ?? '').trim();
    if (!/^(0|[1-9]\d*)$/.test(text)) return fallback;
    const level = Number(text);
    return level <= 10 ? level : fallback;
  }

  function clampCabLevel(value) {
    const level = Number(value);
    return Number.isFinite(level) ? Math.max(0, Math.min(10, Math.round(level))) : 10;
  }

  function cabFactor(level) {
    return clampCabLevel(level) / 10;
  }

  function clampCabFactor(value, fallback = 1) {
    const factor = Number(value);
    return Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : fallback;
  }

  function scaleVolume(volume, factor) {
    const level = Number(volume);
    const cab = Number(factor);
    if (!Number.isFinite(level) || !Number.isFinite(cab)) return 0;
    return Math.max(0, Math.min(1, level * cab));
  }

  const api = { parseCabLevel, clampCabLevel, cabFactor, clampCabFactor, scaleVolume };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.rycadeVolume = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
