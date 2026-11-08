(function (root) {
  function expandPads(pads) {
    return Array.from(pads || []).flatMap(pad => {
      if (!pad || typeof pad.id !== 'string' || !/Rycade Controls/.test(pad.id) ||
          !pad.axes || !(pad.axes.length >= 8)) {
        return [pad];
      }
      return Array.from({ length: 4 }, (_, player) => ({
        id: 'Rycade P' + (player + 1),
        index: pad.index * 4 + player,
        connected: pad.connected !== false,
        timestamp: pad.timestamp,
        mapping: '',
        axes: [pad.axes[2 * player], pad.axes[2 * player + 1]],
        buttons: Array.from(pad.buttons || []).slice(player * 7, player * 7 + 7)
      }));
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { expandPads };
  if (root) root.rycadeExpandPads = expandPads;
})(typeof globalThis !== 'undefined' ? globalThis : window);
