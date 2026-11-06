import ErrorFallback from '@/app/routing/errorBoundary/ErrorFallback';
import { Component, ReactNode } from 'react';

const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

interface ChunkLoadErrorBoundaryProps {
  children: ReactNode;
}

interface State {
  error: unknown;
}

const NO_ERROR: State = { error: undefined };

class ChunkLoadErrorBoundary extends Component<ChunkLoadErrorBoundaryProps, State> {
  constructor(props: ChunkLoadErrorBoundaryProps) {
    super(props);
    this.state = NO_ERROR;
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  resetError = (): void => {
    this.setState(NO_ERROR);
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) return this.props.children;

    const normalized = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    if (!CHUNK_LOAD_ERROR.test(normalized.message)) throw normalized;
    return <ErrorFallback variant="chunk" resetError={this.resetError} />;
  }
}

export default ChunkLoadErrorBoundary;
