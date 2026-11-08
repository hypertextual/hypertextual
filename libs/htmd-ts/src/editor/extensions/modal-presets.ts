import type { KeybindingPreset } from '@cloudvoyant/helical-ui'
import { defineHtmdExtension } from '../define-htmd-extension.js'

// types ---------------------------------------------------------------------

export interface ModalPresetConfig {
  readonly preset: KeybindingPreset
  /**
   * Whether word and paragraph motions in normal mode select the traversed
   * span (`helix` / `kakoune`) rather than collapsing to a single-character
   * cursor (`vim`).
   */
  readonly selectionFirstNormalMotions: boolean
}

export interface ModalPresetOptions {
  readonly config?: Partial<ModalPresetConfig>
}

// api -----------------------------------------------------------------------

/**
 * Helix modal preset extension (`selection -> action` model where normal-mode
 * word and paragraph motions select the traversed span):
 *
 * ```text
 * Normal `w`:   [Hello] world   -->   Hello [world]
 * ```
 */
export const HelixPreset = defineHtmdExtension<ModalPresetOptions, ModalPresetConfig>({
  name: 'helixPreset',
  kind: 'behavior',
  defaultOptions: () => ({}),
  createStorage: (options) => ({
    preset: 'helix',
    selectionFirstNormalMotions: true,
    ...options.config,
  }),
})

/**
 * Vim modal preset extension (`operator -> motion` model where normal-mode
 * motions move a collapsed block cursor without extending selection):
 *
 * ```text
 * Normal `w`:   [H]ello world   -->   Hello [w]orld
 * ```
 */
export const VimPreset = defineHtmdExtension<ModalPresetOptions, ModalPresetConfig>({
  name: 'vimPreset',
  kind: 'behavior',
  defaultOptions: () => ({}),
  createStorage: (options) => ({
    preset: 'vim',
    selectionFirstNormalMotions: false,
    ...options.config,
  }),
})

/**
 * Kakoune modal preset extension (`selection -> action` model with object-verb
 * selection motions and multi-cursor support):
 *
 * ```text
 * Normal `w`:   [Hello] world   -->   Hello [world]
 * ```
 */
export const KakounePreset = defineHtmdExtension<ModalPresetOptions, ModalPresetConfig>({
  name: 'kakounePreset',
  kind: 'behavior',
  defaultOptions: () => ({}),
  createStorage: (options) => ({
    preset: 'kakoune',
    selectionFirstNormalMotions: true,
    ...options.config,
  }),
})

// helpers -------------------------------------------------------------------

/**
 * Returns `true` for selection-first presets (`helix` and `kakoune`) and `false`
 * for operator-first presets (`vim`).
 */
export function isPresetSelectionFirst(preset: KeybindingPreset): boolean {
  return preset === 'helix' || preset === 'kakoune'
}
