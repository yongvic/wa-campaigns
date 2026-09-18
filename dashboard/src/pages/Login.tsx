import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Languages } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';
import { languageOptions, resolveSupportedLanguage, type SupportedLanguage } from '../i18n';
import { authApi } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError(t('login.usernameRequired'));
      return;
    }
    if (!password) {
      setError(t('login.passwordRequired'));
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await authApi.login(username.trim(), password);
      onLogin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.toLowerCase().includes('invalid')
          ? t('login.invalidCredentials')
          : t('login.connectionError'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.svg" alt="" className="logo-icon" />
          <h1 className="login-title">{t('login.title')}</h1>
          <p className="login-subtitle">{t('login.subtitle')}</p>
        </div>

        <div className="login-language">
          <Languages size={18} aria-hidden="true" />
          <CustomSelect
            value={currentLang}
            onChange={value => changeLanguage(value as SupportedLanguage)}
            options={languageOptions.map(opt => ({ value: opt.value, label: opt.label }))}
            ariaLabel={t('common.language')}
          />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="username">{t('common.username')}</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              className={error ? 'error' : ''}
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">{t('common.password')}</label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className={error ? 'error' : ''}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? t('login.connecting') : t('login.connect')}
          </button>
        </form>
      </div>
    </div>
  );
}
