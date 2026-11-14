# Deep space

A deep-black theme for Claude Code, after the Hubble Deep Field. It runs as a mod.

![A pixel-art deep field: a turning spiral galaxy, an elliptical, an edge-on disk and spiked stars on black](assets/preview.png)

- **Desktop and mobile apps:** a pixel-art deep field fills the space behind the conversation. Spiral galaxies turn slowly in their tilted disks (one turn every 6 to 12 minutes), about a hundred stars fade up and down in palette steps, and the long spikes on the bright stars come and go. Every change lands on one shared half-second beat, so it reads as a calm shimmer and repaints only twice a second. With reduced motion turned on in your system settings, it stays still.
- **Desktop app colors:** near-black surfaces with a faint violet cast. Accents are taken from Hubble images: blue spiral arms, gold galaxy cores, pink star-forming knots.
- **Terminal:** a matching color theme, **Deep space**, that you pick in `/theme`. The terminal app draws its own background, so set it to pure black for the deep blacks.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install deep-space --marketplace cstillick/claude-deep-space
```

Answer `y` to add the marketplace, then press Enter to install at the user scope, so every session gets it. A user-scope install also loads in the desktop app's local sessions.

From a shell:

```bash
claude plugin install deep-space --marketplace cstillick/claude-deep-space
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `cstillick/claude-deep-space`, then **Add plugin**.

The background and colors appear when a session starts, so start a new session after installing. To use the terminal colors, run `/theme` and pick **Deep space**.

## Where it shows

| Surface | What you get |
| --- | --- |
| Desktop app | Animated background, plus colors in the Code tab |
| Mobile app | Animated background |
| Terminal | Color theme in `/theme` |
| claude.ai in a browser | Nothing (plugins don't draw there) |

It needs a recent Claude Code: v2.1.324 or later for the desktop colors.

## Changing the scene

`hooks/scene.js` is generated. Edit `gen-scene.mjs` (galaxy placement, colors, turn speeds, the beat) and rebuild it with Node:

```bash
node gen-scene.mjs hooks/scene.js preview.svg
```

Open `preview.svg` in a browser to watch the result.

## Files

- `hooks/register.tsx`: sets the theme when a session starts and draws the background
- `hooks/scene.js`: the animated SVG scene
- `hooks/make-colors.js`: the design system's palette builder, used to make the app colors
- `themes/deep-space.json`: the terminal color theme
- `gen-scene.mjs`: builds `hooks/scene.js`
