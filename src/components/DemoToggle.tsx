import { useDemo } from '../context/DemoContext'

export default function DemoToggle() {
  const { demoMode, toggleDemoMode } = useDemo()

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${demoMode ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
      <div>
        <p className="text-sm font-medium text-gray-700">Demo Mode</p>
        <p className="text-xs text-gray-400">
          {demoMode ? '⚡ Timer set to 30 seconds' : 'Timer set to 36 hours'}
        </p>
      </div>
      <button
        onClick={toggleDemoMode}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${demoMode ? 'bg-amber-500' : 'bg-gray-300'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${demoMode ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}