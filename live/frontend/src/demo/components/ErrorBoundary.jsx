import { Component } from "react";

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-8" data-testid="app-error-boundary">
        <div className="max-w-md bg-white border border-line p-8">
          <div className="eyebrow mb-3">Something went wrong</div>
          <h1 className="font-display text-2xl text-ink">The page hit an unexpected error.</h1>
          <p className="mt-3 text-sm text-ink2 font-mono break-words">{String(this.state.error?.message || this.state.error)}</p>
          <button className="btn-ink mt-6" onClick={() => window.location.reload()} data-testid="error-boundary-reload">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
