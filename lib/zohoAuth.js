// lib/zohoAuth.js
// Caches a Zoho access_token per server instance and refreshes it safely.
// Prevents many users from racing to refresh at the same time.

let cachedToken = null;
let expiryMs = 0;
let refreshPromise = null;

const SKEW_MS = 5 * 60 * 1000; // refresh 5 min before actual expiry

async function doRefresh() {
  const url =
    `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token` +
    `?refresh_token=${encodeURIComponent(process.env.ZOHO_REFRESH_TOKEN)}` +
    `&client_id=${encodeURIComponent(process.env.ZOHO_CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(process.env.ZOHO_CLIENT_SECRET)}` +
    `&grant_type=refresh_token`;

  const resp = await fetch(url, { method: "POST" });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Zoho refresh parse error: ${text}`);
  }

  if (!data.access_token) {
    throw new Error(`Zoho refresh failed: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  const expiresInSec = Number(data.expires_in || 3600);
  // set expiry with a safety buffer
  expiryMs = Date.now() + Math.max(0, (expiresInSec * 1000) - SKEW_MS);

  return cachedToken;
}

export async function getZohoAccessToken() {
  const now = Date.now();
  if (cachedToken && now < expiryMs) {
    return cachedToken;
  }
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export function invalidateZohoToken() {
  cachedToken = null;
  expiryMs = 0;
}
