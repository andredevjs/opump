import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { CHART_THEME } from '@/config/constants';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // S30: Use shared theme for colors
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: CHART_THEME.errorBg }}>
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">!</div>
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="text-sm" style={{ color: CHART_THEME.errorMuted }}>
            An unexpected error occurred. You can try going back or reloading the page.
          </p>
          {this.state.error && (
            <pre
              className="text-xs text-red-400 rounded-lg p-4 text-left overflow-auto max-h-40"
              style={{ background: CHART_THEME.errorCardBg, border: `1px solid ${CHART_THEME.errorBorder}` }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm rounded-lg transition-colors"
              style={{ background: CHART_THEME.errorButton, border: `1px solid ${CHART_THEME.errorBorder}`, color: CHART_THEME.errorMuted }}
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-sm rounded-lg text-white transition-colors"
              style={{ background: CHART_THEME.errorAccent }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
