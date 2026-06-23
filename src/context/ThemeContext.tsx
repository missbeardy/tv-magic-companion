import { createContext, useContext, useEffect, useMemo } from 'react'
import { useOrg } from './OrgContext'
import { applyThemeToDocument, resolveThemeTokens, type ThemeTokens } from '../lib/theme'

const ThemeContext = createContext<ThemeTokens>({
  primary: '#004B93',
  secondary: '#00B4C5',
  primaryDark: '#003d7a',
  displayName: 'Companion',
  logoUrl: null,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { org, brand } = useOrg()

  const tokens = useMemo(
    () => resolveThemeTokens(org, brand),
    [org, brand]
  )

  useEffect(() => {
    applyThemeToDocument(tokens)
  }, [tokens])

  return (
    <ThemeContext.Provider value={tokens}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
