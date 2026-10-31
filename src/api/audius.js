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
      throw new AudiusError("Music service rate limit reached. Please wait a moment and retry.", 429);
    }
    throw new AudiusError(
      detail.replace(/https?:\/\/\S+|audius/gi, "music service") || `Music service request failed (${response.status}).`,
      response.status,
    );
  }

  const payload = await response.json();
  if (!payload || !("data" in payload)) {
    throw new AudiusError("The music service returned an unexpected response.");
  }
  cache.set(cacheKey, { data: payload.data, expiresAt: Date.now() + cacheMs });
  return payload.data;
}

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export const getTrendingTracks = (signal, filters = {}) =>
  audius(`/tracks/trending?${queryString({ limit: 24, ...filters })}`, { signal, cacheMs: 60_000 });

export const getTrendingPlaylists = (signal) =>
  audius(`/playlists/trending?${queryString({ limit: 12 })}`, { signal, cacheMs: 60_000 });

export const getRecentPlaylists = (signal) =>
  audius(`/playlists?${queryString({ sort_method: "recent", limit: 12 })}`, { signal, cacheMs: 60_000 });

export const searchTracks = (query, signal, options = {}) =>
  audius(`/tracks/search?${queryString({ query, limit: 30, ...options })}`, { signal });

export const searchUsers = (query, signal) =>
  audius(`/users/search?${queryString({ query, limit: 20 })}`, { signal });

export const searchPlaylists = (query, signal) =>
  audius(`/playlists/search?${queryString({ query, limit: 30 })}`, { signal });

export const getTrack = (id, signal) => audius(`/tracks/${encodeURIComponent(id)}`, { signal });

export const getUser = (id, signal) => audius(`/users/${encodeURIComponent(id)}`, { signal });

export const getUserTracks = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/tracks?${queryString({ limit: 30 })}`, { signal });

export const getUserAlbums = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/albums?${queryString({ limit: 30 })}`, { signal });

export const getUserPlaylists = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/playlists?${queryString({ limit: 30 })}`, { signal });

export const getUserReposts = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/reposts?${queryString({ limit: 30 })}`, { signal });

export const getUserFavorites = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/favorites?${queryString({ limit: 30 })}`, { signal });

export const getUserFollowers = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/followers?${queryString({ limit: 30 })}`, { signal });

export const getUserFollowing = (id, signal) =>
  audius(`/users/${encodeURIComponent(id)}/following?${queryString({ limit: 30 })}`, { signal });

export const getTrackRemixes = (id, signal) =>
  audius(`/tracks/${encodeURIComponent(id)}/remixes?${queryString({ limit: 20 })}`, { signal });

export const getTrackComments = (id, signal, options = {}) =>
  audius(`/tracks/${encodeURIComponent(id)}/comments?${queryString({ limit: 20, ...options })}`, { signal });

export const getTrackFavorites = (id, signal) =>
  audius(`/tracks/${encodeURIComponent(id)}/favorites?${queryString({ limit: 20 })}`, { signal });

export const getPlaylist = (id, signal) =>
  audius(`/playlists/${encodeURIComponent(id)}`, { signal });

export function getStreamUrl(trackId) {
  const url = new URL(`${apiBase}/tracks/${encodeURIComponent(trackId)}/stream`);
  url.searchParams.set("app_name", appName);
  return url.toString();
}

export function getDownloadUrl(trackId) {
  const url = new URL(`${apiBase}/tracks/${encodeURIComponent(trackId)}/download`);
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
