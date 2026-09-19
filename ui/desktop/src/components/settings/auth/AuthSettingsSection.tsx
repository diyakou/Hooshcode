import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  KeyRound,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  acpAuthenticateProvider,
  acpDeleteProviderSecret,
  acpListProviderSecrets,
  acpSaveDefaults,
  acpSaveProviderConfig,
  type ProviderSecretDto,
} from '../../../acp/providers';
import { errorMessage } from '../../../utils/conversionUtils';
import { acpUpsertConfig } from '../../../acp/config';
import { useModelAndProvider } from '../../ModelAndProviderContext';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { ConfirmationModal } from '../../ui/ConfirmationModal';
import HoushiarUsageSection from './HoushiarUsageSection';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  title: {
    id: 'authSettings.title',
    defaultMessage: 'Provider Credentials',
  },
  description: {
    id: 'authSettings.description',
    defaultMessage: 'Manage provider credentials stored locally by Houshiar Code.',
  },
  loading: {
    id: 'authSettings.loading',
    defaultMessage: 'Loading credentials...',
  },
  empty: {
    id: 'authSettings.empty',
    defaultMessage: 'No locally stored provider credentials were found.',
  },
  failedToLoad: {
    id: 'authSettings.failedToLoad',
    defaultMessage: 'Failed to load provider credentials',
  },
  deleteTitle: {
    id: 'authSettings.deleteTitle',
    defaultMessage: 'Delete credential',
  },
  deleteMessage: {
    id: 'authSettings.deleteMessage',
    defaultMessage: 'Delete the {name} credential for {provider}?',
  },
  activeProviderWarning: {
    id: 'authSettings.activeProviderWarning',
    defaultMessage:
      'This is the active provider. New requests may fail until you configure another credential.',
  },
  delete: {
    id: 'authSettings.delete',
    defaultMessage: 'Delete',
  },
  cancel: {
    id: 'authSettings.cancel',
    defaultMessage: 'Cancel',
  },
  deleted: {
    id: 'authSettings.deleted',
    defaultMessage: 'Credential deleted',
  },
  failedToDelete: {
    id: 'authSettings.failedToDelete',
    defaultMessage: 'Failed to delete credential: {error}',
  },
  storageSecretStore: {
    id: 'authSettings.storageSecretStore',
    defaultMessage: 'Secret store',
  },
  storageProviderCache: {
    id: 'authSettings.storageProviderCache',
    defaultMessage: 'Provider cache',
  },
  expiresAt: {
    id: 'authSettings.expiresAt',
    defaultMessage: 'Expires {date}',
  },
  deleteCredential: {
    id: 'authSettings.deleteCredential',
    defaultMessage: 'Delete credential',
  },
  signIn: {
    id: 'authSettings.signIn',
    defaultMessage: 'Sign in',
  },
  reauthorize: {
    id: 'authSettings.reauthorize',
    defaultMessage: 'Reauthorize',
  },
  signedIn: {
    id: 'authSettings.signedIn',
    defaultMessage: 'Credential configured',
  },
  failedToConfigure: {
    id: 'authSettings.failedToConfigure',
    defaultMessage: 'Failed to configure credential: {error}',
  },
});

function storageLabel(secret: ProviderSecretDto, intl: ReturnType<typeof useIntl>) {
  if (secret.storage === 'provider_cache') {
    return intl.formatMessage(i18n.storageProviderCache);
  }
  return intl.formatMessage(i18n.storageSecretStore);
}

