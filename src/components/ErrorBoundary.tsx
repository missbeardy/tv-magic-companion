import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full card p-6 space-y-3">
            <h1 className="font-display font-bold text-gray-900 text-lg">Something went wrong</h1>
            <p className="text-sm text-gray-500">
              The app hit an error after login. Try a hard refresh (Ctrl+Shift+R). If it keeps
              happening, open DevTools → Console and share the red error message.
            </p>
            <pre className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.assign('/login')}
              className="w-full py-2.5 rounded-xl btn-primary text-sm font-semibold"
            >
              Back to sign in
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
