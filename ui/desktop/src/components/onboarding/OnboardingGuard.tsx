import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useModelAndProvider } from '../ModelAndProviderContext';
import {
  acpGetProviderDetails,
  acpListProviderSecrets,
  acpReadDefaults,
  acpSaveDefaults,
  acpSaveProviderConfig,
} from '../../acp/providers';
import { acpUpsertConfig } from '../../acp/config';
import { Goose } from '../icons';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  checkProviderErrorTitle: {
    id: 'onboardingGuard.checkProviderErrorTitle',
    defaultMessage: 'Unable to connect to Houshiar Code server',
  },
  checkProviderErrorDescription: {
    id: 'onboardingGuard.checkProviderErrorDescription',
    defaultMessage: 'The server may be starting up or temporarily unavailable.',
  },
  retry: {
    id: 'onboardingGuard.retry',
    defaultMessage: 'Retry',
  },
});

interface OnboardingGuardProps {
  children: React.ReactNode;
}

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { refreshCurrentModelAndProvider } = useModelAndProvider();

  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const [hasProvider, setHasProvider] = useState(false);
  const [checkProviderError, setCheckProviderError] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const checkProvider = async (retries = 3, delay = 1000) => {
    setIsCheckingProvider(true);
    setCheckProviderError(false);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let isConfigured = false;

        try {
          const secrets = await acpListProviderSecrets();
          if (secrets.some((s) => s.provider?.toLowerCase().includes('houshiar') && s.hasSecret)) {
            isConfigured = true;
          }
        } catch {}

        if (!isConfigured) {
          try {
            const houshiar = await acpGetProviderDetails('houshiar');
            if (houshiar?.is_configured) {
              isConfigured = true;
            }
          } catch {}
        }

        if (isConfigured) {
          const { providerId } = await acpReadDefaults();
          if (!providerId || !providerId.toLowerCase().includes('houshiar')) {
            await acpSaveDefaults('houshiar', 'claude-sonnet-5');
            await refreshCurrentModelAndProvider();
          }
          setHasProvider(true);
          setIsCheckingProvider(false);
          return;
        }

        // Not configured: show onboarding screen for entering Houshiar API key
        setHasProvider(false);
        setIsCheckingProvider(false);
        return;
      } catch (error) {
        console.error(`Error checking provider (attempt ${attempt + 1}/${retries + 1}):`, error);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    setCheckProviderError(true);
    setIsCheckingProvider(false);
  };

  useEffect(() => {
    checkProvider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHoushiarConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError('کلید API نامعتبر است');
      return;
    }

    setIsValidating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Validate key by making a lightweight authenticated API request
      const response = await fetch('https://wqai.morvism.ir/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': trimmedKey,
          'anthropic-version': '2023-06-01',
          'x-client-brand': 'houshiar-code',
        },
      });

      if (!response.ok) {
        setError('کلید API نامعتبر است');
        setIsValidating(false);
        return;
      }

      let models: string[] = [];
      try {
        const data = await response.json();
        const arr = Array.isArray(data) ? data : data.data || data.models || [];
        models = arr.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      } catch {
        setError('دریافت مدلها با خطا مواجه شد');
        setIsValidating(false);
        return;
      }

      const defaultModel = models.includes('claude-sonnet-5')
        ? 'claude-sonnet-5'
        : models[0] || 'claude-sonnet-5';

      if (models.length > 0) {
        try {
          await window.electron.setSetting('houshiar_models', models);
        } catch {}
      }

      // Direct secret persistence for both key variants
      await acpUpsertConfig('HOUSHIAR_API_KEY', trimmedKey, true);
      await acpUpsertConfig('CUSTOM_HOUSHIAR_API_KEY', trimmedKey, true);

      try {
        await acpSaveProviderConfig('houshiar', [{ key: 'HOUSHIAR_API_KEY', value: trimmedKey }]);
      } catch {
        try {
          await acpSaveProviderConfig('custom_houshiar', [
            { key: 'CUSTOM_HOUSHIAR_API_KEY', value: trimmedKey },
          ]);
        } catch {}
      }

      try {
        await acpSaveDefaults('houshiar', defaultModel);
      } catch {
        try {
          await acpSaveDefaults('custom_houshiar', defaultModel);
        } catch {}
      }

      try {
        await acpUpsertConfig('GOOSE_PROVIDER', 'houshiar', false);
        await acpUpsertConfig('GOOSE_MODEL', defaultModel, false);
      } catch {}

      await refreshCurrentModelAndProvider();

      setSuccessMessage('اتصال با موفقیت انجام شد');
      setTimeout(() => {
        setHasProvider(true);
        navigate('/', { replace: true });
      }, 700);
    } catch (err: any) {
      console.error('Error connecting to Houshiar:', err);
      const msg = err?.message || err?.data || String(err);
      setError(`خطا در اتصال: ${msg}`);
      setIsValidating(false);
    }
  };

  if (isCheckingProvider) {
    return null;
  }

  if (checkProviderError) {
    return (
      <div className="h-screen w-full bg-background-default flex flex-col items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <Goose className="size-8 mx-auto" />
          </div>
          <h1 className="text-xl font-light mb-3">
            {intl.formatMessage(i18n.checkProviderErrorTitle)}
          </h1>
          <p className="text-text-muted mb-6">
            {intl.formatMessage(i18n.checkProviderErrorDescription)}
          </p>
          <Button onClick={() => checkProvider()}>{intl.formatMessage(i18n.retry)}</Button>
        </div>
      </div>
    );
  }

  if (hasProvider) {
    return <>{children}</>;
  }

  const isPersian = intl.locale.startsWith('fa');

  const handleToggleLanguage = async () => {
    const nextLang = isPersian ? 'en' : 'fa';
    await window.electron.setSetting('language', nextLang);
    window.electron.reloadApp();
  };

  return (
    <div className="h-screen w-full bg-background-default flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full p-8 bg-background-secondary rounded-2xl border border-border-subtle shadow-lg relative">
        <div className="flex justify-end w-full mb-2">
          <button
            type="button"
            onClick={handleToggleLanguage}
            className="text-xs px-2.5 py-1 rounded-full border border-border-default hover:bg-background-hover text-text-secondary transition-colors cursor-pointer"
          >
            {isPersian ? '🌐 English' : '🌐 فارسی'}
          </button>
        </div>

        <div className="flex flex-col items-center mb-6 text-center">
          <div className="mb-4">
            <Goose className="size-10 text-text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Houshiar Code</h1>
          <p className="text-sm text-text-muted mt-1">
            {isPersian
              ? 'کلید API هوشیار را برای اتصال وارد کنید'
              : 'Enter your Houshiar API key to get started'}
          </p>
        </div>

        <form onSubmit={handleHoushiarConnect} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              {isPersian ? 'کلید API هوشیار:' : 'Houshiar API Key:'}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
              }}
              placeholder={
                isPersian
                  ? 'کلید API خود را وارد کنید (sk-waiq-...)'
                  : 'Enter your API key (sk-waiq-...)'
              }
              className="w-full bg-background-default border-border-default focus:border-accent text-sm"
              disabled={isValidating}
              dir="ltr"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-xs text-danger font-medium text-center p-2 rounded bg-danger/10 border border-danger/20">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="text-xs text-success font-medium text-center p-2 rounded bg-success/10 border border-success/20">
              {successMessage}
            </div>
          )}

          <Button
            type="submit"
            className="w-full py-2.5 font-medium"
            disabled={isValidating || !apiKey.trim()}
          >
            {isValidating
              ? isPersian
                ? 'در حال اتصال...'
                : 'Connecting...'
              : isPersian
                ? 'اتصال به هوشیار'
                : 'Connect to Houshiar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
