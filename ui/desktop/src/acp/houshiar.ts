import type { HoushiarUsageData } from '../types/houshiar';
import { getAcpClient } from './acpConnection';

export async function acpGetHoushiarUsage(customApiKey?: string): Promise<HoushiarUsageData> {
  // If custom API key is passed directly (e.g. from UI input before saving), query endpoints
  if (customApiKey && customApiKey.trim()) {
    const key = customApiKey.trim();
    const endpoints = [
      'https://api.houshiar-ai.ir/v1/messages/usage',
      'https://api.houshiar-ai.ir/v1/message/usage',
      'https://wqai.morvism.ir/v1/messages/usage',
      'https://wqai.morvism.ir/v1/message/usage',
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'Authorization': `Bearer ${key}`,
            'x-client-brand': 'houshiar-code',
          },
        });
        if (response.ok) {
          const data = await response.json();
          return data as HoushiarUsageData;
        }
      } catch {
        // try next endpoint
      }
    }
  }

  // Otherwise query via ACP backend (which has access to the stored key)
  try {
    const client = await getAcpClient();
    const result = await client.connection.agent.request('goose/houshiar/usage', {});
    return result as HoushiarUsageData;
  } catch (err: any) {
    const msg = err?.data || err?.message || String(err);
    throw new Error(msg);
  }
}
