import type { On, ThemeSetArgs } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { SCENE } from '../hooks/scene.js'

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const
const SCENE_NAME = 'hubble-deep-field'
// How the person's Enter in the prompt box runs a command.
const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

// Nothing sits beneath the plugin: each hook here stands for the engine.
function engine(on: On, store: Record<string, unknown> = {}) {
  const seen = { sets: [] as ThemeSetArgs[], clears: 0, commands: [] as string[] }

  mock.store(on, store)
  on('command.register', (_, e) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('theme.set', (_, e) => {
    seen.sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('theme.clear', () => {
    seen.clears += 1
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return seen
}

test('a session starts with /deep-space and the deep field', async ($, on) => {
  const seen = engine(on)

  await $.session.start(START)

  expect(seen.commands).toEqual(['deep-space'])
  expect(seen.sets.length).toBe(1)
  expect(seen.sets[0]?.backdrop).toMatchObject({ id: SCENE_NAME })
  expect(seen.sets[0]?.colors).toBeDefined()
})

test('/deep-space switches the theme off, then on again', async ($, on) => {
  const seen = engine(on)

  await $.session.start(START)

  const off = await $.command.run({ command: 'deep-space', args: '', ...TYPED })
  expect(off.text).toContain('Deep space is off')
  expect(seen.clears).toBe(1)

  const back = await $.command.run({ command: 'deep-space', args: '', ...TYPED })
  expect(back.text).toBe('Deep space is on.')
  expect(seen.sets.length).toBe(2)
})

test('off carries into new sessions until /deep-space on', async ($, on) => {
  const seen = engine(on)

  await $.session.start(START)
  await $.command.run({ command: 'deep-space', args: 'off', ...TYPED })
  await $.session.start(START)

  expect(seen.sets.length).toBe(1)
  expect(seen.commands).toEqual(['deep-space', 'deep-space'])

  const back = await $.command.run({ command: 'deep-space', args: ' ON ', ...TYPED })
  expect(back.text).toBe('Deep space is on.')
  expect(seen.sets.length).toBe(2)
})

test('a session whose store says off starts plain', async ($, on) => {
  const seen = engine(on, { isOff: true })

  await $.session.start(START)

  expect(seen.sets.length).toBe(0)
  expect(seen.commands).toEqual(['deep-space'])
})

test('/deep-space on while showing paints again; off while off stays off', async ($, on) => {
  const seen = engine(on)

  await $.session.start(START)
  await $.command.run({ command: 'deep-space', args: 'on', ...TYPED })
  expect(seen.sets.length).toBe(2)
  expect(seen.clears).toBe(0)

  await $.command.run({ command: 'deep-space', args: 'off', ...TYPED })
  const again = await $.command.run({ command: 'deep-space', args: 'off', ...TYPED })
  expect(again.text).toContain('Deep space is off')
  expect(seen.sets.length).toBe(2)
})

test('an unknown word prints the usage and changes nothing', async ($, on) => {
  const seen = engine(on)

  await $.session.start(START)
  const run = await $.command.run({ command: 'deep-space', args: 'sideways', ...TYPED })

  expect(run.text).toContain('Usage: /deep-space [on|off]')
  expect(seen.sets.length).toBe(1)
  expect(seen.clears).toBe(0)
})

const BACKDROP = {
  plugin: 'deep-space',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: {
    id: SCENE_NAME,
    plugin: 'deep-space',
    glass: { blur: 6, tint: '#000000', opacity: 0.55 },
  },
} as const

test('the deep field is drawn behind desktop and mobile', async $ => {
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BACKDROP, surface })

    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})

// The desktop app draws a scene still, with no error, when its SVG uses any of
// these. Each was found by capturing the screen while test scenes cycled.
test('the scene uses nothing that makes the desktop app draw it still', () => {
  expect(SCENE.length).toBeLessThanOrEqual(131072)
  expect(SCENE).not.toContain('shape-rendering')
  expect(SCENE).not.toContain('<feTile')
  expect(SCENE).not.toContain('<feImage')

  const media = SCENE.match(/@media[^{]*/g) ?? []
  expect(media.every(rule => rule.trim() === '@media (prefers-reduced-motion:reduce)')).toBe(true)
})
