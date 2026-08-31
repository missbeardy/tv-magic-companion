import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The /visualise campaign shipped every primary CTA at 2.38:1 — white on
 * #14bac1, against a 4.5:1 requirement. The fix was to split the bright cyan
 * (graphics only) from an ink token used wherever text is involved. These
 * assertions exist so a future colour tweak cannot quietly undo that.
 */

const css = readFileSync(new URL('../src/campaign/campaign.css', import.meta.url), 'utf8')

function readToken(name: string): string {
  const match = css.match(new RegExp(String.raw`${name}:\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`token ${name} not found in campaign.css`)
  return match[1]
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** Contrast against white, which is both the page ground and the button text. */
function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05)
}

describe('campaign colour tokens', () => {
  it('--c-cyan-ink clears WCAG AA for normal text', () => {
    expect(contrastWithWhite(readToken('--c-cyan-ink'))).toBeGreaterThanOrEqual(4.5)
  })

  it('--c-coral clears WCAG AA in both directions', () => {
    // Used as white-on-coral (guarantee card) and coral-on-white (form errors).
    expect(contrastWithWhite(readToken('--c-coral'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the bright cyan out of anything that carries text', () => {
    const cyan = readToken('--c-cyan')
    expect(contrastWithWhite(cyan)).toBeLessThan(4.5)
    // If it ever passes, the split is no longer needed — but until then, the
    // button, label and focus rules must not reference it.
    const textRules = css.match(/(background|color|outline|border-color|accent-color):[^;]*--c-cyan\)/g)
    expect(textRules).toBeNull()
  })
})
