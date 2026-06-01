import { useDemo } from '../context/DemoContext'

export default function DemoBanner() {
  const { demoMode } = useDemo()

  if (!demoMode) return null

  return (
    <div className="bg-amber-400 text-amber-900 text-sm font-medium text-center py-2 px-4">
      ⚡ Demo Mode Active — Lead timers set to 30 seconds
    </div>
  )
}