import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { acpGetHoushiarUsage } from '../../../acp/houshiar';
import type { HoushiarUsageData } from '../../../types/houshiar';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { useIntl } from '../../../i18n';

interface HoushiarUsageSectionProps {
  apiKey?: string;
}

export default function HoushiarUsageSection({ apiKey }: HoushiarUsageSectionProps) {
  const intl = useIntl();
  const isPersian = intl.locale.startsWith('fa');
  const [usage, setUsage] = useState<HoushiarUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(
    async (key?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await acpGetHoushiarUsage(key);
        setUsage(data);
      } catch (err: any) {
        const msg =
          err?.message ||
          (isPersian ? 'دریافت آمار مصرف با خطا مواجه شد' : 'Failed to fetch usage metrics');
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [isPersian]
  );

  useEffect(() => {
    fetchUsage(apiKey);
  }, [fetchUsage, apiKey]);

  // Calculations for display
  const tokensToday = usage?.billing?.tokens_used_today ?? usage?.used_today ?? 0;
  const balance =
    usage?.billing?.credits_remaining ??
    usage?.billing?.user_token_balance ??
    usage?.user_token_balance ??
    0;
  const tokensMonth = usage?.billing?.tokens_used_month ?? 0;
  const monthLimit = usage?.billing?.monthly_token_limit ?? 40_000_000;
  const contextLimit =
    usage?.context_limit ?? usage?.context?.limit ?? usage?.limits?.max_context_tokens ?? 200_000;

  const usagePercent =
    monthLimit > 0
      ? Math.min(100, Math.round((tokensMonth / monthLimit) * 100 * 10) / 10)
      : (usage?.usage_percent ?? 0);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(isPersian ? 'fa-IR' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const num = (n: number) => n.toLocaleString(isPersian ? 'fa-IR' : 'en-US');

  return (
    <Card className="border border-border-primary">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" />
            <CardTitle className="text-base">
              {isPersian ? 'آمار مصرف و اشتراک' : 'Usage & Subscription'}
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 self-start sm:self-auto text-xs"
            disabled={loading}
            onClick={() => {
              fetchUsage(apiKey);
              toast.info(
                isPersian ? 'در حال بروزرسانی آمار مصرف...' : 'Refreshing usage metrics...'
              );
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {isPersian ? 'بروزرسانی آمار' : 'Refresh'}
          </Button>
        </div>
        <CardDescription className="text-xs mt-1">
          {isPersian
            ? 'گزارش آنلاین میزان مصرف روزانه و ماهانه، موجودی باقیمانده و سقف منابع حساب شما در هوشیار'
            : 'Real-time overview of daily & monthly token usage, credits, and plan limits on Houshiar'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4 pt-1">
        {loading && !usage ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <span>
              {isPersian ? 'در حال دریافت اطلاعات مصرف و پلن...' : 'Loading usage and plan data...'}
            </span>
          </div>
        ) : error && !usage ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {isPersian
                ? 'پس از ذخیره کلید API، وضعیت مصرف به صورت خودکار نمایش داده می‌شود.'
                : 'Usage metrics will appear automatically once an API key is configured.'}
            </p>
          </div>
        ) : usage ? (
          <>
            {/* Top Row: Plan info */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border-subtle bg-background-secondary p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {isPersian ? 'پلن اشتراک' : 'Plan'}
                  </span>
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-lg font-bold uppercase tracking-tight text-text-primary">
                    {usage.plan || 'Standard'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {isPersian
                      ? usage.status === 'active'
                        ? 'فعال'
                        : usage.status
                      : usage.status === 'active'
                        ? 'Active'
                        : usage.status}
                  </span>
                </div>
                {usage.key_masked && (
                  <div className="mt-1 text-[11px] font-mono text-text-muted break-all" dir="ltr">
                    {usage.key_masked}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border-subtle bg-background-secondary p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {isPersian ? 'مصرف امروز' : "Today's Usage"}
                  </span>
                  <Zap className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="mt-2 text-lg font-bold text-text-primary">
                  {num(tokensToday)}{' '}
                  <span className="text-xs font-normal text-text-muted">
                    {isPersian ? 'توکن' : 'tokens'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-text-muted">
                  {isPersian
                    ? `حالت هزینه‌بندی: ${usage.billing_mode || 'پنجره زمینه'}`
                    : `Billing mode: ${usage.billing_mode || 'context_window'}`}
                </div>
              </div>

              <div className="rounded-lg border border-border-subtle bg-background-secondary p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {isPersian ? 'موجودی اعتبار' : 'Credit Balance'}
                  </span>
                  <Cpu className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="mt-2 text-lg font-bold text-text-primary">
                  {num(balance)}{' '}
                  <span className="text-xs font-normal text-text-muted">
                    {isPersian ? 'توکن' : 'tokens'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-text-muted">
                  {isPersian
                    ? `انقضا: ${formatDate(usage.expires_at)}`
                    : `Expires: ${formatDate(usage.expires_at)}`}
                </div>
              </div>
            </div>

            {/* Monthly Progress Bar */}
            <div className="rounded-lg border border-border-subtle bg-background-secondary p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-primary">
                  {isPersian ? 'مصرف این ماه:' : 'Monthly Usage:'}
                </span>
                <span className="font-mono text-text-secondary">
                  {num(tokensMonth)} / {num(monthLimit)} {isPersian ? 'توکن' : 'tokens'} (
                  {usagePercent}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-background-tertiary">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(1, Math.min(100, usagePercent))}%` }}
                />
              </div>
            </div>

            {/* Limits & Capabilities Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
              <div className="rounded-lg border border-border-subtle bg-background-secondary/60 p-2.5">
                <div className="text-[11px] text-text-secondary">
                  {isPersian ? 'سقف پنجره متنی' : 'Context Window'}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-text-primary">
                  {num(contextLimit)}
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-background-secondary/60 p-2.5">
                <div className="text-[11px] text-text-secondary">
                  {isPersian ? 'درخواست در دقیقه (RPM)' : 'Requests/Min (RPM)'}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-text-primary">
                  {usage.limits?.rpm ?? 60}
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-background-secondary/60 p-2.5">
                <div className="text-[11px] text-text-secondary">
                  {isPersian ? 'درخواست همزمان' : 'Concurrency'}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-text-primary">
                  {usage.limits?.concurrency ?? 4}
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-background-secondary/60 p-2.5">
                <div className="text-[11px] text-text-secondary">
                  {isPersian ? 'حداکثر خروجی' : 'Max Output'}
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-text-primary">
                  {num(usage.limits?.max_output_tokens ?? 8192)}
                </div>
              </div>
            </div>

            {/* Last Request Information if available */}
            {usage.last_request && (
              <div className="rounded-lg border border-border-subtle bg-background-secondary/40 p-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2 text-text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {isPersian ? 'آخرین درخواست: مدل ' : 'Last Request: Model '}
                    <strong className="text-text-primary font-mono">
                      {usage.last_request.model}
                    </strong>
                  </span>
                </div>
                <div className="font-mono text-text-secondary">
                  {isPersian
                    ? `توکن مصرفی: ${num(usage.last_request.customer_billable_tokens ?? 0)} (ورودی: ${num(usage.last_request.input_tokens ?? 0)} / خروجی: ${num(usage.last_request.output_tokens ?? 0)})`
                    : `Tokens used: ${num(usage.last_request.customer_billable_tokens ?? 0)} (In: ${num(usage.last_request.input_tokens ?? 0)} / Out: ${num(usage.last_request.output_tokens ?? 0)})`}
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
