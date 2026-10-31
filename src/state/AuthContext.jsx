import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  audiusAccountRequest, beginAudiusLogin, completeAudiusLogin, hasOAuthCallback,
  isAudiusAuthConfigured, restoreAudiusSession, revokeAudiusSession,
} from "../auth/audiusOAuth.js";
import { getId } from "../api/audius.js";

const AuthContext = createContext(null);
const favoriteTrackId = (item) => String(item?.track?.id ?? item?.track_id ?? item?.id ?? "");
const followedUserId = (item) => String(item?.user?.id ?? item?.user_id ?? item?.id ?? "");

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [audiusFavorites, setAudiusFavorites] = useState([]);
  const [audiusPlaylists, setAudiusPlaylists] = useState([]);
  const [following, setFollowing] = useState([]);
  const [accountLibraryLoading, setAccountLibraryLoading] = useState(false);
  const callbackStarted = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== "/callback" || !hasOAuthCallback() || callbackStarted.current) return undefined;
    callbackStarted.current = true;
    setStatus("loading");
    completeAudiusLogin()
      .then((profile) => {
        setUser(profile);
        setError("");
        setStatus("authenticated");
        navigate("/profile", { replace: true });
      })
      .catch((callbackError) => {
        setUser(null);
        setError(callbackError.message || "Sign-in failed.");
        setStatus("anonymous");
      });
    return undefined;
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname === "/callback" && hasOAuthCallback()) return undefined;
    let active = true;
    restoreAudiusSession()
      .then((profile) => {
        if (!active) return;
        setUser(profile);
        setStatus(profile ? "authenticated" : "anonymous");
      })
      .catch((restoreError) => {
        if (!active) return;
        setError(restoreError.message || "Could not restore your session.");
        setStatus("anonymous");
      });
    return () => { active = false; };
  // Session restoration is a single startup check; route changes do not refetch the account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async () => {
    setError("");
    setStatus("loading");
    try {
      await beginAudiusLogin();
    } catch (loginError) {
      setError(loginError.message || "Could not start sign-in.");
      setStatus("anonymous");
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setStatus("anonymous");
    setError("");
    try {
      await revokeAudiusSession();
    } catch (logoutError) {
      setError(logoutError.message || "Your local session was cleared, but sign-out could not be completed.");
    }
  }, []);

  const accountRequest = useCallback((path, options) => {
    if (!user) throw new Error("Sign in to use this feature.");
    return audiusAccountRequest(path, options);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAudiusFavorites([]);
      setAudiusPlaylists([]);
      setFollowing([]);
      setAccountLibraryLoading(false);
      return;
    }
    let active = true;
    setAccountLibraryLoading(true);
    const userId = encodeURIComponent(user.userId);
    Promise.all([
      accountRequest(`/users/${userId}/favorites?limit=100`),
      accountRequest(`/users/${userId}/following?limit=100`),
      accountRequest(`/users/${userId}/playlists?limit=100`),
    ]).then(([favorites, followed, playlists]) => {
      if (!active) return;
      setAudiusFavorites(Array.isArray(favorites) ? favorites : []);
      setFollowing(Array.isArray(followed) ? followed : []);
      setAudiusPlaylists(Array.isArray(playlists) ? playlists : []);
      setError("");
    }).catch((requestError) => {
      if (!active) return;
      setError(requestError.message || "Could not load your account library.");
    }).finally(() => {
      if (active) setAccountLibraryLoading(false);
    });
    return () => { active = false; };
  }, [accountRequest, user]);

  const toggleAudiusFavorite = useCallback(async (track) => {
    if (!user || !track?.id) throw new Error("Sign in to save tracks to your account.");
    const isSaved = audiusFavorites.some((item) => favoriteTrackId(item) === String(track.id));
    const userId = encodeURIComponent(user.userId);
    const trackId = encodeURIComponent(track.id);
    await accountRequest(`/tracks/${trackId}/favorites?user_id=${userId}`, {
      method: isSaved ? "DELETE" : "POST",
    });
    setAudiusFavorites((items) => isSaved
      ? items.filter((item) => favoriteTrackId(item) !== String(track.id))
      : [{ ...track }, ...items]);
    return !isSaved;
  }, [accountRequest, audiusFavorites, user]);

  const toggleFollowing = useCallback(async (artistId) => {
    if (!user) throw new Error("Sign in to follow artists.");
    const isFollowed = following.some((item) => {
      return followedUserId(item) === String(artistId);
    });
    const targetId = encodeURIComponent(artistId);
    const userId = encodeURIComponent(user.userId);
    await accountRequest(`/users/${targetId}/follow?user_id=${userId}`, {
      method: isFollowed ? "DELETE" : "POST",
    });
    setFollowing((items) => isFollowed
      ? items.filter((item) => followedUserId(item) !== String(artistId))
      : [...items, { id: String(artistId) }]);
    return !isFollowed;
  }, [accountRequest, following, user]);

  const repostTrack = useCallback(async (track) => {
    if (!user || !track?.id) throw new Error("Sign in to repost tracks.");
    const userId = encodeURIComponent(user.userId);
    const trackId = encodeURIComponent(track.id);
    return accountRequest(`/tracks/${trackId}/reposts?user_id=${userId}`, { method: "POST" });
  }, [accountRequest, user]);

  const postTrackComment = useCallback(async (trackId, text) => {
    if (!user) throw new Error("Sign in to comment.");
    if (!/^\d+$/.test(String(trackId))) {
      throw new Error("This track cannot be used for comments.");
    }
    const userId = encodeURIComponent(user.userId);
    return accountRequest(`/comments?user_id=${userId}`, {
      method: "POST",
      body: { entityType: "Track", entityId: Number(trackId), body: text.trim() },
    });
  }, [accountRequest, user]);

  const createAudiusPlaylist = useCallback(async (name, description = "") => {
    if (!user) throw new Error("Sign in to create a playlist.");
    const playlistName = name.trim();
    if (!playlistName) throw new Error("Enter a playlist name.");
    const userId = encodeURIComponent(user.userId);
    await accountRequest(`/playlists?user_id=${userId}`, {
      method: "POST",
      body: { playlist_name: playlistName, description: description.trim(), playlist_contents: [] },
    });
    const result = await accountRequest(`/users/${userId}/playlists?limit=100`);
    setAudiusPlaylists(Array.isArray(result) ? result : []);
  }, [accountRequest, user]);

  const updateAudiusPlaylist = useCallback(async (playlist, metadata) => {
    if (!user) throw new Error("Sign in to edit your playlists.");
    const playlistId = getId(playlist);
    if (!playlistId) throw new Error("The playlist could not be identified.");
    const userId = encodeURIComponent(user.userId);
    await accountRequest(`/playlists/${encodeURIComponent(playlistId)}?user_id=${userId}`, {
      method: "PUT",
      body: metadata,
    });
    const result = await accountRequest(`/users/${userId}/playlists?limit=100`);
    setAudiusPlaylists(Array.isArray(result) ? result : []);
  }, [accountRequest, user]);

  const deleteAudiusPlaylist = useCallback(async (playlist) => {
    if (!user) throw new Error("Sign in to delete your playlists.");
    const playlistId = getId(playlist);
    if (!playlistId) throw new Error("The playlist could not be identified.");
    const userId = encodeURIComponent(user.userId);
    await accountRequest(`/playlists/${encodeURIComponent(playlistId)}?user_id=${userId}`, { method: "DELETE" });
    setAudiusPlaylists((items) => items.filter((item) => getId(item) !== playlistId));
  }, [accountRequest, user]);

  const addTrackToAudiusPlaylist = useCallback(async (playlist, track) => {
    if (!user || !track?.id) throw new Error("Sign in to edit your playlists.");
    const playlistId = getId(playlist);
    const trackId = String(track.track_id ?? track.id);
    if (!playlistId) throw new Error("The playlist could not be identified.");
    if (!/^\d+$/.test(trackId)) throw new Error("This track cannot be added to that playlist.");
    const details = await accountRequest(`/playlists/${encodeURIComponent(playlistId)}`);
    const currentTracks = Array.isArray(details.tracks) ? details.tracks : playlist.tracks;
    if (!Array.isArray(currentTracks) && Number(playlist.track_count) > 0) {
      throw new Error("The playlist tracks could not be loaded, so no changes were made.");
    }
    const existing = Array.isArray(currentTracks) ? currentTracks : [];
    const getNumericTrackId = (item) => String(item.track_id ?? item.track?.track_id ?? item.id ?? item.track?.id ?? "");
    if (existing.some((item) => getNumericTrackId(item) === trackId)) return false;
    if (existing.some((item) => !/^\d+$/.test(getNumericTrackId(item)))) {
      throw new Error("This track cannot be safely reordered.");
    }
    const playlistContents = [
      ...existing.map((item) => ({
        track_id: Number(getNumericTrackId(item)),
        timestamp: Number(item.created_at_unix || item.timestamp) || Math.floor(Date.now() / 1000),
      })),
      { track_id: Number(trackId), timestamp: Math.floor(Date.now() / 1000) },
    ];
    await updateAudiusPlaylist(playlist, { playlist_contents: playlistContents });
    return true;
  }, [updateAudiusPlaylist, user]);

  const value = {
    user,
    status,
    error,
    audiusFavorites,
    audiusPlaylists,
    following,
    accountLibraryLoading,
    configured: isAudiusAuthConfigured(),
    login,
    logout,
    accountRequest,
    toggleAudiusFavorite,
    toggleFollowing,
    repostTrack,
    postTrackComment,
    createAudiusPlaylist,
    updateAudiusPlaylist,
    deleteAudiusPlaylist,
    addTrackToAudiusPlaylist,
    clearAuthError: () => setError(""),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
