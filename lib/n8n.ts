import { env } from '@/lib/env';

export async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, error: `Webhook failed with ${res.status}` } as const;
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const data = contentType.includes('application/json') ? (text.trim() ? JSON.parse(text) : null) : text;
  return { ok: true, data } as const;
}

export async function triggerN8n(pathname: string, payload: unknown) {
  if (!env.n8nWebhookBaseUrl) {
    return { ok: false, error: 'N8N webhook base URL is not configured' } as const;
  }

  const url = `${env.n8nWebhookBaseUrl.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`;
  return postJson(url, payload);
}
