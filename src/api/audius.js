const configuredBase = import.meta.env.VITE_AUDIUS_API_BASE_URL?.trim();
const apiBase = (configuredBase || "https://discoveryprovider.audius.co/v1").replace(/\/+$/, "");
const appName = import.meta.env.VITE_AUDIUS_APP_NAME?.trim() || "soungdify";
const cache = new Map();
const CACHE_MS = 30_000;

export class AudiusError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AudiusError";
    this.status = status;
  }
}

export async function audius(path, { signal, cacheMs = CACHE_MS } = {}) {
  const url = new URL(`${apiBase}${path}`);
  url.searchParams.set("app_name", appName);
  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.message || body?.error || "";
    } catch {
      detail = "";
    }
    if (response.status === 429) {
      throw new AudiusError("Audius rate limit reached. Please wait a moment and retry.", 429);
    }
    throw new AudiusError(
      detail || `Audius request failed (${response.status}).`,
      response.status,
    );
  }

  const payload = await response.json();
  if (!payload || !("data" in payload)) {
    throw new AudiusError("Audius returned an unexpected response.");
  }
  cache.set(cacheKey, { data: payload.data, expiresAt: Date.now() + cacheMs });
  return payload.data;
}

export const getTrendingTracks = (signal) =>
  audius("/tracks/trending?limit=24", { signal, cacheMs: 60_000 });

export const getTrendingPlaylists = (signal) =>
  audius("/playlists/trending?limit=12", { signal, cacheMs: 60_000 });

export const searchTracks = (query, signal) =>
  audius(`/tracks/search?query=${encodeURIComponent(query)}&limit=30`, { signal });

export const searchUsers = (query, signal) =>
  audius(`/users/search?query=${encodeURIComponent(query)}&limit=20`, { signal });

export const searchPlaylists = (query, signal) =>
  audius(`/playlists/search?query=${encodeURIComponent(query)}&limit=20`, { signal });

export const getTrack = (id, signal) => audius(`/tracks/${encodeURIComponent(id)}`, { signal });

export const getUser = (id, signal) => audius(`/users/${encodeURIComponent(id)}`, { signal });

export const getUserTracks = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/tracks?limit=30`, { signal });

export const getPlaylist = (id, signal) =>
  audius(`/playlists/${encodeURIComponent(id)}`, { signal });

export function getStreamUrl(trackId) {
  const url = new URL(`${apiBase}/tracks/${encodeURIComponent(trackId)}/stream`);
  url.searchParams.set("app_name", appName);
  return url.toString();
}

export function getArtwork(item, size = "480x480") {
  const art = item?.artwork;
  if (typeof art === "string") return art;
  if (art && typeof art === "object") {
    return art[size] || art["1000x1000"] || art["480x480"] || art["150x150"] || "";
  }
  return "";
}

export function getArtist(item) {
  return item?.user?.name || item?.artist || "Unknown artist";
}

export function getId(item) {
  return String(item?.id ?? item?.playlist_id ?? item?.user_id ?? "");
}

export function getApiBase() {
  return apiBase;
}
