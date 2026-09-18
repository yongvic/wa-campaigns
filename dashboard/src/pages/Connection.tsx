import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, LogOut, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { whatsappApi } from '../services/api';
import './Connection.css';

export function Connection() {
  const { t } = useTranslation();
  useDocumentTitle(t('connection.title'));

  const statusQuery = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => whatsappApi.status(),
    refetchInterval: 3000,
  });

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loggedIn = Boolean(statusQuery.data?.is_logged_in);

  const loadQr = useCallback(async () => {
    setQrLoading(true);
    setQrError('');
    try {
      const data = await whatsappApi.qr();
      setQrUrl(data.qrImageUrl);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : t('connection.qrError'));
      setQrUrl(null);
    } finally {
      setQrLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (loggedIn) {
      setQrUrl(null);
      return;
    }
    void loadQr();
    const timer = setInterval(() => void loadQr(), 25_000);
    return () => clearInterval(timer);
  }, [loggedIn, loadQr]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await whatsappApi.logout();
      await statusQuery.refetch();
      await loadQr();
    } finally {
      setLoggingOut(false);
    }
  };

  const statusText = (() => {
    if (!statusQuery.data) return t('common.loading');
    if (statusQuery.data.is_logged_in) return t('connection.statusConnected');
    if (statusQuery.data.is_connected) return t('connection.statusPartial');
    return t('connection.statusDisconnected');
  })();

  return (
    <div className="campaign-product-page sessions-page">
      <PageHeader title={t('connection.title')} subtitle={t('connection.subtitle')} />

      <div className="session-card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="session-status-row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {loggedIn ? (
            <CheckCircle2 color="var(--primary)" size={22} />
          ) : (
            <XCircle color="var(--text-secondary)" size={22} />
          )}
          <div>
            <strong>{loggedIn ? t('common.connected') : t('common.disconnected')}</strong>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>{statusText}</p>
            {statusQuery.data?.jid && (
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                {t('connection.jid')}: {statusQuery.data.jid.replace('@s.whatsapp.net', '')}
              </p>
            )}
          </div>
        </div>

        {!loggedIn && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>{t('connection.qrHint')}</p>
            {qrLoading && !qrUrl && (
              <div style={{ padding: 40 }}>
                <Loader2 className="animate-spin" size={28} />
                <p>{t('connection.loadingQr')}</p>
              </div>
            )}
            {qrError && <p className="error-text">{qrError}</p>}
            {qrUrl && (
              <img
                src={qrUrl}
                alt="WhatsApp QR"
                style={{
                  width: 260,
                  height: 260,
                  objectFit: 'contain',
                  background: '#fff',
                  borderRadius: 12,
                  padding: 8,
                }}
              />
            )}
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn-secondary" onClick={() => void loadQr()} disabled={qrLoading}>
                <RefreshCw size={16} /> {t('connection.refreshQr')}
              </button>
            </div>
          </div>
        )}

        {loggedIn && (
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              className="btn-danger"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <LogOut size={16} /> {t('connection.logout')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
