import { Component, type ErrorInfo, type ReactNode } from 'react';

import { translateCurrent } from '../lib/i18n';
import { BrandMark } from './GlobalHeader';
import { Button } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="standalone-center">
        <div className="message-card">
          <BrandMark />
          <h1>{translateCurrent('Something went wrong')}</h1>
          <p>
            {translateCurrent(
              'The interface hit an unexpected error. Reload the page to try again.',
            )}
          </p>
          <div className="message-actions">
            <Button variant="primary" onClick={() => window.location.reload()}>
              {translateCurrent('Reload')}
            </Button>
            <Button onClick={() => window.location.assign('/projects')}>
              {translateCurrent('Back to projects')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
