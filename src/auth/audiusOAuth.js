const API_BASE = "https://api.audius.co/v1";
const TOKEN_STORAGE_KEY = "soungdify.audius.auth";
const OAUTH_STATE_KEY = "soungdify.audius.oauth";
const apiKey = import.meta.env.VITE_AUDIUS_API_KEY?.trim() || "";

export class AudiusAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AudiusAuthError";
    this.status = status;
  }
}

function getRedirectUri() {
  const configured = import.meta.env.VITE_AUDIUS_REDIRECT_URI?.trim();
  return configured || `${window.location.origin}/callback`;
}

function getStoredTokens() {
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_STORAGE_KEY) || "null");
    if (stored?.accessToken && stored?.refreshToken && stored?.user) return stored;
  } catch (error) {
    console.error("Unable to read Audius sign-in state.", error);
  }
  return null;
}

function saveTokens(tokens) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error("Unable to save Audius sign-in state.", error);
    throw new AudiusAuthError("Browser storage is unavailable; Audius sign-in could not be saved.");
  }
}

function clearTokens() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function tokenExpiry(response) {
  const seconds = Number(response.expires_in);
  return Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.now() + 55 * 60 * 1000;
}

async function parseResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error_description || payload?.message || payload?.error;
    throw new AudiusAuthError(message || `Audius request failed (${response.status}).`, response.status);
  }
  if (!payload || typeof payload !== "object") {
    throw new AudiusAuthError("Audius returned an unexpected response.");
  }
  return payload;
}

function authPayload(payload) {
  return payload.data && typeof payload.data === "object" ? payload.data : payload;
}

async function getProfile(accessToken) {
  const url = new URL(`${API_BASE}/me`);
  url.searchParams.set("app_name", "soungdify");
  const payload = await parseResponse(await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  }));
  const user = authPayload(payload);
  if (!user?.userId && !user?.id) throw new AudiusAuthError("Audius did not return a signed-in profile.");
  return { ...user, userId: String(user.userId ?? user.id) };
}

async function refreshTokens(tokens) {
  if (!apiKey) throw new AudiusAuthError("Add VITE_AUDIUS_API_KEY to enable Audius sign-in.");
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: apiKey,
    }),
  });
  const payload = authPayload(await parseResponse(response));
  if (!payload.access_token || !payload.refresh_token) {
    throw new AudiusAuthError("Audius could not refresh the sign-in session.");
  }
  const updated = {
    ...tokens,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: tokenExpiry(payload),
  };
  saveTokens(updated);
  return updated;
}

let refreshInFlight;

async function currentTokens(forceRefresh = false) {
  const tokens = getStoredTokens();
  if (!tokens) throw new AudiusAuthError("Sign in with Audius to use this feature.");
  if (!forceRefresh && tokens.expiresAt > Date.now() + 30_000) return tokens;
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens(tokens).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export function isAudiusAuthConfigured() {
  return Boolean(apiKey);
}

export async function beginAudiusLogin() {
  if (!apiKey) throw new AudiusAuthError("Add VITE_AUDIUS_API_KEY to enable Audius sign-in.");
  const redirectUri = getRedirectUri();
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64Url(verifierBytes);
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const session = { codeVerifier, state, redirectUri };
  sessionStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(session));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const authorize = new URL(`${API_BASE}/oauth/authorize`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "write");
  authorize.searchParams.set("api_key", apiKey);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", base64Url(new Uint8Array(digest)));
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("app_name", "soungdify");
  window.location.assign(authorize.toString());
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function hasOAuthCallback() {
  const url = new URL(window.location.href);
  return url.pathname === "/callback"
    && (url.searchParams.has("code") || url.searchParams.has("error")
      || new URLSearchParams(url.hash.slice(1)).has("code"));
}

export async function completeAudiusLogin() {
  if (!apiKey) throw new AudiusAuthError("Add VITE_AUDIUS_API_KEY to enable Audius sign-in.");
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.slice(1));
  for (const [key, value] of fragment) if (!params.has(key)) params.set(key, value);

  const oauthState = JSON.parse(sessionStorage.getItem(OAUTH_STATE_KEY) || "null");
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  if (params.has("error")) {
    throw new AudiusAuthError(params.get("error_description") || "Audius sign-in was not completed.");
  }
  if (!oauthState?.state || params.get("state") !== oauthState.state) {
    throw new AudiusAuthError("Audius sign-in could not be verified. Please try again.");
  }
  const code = params.get("code");
  if (!code) throw new AudiusAuthError("Audius did not return a sign-in code.");

  const tokenResponse = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: oauthState.codeVerifier,
      client_id: apiKey,
      redirect_uri: oauthState.redirectUri,
    }),
  });
  const tokenPayload = authPayload(await parseResponse(tokenResponse));
  if (!tokenPayload.access_token || !tokenPayload.refresh_token) {
    throw new AudiusAuthError("Audius did not return a complete sign-in session.");
  }
  const user = await getProfile(tokenPayload.access_token);
  const tokens = {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: tokenExpiry(tokenPayload),
    user,
  };
  saveTokens(tokens);
  window.history.replaceState({}, document.title, "/callback");
  return user;
}

export async function restoreAudiusSession() {
  const tokens = getStoredTokens();
  if (!tokens) return null;
  try {
    const current = await currentTokens();
    const user = await getProfile(current.accessToken);
    const updated = { ...current, user };
    saveTokens(updated);
    return user;
  } catch (error) {
    if (error instanceof AudiusAuthError && error.status === 401) {
      clearTokens();
      return null;
    }
    throw error;
  }
}

export async function getAudiusAccessToken() {
  const tokens = await currentTokens();
  return tokens.accessToken;
}

export async function revokeAudiusSession() {
  const tokens = getStoredTokens();
  clearTokens();
  if (!tokens?.refreshToken || !apiKey) return;
  const response = await fetch(`${API_BASE}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token: tokens.refreshToken, client_id: apiKey }),
  });
  if (!response.ok) {
    throw new AudiusAuthError(`Audius could not revoke the session (${response.status}).`, response.status);
  }
}

export async function audiusAccountRequest(path, { method = "GET", body, signal } = {}) {
  if (!apiKey) throw new AudiusAuthError("Add VITE_AUDIUS_API_KEY to use Audius account features.");
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("app_name", "soungdify");
  url.searchParams.set("api_key", apiKey);
  const send = async (token) => fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined && !["POST", "PUT", "PATCH"].includes(method)
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  let token = await getAudiusAccessToken();
  let response = await send(token);
  if (response.status === 401) {
    const refreshed = await currentTokens(true);
    token = refreshed.accessToken;
    response = await send(token);
  }
  return authPayload(await parseResponse(response));
}
