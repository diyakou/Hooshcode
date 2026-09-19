export interface HoushiarUsageData {
  authenticated: boolean;
  key_masked?: string;
  key_name?: string;
  plan: string;
  managed?: boolean;
  status: string;
  billing_mode?: string;
  daily_limit?: number | null;
  used_today?: number;
  remaining_today?: number | null;
  usage_percent?: number;
  reset_at?: string;
  context_limit?: number;
  context?: {
    limit: number;
    last_request_used: number;
    last_request_remaining: number;
    last_request_percent: number;
  };
  started_at?: string;
  expires_at?: string;
  user_token_balance?: number;
  lifetime?: {
    total_requests: number;
    total_billable_tokens: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  last_request?: {
    request_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    customer_billable_tokens: number;
    created_at: string;
  };
  billing?: {
    mode: string;
    formula?: string;
    input_weight?: number;
    output_weight?: number;
    tokens_used_today: number;
    daily_token_limit?: number;
    daily_tokens_remaining?: number | null;
    tokens_used_month: number;
    monthly_token_limit: number;
    credits_used: number;
    credits_limit: number;
    credits_remaining: number;
    user_token_balance: number;
  };
  limits?: {
    rpm: number;
    concurrency: number;
    max_context_tokens: number;
    max_output_tokens: number;
  };
  error?: string;
}
