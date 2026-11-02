import { Component, ReactNode } from 'react';
import ErrorFallback from './ErrorFallback';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback resetError={this.resetError} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