function expiryLabel(secret: ProviderSecretDto, intl: ReturnType<typeof useIntl>) {
  if (!secret.expiresAt) {
    return null;
  }
  return intl.formatMessage(i18n.expiresAt, {
    date: intl.formatDate(new Date(secret.expiresAt), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  });
}

function expiryClass(secret: ProviderSecretDto) {
  if (secret.status === 'expired') {
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  }
  return 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300';
}

export default function AuthSettingsSection() {
  const intl = useIntl();
  const { currentProvider, refreshCurrentModelAndProvider } = useModelAndProvider();
  const [secrets, setSecrets] = useState<ProviderSecretDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [secretToDelete, setSecretToDelete] = useState<ProviderSecretDto | null>(null);

  const [houshiarKeyInput, setHoushiarKeyInput] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const secrets = await acpListProviderSecrets();
      setSecrets(secrets);
    } catch {
      toast.error(intl.formatMessage(i18n.failedToLoad));
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const hasHoushiarKey = secrets.some(
    (s) => s.provider?.toLowerCase().includes('houshiar') && (s.hasSecret || s.configured)
  );

  const handleSaveHoushiarKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedKey = houshiarKeyInput.trim();
    if (!trimmedKey) {
      setKeyError('کلید API نمی‌تواند خالی باشد');
      return;
    }

    setIsSavingKey(true);
    setKeyError(null);

    try {
      let models: string[] = [];
      try {
        const response = await fetch('https://wqai.morvism.ir/v1/models', {
          method: 'GET',
          headers: {
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
            'x-client-brand': 'houshiar-code',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const arr = Array.isArray(data) ? data : data.data || data.models || [];
          models = arr
            .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
            .filter(Boolean);
        }
      } catch (fetchErr) {
        console.warn('Could not fetch models directly from renderer:', fetchErr);
      }

      if (models.length > 0) {
        try {
          await window.electron.setSetting('houshiar_models', models);
        } catch {}
      }

      const defaultModel = models.includes('claude-sonnet-5')
        ? 'claude-sonnet-5'
        : models[0] || 'claude-sonnet-5';

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
        await acpUpsertConfig('GOOSE_MODEL', 'claude-sonnet-5', false);
      } catch {}

      await refreshCurrentModelAndProvider();
      await loadSecrets();

      toast.success('کلید API هوشیار با موفقیت ذخیره شد');
      setIsEditingKey(false);
      setHoushiarKeyInput('');
    } catch (err: any) {
      console.error('Error saving Houshiar key:', err);
      const msg = err?.message || err?.data || String(err);
      setKeyError(`خطا در ذخیره‌سازی: ${msg}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const confirmDelete = async () => {
    if (!secretToDelete) {
      return;
    }

    setDeletingId(secretToDelete.id);
    try {
      await acpDeleteProviderSecret(secretToDelete.id);
      toast.success(intl.formatMessage(i18n.deleted));
      setSecretToDelete(null);
      await loadSecrets();
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.failedToDelete, {
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      setDeletingId(null);
    }
  };

  const configureSecret = async (secret: ProviderSecretDto) => {
    if (!secret.configureProvider) {
      return;
    }

    setConfiguringId(secret.id);
    try {
      await acpAuthenticateProvider(secret.configureProvider);
      toast.success(intl.formatMessage(i18n.signedIn));
      await loadSecrets();
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.failedToConfigure, {
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      setConfiguringId(null);
    }
  };

  const isActiveProvider = secretToDelete?.provider === currentProvider;

  return (
    <section id="auth" className="space-y-4 pr-4 mt-1">
      {/* Houshiar API Key Management Card */}
      <Card className="pb-3 border border-border-primary">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-accent" />
              {intl.locale.startsWith('fa') ? 'کلید API هوشیار' : 'Houshiar API Key'}
            </CardTitle>
            {hasHoushiarKey && !isEditingKey && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20">
                <CheckCircle2 className="h-3 w-3" />
                {intl.locale.startsWith('fa') ? 'متصل است' : 'Connected'}
              </span>
            )}
            {!hasHoushiarKey && !isEditingKey && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                {intl.locale.startsWith('fa') ? 'تنظیم نشده' : 'Not Configured'}
              </span>
            )}
          </div>
          <CardDescription>
            {intl.locale.startsWith('fa')
              ? 'کلید API هوشیار را در این بخش تنظیم یا بروزرسانی کنید.'
              : 'Configure or update your Houshiar API key here.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 py-2">
          {hasHoushiarKey && !isEditingKey ? (
            <div className="flex items-center justify-between py-2">
              <div className="space-y-1">
                <div className="text-xs text-text-secondary">
                  {intl.locale.startsWith('fa') ? 'کلید فعال:' : 'Active Key:'}
                </div>
                <div className="font-mono text-sm tracking-widest text-text-primary">
                  ••••••••••••••••••••••••••••••••
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setIsEditingKey(true);
                  setKeyError(null);
                }}
              >
                <Edit3 className="h-3.5 w-3.5" />
                {intl.locale.startsWith('fa') ? 'تغییر کلید API' : 'Change API Key'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSaveHoushiarKey} className="space-y-3 pt-1">
              <div className="flex flex-col gap-2">
                <Input
                  type="password"
                  placeholder={
                    intl.locale.startsWith('fa')
                      ? 'کلید API خود را وارد کنید (sk-waiq-...)'
                      : 'Enter your API key (sk-waiq-...)'
                  }
                  value={houshiarKeyInput}
                  onChange={(e) => {
                    setHoushiarKeyInput(e.target.value);
                    setKeyError(null);
                  }}
                  disabled={isSavingKey}
                  className="font-mono text-sm"
                  dir="ltr"
                  autoFocus
                />
                {keyError && <p className="text-xs text-red-500 font-medium">{keyError}</p>}
              </div>
              <div className="flex items-center gap-2 justify-end">
                {hasHoushiarKey && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSavingKey}
                    onClick={() => {
                      setIsEditingKey(false);
                      setKeyError(null);
                      setHoushiarKeyInput('');
                    }}
                  >
                    {intl.locale.startsWith('fa') ? 'انصراف' : 'Cancel'}
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingKey || !houshiarKeyInput.trim()}
                  className="gap-2"
                >
                  {isSavingKey ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {intl.locale.startsWith('fa') ? 'در حال ذخیره...' : 'Saving...'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      {intl.locale.startsWith('fa') ? 'ذخیره کلید' : 'Save Key'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Houshiar Usage, Plan, and Token Metrics Dashboard */}
      <HoushiarUsageSection />

      <Card className="pb-2">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {intl.formatMessage(i18n.title)}
          </CardTitle>
          <CardDescription>{intl.formatMessage(i18n.description)}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 py-2">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              {intl.formatMessage(i18n.loading)}
            </div>
          ) : secrets.length === 0 ? (
            <div className="py-6 text-sm text-text-secondary">{intl.formatMessage(i18n.empty)}</div>
          ) : (
            <div className="divide-y divide-border-primary">
              {secrets.map((secret) => (
                <div
                  key={secret.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="auth-secret-row"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-text-primary">
                        {secret.providerDisplayName}
                      </h3>
                      <span className="rounded border border-border-primary bg-background-secondary px-2 py-0.5 text-xs text-text-secondary">
                        {storageLabel(secret, intl)}
                      </span>
                      {expiryLabel(secret, intl) && (
                        <span
                          className={`rounded border px-2 py-0.5 text-xs ${expiryClass(secret)}`}
                        >
                          {expiryLabel(secret, intl)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-text-secondary">
                      {secret.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {secret.canConfigure && secret.configureProvider && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={configuringId === secret.id}
                        onClick={() => configureSecret(secret)}
                      >
                        {configuringId === secret.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : secret.hasSecret || secret.configured ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : (
                          <LogIn className="h-4 w-4" />
                        )}
                        {secret.hasSecret || secret.configured
                          ? intl.formatMessage(i18n.reauthorize)
                          : intl.formatMessage(i18n.signIn)}
                      </Button>
                    )}
                    {secret.canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="round"
                        className="text-text-secondary hover:text-text-primary"
                        disabled={deletingId === secret.id}
                        onClick={() => setSecretToDelete(secret)}
                        aria-label={intl.formatMessage(i18n.deleteCredential)}
                        title={intl.formatMessage(i18n.deleteCredential)}
                      >
                        {deletingId === secret.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={!!secretToDelete}
        title={intl.formatMessage(i18n.deleteTitle)}
        message={
          secretToDelete
            ? intl.formatMessage(i18n.deleteMessage, {
                name: secretToDelete.name,
                provider: secretToDelete.providerDisplayName,
              })
            : ''
        }
        detail={isActiveProvider ? intl.formatMessage(i18n.activeProviderWarning) : undefined}
        onConfirm={confirmDelete}
        onCancel={() => setSecretToDelete(null)}
        confirmLabel={intl.formatMessage(i18n.delete)}
        cancelLabel={intl.formatMessage(i18n.cancel)}
        confirmVariant="destructive"
        isSubmitting={!!deletingId}
      />
    </section>
  );
}
