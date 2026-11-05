# RYCADE

A static, playable game-library frontend for a four-player arcade cabinet. The library is a visual prototype; it does not run emulators.

## Controls

- Left / Right: browse the flyers; hold to repeat and skim by letter. Pause on a game (or press Down) to open its details.
- Up: move into the top bar. Left / Right picks search, a category, or settings; SHOOT selects it; Down goes back to the games.
- Categories: ALL, ★ FAVORITES, 2P+ (2 or more players), 4P (4 or more players), then each system.
- Z / C: switch categories directly.
- In settings, Left from the section list closes it. In search, DONE closes it.
- Enter (START): launch the selected game, including while watching its demo. Escape exits the launched prototype.
- 1 / 2 / 3: SHOOT / PASS / TURBO. SHOOT (1) opens the selected game's video demo; SHOOT again or Escape returns to the menu.
- F: favorite or unfavorite the selected game. Favorites live in the ★ FAVORITES tab and persist in the browser.
- Click or tap a flyer to select it, tap it again or the game screen to launch, and tap while launched to exit.
- `/` or `S`: search the library; `M`: open settings. Settings persist in the browser.
- Use the Phone Remote section in settings to scan the pairing QR code and send a game selection from your phone.
- Attract mode starts after 2 minutes idle and shuffles full-screen game demos without repeats. Settings > Display offers Off / 1 / 2 / 5 minutes. Any input returns to browsing; START selects the game shown without launching it. Attract clips are muted; manual demos keep their existing audio controls. Settings, search, demos, launched games and boot previews suspend the idle countdown. Gamepad buttons/sticks wake it (standard gamepad START is button 9).
- Reduced motion uses still gameplay snaps and a steady START prompt during attract mode, keeping the same clip-length rotation.
- Settings > Boot > Play boot now previews the selected scene. Boot scenes are rendered live in `public/boot.js`, clocked to `public/boot/rycade.wav`, with the big reveal on the 4.44s synth hit. Each intro plays once, then holds its title screen with ambient motion until a key or click dismisses it; that input is consumed. Reduced motion shows the finished title screen. Boot audio follows master volume and mute.

## Demo videos

Real gameplay/attract video snaps are bundled for every library entry in `public/videos/<game-id>.mp4`, for example `public/videos/jamte.mp4`. Sources and encoding details are recorded in `public/videos/sources.json`. Clips are approximately 25 seconds, H.264 + AAC, at most 480 pixels wide, with faststart and a short fade through black at the loop boundary. A game's optional `video` field can override that path for another video format or location.

SHOOT opens a looping, full-screen demo. SHOOT or Escape closes it; START stops the demo and launches the selected game. Missing or unplayable clips return to the menu with an unavailable message. Demo audio follows the master volume and mute setting.

## Audio credits

Navigation and feedback sounds are synthesized in-browser with the Web Audio API in the Cabinet, Chip, and Neo sound sets. Boot previews use the supplied `rycade.wav` and `rycadeping.wav` recordings. Both files share one timeline: `rycadeping.wav` already has 4.44 seconds of leading silence, so it plays in sync with `rycade.wav` at 32% level, skipping a 25ms click at 4.44s. It keeps its recorded fade-in and fades out over its final eight seconds, ending around 48.84 seconds into the sequence.

## Deploy

```sh
npx wrangler deploy
```
