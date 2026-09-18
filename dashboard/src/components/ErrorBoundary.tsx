import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import i18n from '../i18n';
import './ScreenStatus.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="screen-status screen-status--error" style={{ margin: '2rem auto', maxWidth: 480 }}>
          <AlertCircle size={48} style={{ color: 'var(--error)' }} aria-hidden="true" />
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>{i18n.t('errorBoundary.title')}</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '42ch', textAlign: 'center' }}>
            {i18n.t('errorBoundary.description')}
          </p>
          <button type="button" className="btn-primary" onClick={this.handleReload}>
            <RefreshCw size={18} aria-hidden="true" />
            {i18n.t('errorBoundary.reload')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
