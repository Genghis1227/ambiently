import React from 'react';

interface TileErrorBoundaryProps {
  /** Shown in the message, e.g. the tile's title */
  label?: string;
  /** When this changes (the tile's config was edited), the tile tries again */
  resetKey?: unknown;
  children: React.ReactNode;
}

interface TileErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

// Without this, an error inside one tile unmounts the whole board, and a wall screen nobody is
// watching stays blank. With it, only that tile shows a message, and it retries by itself.
export class TileErrorBoundary extends React.Component<TileErrorBoundaryProps, TileErrorBoundaryState> {
  state: TileErrorBoundaryState = { error: null, resetKey: this.props.resetKey };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<TileErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: TileErrorBoundaryProps,
    state: TileErrorBoundaryState
  ): Partial<TileErrorBoundaryState> | null {
    // Edited config (a new updated_at) gets a fresh try
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Tile "${this.props.label || 'tile'}" failed:`, error, info.componentStack);
    // Retry after a minute, in case the cause was passing (a feed's odd answer, a race on startup)
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.setState({ error: null }), 60 * 1000);
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
        <span className="text-2xl" aria-hidden="true">
          ⚠️
        </span>
        <p className="text-sm font-semibold text-gray-200">{this.props.label || 'This tile'} hit a problem</p>
        <p className="text-xs text-gray-400 max-w-[18rem]">The rest of the board keeps working. It will try again in a minute.</p>
        <button
          type="button"
          data-no-drag="true"
          onClick={() => this.setState({ error: null })}
          className="mt-1 rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
        >
          Try again now
        </button>
      </div>
    );
  }
}
