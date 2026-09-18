import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileUp,
  Film,
  ImageIcon,
  Loader2,
  Megaphone,
  Paperclip,
  Smartphone,
  Type,
  Upload,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ScreenStatus } from '../components/ScreenStatus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  campaignsApi,
  whatsappApi,
  type Campaign,
  type PhoneCheckResult,
  type WaContact,
} from '../services/api';
import {
  estimateCampaignMinutes,
  parseContactsFile,
  parsePhoneNumbers,
} from '../utils/campaignContacts';
import './Campaigns.css';

type Step = 1 | 2 | 3;
type Phase = 'compose' | 'sending' | 'done';
type ContactSource = 'paste' | 'file' | 'contacts';
type MessageKind = 'text' | 'image' | 'video' | 'file';
type MediaKind = 'image' | 'video' | 'file';

const BLOCKED_EXT = /\.(exe|bat|cmd|com|scr|pif|msi|js|vbs|ps1|sh|dll)$/i;
const ACCEPT_BY_KIND: Record<MediaKind, string> = {
  image: 'image/jpeg,image/png,.jpg,.jpeg,.png',
  video: 'video/mp4,.mp4,.mkv,.avi',
  file: 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.zip',
};

function classifyMediaFile(file: File): MediaKind {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png' || /\.(jpe?g|png)$/.test(name)) {
    return 'image';
  }
  if (
    type === 'video/mp4' ||
    type === 'video/x-matroska' ||
    type === 'video/x-msvideo' ||
    type === 'video/avi' ||
    /\.(mp4|mkv|avi)$/.test(name)
  ) {
    return 'video';
  }
  return 'file';
}

