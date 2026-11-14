import type { EngineInterface, Register, ThemeResult, ThemeSetArgs } from 'claude-code'

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

// A light, dark veil keeps the words readable and the pixels crisp.
const GLASS = { blur: 6, tint: '#000000', opacity: 0.55 }

// Builds name the backdrop differently: `id` (2.1.321, the API typed here)
// or `scene`. A build refuses the name it doesn't know, so try each in turn.
const LOOKS: readonly ThemeSetArgs[] = [
  { colors: theme, backdrop: { id: SCENE_NAME, glass: GLASS } },
  { colors: theme, backdrop: { scene: SCENE_NAME, glass: GLASS } } as unknown as ThemeSetArgs,
]

const COMMAND = 'deep-space'
// Set in this plugin's own store by `/deep-space off`, so new sessions start
// without the theme until `/deep-space on`.
const OFF_KEY = 'isOff'

// The theme stands once a build takes it, drawn now or by a surface that
// attaches later; `refusal` says why no build took it.
type Painted = { set: ThemeResult; refusal?: undefined } | { set?: undefined; refusal: string }

async function paint($: EngineInterface): Promise<Painted> {
  let refusal = 'the theme was refused'

  for (const look of LOOKS) {
    try {
      return { set: await $.theme.set(look) }
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error)
    }
  }

  return { refusal }
}

// Paints the theme and says in the status line why nothing draws it, if so.
async function show($: EngineInterface): Promise<Painted> {
  const painted = await paint($)
  const { set } = painted

  $.ui.status(set === undefined ? painted.refusal : set.isDrawn ? undefined : set.reason)

  return painted
}

export const register: Register = on => {
  // Whether this plugin's theme stands in this session, as it last set it.
  // A reload starts it over, and runs session.start again to set it.
  let isShowing = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Turn the Deep space theme on or off',
      argumentHint: '[on|off]',
      immediate: true,
    })

    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    if ((await $.store.get(OFF_KEY)) !== true) {
      isShowing = (await show($)).set !== undefined
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    // Typed as a string, but a run with nothing after the name can leave it out.
    const arg = (e.args ?? '').trim().toLowerCase()

    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /deep-space [on|off]. With nothing after it, it switches the theme.' }
    }
    if (arg === 'off' || (arg === '' && isShowing)) {
      await $.store.set(OFF_KEY, true)
      await $.theme.clear()
      isShowing = false
      $.ui.status(undefined)

      return { text: 'Deep space is off, here and in new sessions. /deep-space brings it back.' }
    }

    await $.store.delete(OFF_KEY)
    const { set, refusal } = await show($)

    isShowing = set !== undefined
    if (set === undefined) {
      return { text: `Deep space couldn't be set: ${refusal}` }
    }
    if (!set.isDrawn) {
      return {
        text: `Deep space is on, but nothing here draws it (${set.reason}). In a terminal, pick Deep space in /theme.`,
      }
    }

    return { text: 'Deep space is on.' }
  }).catch(($, e, next) => ({
    // Without this, a failed run would fall through as an unknown command.
    text: `Deep space couldn't switch: ${next.error.message ?? next.error.kind}`,
  }))

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    // The scene name is this mod's own, so it alone says the backdrop is ours.
    const props = e.props as { id?: string; scene?: string }

    if ((props.id ?? props.scene) !== SCENE_NAME) {
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
