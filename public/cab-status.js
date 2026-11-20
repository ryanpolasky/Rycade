(function (root) {
  const WARNING_DELAY_MS = 5000;
  const LINK_TIMEOUT_MS = 1000;

  function pressed(button) {
    return Boolean(button && (button.pressed || Number(button.value) > 0.5));
  }

  function deckWarningState(pads, now, state = {}) {
    const controller = Array.from(pads || []).find(pad =>
      pad && typeof pad.id === 'string' && pad.id.includes('Rycade Controls'));
    if (!controller) {
      const missingSince = state.missingSince ?? now;
      return {
        show: now - missingSince >= WARNING_DELAY_MS,
        missingSince,
        noLinksSince: null,
        linkValues: [null, null],
        linkChangedAt: [null, null]
      };
    }

    const linkValues = Array.isArray(state.linkValues) ? [...state.linkValues] : [null, null];
    const linkChangedAt = Array.isArray(state.linkChangedAt) ? [...state.linkChangedAt] : [null, null];
    while (linkValues.length < 2) linkValues.push(null);
    while (linkChangedAt.length < 2) linkChangedAt.push(null);
    const values = [pressed(controller.buttons?.[28]), pressed(controller.buttons?.[29])];
    for (let link = 0; link < 2; link++) {
      if (linkValues[link] !== null && linkValues[link] !== values[link]) linkChangedAt[link] = now;
      linkValues[link] = values[link];
    }

    const linkAlive = linkChangedAt.some(changedAt =>
      changedAt !== null && now - changedAt < LINK_TIMEOUT_MS);
    if (linkAlive) {
      return { show: false, missingSince: null, noLinksSince: null, linkValues, linkChangedAt };
    }

    const noLinksSince = state.noLinksSince ?? now;
    return {
      show: now - noLinksSince >= WARNING_DELAY_MS,
      missingSince: null,
      noLinksSince,
      linkValues,
      linkChangedAt
    };
  }

  const api = { deckWarningState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.rycadeDeckStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
