# RYCADE

A static, playable game-library frontend for a four-player arcade cabinet. The library is a visual prototype; it does not run emulators.

## Controls

- Up / Down: browse; hold to repeat and skim by letter.
- Left / Right or Z / C: switch systems.
- X, Enter, or Space: launch the selected game; Escape or Enter exits.
- Click or tap a row to select it, tap it again or the CRT to launch, and tap while launched to exit. Scroll or swipe the list to browse.
- `/` or `S`: search the library; `M`: open settings. Settings persist in the browser.
- Use the Phone Remote section in settings to scan the pairing QR code and send a game selection from your phone.

## Audio credits

Cabinet sounds are synthesized in-browser with the Web Audio API in the Cabinet, Chip, and Neo sound sets. No third-party sound samples are used.

## Deploy

```sh
npx wrangler deploy
```
