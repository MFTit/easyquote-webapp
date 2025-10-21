// lib/zohoAuth.js
// Enhanced Zoho Auth Manager with cooldown protection and safe refresh throttling

let cachedToken = null;
let expiryMs = 0;
let refreshPromise = null;
let cooldownUntil = 0; // timestamp until which refreshes are paused

const SKEW_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const COOLDOWN_MS = 60 * 1000; // 1-minute pause after Zoho Access Denied

async function doRefresh() {
  // If we’re in cooldown, throw gracefully
  const now = Date.now();
  if (now < cooldownUntil) {
    const waitSec = Math.ceil((cooldownUntil - now) / 1000);
    throw new Error(`Zoho cooldown active (${waitSec}s left). Please wait.`);
  }

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

  // Handle Zoho’s “too many requests” or “access denied”
  if (data.error) {
    if (data.error_description && data.error_description.includes("too many requests")) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      throw new Error("Zoho Access Denied: rate limit triggered. Cooldown 60s.");
    }
    throw new Error(`Zoho refresh failed: ${JSON.stringify(data)}`);
  }

  // Store new access token
  cachedToken = data.access_token;
  const expiresInSec = Number(data.expires_in || 3600);
  expiryMs = Date.now() + Math.max(0, expiresInSec * 1000 - SKEW_MS);

  return cachedToken;
}

export async function getZohoAccessToken() {
  const now = Date.now();

  // If cached and valid, return it
  if (cachedToken && now < expiryMs) return cachedToken;

  // If cooldown is active, throw gently
  if (now < cooldownUntil) {
    const waitSec = Math.ceil((cooldownUntil - now) / 1000);
    throw new Error(`Zoho cooldown active (${waitSec}s left).`);
  }

  // Only one refresh at a time per instance
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }

  return refreshPromise;
}

export function invalidateZohoToken() {
  cachedToken = null;
  expiryMs = 0;
}
