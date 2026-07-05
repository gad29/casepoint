export const env = {
  /** Admin login: plain password or bcrypt hash (hash wins when both are set). */
  adminPassword: process.env.ADMIN_PASSWORD,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@casepoint.local',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET,
  adminSessionHours: process.env.ADMIN_SESSION_HOURS || '24',

  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',

  /** Base URL of the n8n webhook endpoint, e.g. https://n8n.example.com/webhook */
  n8nWebhookBaseUrl: process.env.N8N_WEBHOOK_BASE_URL,
  /** Shared secret n8n sends in x-casepoint-api-key when reading data from the app. */
  apiAccessToken: process.env.CASEPOINT_API_TOKEN,
  /** Shared secret for POST /api/webhooks/n8n when not using an admin session. */
  n8nForwarderSecret: process.env.N8N_FORWARDER_SECRET,

  /** Root folder for the JSON database and per-client document folders. */
  dataDir: process.env.DATA_DIR || './data',
  uploadMaxFileBytes: (() => {
    const raw = process.env.UPLOAD_MAX_FILE_BYTES;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    return 25 * 1024 * 1024;
  })(),
};

export function looksLikePlaceholder(value?: string | null) {
  if (!value) return true;
  return value.includes('example.com') || value.includes('change-me') || value.includes('replace-with-');
}

export function hasAdminPassword() {
  return Boolean(
    (env.adminPasswordHash && !looksLikePlaceholder(env.adminPasswordHash)) ||
    (env.adminPassword && !looksLikePlaceholder(env.adminPassword)),
  );
}

export function hasN8nConfig() {
  return Boolean(env.n8nWebhookBaseUrl && !looksLikePlaceholder(env.n8nWebhookBaseUrl));
}

export function hasApiAccessToken() {
  return Boolean(env.apiAccessToken && !looksLikePlaceholder(env.apiAccessToken));
}

export function hasLiveAppBaseUrl() {
  return Boolean(env.appBaseUrl && !env.appBaseUrl.includes('localhost'));
}

export function isProductionLike() {
  return process.env.NODE_ENV === 'production' || hasLiveAppBaseUrl();
}
