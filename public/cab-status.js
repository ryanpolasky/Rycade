(function (root) {
  const WARNING_DELAY_MS = 5000;

  function pressed(button) {
    return Boolean(button && (button.pressed || Number(button.value) > 0.5));
  }

  function deckWarningState(pads, now, state = {}) {
    const controller = Array.from(pads || []).find(pad =>
      pad && typeof pad.id === 'string' && pad.id.includes('Rycade Controls'));
    if (!controller) {
      const missingSince = state.missingSince ?? now;
      return { show: now - missingSince >= WARNING_DELAY_MS, missingSince, noLinksSince: null };
    }
    if (pressed(controller.buttons?.[28]) || pressed(controller.buttons?.[29])) {
      return { show: false, missingSince: null, noLinksSince: null };
    }
    const noLinksSince = state.noLinksSince ?? now;
    return { show: now - noLinksSince >= WARNING_DELAY_MS, missingSince: null, noLinksSince };
  }

  const api = { deckWarningState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.rycadeDeckStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
