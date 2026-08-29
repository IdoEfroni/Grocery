import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last-resort guard against a white screen.
 *
 * Deliberately not translated: if the language provider itself is what threw,
 * calling `t()` here would throw again and defeat the boundary.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in React tree:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div role="alert" style={{ padding: '2rem', maxWidth: '32rem', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
        <p style={{ color: '#6c757d' }}>
          The app hit an unexpected error. Reloading usually clears it.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
        {import.meta.env.DEV && (
          <pre
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#f8f9fa',
              overflowX: 'auto',
              fontSize: '0.75rem',
            }}
          >
            {error.stack ?? error.message}
          </pre>
        )}
      </div>
    )
  }
}
