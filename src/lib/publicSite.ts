/**
 * Customer-facing paths that must not behave like the FieldBourne PWA.
 *
 * Chrome 139+ on desktop captures every in-scope https link into the installed
 * app. The staff manifest is scoped to `/leads` so these URLs stay in the
 * browser. This helper also gates install chrome, SW registration and
 * OneSignal — a visitor to /visualise must not be offered FieldBourne.
 */
const PUBLIC_SITE_EXACT = new Set([
  '/visualise',
  '/privacy',
  '/terms',
  '/delete-account',
])

const PUBLIC_SITE_PREFIXES = ['/quote/', '/invoice/', '/visualise/']

export function isPublicSitePath(pathname: string): boolean {
  const path = pathname.split('?')[0]
  if (PUBLIC_SITE_EXACT.has(path)) return true
  return PUBLIC_SITE_PREFIXES.some((prefix) => path.startsWith(prefix))
}
