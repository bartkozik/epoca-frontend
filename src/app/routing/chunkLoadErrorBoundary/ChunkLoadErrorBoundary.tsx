import ErrorFallback from '@/app/routing/errorBoundary/ErrorFallback';
import { Component, ReactNode } from 'react';

// Matches the browser-native error messages thrown when a dynamically-imported chunk 404s
// (e.g. after a deploy replaces the hashed chunk files an already-open tab still references).
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

  // Just capture whatever was thrown; deciding what to do with it happens in render(), since
  // re-throwing from getDerivedStateFromError isn't a documented React contract.
  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  resetError = (): void => {
    this.setState(NO_ERROR);
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) return this.props.children;

    // Normalize to an Error (it's only guaranteed to be whatever was thrown) so the re-throw
    // below satisfies eslint's only-throw-error rule.
    const normalized = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    // Not a chunk-load failure: re-throw for the ancestor app-level ErrorBoundary to handle.
    if (!CHUNK_LOAD_ERROR.test(normalized.message)) throw normalized;
    return <ErrorFallback variant="chunk" resetError={this.resetError} />;
  }
}

export default ChunkLoadErrorBoundary;
