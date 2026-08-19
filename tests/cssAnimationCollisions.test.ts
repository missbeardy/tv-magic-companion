import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard against a whole class of invisible bug.
 *
 * The leaderboard champion card carried `.podium-reveal` (which sets `opacity: 0` and
 * animates it back to 1) and `.champion-glow`. Both declared the `animation` SHORTHAND,
 * so the later rule replaced `podium-rise` outright — leaving the card stuck at
 * `opacity: 0`. First place rendered as a blank space in production while all 774 tests
 * passed, because jsdom does not apply stylesheets and the element was in the DOM.
 *
 * So: whenever two animation-declaring classes appear on the same element, the stylesheet
 * must also carry a compound rule for that pair, or the pair must be listed below with a
 * reason. Nothing here proves the animation looks right — only that one cannot silently
 * cancel another.
 */

const CSS_PATH = join(process.cwd(), 'src/index.css')
const SRC_DIR = join(process.cwd(), 'src')

/**
 * Pairs that are safe despite sharing the shorthand, with the reason. Keep this short —
 * a compound rule is the better fix in almost every case.
 */
const ALLOWED_PAIRS = new Set([
  // .nav-badge-pulse re-declares badge-pop as its own first animation, so overriding
  // .nav-tab-badge loses nothing.
  'nav-badge-pulse|nav-tab-badge',
  // Opposite branches of one ternary (LeaderboardPage week nav) — only ever one of the
  // two is applied. A line scan cannot see that; distinguishing it properly would need a
  // real parser, so it is recorded here instead.
  'week-enter-back|week-enter-fwd',
])

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

/** Class selectors whose rule body sets the `animation` shorthand. */
function animationShorthandClasses(css: string): Set<string> {
  const found = new Set<string>()
  const ruleRe = /\.([a-z0-9_-]+)\s*\{([^}]*)\}/gi
  let match: RegExpExecArray | null
  while ((match = ruleRe.exec(css))) {
    const [, className, body] = match
    if (/(^|[;\s])animation\s*:/.test(body)) found.add(className)
  }
  return found
}

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('CSS animation collisions', () => {
  const css = readCss()
  const animationClasses = animationShorthandClasses(css)

  it('finds the animation classes it is meant to be policing', () => {
    // A regex that silently matched nothing would make this whole file a no-op.
    expect(animationClasses.size).toBeGreaterThan(5)
    expect(animationClasses).toContain('podium-reveal')
    expect(animationClasses).toContain('champion-glow')
  })

  it('never lets one animation class silently cancel another', () => {
    const offenders: string[] = []

    for (const file of tsxFiles(SRC_DIR)) {
      const contents = readFileSync(file, 'utf8')
      for (const line of contents.split('\n')) {
        if (!line.includes('className')) continue

        const present = [...animationClasses].filter((cls) =>
          new RegExp(`(^|[\\s'"\`])${cls}([\\s'"\`]|$)`).test(line)
        )
        if (present.length < 2) continue

        for (let i = 0; i < present.length; i++) {
          for (let j = i + 1; j < present.length; j++) {
            const pair = [present[i], present[j]].sort()
            if (ALLOWED_PAIRS.has(pair.join('|'))) continue
            // A compound rule in either order resolves the shorthand explicitly.
            const compound =
              css.includes(`.${pair[0]}.${pair[1]}`) || css.includes(`.${pair[1]}.${pair[0]}`)
            if (!compound) {
              offenders.push(`${file.replace(process.cwd(), '')}: .${pair[0]} + .${pair[1]}`)
            }
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('resolves the champion card pair that shipped broken', () => {
    expect(css).toContain('.podium-reveal.champion-glow')
    // Longhands, not the shorthand — that is what makes it uncancellable.
    const rule = css.slice(css.indexOf('.podium-reveal.champion-glow'))
    expect(rule).toMatch(/animation-name:\s*podium-rise,\s*champion-glow/)
  })
})