function maxMbForKind(kind: MediaKind): number {
  if (kind === 'image') return 16;
  if (kind === 'video') return 100;
  return 50;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyCheck(): PhoneCheckResult {
  return { onWhatsApp: [], notOnWhatsApp: [], failed: [] };
}

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
  const [checkSummary, setCheckSummary] = useState<PhoneCheckResult>(emptyCheck);
  const [checking, setChecking] = useState(false);
  const [waContacts, setWaContacts] = useState<WaContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [messageKind, setMessageKind] = useState<MessageKind>('text');
  const [message, setMessage] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!mediaFile || classifyMediaFile(mediaFile) !== 'image') {
      setMediaPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

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

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return waContacts;
    return waContacts.filter(
      c => c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || q),
    );
  }, [waContacts, contactSearch]);

  const canContinueMessage =
    messageKind === 'text' ? Boolean(message.trim()) : Boolean(mediaFile);

  const verifyNumbers = async (parsed: string[], retryFailed = false) => {
    const toCheck = retryFailed ? checkSummary.failed.map(item => item.phone) : parsed;
    if (toCheck.length === 0) {
      setError(t('campaigns.errors.noNumbers'));
      return;
    }
    setChecking(true);
    setError('');
    try {
      const result = await whatsappApi.check(toCheck);
      const merged: PhoneCheckResult = retryFailed
        ? {
            onWhatsApp: [...new Set([...checkSummary.onWhatsApp, ...result.onWhatsApp])],
            notOnWhatsApp: [
              ...new Set([
                ...checkSummary.notOnWhatsApp.filter(n => !result.onWhatsApp.includes(n)),
                ...result.notOnWhatsApp,
              ]),
            ],
            failed: result.failed,
          }
        : result;
      setCheckSummary(merged);
      setPhones(merged.onWhatsApp);
      if (merged.onWhatsApp.length === 0) {
        setError(t('campaigns.errors.noneOnWhatsApp'));
      }
    } catch (err) {
      setPhones([]);
      setCheckSummary(emptyCheck());
      setError(err instanceof Error ? err.message : t('campaigns.errors.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  const applyPaste = () => {
    const parsed = parsePhoneNumbers(pasteText);
    void verifyNumbers(parsed);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const parsed = await parseContactsFile(file);
    if (parsed.length === 0) {
      setError(t('campaigns.errors.noNumbers'));
      return;
    }
    setPasteText(parsed.join('\n'));
    void verifyNumbers(parsed);
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    setError('');
    try {
      const data = await whatsappApi.contacts();
      setWaContacts(data.contacts);
      setSelectedContacts([]);
      if (data.contacts.length === 0) {
        setError(t('campaigns.contacts.empty'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('campaigns.errors.contactsFailed'));
    } finally {
      setLoadingContacts(false);
    }
  };

  const toggleContact = (phone: string) => {
    setSelectedContacts(current =>
      current.includes(phone) ? current.filter(p => p !== phone) : [...current, phone],
    );
  };

  const useSelectedContacts = () => {
    if (selectedContacts.length === 0) {
      setError(t('campaigns.errors.noSelection'));
      return;
    }
    setError('');
    setPhones(selectedContacts);
    setCheckSummary({
      onWhatsApp: selectedContacts,
      notOnWhatsApp: [],
      failed: [],
    });
  };

  const onMedia = (file: File | null) => {
    if (!file || messageKind === 'text') return;
    if (BLOCKED_EXT.test(file.name) || !/\.[a-z0-9]+$/i.test(file.name)) {
      setError(t('campaigns.errors.fileType'));
      return;
    }
    const kind = classifyMediaFile(file);
    if (kind !== messageKind) {
      setError(t('campaigns.errors.wrongMediaType'));
      return;
    }
    const maxMb = maxMbForKind(kind);
    if (file.size > maxMb * 1024 * 1024) {
      setError(
        t('campaigns.errors.fileTooLarge', {
          max: maxMb,
          kind: t(`campaigns.mediaKind.${kind}`),
        }),
      );
      return;
    }
    setError('');
    setMediaFile(file);
  };

  const changeMessageKind = (kind: MessageKind) => {
    setMessageKind(kind);
    setError('');
    if (kind === 'text') {
      setMediaFile(null);
      return;
    }
    if (mediaFile && classifyMediaFile(mediaFile) !== kind) {
      setMediaFile(null);
    }
  };

  const goToReview = () => {
    if (messageKind === 'text' && !message.trim()) {
      setError(t('campaigns.errors.noMessage'));
      return;
    }
    if (messageKind !== 'text' && !mediaFile) {
      setError(t('campaigns.errors.needMedia'));
      return;
    }
    setError('');
    setStep(3);
  };

  const startCampaign = async () => {
    if (phones.length === 0) {
      setError(t('campaigns.errors.noNumbers'));
      return;
    }
    if (messageKind === 'text' && !message.trim()) {
      setError(t('campaigns.errors.noMessage'));
      return;
    }
    if (messageKind !== 'text' && !mediaFile) {
      setError(t('campaigns.errors.needMedia'));
      return;
    }
    setStarting(true);
    setError('');
    try {
      const created = await campaignsApi.create({
        message: message.trim(),
        phones,
        media: messageKind === 'text' ? undefined : (mediaFile ?? undefined),
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
    setMediaFile(null);
    setMessageKind('text');
    setCheckSummary(emptyCheck());
    setSelectedContacts([]);
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
          {campaign.has_media && campaign.media_name ? (
            <p className="hint" style={{ marginTop: 8 }}>
              {t('campaigns.review.attachment')} : {campaign.media_name}
            </p>
          ) : null}
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

  const mediaHint =
    messageKind === 'image'
      ? t('campaigns.fields.imageHint')
      : messageKind === 'video'
        ? t('campaigns.fields.videoHint')
        : t('campaigns.fields.docHint');

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
            <button
              type="button"
              className={source === 'contacts' ? 'active' : ''}
              onClick={() => setSource('contacts')}
            >
              <Users size={16} /> {t('campaigns.source.contacts')}
            </button>
          </div>

          {source === 'paste' && (
            <>
              <label htmlFor="numbers">{t('campaigns.fields.numbers')}</label>
              <textarea
                id="numbers"
                rows={10}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={t('campaigns.fields.numbersPlaceholder')}
                disabled={checking}
              />
              <p className="hint">{t('campaigns.fields.numbersHint')}</p>
              <button
                type="button"
                className="btn-secondary"
                disabled={checking || !pasteText.trim()}
                onClick={applyPaste}
              >
                {checking ? <Loader2 className="animate-spin" size={16} /> : null}
                {checking
                  ? t('campaigns.verify.checking', { count: parsePhoneNumbers(pasteText).length || '…' })
                  : t('campaigns.actions.parse')}
              </button>
            </>
          )}

          {source === 'file' && (
            <label className={`file-drop ${checking ? 'is-disabled' : ''}`}>
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                disabled={checking}
                onChange={e => void onFile(e.target.files?.[0] ?? null)}
              />
              {checking ? <Loader2 className="animate-spin" size={28} /> : <FileUp size={28} />}
              <span>
                {checking
                  ? t('campaigns.verify.checking', { count: phones.length || '…' })
                  : t('campaigns.fields.fileHint')}
              </span>
            </label>
          )}

          {source === 'contacts' && (
            <div className="contacts-panel">
              <button
                type="button"
                className="btn-secondary"
                disabled={loadingContacts}
                onClick={() => void loadContacts()}
              >
                {loadingContacts ? <Loader2 className="animate-spin" size={16} /> : <Users size={16} />}
                {loadingContacts ? t('campaigns.contacts.loading') : t('campaigns.contacts.load')}
              </button>

              {waContacts.length > 0 && (
                <>
                  <p className="recipients-count">{t('campaigns.contacts.ready', { count: waContacts.length })}</p>
                  <input
                    type="search"
                    className="contact-search"
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder={t('campaigns.fields.contactSearch')}
                  />
                  <div className="contact-toolbar">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setSelectedContacts(filteredContacts.map(c => c.phone))}
                    >
                      {t('campaigns.contacts.selectAll')}
                    </button>
                    <button type="button" className="btn-link" onClick={() => setSelectedContacts([])}>
                      {t('campaigns.contacts.selectNone')}
                    </button>
                    <span>{t('campaigns.contacts.selected', { count: selectedContacts.length })}</span>
                  </div>
                  <ul className="contact-list">
                    {filteredContacts.map(contact => (
                      <li key={contact.phone}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(contact.phone)}
                            onChange={() => toggleContact(contact.phone)}
                          />
                          <span>
                            <strong>{contact.name}</strong>
                            <em>{contact.phone}</em>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={selectedContacts.length === 0}
                    onClick={useSelectedContacts}
                  >
                    {t('campaigns.contacts.useSelection')}
                  </button>
                </>
              )}
            </div>
          )}

          {checkSummary.onWhatsApp.length > 0 && (
            <div className="verify-summary">
              <p className="recipients-count">
                {t('campaigns.verify.ok', { count: checkSummary.onWhatsApp.length })}
              </p>
              {checkSummary.notOnWhatsApp.length > 0 && (
                <details>
                  <summary>{t('campaigns.verify.skipped', { count: checkSummary.notOnWhatsApp.length })}</summary>
                  <p className="hint skipped-list">{checkSummary.notOnWhatsApp.join(', ')}</p>
                </details>
              )}
              {checkSummary.failed.length > 0 && (
                <div className="verify-failed">
                  <p>{t('campaigns.verify.failed', { count: checkSummary.failed.length })}</p>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={checking}
                    onClick={() => void verifyNumbers([], true)}
                  >
                    {t('campaigns.actions.retryCheck')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="step-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={phones.length === 0 || checking}
              onClick={() => setStep(2)}
            >
              {t('common.next')} <ChevronRight size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="campaign-card">
          <div className="source-tabs message-type-tabs">
            <button
              type="button"
              className={messageKind === 'text' ? 'active' : ''}
              onClick={() => changeMessageKind('text')}
            >
              <Type size={16} /> {t('campaigns.messageTypes.text')}
            </button>
            <button
              type="button"
              className={messageKind === 'image' ? 'active' : ''}
              onClick={() => changeMessageKind('image')}
            >
              <ImageIcon size={16} /> {t('campaigns.messageTypes.image')}
            </button>
            <button
              type="button"
              className={messageKind === 'video' ? 'active' : ''}
              onClick={() => changeMessageKind('video')}
            >
              <Film size={16} /> {t('campaigns.messageTypes.video')}
            </button>
            <button
              type="button"
              className={messageKind === 'file' ? 'active' : ''}
              onClick={() => changeMessageKind('file')}
            >
              <FileText size={16} /> {t('campaigns.messageTypes.file')}
            </button>
          </div>

          {messageKind === 'text' ? (
            <label htmlFor="message">{t('campaigns.fields.message')}</label>
          ) : (
            <p className="media-attach-label">{t('campaigns.fields.attachment')}</p>
          )}
          {messageKind !== 'text' && (
            <>
              <p className="hint">{mediaHint}</p>
              {mediaFile ? (
                <div className="media-attach-preview">
                  {mediaPreviewUrl ? (
                    <img src={mediaPreviewUrl} alt="" />
                  ) : messageKind === 'video' ? (
                    <Film size={28} />
                  ) : (
                    <FileText size={28} />
                  )}
                  <div className="media-attach-meta">
                    <strong>{mediaFile.name}</strong>
                    <span>
                      {t(`campaigns.mediaKind.${classifyMediaFile(mediaFile)}`)} · {formatBytes(mediaFile.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary media-attach-remove"
                    onClick={() => setMediaFile(null)}
                  >
                    <X size={16} /> {t('campaigns.fields.attachmentRemove')}
                  </button>
                </div>
              ) : null}
              <label className="file-drop media-drop">
                <input
                  type="file"
                  accept={ACCEPT_BY_KIND[messageKind]}
                  onChange={e => {
                    onMedia(e.target.files?.[0] ?? null);
                    e.currentTarget.value = '';
                  }}
                />
                <Paperclip size={20} />
                <span>
                  {mediaFile
                    ? t('campaigns.fields.attachmentChange')
                    : t('campaigns.fields.attachmentChoose')}
                </span>
              </label>
              <label htmlFor="message" style={{ marginTop: 16, display: 'block' }}>
                {t('campaigns.fields.message')}
              </label>
            </>
          )}
          <textarea
            id="message"
            rows={messageKind === 'text' ? 8 : 5}
            maxLength={4096}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={
              messageKind === 'text'
                ? t('campaigns.fields.messagePlaceholder')
                : t('campaigns.fields.captionPlaceholder')
            }
          />
          <p className="hint">
            {messageKind === 'text'
              ? t('campaigns.fields.messageHint', { count: message.length })
              : t('campaigns.fields.messageOptionalHint', { count: message.length })}
          </p>

          <div className="step-actions">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              <ChevronLeft size={16} /> {t('common.back')}
            </button>
            <button type="button" className="btn-primary" disabled={!canContinueMessage} onClick={goToReview}>
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
          <p className="hint">{t(`campaigns.messageTypes.${messageKind}`)}</p>
          {mediaFile ? (
            <div className="media-attach-preview review-media">
              {mediaPreviewUrl ? (
                <img src={mediaPreviewUrl} alt="" />
              ) : messageKind === 'video' ? (
                <Film size={28} />
              ) : (
                <FileText size={28} />
              )}
              <div className="media-attach-meta">
                <strong>{mediaFile.name}</strong>
                <span>
                  {t(`campaigns.mediaKind.${classifyMediaFile(mediaFile)}`)} · {formatBytes(mediaFile.size)}
                </span>
              </div>
            </div>
          ) : null}
          {message.trim() ? (
            <pre className="message-preview">{message}</pre>
          ) : messageKind !== 'text' ? (
            <p className="hint">{t('campaigns.review.captionOnly')}</p>
          ) : null}

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
