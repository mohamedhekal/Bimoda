import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-bad/50 bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page hit an unexpected error. Your demo data is stored locally and was not changed.</p>
        <p className="mt-2 break-words text-xs text-muted">{this.state.error.message}</p>
        <button className="mt-4 rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-[#06101c]" onClick={() => location.assign('/app')}>
          Back to Mission Control
        </button>
      </div>
    )
  }
}
