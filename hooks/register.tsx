import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE } from './scene.js'

const SCENE_NAME = 'hubble-deep-field'

// Near-black grays with a faint violet cast, and roles taken from a Hubble
// image: blue spiral arms, golden galaxy cores, pink star-forming knots.
const { theme, problems } = makeColors({
  label: 'Deep space',
  only: 'dark',
  contrast: 'more',
  roles: {
    accent: '#6f9dff',
    danger: '#ff5470',
    success: '#4fd1a5',
    warning: '#ffbe5c',
    pro: '#d07bff',
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#040407',
        'surface-1': '#09090f',
        'surface-2': '#0e0e16',
        'surface-3': '#14141e',
        'text-primary': '#eceaf6',
        'text-secondary': '#bebcd0',
        'text-muted': '#9290aa',
      },
    },
    git: {
      added: '#4fd1a5',
      removed: '#ff5470',
      modified: '#ffbe5c',
      merged: '#c69bff',
      closed: '#ff5470',
      conflicting: '#ff8a4c',
      draft: '#b6b4cc',
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: {
    scene: SCENE_NAME,
    // A light, dark veil keeps the words readable and the pixels crisp.
    glass: { blur: 6, tint: '#000000', opacity: 0.55 },
  },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    // The scene name is this mod's own, so it alone says the backdrop is ours.
    if (e.props.scene !== SCENE_NAME) {
      return next(e)
    }
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return (
      <Svg
        source={SCENE}
        alt="A pixel-art deep field on black: spiral galaxies turning slowly, an elliptical and an edge-on galaxy, and stars that dim and brighten"
        isInteractive
      />
    )
  })
}
