import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Loader2,
  Megaphone,
  Smartphone,
  Upload,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ScreenStatus } from '../components/ScreenStatus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { campaignsApi, whatsappApi, type Campaign } from '../services/api';
import {
  estimateCampaignMinutes,
  parseContactsFile,
  parsePhoneNumbers,
} from '../utils/campaignContacts';
import './Campaigns.css';

type Step = 1 | 2 | 3;
type Phase = 'compose' | 'sending' | 'done';
type ContactSource = 'paste' | 'file';

export function Campaigns() {
  const { t } = useTranslation();
  useDocumentTitle(t('campaigns.title'));

  const statusQuery = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => whatsappApi.status(),
    refetchInterval: 5000,
  });

  const connected = Boolean(statusQuery.data?.is_logged_in);

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>('compose');
  const [source, setSource] = useState<ContactSource>('paste');
  const [pasteText, setPasteText] = useState('');
  const [phones, setPhones] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!campaign || phase !== 'sending') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const latest = await campaignsApi.get(campaign.id);
        if (cancelled) return;
        setCampaign(latest);
        if (['completed', 'cancelled', 'failed'].includes(latest.status)) {
          setPhase('done');
        }
      } catch {
        /* keep polling */
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [campaign?.id, phase]);

  useEffect(() => {
    if (phase !== 'sending') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

  const estimate = useMemo(() => estimateCampaignMinutes(phones.length), [phones.length]);

  const applyPaste = () => {
    const parsed = parsePhoneNumbers(pasteText);
    if (parsed.length === 0) {
      setError(t('campaigns.errors.noNumbers'));
      return;
    }
    setError('');
    setPhones(parsed);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const parsed = await parseContactsFile(file);
    if (parsed.length === 0) {
      setError(t('campaigns.errors.noNumbers'));
      return;
    }
    setError('');
    setPhones(parsed);
    setPasteText(parsed.join('\n'));
  };

  const startCampaign = async () => {
    if (phones.length === 0) {
      setError(t('campaigns.errors.noNumbers'));
      return;
    }
    if (!message.trim()) {
      setError(t('campaigns.errors.noMessage'));
      return;
    }
    setStarting(true);
    setError('');
    try {
      const created = await campaignsApi.create({
        message: message.trim(),
        phones,
      });
      setCampaign(created);
      setPhase('sending');
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('campaigns.errors.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  const cancelCampaign = async () => {
    if (!campaign) return;
    const updated = await campaignsApi.cancel(campaign.id);
    setCampaign(updated);
    setPhase('done');
  };

  const reset = () => {
    setPhase('compose');
    setStep(1);
    setCampaign(null);
    setPhones([]);
    setPasteText('');
    setMessage('');
    setError('');
  };

  if (statusQuery.isLoading) {
    return (
      <div className="campaign-product-page">
        <ScreenStatus kind="loading" title={t('common.loading')} />
      </div>
    );
  }

  if (!connected && phase === 'compose') {
    return (
      <div className="campaign-product-page">
        <PageHeader title={t('campaigns.title')} subtitle={t('campaigns.subtitle')} />
        <ScreenStatus
          kind="empty"
          icon={<Smartphone size={40} />}
          title={t('campaigns.noConnectionTitle')}
          description={t('campaigns.noConnectionDesc')}
          action={
            <Link to="/connection" className="btn-primary">
              {t('campaigns.goToConnection')}
            </Link>
          }
        />
      </div>
    );
  }

  if (phase === 'sending' && campaign) {
    const progress = campaign.total
      ? Math.round(((campaign.total - campaign.pending) / campaign.total) * 100)
      : 0;
    return (
      <div className="campaign-product-page">
        <PageHeader title={t('campaigns.progress.title')} />
        <div className="campaign-card" style={{ maxWidth: 560, margin: '0 auto' }}>
          <p>{t('campaigns.progress.status', { status: campaign.status })}</p>
          <div className="progress-bar" style={{ height: 10, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden', margin: '16px 0' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>{t('campaigns.progress.sent')}: <strong>{campaign.sent}</strong></div>
            <div>{t('campaigns.progress.failed')}: <strong>{campaign.failed}</strong></div>
            <div>{t('campaigns.progress.skipped')}: <strong>{campaign.skipped}</strong></div>
            <div>{t('campaigns.progress.pending')}: <strong>{campaign.pending}</strong></div>
          </div>
          <button type="button" className="btn-danger" style={{ marginTop: 20 }} onClick={() => void cancelCampaign()}>
            {t('campaigns.actions.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done' && campaign) {
    return (
      <div className="campaign-product-page">
        <PageHeader title={t('campaigns.done.title')} />
        <div className="campaign-card" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--primary)" />
          <p style={{ marginTop: 12 }}>
            {t('campaigns.done.summary', {
              sent: campaign.sent,
              failed: campaign.failed,
              skipped: campaign.skipped,
            })}
          </p>
          <button type="button" className="btn-primary" style={{ marginTop: 16 }} onClick={reset}>
            {t('campaigns.actions.new')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="campaign-product-page campaigns-page">
      <PageHeader title={t('campaigns.title')} subtitle={t('campaigns.subtitle')} />

      <ol className="campaign-steps" aria-label={t('campaigns.stepsLabel')}>
        {([1, 2, 3] as Step[]).map(n => (
          <li key={n} className={step === n ? 'active' : step > n ? 'done' : ''}>
            <span>{n}</span> {t(`campaigns.steps.${n}`)}
          </li>
        ))}
      </ol>

      {error && (
        <div className="campaign-error" role="alert">
          <XCircle size={18} /> {error}
        </div>
      )}

      {step === 1 && (
        <section className="campaign-card">
          <div className="source-tabs">
            <button
              type="button"
              className={source === 'paste' ? 'active' : ''}
              onClick={() => setSource('paste')}
            >
              <Upload size={16} /> {t('campaigns.source.paste')}
            </button>
            <button
              type="button"
              className={source === 'file' ? 'active' : ''}
              onClick={() => setSource('file')}
            >
              <FileUp size={16} /> {t('campaigns.source.file')}
            </button>
          </div>

          {source === 'paste' ? (
            <>
              <label htmlFor="numbers">{t('campaigns.fields.numbers')}</label>
              <textarea
                id="numbers"
                rows={10}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={t('campaigns.fields.numbersPlaceholder')}
              />
              <p className="hint">{t('campaigns.fields.numbersHint')}</p>
              <button type="button" className="btn-secondary" onClick={applyPaste}>
                {t('campaigns.actions.parse')}
              </button>
            </>
          ) : (
            <>
              <label className="file-drop">
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={e => void onFile(e.target.files?.[0] ?? null)}
                />
                <FileUp size={28} />
                <span>{t('campaigns.fields.fileHint')}</span>
              </label>
            </>
          )}

          {phones.length > 0 && (
            <p className="recipients-count">{t('campaigns.recipients', { count: phones.length })}</p>
          )}

          <div className="step-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={phones.length === 0}
              onClick={() => setStep(2)}
            >
              {t('common.next')} <ChevronRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="campaign-card">
          <label htmlFor="message">{t('campaigns.fields.message')}</label>
          <textarea
            id="message"
            rows={8}
            maxLength={4096}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t('campaigns.fields.messagePlaceholder')}
          />
          <p className="hint">{t('campaigns.fields.messageHint', { count: message.length })}</p>
          <div className="step-actions">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              <ChevronLeft size={16} /> {t('common.back')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!message.trim()}
              onClick={() => setStep(3)}
            >
              {t('common.next')} <ChevronRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="campaign-card">
          <h3>
            <Megaphone size={18} /> {t('campaigns.review.recipients')}
          </h3>
          <p>{t('campaigns.recipients', { count: phones.length })}</p>
          <p className="hint">{t('campaigns.estimate', { minutes: estimate })}</p>

          <h3 style={{ marginTop: 20 }}>{t('campaigns.review.message')}</h3>
          <pre className="message-preview">{message}</pre>

          <div className="step-actions">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
              <ChevronLeft size={16} /> {t('common.back')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={starting}
              onClick={() => void startCampaign()}
            >
              {starting ? <Loader2 className="animate-spin" size={16} /> : null}
              {t('campaigns.actions.start')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
