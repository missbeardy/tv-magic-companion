/** Suspense fallback for lazy-loaded routes — matches the existing loading treatment used
 * app-wide (ProtectedRoute, Login, App's Dashboard), not a new visual pattern. */
export default function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Loading...</p>
    </div>
  )
}
