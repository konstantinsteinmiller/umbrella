import { beforeEach, describe, expect, it } from 'vitest'
import { ACTIONS, actionForCode, bindKey, bindingsChanged, boundCode, codesFor, isBindable, primaryCode, resetBindings, __resetBindingsForTests } from '@/umbrella/keyBindings'
import { classify, guessFromLanguage, keyboard, keyLabel, observeKey, setAutoLayout, setManualLayout, __resetKeyboardForTests } from '@/umbrella/keyLabels'
import en from '@/i18n/locales/en'

const press = (code: string, key: string) => observeKey({ code, key, ctrlKey: false, altKey: false, metaKey: false })

beforeEach(() => {
  __resetBindingsForTests()
  __resetKeyboardForTests()
})

describe('key bindings', () => {
  it('defaults and alternates', () => {
    expect(actionForCode('KeyA')).toBe('left')
    expect(actionForCode('ArrowLeft')).toBe('left')
    expect(actionForCode('KeyD')).toBe('right')
    expect(actionForCode('Space')).toBe('umbrella')
    expect(actionForCode('Enter')).toBe('umbrella')
    expect(actionForCode('KeyR')).toBe('restart')
    expect(actionForCode('KeyL')).toBe('levels')
    expect(actionForCode('Escape')).toBeNull()
  })
  it('a rebound key drives its action and the old one no longer does', () => {
    bindKey('umbrella', 'KeyK')
    expect(actionForCode('KeyK')).toBe('umbrella')
    expect(actionForCode('Space')).toBeNull()
    expect(actionForCode('Enter')).toBe('umbrella')
    expect(boundCode('Space')).toBe('KeyK')
  })
  it('another action\'s main key swaps, so every action stays bound', () => {
    bindKey('left', 'KeyD')
    expect(primaryCode('left')).toBe('KeyD')
    expect(primaryCode('right')).toBe('KeyA')
    for (const a of ACTIONS) expect(codesFor(a).length).toBeGreaterThan(0)
  })
  it('taking an alternate moves it', () => {
    bindKey('restart', 'ArrowLeft')
    expect(actionForCode('ArrowLeft')).toBe('restart')
    expect(codesFor('left')).toEqual(['KeyA'])
  })
  it('reserved keys are refused, reset restores the defaults', () => {
    expect(isBindable('Escape')).toBe(false)
    expect(bindKey('left', 'Escape')).toBe(false)
    bindKey('left', 'KeyJ')
    expect(bindingsChanged()).toBe(true)
    resetBindings()
    expect(bindingsChanged()).toBe(false)
    expect(primaryCode('left')).toBe('KeyA')
  })
})

describe('keyboard layout labels', () => {
  it('classifies telltales; W and A settle nothing (they read the same on QWERTZ)', () => {
    expect(classify('KeyA', 'q')).toBe('azerty')
    expect(classify('KeyW', 'z')).toBe('azerty')
    expect(classify('KeyY', 'z')).toBe('qwertz')
    expect(classify('KeyZ', 'z')).toBe('qwerty')
    expect(classify('KeyW', 'w')).toBeNull()
    expect(classify('KeyA', 'a')).toBeNull()
  })
  it('guesses from the browser language', () => {
    expect(guessFromLanguage(['fr-FR'])).toBe('azerty')
    expect(guessFromLanguage(['fr-CA'])).toBe('qwerty')
    expect(guessFromLanguage(['fr-CH'])).toBe('qwertz')
    expect(guessFromLanguage(['de-DE'])).toBe('qwertz')
    expect(guessFromLanguage(['en-US'])).toBe('qwerty')
  })
  it('typing on AZERTY relabels the moving keys', () => {
    press('KeyA', 'q')
    expect(keyboard.detected).toBe('azerty')
    expect(keyLabel('KeyA')).toBe('Q')
    expect(keyLabel('KeyD')).toBe('D')
  })
  it('a QWERTZ player pressing W keeps QWERTZ', () => {
    press('KeyY', 'z')
    press('KeyW', 'w')
    expect(keyboard.detected).toBe('qwertz')
    expect(keyLabel('KeyY')).toBe('Z')
  })
  it('Cyrillic letters are not shown: the Latin letter on the same key is', () => {
    press('KeyA', 'ф')
    expect(keyLabel('KeyA')).toBe('A')
  })
  it('auto off uses the picked layout', () => {
    setAutoLayout(false)
    setManualLayout('azerty')
    expect(keyLabel('KeyA')).toBe('Q')
    setAutoLayout(true)
  })
  it('digits stay digits; Space and Enter are words in the player\'s language', () => {
    press('KeyA', 'q')
    expect(keyLabel('Digit1')).toBe('1')
    const t = (k: string) => `<${k}>`
    expect(keyLabel('Space', t)).toBe('<umbrella.kb.space>')
    expect(keyLabel('Enter')).toBe('Enter')
    expect(Object.keys(en.umbrella.kb)).toEqual(expect.arrayContaining(['space', 'enter', 'shift', 'backspace']))
  })
})
