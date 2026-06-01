import { createContext, useContext, useState } from 'react'

interface DemoContextType {
  demoMode: boolean
  toggleDemoMode: () => void
}

const DemoContext = createContext<DemoContextType>({
  demoMode: false,
  toggleDemoMode: () => {},
})

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [demoMode, setDemoMode] = useState(false)

  function toggleDemoMode() {
    setDemoMode(prev => !prev)
  }

  return (
    <DemoContext.Provider value={{ demoMode, toggleDemoMode }}>
      {children}
    </DemoContext.Provider>
  )
}

export const useDemo = () => useContext(DemoContext)