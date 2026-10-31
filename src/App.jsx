import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, ChevronDown, CircleHelp, Clock3, Disc3, Heart,
  Home, ListMusic, LoaderCircle, Music2, Pause, Play, Plus, Search, Settings,
  Share2, Shuffle, SkipBack, SkipForward, Sparkles, Sun, Moon, Volume2, VolumeX, X, Download,
  Repeat, ListPlus, SlidersHorizontal, Maximize2, ExternalLink,
  LogIn, LogOut, MessageCircle, Repeat2, UserRound,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AudiusError, getApiBase, getArtist, getArtwork, getDownloadUrl, getId, getPlaylist, getTrack,
  getTrackComments, getTrackRemixes, getTrendingPlaylists, getTrendingTracks,
  getRecentPlaylists, getUser, getUserAlbums, getUserFavorites, getUserFollowers, getUserFollowing,
  getUserPlaylists, getUserReposts, getUserTracks, searchPlaylists, searchTracks, searchUsers,
} from "./api/audius.js";
import { usePlayer } from "./state/PlayerContext.jsx";
import { useAuth } from "./state/AuthContext.jsx";

const genres = ["Electronic", "Hip-Hop", "House", "Lo-Fi", "Pop", "Ambient", "Techno", "Jazz", "Rock", "R&B"];
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};
const formatCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count)) return "—";
  return Intl.NumberFormat(undefined, { notation: count > 9999 ? "compact" : "standard" }).format(count);
};
const getAudiusFavoriteTrackId = (item) => String(item?.track?.id ?? item?.track_id ?? item?.id ?? "");
const getFollowedArtistId = (item) => String(item?.user?.id ?? item?.user_id ?? item?.id ?? "");

function usePageData(loader, dependencies = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    loader(controller.signal)
      .then((data) => setState({ loading: false, data, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ loading: false, data: null, error: error.message || "Unable to load Audius content." });
        }
      });
    return () => controller.abort();
  // The caller supplies stable values in dependencies; loader changes with those values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

function useInfiniteTrendingTracks() {
  const [tracks, setTracks] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const pageSize = 24;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getTrendingTracks(controller.signal, { limit: pageSize, offset: 0 })
      .then((results) => {
        if (controller.signal.aborted) return;
        const nextTracks = Array.isArray(results) ? results : [];
        setTracks(nextTracks);
        setOffset(nextTracks.length);
        setHasMore(nextTracks.length === pageSize);
        setLoading(false);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const loadMore = async () => {
    if (loadingRef.current || loading || loadingMore || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const results = await getTrendingTracks(undefined, { limit: pageSize, offset });
      const nextTracks = Array.isArray(results) ? results : [];
      setTracks((existing) => {
        const knownIds = new Set(existing.map((track) => String(track.id)));
        return [...existing, ...nextTracks.filter((track) => !knownIds.has(String(track.id)))];
      });
      setOffset((current) => current + nextTracks.length);
      setHasMore(nextTracks.length === pageSize);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore || error || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "500px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, loading, loadingMore, offset]);

  return {
    tracks, loading, loadingMore, hasMore, error, sentinelRef,
    retry: () => setAttempt((value) => value + 1),
    loadMore,
  };
}

function getErrorMessage(error) {
  if (error instanceof AudiusError && error.status === 404) return "This Audius item could not be found.";
  return error?.message || "Unable to load Audius content. Check your connection and retry.";
}

function usePageMetadata(title, description) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Soungdify`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute("content", description.slice(0, 160));
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", `${title} · Soungdify`);
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription && description) ogDescription.setAttribute("content", description.slice(0, 160));
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", `${title} · Soungdify`);
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription && description) twitterDescription.setAttribute("content", description.slice(0, 160));
  }, [title, description]);
}

function Artwork({ item, className = "" }) {
  const [failed, setFailed] = useState(false);
  const src = getArtwork(item);
  return src && !failed
    ? <img className={`artwork ${className}`} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <div className={`artwork artwork-fallback ${className}`} aria-hidden="true"><AudioLines size={28} /></div>;
}

function EmptyState({ title, body, action }) {
  return <div className="empty-state"><div className="empty-icon"><Music2 size={22} /></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function LoadingGrid() {
  return <div className="track-grid" aria-label="Loading tracks">{Array.from({ length: 8 }, (_, i) =>
    <div className="skeleton-card" key={i}><div className="skeleton-art" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>;
}

function ErrorState({ message, onRetry }) {
  return <div className="error-state" role="alert"><div className="empty-icon"><CircleHelp size={22} /></div><h3>Couldn’t load this right now</h3><p>{message}</p><button className="button button-muted" onClick={onRetry}>Try again</button></div>;
}

function DownloadButton({ track, onMessage, compact = false }) {
  const downloadable = track?.is_downloadable === true;
  if (!downloadable && compact) return null;
  if (!downloadable) {
    return <button className="button button-muted" type="button" disabled title="The artist has not enabled downloads for this track">
      <Download size={16} /> Downloads disabled
    </button>;
  }
  return <a
    className={compact ? "icon-button download-button" : "button button-muted"}
    href={getDownloadUrl(track.id)}
    target="_blank"
    rel="noreferrer"
    aria-label={`Download ${track.title || "track"} from Audius`}
    title="Download this artist-enabled track from Audius"
    onClick={() => onMessage?.("Opening the artist-enabled Audius download…")}
  >
    <Download size={compact ? 16 : 17} />{compact ? null : "Download"}
  </a>;
}

function TrackCard({ track, tracks = [], onMessage }) {
  const { current, isPlaying, playTrack, togglePlayback, toggleFavorite, favorites, addToQueue } = usePlayer();
  const isCurrent = current && String(current.id) === String(track.id);
  const isFavorite = favorites.some((item) => String(item.id) === String(track.id));
  const play = () => isCurrent ? togglePlayback() : playTrack(track, tracks.length ? tracks : [track]);
  const share = async () => {
    const url = `${window.location.origin}/tracks/${encodeURIComponent(track.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: track.title, url });
      else {
        await navigator.clipboard.writeText(url);
        onMessage("Track link copied");
      }
    } catch (error) {
      if (error.name !== "AbortError") onMessage("Could not share this track from this browser.");
    }
  };
  return (
    <article className={`music-card ${isCurrent ? "is-current" : ""}`}>
      <button className="cover-button" onClick={play} aria-label={`${isPlaying && isCurrent ? "Pause" : "Play"} ${track.title || "track"}`}>
        <Artwork item={track} />
        <span className="cover-play">{isPlaying && isCurrent ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</span>
      </button>
      <div className="track-card-info">
        <Link className="track-title" to={`/tracks/${encodeURIComponent(track.id)}`}>{track.title || "Untitled track"}</Link>
        <Link className="track-artist" to={`/artists/${encodeURIComponent(track.user?.id || track.user_id || "")}`}>{getArtist(track)}</Link>
      </div>
      <div className="track-card-meta">
        <span><Play size={13} /> {formatCount(track.play_count)}</span>
        <button className={`icon-button favorite-button ${isFavorite ? "active" : ""}`} onClick={() => toggleFavorite(track)} aria-label={isFavorite ? "Remove local favorite" : "Add local favorite"} title="Save to your local library">
          <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <DownloadButton track={track} onMessage={onMessage} compact />
        <AudiusTrackActions track={track} onMessage={onMessage} />
        <button className="icon-button" onClick={() => onMessage(addToQueue(track) ? "Added to queue" : "Track is already in the queue")} aria-label="Add to queue" title="Add to queue"><Plus size={17} /></button>
        <PlaylistPicker track={track} onMessage={onMessage} />
        <button className="icon-button" onClick={share} aria-label="Share track" title="Share"><Share2 size={16} /></button>
      </div>
    </article>
  );
}

function AudiusTrackActions({ track, onMessage }) {
  const { user, audiusFavorites, accountLibraryLoading, toggleAudiusFavorite, repostTrack } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const saved = audiusFavorites.some((item) => getAudiusFavoriteTrackId(item) === String(track.id));
  const requireLogin = () => {
    if (!user) navigate("/login");
    return Boolean(user);
  };
  const toggleSaved = async () => {
    if (!requireLogin()) return;
    setBusy(true);
    try {
      const isSaved = await toggleAudiusFavorite(track);
      onMessage(isSaved ? "Saved to your Audius library" : "Removed from your Audius library");
    } catch (error) {
      onMessage(error.message || "Could not update your Audius favorites.");
    } finally {
      setBusy(false);
    }
  };
  const repost = async () => {
    if (!requireLogin()) return;
    setBusy(true);
    try {
      await repostTrack(track);
      onMessage("Track reposted to your Audius profile");
    } catch (error) {
      onMessage(error.message || "Could not repost this track.");
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button className={`icon-button favorite-button ${saved ? "active" : ""}`} onClick={toggleSaved} disabled={busy || accountLibraryLoading} aria-label={saved ? "Remove Audius favorite" : "Save to Audius"} title={user ? "Save to Audius" : "Sign in to save to Audius"}>
      <Heart size={17} fill={saved ? "currentColor" : "none"} />
    </button>
    <button className="icon-button" onClick={repost} disabled={busy} aria-label="Repost to Audius" title={user ? "Repost to Audius" : "Sign in to repost"}>
      <Repeat2 size={16} />
    </button>
  </>;
}

function PlaylistPicker({ track, onMessage }) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState(readLocalPlaylists);
  const [accountBusy, setAccountBusy] = useState(false);
  const { user, audiusPlaylists, accountLibraryLoading, addTrackToAudiusPlaylist } = useAuth();
  useEffect(() => {
    const refresh = () => setPlaylists(readLocalPlaylists());
    window.addEventListener("soungdify:playlists", refresh);
    return () => window.removeEventListener("soungdify:playlists", refresh);
  }, []);
  const add = (playlist) => {
    const updated = playlists.map((item) => item.id === playlist.id
      ? { ...item, tracks: item.tracks.some((entry) => String(entry.id) === String(track.id)) ? item.tracks : [...item.tracks, track] }
      : item);
    if (!saveLocalPlaylists(updated)) {
      onMessage("Could not save this playlist in browser storage.");
      return;
    }
    onMessage(`Added to ${playlist.name}`);
    setOpen(false);
  };
  const addToAudius = async (playlist) => {
    setAccountBusy(true);
    try {
      const added = await addTrackToAudiusPlaylist(playlist, track);
      onMessage(added ? `Added to ${playlist.playlist_name || "Audius playlist"}` : "Track is already in that Audius playlist");
      setOpen(false);
    } catch (error) {
      onMessage(error.message || "Could not update the Audius playlist.");
    } finally {
      setAccountBusy(false);
    }
  };
  return <div className="playlist-picker">
    <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="Add to playlist" title="Add to playlist"><ListPlus size={17} /></button>
    {open && <div className="playlist-picker-popover">
      <b>Local playlists</b>
      {playlists.length ? playlists.map((playlist) => <button key={playlist.id} onClick={() => add(playlist)}>{playlist.name}</button>) : <span className="muted">Create a local playlist first.</span>}
      <Link to="/playlists" onClick={() => setOpen(false)}>Manage playlists</Link>
      <b>Audius playlists</b>
      {!user && <Link to="/login" onClick={() => setOpen(false)}>Sign in to add to your Audius playlists</Link>}
      {user && accountLibraryLoading && <span className="muted">Loading your Audius playlists…</span>}
      {user && !accountLibraryLoading && (audiusPlaylists.length
        ? audiusPlaylists.map((playlist) => <button key={getId(playlist)} onClick={() => addToAudius(playlist)} disabled={accountBusy}>{playlist.playlist_name || "Untitled Audius playlist"}</button>)
        : <span className="muted">No Audius playlists found.</span>)}
    </div>}
  </div>;
}

function TrackGrid({ tracks, onMessage }) {
  if (!tracks?.length) return <EmptyState title="No tracks here yet" body="Audius did not return any tracks for this section." />;
  return <div className="track-grid">{tracks.map((track) => <TrackCard key={track.id} track={track} tracks={tracks} onMessage={onMessage} />)}</div>;
}

function PlaylistGrid({ playlists }) {
  if (!playlists?.length) return <EmptyState title="No playlists available" body="Audius did not return any trending playlists." />;
  return <div className="profile-grid playlist-grid">{playlists.map((playlist) => (
    <Link className="profile-card playlist-card" to={`/${playlist.is_album ? "albums" : "playlists"}/${encodeURIComponent(getId(playlist))}`} key={getId(playlist)}>
      <Artwork item={playlist} className="profile-art" />
      <b>{playlist.playlist_name || (playlist.is_album ? "Untitled album" : "Untitled playlist")}</b>
      <span>{getArtist(playlist)}</span>
      <small>{formatCount(playlist.track_count)} tracks</small>
    </Link>
  ))}</div>;
}

function AudiusOwnedPlaylistGrid({ playlists, onEdit, onDelete, disabled }) {
  if (!playlists?.length) return <EmptyState title="No Audius playlists yet" body="Create an Audius playlist above to manage it here." />;
  return <div className="profile-grid playlist-grid">{playlists.map((playlist) => (
    <article className="profile-card playlist-card account-playlist-card" key={getId(playlist)}>
      <Link to={`/${playlist.is_album ? "albums" : "playlists"}/${encodeURIComponent(getId(playlist))}`}>
        <Artwork item={playlist} className="profile-art" />
        <b>{playlist.playlist_name || (playlist.is_album ? "Untitled album" : "Untitled playlist")}</b>
        <span>{getArtist(playlist)}</span>
        <small>{formatCount(playlist.track_count)} tracks</small>
      </Link>
      <div className="settings-actions"><button className="button button-muted" onClick={() => onEdit(playlist)} disabled={disabled}>Edit</button><button className="button button-danger" onClick={() => onDelete(playlist)} disabled={disabled}>Delete</button></div>
    </article>
  ))}</div>;
}

function ArtistGrid({ artists }) {
  if (!artists.length) return null;
  return <div className="profile-grid">{artists.map((artist) => (
    <Link className="profile-card" to={`/artists/${encodeURIComponent(artist.id)}`} key={artist.id}>
      <Artwork item={{ artwork: artist.profile_picture }} className="profile-art artist-grid-art" />
      <b>{artist.name || artist.handle || "Audius artist"}</b>
      <span>@{artist.handle || "artist"}</span>
      <small>{formatCount(artist.follower_count)} followers</small>
    </Link>
  ))}</div>;
}

function RankedTracksSection({ title, eyebrow, tracks, metric, onMessage }) {
  const score = (track) => metric === "release_date"
    ? new Date(track.release_date || track.created_at || 0).getTime()
    : metric === "fewest_plays"
      ? Number(track.play_count || 0)
    : Number(track[metric] || 0);
  const ranked = [...(tracks || [])].sort((a, b) => metric === "fewest_plays" ? score(a) - score(b) : score(b) - score(a)).slice(0, 6);
  if (!ranked.length) return null;
  return <section className="discovery-section">
    <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div></div>
    <TrackGrid tracks={ranked} onMessage={onMessage} />
  </section>;
}

function TrackList({ tracks, onMessage, compact = false }) {
  const { playFromQueue, current, isPlaying, togglePlayback, addToQueue, toggleFavorite, favorites } = usePlayer();
  if (!tracks?.length) return <EmptyState title="No tracks here yet" body="Audius did not return any tracks for this section." />;
  return <div className={`list-table ${compact ? "compact" : ""}`}>
    {tracks.map((track, i) => {
      const active = current && String(current.id) === String(track.id);
      const favorite = favorites.some((item) => String(item.id) === String(track.id));
      return <div className={`list-row ${active ? "active" : ""}`} key={track.id}>
        <button className="list-play" onClick={() => active ? togglePlayback() : playFromQueue(tracks, i)} aria-label={`Play ${track.title || "track"}`}>
          {active && isPlaying ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <Artwork item={track} className="list-art" />
        <div className="list-track-label"><Link to={`/tracks/${encodeURIComponent(track.id)}`}>{track.title || "Untitled track"}</Link><Link className="muted-link" to={`/artists/${encodeURIComponent(track.user?.id || track.user_id || "")}`}>{getArtist(track)}</Link></div>
        <span className="list-count"><Play size={13} /> {formatCount(track.play_count)}</span>
        <div className="list-actions">
          <button className={`icon-button favorite-button ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(track)} aria-label={favorite ? "Remove local favorite" : "Save to local library"}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button>
          <DownloadButton track={track} onMessage={onMessage} compact />
          <button className="icon-button" onClick={() => onMessage(addToQueue(track) ? "Added to queue" : "Track is already in the queue")} aria-label={`Add ${track.title || "track"} to queue`}><Plus size={17} /></button>
          <PlaylistPicker track={track} onMessage={onMessage} />
        </div>
      </div>;
    })}
  </div>;
}

function Header({ onMessage, query, setQuery, onSearch }) {
  const navigate = useNavigate();
  const location = useLocation();
  return <header className="topbar">
    <div className="history-buttons">
      <button className="icon-button top-history" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft size={18} /></button>
      <button className="icon-button top-history" onClick={() => navigate(1)} aria-label="Go forward"><ArrowRight size={18} /></button>
    </div>
    <form className="searchbox" role="search" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
      <Search size={19} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (!location.pathname.startsWith("/search")) navigate("/search"); }} placeholder="Search tracks, artists, playlists" aria-label="Search Audius" />
      {query && <button className="icon-button search-clear" type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}
      <kbd>↵</kbd>
    </form>
    <button className="avatar-button" onClick={() => navigate("/settings")} aria-label="Open listening preferences and settings" title="Listening preferences and settings">
      <Settings size={18} />
    </button>
  </header>;
}

function Sidebar({ onMessage }) {
  const { user } = useAuth();
  return <aside className="sidebar">
    <Link className="brand" to="/"><span className="brand-mark"><AudioLines size={23} /></span><span>soungdify</span></Link>
    <div className="side-label">Discover</div>
    <nav className="side-nav">
      <NavLink to="/" end><Home size={18} /> Home</NavLink>
      <NavLink to="/discover"><Sparkles size={18} /> Discover</NavLink>
      <NavLink to="/for-you"><Heart size={18} /> For you</NavLink>
      <NavLink to="/new-releases"><Clock3 size={18} /> New releases</NavLink>
      <NavLink to="/search"><Search size={18} /> Search</NavLink>
    </nav>
    <div className="side-label library-label">Your library</div>
    <nav className="side-nav">
      <NavLink to="/library"><Heart size={18} /> Saved tracks</NavLink>
      <NavLink to="/history"><Clock3 size={18} /> Listening history</NavLink>
      <NavLink to="/queue"><ListMusic size={18} /> Queue</NavLink>
      <NavLink to="/playlists"><Disc3 size={18} /> My playlists</NavLink>
      <NavLink to={user ? "/profile" : "/login"}><UserRound size={18} /> {user ? "Audius profile" : "Sign in"}</NavLink>
    </nav>
    <div className="sidebar-note"><div className="note-icon"><Disc3 size={17} /></div><b>Independent sound</b><p>Discover music from artists on Audius.</p><span>Free · Open discovery</span></div>
    <NavLink className="settings-link" to="/settings"><Settings size={17} /> Settings <ChevronDown size={14} /></NavLink>
  </aside>;
}

function PlayerBar({ onMessage, onQueue }) {
  const { current, isPlaying, togglePlayback, next, previous, time, duration, volume, setVolume, shuffle, setShuffle, repeat, setRepeat, speed, setSpeed, seek, error, setError, favorites, toggleFavorite } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const isFavorite = current && favorites.some((track) => String(track.id) === String(current.id));
  const percent = duration ? Math.min((time / duration) * 100, 100) : 0;
  const keySeek = (event) => {
    if (event.key === "ArrowRight") seek(time + 5);
    if (event.key === "ArrowLeft") seek(time - 5);
  };
  return <>
    {error && <div className="player-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss playback error"><X size={14} /></button></div>}
    <footer className="playerbar">
      <div className="now-playing">
        <button className="now-art-button" onClick={() => current && setExpanded(true)} aria-label="Expand player" disabled={!current}>{current ? <Artwork item={current} className="now-art" /> : <div className="artwork artwork-fallback now-art"><AudioLines size={22} /></div>}</button>
        <div className="now-label">{current ? <><Link to={`/tracks/${encodeURIComponent(current.id)}`}>{current.title || "Untitled track"}</Link><span>{getArtist(current)}</span></> : <><b>Ready when you are</b><span>Pick a track to start listening</span></>}</div>
        {current && <button className={`icon-button favorite-button now-favorite ${isFavorite ? "active" : ""}`} onClick={() => toggleFavorite(current)} aria-label={isFavorite ? "Remove local favorite" : "Save to local library"}><Heart size={17} fill={isFavorite ? "currentColor" : "none"} /></button>}
      </div>
      <div className="playback">
        <div className="playback-controls">
          <button className={`icon-button control-secondary ${shuffle ? "control-active" : ""}`} onClick={() => setShuffle(!shuffle)} aria-label="Toggle shuffle" title="Shuffle"><Shuffle size={17} /></button>
          <button className="icon-button" onClick={previous} aria-label="Previous track"><SkipBack size={18} fill="currentColor" /></button>
          <button className="play-button" onClick={togglePlayback} disabled={!current} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
          <button className="icon-button" onClick={next} aria-label="Next track"><SkipForward size={18} fill="currentColor" /></button>
          <button className={`icon-button control-secondary ${repeat !== "off" ? "control-active" : ""}`} onClick={() => setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off")} aria-label={`Repeat ${repeat}`} title={`Repeat ${repeat}`}><span className="repeat-glyph">{repeat === "one" ? "↻¹" : "↻"}</span></button>
        </div>
        <div className="progress-row">
          <span>{formatTime(time)}</span>
          <input type="range" min="0" max={duration || 1} value={Math.min(time, duration || 1)} onChange={(event) => seek(Number(event.target.value))} onKeyDown={keySeek} aria-label="Track progress" style={{ "--progress": `${percent}%` }} disabled={!current} />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="player-extras">
        <button className="icon-button queue-toggle" onClick={onQueue} aria-label="Open queue" title="Queue"><ListMusic size={18} /></button>
        <label className="speed-control"><span>Speed</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Playback speed">{[0.75, 1, 1.25, 1.5, 2].map((rate) => <option value={rate} key={rate}>{rate}×</option>)}</select></label>
        <div className="volume-control"><button className="icon-button" aria-label={volume === 0 ? "Unmute" : "Mute"} onClick={() => setVolume(volume === 0 ? 0.8 : 0)}>{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" style={{ "--progress": `${volume * 100}%` }} /></div>
      </div>
    </footer>
    {expanded && <ExpandedPlayer close={() => setExpanded(false)} onMessage={onMessage} />}
  </>;
}

function ExpandedPlayer({ close, onMessage }) {
  const { current, isPlaying, togglePlayback, next, previous, time, duration, seek, favorites, toggleFavorite } = usePlayer();
  useEffect(() => {
    const handle = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [close]);
  if (!current) return null;
  const favorite = favorites.some((item) => String(item.id) === String(current.id));
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: current.title, url: window.location.href });
      else { await navigator.clipboard.writeText(`${window.location.origin}/tracks/${encodeURIComponent(current.id)}`); onMessage("Track link copied"); }
    } catch (error) {
      if (error.name !== "AbortError") onMessage("Could not share this track from this browser.");
    }
  };
  return <div className="expanded-player" role="dialog" aria-modal="true" aria-label="Full-screen music player">
    <div className="expanded-top"><span className="eyebrow">NOW PLAYING</span><button className="icon-button" onClick={close} aria-label="Close full-screen player"><X size={20} /></button></div>
    <div className="expanded-content"><Artwork item={current} className="expanded-art" /><div className="expanded-info"><h1>{current.title || "Untitled track"}</h1><Link to={`/artists/${encodeURIComponent(current.user?.id || current.user_id || "")}`} onClick={close}>{getArtist(current)}</Link></div>
      <div className="expanded-actions"><button className={`icon-button favorite-button ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(current)} aria-label="Toggle local favorite"><Heart size={20} fill={favorite ? "currentColor" : "none"} /></button><button className="icon-button" onClick={share} aria-label="Share track"><Share2 size={19} /></button><Link className="icon-button" to={`/tracks/${encodeURIComponent(current.id)}`} onClick={close} aria-label="Open track details"><ExternalLink size={18} /></Link></div>
    </div>
    <div className="expanded-playback"><div className="expanded-controls"><button className="icon-button" onClick={previous} aria-label="Previous track"><SkipBack size={21} fill="currentColor" /></button><button className="play-button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><button className="icon-button" onClick={next} aria-label="Next track"><SkipForward size={21} fill="currentColor" /></button></div><div className="progress-row"><span>{formatTime(time)}</span><input type="range" min="0" max={duration || 1} value={Math.min(time, duration || 1)} onChange={(event) => seek(Number(event.target.value))} aria-label="Track progress" style={{ "--progress": `${duration ? (time / duration) * 100 : 0}%` }} /><span>{formatTime(duration)}</span></div></div>
  </div>;
}
function HomePage({ onMessage }) {
  const { tracks, loading, loadingMore, hasMore, error, sentinelRef, retry, loadMore } = useInfiniteTrendingTracks();
  const { data: playlists, loading: playlistsLoading, error: playlistsError, retry: retryPlaylists } = usePageData(getTrendingPlaylists, []);
  const { data: newPlaylists, loading: newPlaylistsLoading, error: newPlaylistsError, retry: retryNewPlaylists } = usePageData(getRecentPlaylists, []);
  const { listeningPreferences } = usePlayer();
  const navigate = useNavigate();
  const chartTracks = tracks.slice(0, 24);
  const chartArtists = [...new Map(tracks.filter((track) => track.user?.id).map((track) => [String(track.user.id), track.user])).values()];
  const artists = [...new Map([
    ...listeningPreferences.artists.map((artist) => [String(artist.id), artist]),
    ...chartArtists.map((artist) => [String(artist.id), artist]),
  ]).values()].slice(0, 12);
  const preferredArtistIds = new Set(listeningPreferences.artists.map((artist) => getId(artist)));
  const preferredGenres = new Set(listeningPreferences.genres.map((genre) => genre.toLowerCase()));
  const preferredTracks = tracks.filter((track) => (
    (preferredArtistIds.size > 0 && preferredArtistIds.has(String(track.user?.id || track.user_id || "")))
    || (preferredGenres.size > 0 && preferredGenres.has(String(track.genre || "").toLowerCase()))
  ));
  return <div className="page home-page">
    <section className="hero">
      <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
      <div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> Powered by Audius</span><h1>Find your next<br /><em>favorite sound.</em></h1><p>Independent music discovery, made for the curious.</p><button className="button button-accent" onClick={() => navigate("/discover")}><Sparkles size={17} /> Explore what’s trending</button></div>
      <div className="hero-art" aria-hidden="true"><div className="hero-record"><div className="record-groove" /><div className="record-label"><AudioLines size={34} /></div></div><div className="hero-sticker">NEW<br />SOUNDS<br /><span>DAILY</span></div></div>
    </section>
    <div className="section-heading"><div><div className="eyebrow">AUDIOUS CHARTS</div><h2>Trending right now</h2><p>Tracks listeners are discovering across Audius. More load as you scroll.</p></div><Link className="text-link" to="/discover">Explore all <ArrowRight size={15} /></Link></div>
    {loading && <LoadingGrid />}
    {!loading && error && !tracks.length && <ErrorState message={error} onRetry={retry} />}
    {!loading && tracks.length > 0 && <TrackGrid tracks={tracks} onMessage={onMessage} />}
    {!loading && error && tracks.length > 0 && <ErrorState message={error} onRetry={retry} />}
    <div className="infinite-scroll-sentinel" ref={sentinelRef} aria-hidden="true" />
    {loadingMore && <div className="inline-loading"><LoaderCircle className="spin" size={18} /> Loading more tracks…</div>}
    {!loadingMore && hasMore && tracks.length > 0 && <button className="button button-muted load-more" onClick={loadMore}>Load more tracks</button>}
    {!hasMore && tracks.length > 0 && <p className="source-note">You’ve reached the end of the currently available trending results.</p>}
    {listeningPreferences.genres.length > 0 && <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">YOUR LISTENING TASTE</div><h2>Your favorite sounds</h2></div><Link className="text-link" to="/settings">Edit preferences <Settings size={14} /></Link></div>
      <div className="mood-chips">{listeningPreferences.genres.map((genre) => <Link key={genre} to={`/genres/${encodeURIComponent(genre)}`}>{genre}</Link>)}</div>
    </section>}
    {preferredTracks.length > 0 && <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">BASED ON YOUR TASTE</div><h2>Picked for you</h2><p>Trending results matching your selected artists or genres.</p></div><Link className="text-link" to="/settings">Adjust taste <Settings size={14} /></Link></div>
      <TrackGrid tracks={preferredTracks} onMessage={onMessage} />
    </section>}
    {listeningPreferences.playlists.length > 0 && <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">SAVED TASTE</div><h2>Playlists you like</h2></div><Link className="text-link" to="/settings">Edit preferences <Settings size={14} /></Link></div>
      <PlaylistGrid playlists={listeningPreferences.playlists} />
    </section>}
    <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">COMMUNITY PICKS</div><h2>Trending playlists</h2><p>Public playlists currently popular on Audius.</p></div></div>
      {playlistsLoading && <LoadingGrid />}
      {!playlistsLoading && playlistsError && <ErrorState message={playlistsError} onRetry={retryPlaylists} />}
      {!playlistsLoading && !playlistsError && <PlaylistGrid playlists={playlists || []} />}
    </section>
    <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">RECENTLY CREATED</div><h2>New playlists</h2><p>Recent public Audius playlists.</p></div></div>
      {newPlaylistsLoading && <LoadingGrid />}
      {!newPlaylistsLoading && newPlaylistsError && <ErrorState message={newPlaylistsError} onRetry={retryNewPlaylists} />}
      {!newPlaylistsLoading && !newPlaylistsError && <PlaylistGrid playlists={newPlaylists || []} />}
    </section>
    {artists.length > 0 && <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">{listeningPreferences.artists.length ? "YOUR ARTISTS & CHART CREATORS" : "CREATORS IN THE CHARTS"}</div><h2>Artists to listen to</h2><p>Select an artist to open their profile and play their tracks.</p></div><Link className="text-link" to="/settings">Choose artists <Settings size={14} /></Link></div>
      <ArtistGrid artists={artists} />
    </section>}
    {chartTracks.length > 0 && <>
      <RankedTracksSection title="Most loved in this chart" eyebrow="BY AUDIUS FAVORITES" tracks={chartTracks} metric="favorite_count" onMessage={onMessage} />
      <RankedTracksSection title="Most reposted in this chart" eyebrow="BY REPOSTS" tracks={chartTracks} metric="repost_count" onMessage={onMessage} />
      <RankedTracksSection title="Recently released chart tracks" eyebrow="RELEASE DATES FROM AUDIUS" tracks={chartTracks} metric="release_date" onMessage={onMessage} />
      <RankedTracksSection title="Lower-play-count tracks in this chart" eyebrow="A SMALLER AUDIUS CHART AUDIENCE" tracks={chartTracks} metric="fewest_plays" onMessage={onMessage} />
    </>}
    <section className="local-recommendations-promo">
      <div><div className="eyebrow">PERSONALIZED ON YOUR DEVICE</div><h2>Music shaped by your listening</h2><p>Local recommendations use your saved and recently played track metadata; nothing is sent to a recommendation service.</p></div>
      <Link to="/for-you" className="button button-accent">For you <ArrowRight size={15} /></Link>
    </section>
    <section className="genre-section">
      <div className="section-heading"><div><div className="eyebrow">FOLLOW A FEELING</div><h2>Explore by sound</h2><p>Search Audius tracks by a style you love.</p></div></div>
      <div className="genre-grid">{genres.map((genre, i) => <button className={`genre-tile genre-${i % 5}`} key={genre} onClick={() => navigate(`/genres/${encodeURIComponent(genre)}`)}><span>{genre}</span><ArrowRight size={17} /></button>)}</div>
      <div className="mood-chips"><span className="eyebrow">SEARCH BY MOOD PHRASE</span>{["Chill", "Energetic", "Focus", "Dreamy", "Party", "Melancholy"].map((mood) => <Link key={mood} to={`/moods/${encodeURIComponent(mood)}`}>{mood}</Link>)}</div>
    </section>
    <p className="source-note">Music, metadata, and artwork are supplied by Audius. Availability and playback depend on the source track.</p>
  </div>;
}

function DiscoverPage({ onMessage }) {
  const { genre: routeGenre } = useParams();
  const [genre, setGenre] = useState(routeGenre || "");
  const [time, setTime] = useState("week");
  useEffect(() => setGenre(routeGenre || ""), [routeGenre]);
  const { data: tracks, loading, error, retry } = usePageData(
    (signal) => getTrendingTracks(signal, { genre, time }),
    [genre, time, routeGenre],
  );
  const { playFromQueue } = usePlayer();
  const exploreRandom = () => {
    if (!tracks?.length) return;
    const randomIndex = Math.floor(Math.random() * tracks.length);
    playFromQueue(tracks, randomIndex);
    onMessage("Playing a random track from Audius trending");
  };
  return <div className="page">
    <PageIntro eyebrow="DISCOVERY" title="Explore the soundscape" description="Browse real tracks currently trending on Audius." />
    <div className="discovery-controls">
      <label><SlidersHorizontal size={16} /><span>Filter charts</span></label>
      <select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filter by genre">
        <option value="">All genres</option>{genres.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select value={time} onChange={(event) => setTime(event.target.value)} aria-label="Chart time period">
        <option value="week">This week</option><option value="month">This month</option><option value="allTime">All time</option>
      </select>
      <button className="button button-muted" disabled={!tracks?.length} onClick={exploreRandom}><Sparkles size={15} /> Feeling lucky</button>
    </div>
    {loading && <LoadingGrid />}
    {!loading && error && <ErrorState message={error} onRetry={retry} />}
    {!loading && !error && <TrackList tracks={tracks || []} onMessage={onMessage} />}
    <p className="source-note">Charts are public Audius results filtered by the selected genre and time period. Mood/tag filtering, “under the radar,” and proprietary personalized recommendations are not exposed by this public endpoint. “Feeling lucky” plays a random result from the loaded chart.</p>
  </div>;
}

function NewReleasesPage({ onMessage }) {
  const { data: chart, loading, error, retry } = usePageData(
    (signal) => getTrendingTracks(signal, { time: "week" }),
    [],
  );
  const latest = [...(chart || [])].sort((a, b) =>
    new Date(b.release_date || b.created_at || 0) - new Date(a.release_date || a.created_at || 0));
  return <div className="page"><PageIntro eyebrow="LATEST RELEASE DATES" title="New releases" description="Recently dated tracks from Audius’s weekly trending chart." />
    {loading && <LoadingGrid />}
    {!loading && error && <ErrorState message={error} onRetry={retry} />}
    {!loading && !error && <TrackGrid tracks={latest} onMessage={onMessage} />}
    <p className="source-note">The public discovery API does not expose a complete global new-release catalog here; this list sorts the weekly trending results by the release dates Audius returns.</p>
  </div>;
}

function MoodPage({ onMessage }) {
  const { mood } = useParams();
  const { data: tracks, loading, error, retry } = usePageData(
    (signal) => searchTracks(mood, signal),
    [mood],
  );
  return <div className="page"><PageIntro eyebrow="SEARCH BY MOOD" title={mood} description="Tracks returned by Audius search for this mood/tag phrase." />
    {loading && <LoadingGrid />}
    {!loading && error && <ErrorState message={error} onRetry={retry} />}
    {!loading && !error && <TrackList tracks={tracks || []} onMessage={onMessage} />}
    <p className="source-note">Audius has no public canonical mood directory; this page searches real track metadata and descriptions by the selected phrase.</p>
  </div>;
}

function ForYouPage({ onMessage }) {
  const { data: chart, loading, error, retry } = usePageData(getTrendingTracks, []);
  const { favorites, history } = usePlayer();
  const listened = [...favorites, ...history.map((item) => item.track)].filter(Boolean);
  const genreCounts = new Map();
  const tagCounts = new Map();
  const listenedIds = new Set(listened.map((track) => String(track.id)));
  for (const track of listened) {
    if (track.genre) genreCounts.set(track.genre, (genreCounts.get(track.genre) || 0) + 2);
    for (const tag of String(track.tags || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const recommendations = (chart || [])
    .filter((track) => !listenedIds.has(String(track.id)))
    .map((track) => {
      const tags = String(track.tags || "").split(",").map((value) => value.trim().toLowerCase());
      const score = (genreCounts.get(track.genre) || 0) + tags.reduce((total, tag) => total + (tagCounts.get(tag) || 0), 0);
      return { track, score };
    })
    .sort((a, b) => b.score - a.score || Number(b.track.play_count || 0) - Number(a.track.play_count || 0))
    .slice(0, 18)
    .map(({ track }) => track);
  return <div className="page">
    <PageIntro eyebrow="LOCAL, NOT PROPRIETARY" title="Made for your listening" description={listened.length ? "A lightweight recommendation ranking from your local favorites/history and real Audius chart metadata." : "Save or play tracks to personalize this local section. Until then, these are public trending tracks—not personalized recommendations."} />
    {loading && <LoadingGrid />}
    {!loading && error && <ErrorState message={error} onRetry={retry} />}
    {!loading && !error && <TrackGrid tracks={recommendations.length ? recommendations : chart || []} onMessage={onMessage} />}
    <p className="source-note">This local ranking compares genre/tag metadata against this browser’s favorites and listening history. It is not Audius’s recommendation engine, does not send your history to Audius, and uses the public trending chart as its candidate pool.</p>
  </div>;
}

function PageIntro({ eyebrow, title, description, children }) {
  return <div className="page-intro"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p>{children}</div>;
}

function UnavailableFeaturePage({ title, feature, details }) {
  return <div className="page"><PageIntro eyebrow="AUDIOUS API LIMITATION" title={title} description={details} />
    <div className="notice-box unavailable-notice"><CircleHelp size={18} /><span><b>{feature} isn’t available in this app.</b> This feature needs an authenticated Audius operation or a public endpoint that is not available here. No simulated data or actions are shown.</span></div>
    <Link className="button button-muted" to="/discover"><Sparkles size={16} /> Return to public discovery</Link>
  </div>;
}

function AudiusLoginPage() {
  const { user, status, error, configured, login, logout, clearAuthError } = useAuth();
  usePageMetadata("Audius sign-in", "Sign in securely with Audius to save tracks, follow artists, repost, and comment.");
  if (user) return <div className="page"><PageIntro eyebrow="AUDIOUS ACCOUNT" title={`Welcome, ${user.name || user.handle || "listener"}`} description="Your Audius account is connected to Soungdify." />
    <div className="settings-card"><p>Signed in as <b>@{user.handle || user.name}</b>. Your account actions are authorized directly by Audius.</p><div className="settings-actions"><Link className="button button-accent" to="/profile">Open your profile</Link><button className="button button-muted" onClick={logout}><LogOut size={16} /> Sign out</button></div></div>
  </div>;
  return <div className="page"><PageIntro eyebrow="AUDIOUS ACCOUNT" title="Sign in with Audius" description="Connect your Audius account to save favorites, follow artists, repost tracks, and comment." />
    <section className="settings-card account-login-card">
      {!configured && <div className="notice-box"><CircleHelp size={17} /><span>Sign-in setup is required. Add a public Audius API key and register this exact callback URL: <code>{window.location.origin}/callback</code>.</span></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button button-accent" onClick={login} disabled={!configured || status === "loading"}><LogIn size={17} /> {status === "loading" ? "Checking session…" : "Continue with Audius"}</button>
      <p className="muted">Soungdify never asks for or stores your Audius password. Audius authorizes the connection using OAuth with PKCE.</p>
      {error && <button className="text-link button-reset" onClick={clearAuthError}>Dismiss message</button>}
    </section>
  </div>;
}

function AudiusCallbackPage() {
  const { status, error } = useAuth();
  return <div className="page">
    {status === "loading"
      ? <div className="inline-loading"><LoaderCircle className="spin" /> Completing secure Audius sign-in…</div>
      : error
        ? <ErrorState message={error} onRetry={() => window.location.assign("/login")} />
        : <EmptyState title="No sign-in response found" body="Return to the sign-in page to connect your Audius account." action={<Link className="text-link" to="/login">Go to sign in</Link>} />}
  </div>;
}

function AudiusAccountPage({ initialTab = "favorites", onMessage }) {
  const {
    user, status, error: authError, logout, audiusFavorites, audiusPlaylists,
    createAudiusPlaylist, updateAudiusPlaylist, deleteAudiusPlaylist,
  } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistBusy, setPlaylistBusy] = useState(false);
  useEffect(() => setTab(initialTab), [initialTab]);
  const content = usePageData((signal) => {
    if (!user) return Promise.resolve([]);
    if (tab === "favorites") return getUserFavorites(user.userId, signal);
    if (tab === "following") return getUserFollowing(user.userId, signal);
    if (tab === "followers") return getUserFollowers(user.userId, signal);
    if (tab === "playlists") return getUserPlaylists(user.userId, signal);
    if (tab === "reposts") return getUserReposts(user.userId, signal);
    return getUserTracks(user.userId, signal);
  }, [user?.userId, tab]);
  usePageMetadata(user?.name || "Your Audius profile", "Your Audius profile and account library.");
  if (!user && status === "loading") return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Checking your Audius session…</div></div>;
  if (!user) return <div className="page"><PageIntro eyebrow="AUDIOUS ACCOUNT" title="Your profile" description="Sign in with Audius to view your account library." />{authError && <p className="auth-error" role="alert">{authError}</p>}<Link className="button button-accent" to="/login">Sign in with Audius</Link></div>;
  const tabs = ["favorites", "reposts", "tracks", "playlists", "followers", "following"];
  const entries = Array.isArray(content.data) ? content.data : [];
  const tracks = entries.map((entry) => entry.track || entry).filter((entry) => entry?.title);
  const createPlaylist = async (event) => {
    event.preventDefault();
    if (!playlistName.trim() || playlistBusy) return;
    setPlaylistBusy(true);
    try {
      await createAudiusPlaylist(playlistName, playlistDescription);
      setPlaylistName("");
      setPlaylistDescription("");
      onMessage("Audius playlist created");
    } catch (playlistError) {
      onMessage(playlistError.message || "Could not create the Audius playlist.");
    } finally {
      setPlaylistBusy(false);
    }
  };
  const editPlaylist = async (playlist) => {
    const name = window.prompt("Playlist name", playlist.playlist_name || "");
    if (name === null) return;
    const description = window.prompt("Playlist description", playlist.description || "");
    if (description === null) return;
    setPlaylistBusy(true);
    try {
      await updateAudiusPlaylist(playlist, { playlist_name: name.trim(), description: description.trim() });
      onMessage("Audius playlist updated");
    } catch (playlistError) {
      onMessage(playlistError.message || "Could not update the Audius playlist.");
    } finally {
      setPlaylistBusy(false);
    }
  };
  const removePlaylist = async (playlist) => {
    if (!window.confirm(`Delete "${playlist.playlist_name || "this playlist"}" from Audius?`)) return;
    setPlaylistBusy(true);
    try {
      await deleteAudiusPlaylist(playlist);
      onMessage("Audius playlist deleted");
    } catch (playlistError) {
      onMessage(playlistError.message || "Could not delete the Audius playlist.");
    } finally {
      setPlaylistBusy(false);
    }
  };
  return <div className="page">
    <div className="artist-hero"><div className="artist-profile"><Artwork item={{ artwork: user.profilePicture }} className="artist-avatar" /><div><span className="eyebrow">YOUR AUDIOUS ACCOUNT</span><h1>{user.name || user.handle}</h1><p>@{user.handle}</p></div><button className="button button-muted" onClick={logout}><LogOut size={16} /> Sign out</button></div></div>
    {authError && <p className="auth-error" role="alert">{authError}</p>}
    <div className="search-tabs profile-tabs" role="tablist" aria-label="Your Audius library">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {content.loading && <div className="inline-loading"><LoaderCircle className="spin" /> Loading your Audius {tab}…</div>}
    {!content.loading && content.error && <ErrorState message={content.error} onRetry={content.retry} />}
    {!content.loading && !content.error && ["favorites", "tracks", "reposts"].includes(tab) && <TrackList tracks={tracks} onMessage={onMessage} />}
    {!content.loading && !content.error && tab === "playlists" && <>
      <form className="account-playlist-form settings-card" onSubmit={createPlaylist}><h2>Create an Audius playlist</h2><label>Playlist name<input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={100} required /></label><label>Description<input value={playlistDescription} onChange={(event) => setPlaylistDescription(event.target.value)} maxLength={1000} /></label><button className="button button-accent" disabled={playlistBusy || !playlistName.trim()}><Plus size={16} /> Create playlist</button></form>
      <AudiusOwnedPlaylistGrid playlists={audiusPlaylists.length ? audiusPlaylists : entries} onEdit={editPlaylist} onDelete={removePlaylist} disabled={playlistBusy} />
    </>}
    {!content.loading && !content.error && ["followers", "following"].includes(tab) && <UserGrid users={entries} />}
    {tab === "favorites" && <p className="source-note">{audiusFavorites.length} Audius favorites loaded for quick-save controls.</p>}
  </div>;
}

function SearchPage({ onMessage, query, setQuery }) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [recent, setRecent] = useState(() => readLocal("soungdify.searches", []));
  const timer = useRef(null);
  const search = (term) => {
    const next = term.trim();
    if (!next) return;
    setQuery(next);
    setParams({ q: next });
    setOffset(0);
    const past = readLocal("soungdify.searches", []);
    const updated = [next, ...past.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 8);
    if (writeLocal("soungdify.searches", updated)) setRecent(updated);
    else onMessage("Search completed, but local search history could not be saved.");
  };
  useEffect(() => {
    const fromUrl = params.get("q") || "";
    if (fromUrl && fromUrl !== query) setQuery(fromUrl);
  }, [params, query, setQuery]);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    timer.current = window.setTimeout(async () => {
      try {
        if (tab === "all") {
          const [tracks, artists, playlists] = await Promise.all([
            searchTracks(term, controller.signal, { limit: 6 }),
            searchUsers(term, controller.signal),
            searchPlaylists(term, controller.signal),
          ]);
          setResults({
            tracks: Array.isArray(tracks) ? tracks : [],
            artists: Array.isArray(artists) ? artists.slice(0, 6) : [],
            playlists: Array.isArray(playlists) ? playlists.slice(0, 6) : [],
          });
          setHasMore(false);
        } else if (tab === "tracks") {
          const data = await searchTracks(term, controller.signal, { offset, limit: 30 });
          setResults((previous) => offset ? [...previous, ...(data || [])] : Array.isArray(data) ? data : []);
          setHasMore(Array.isArray(data) && data.length === 30);
        } else if (tab === "artists") {
          const data = await searchUsers(term, controller.signal);
          setResults(Array.isArray(data) ? data : []);
          setHasMore(false);
        } else if (tab === "tags") {
          const data = await searchTracks(term, controller.signal);
          setResults(Array.isArray(data) ? data : []);
          setHasMore(false);
        } else {
          const data = await searchPlaylists(term, controller.signal);
          const playlists = Array.isArray(data) ? data : [];
          setResults(tab === "albums" ? playlists.filter((item) => item.is_album) : tab === "playlists" ? playlists.filter((item) => !item.is_album) : playlists);
          setHasMore(false);
        }
      } catch (requestError) {
        if (requestError.name !== "AbortError") setError(getErrorMessage(requestError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer.current);
      controller.abort();
    };
  }, [query, tab, offset, retryCount]);
  const tabs = ["all", "tracks", "artists", "albums", "playlists", "tags"];
  const submitSearch = (term) => {
    search(term);
    setTab("all");
  };
  const showProfiles = (items) => <div className="profile-grid">{items.map((user) => <Link className="profile-card" to={`/artists/${encodeURIComponent(user.id)}`} key={user.id}><Artwork item={{ artwork: user?.profile_picture }} className="profile-art artist-grid-art" /><b>{user.name || user.handle || "Audius artist"}</b><span>@{user.handle || "artist"}</span><small>{formatCount(user.follower_count)} followers</small></Link>)}</div>;
  const showPlaylists = (items) => <PlaylistGrid playlists={items} />;
  return <div className="page search-page">
    <PageIntro eyebrow="SEARCH AUDIOUS" title="What are you in the mood for?" description="Search public Audius tracks, artists, and playlists." />
    <form className="search-page-form" onSubmit={(event) => { event.preventDefault(); submitSearch(query); }}><Search size={20} /><input value={query} onChange={(event) => { setOffset(0); setQuery(event.target.value); }} placeholder="Try a track, artist, or genre" autoFocus aria-label="Search query" /><button className="button button-accent" type="submit">Search</button></form>
    {query.trim().length < 2 && <div className="recent-searches"><div className="section-heading small-heading"><div><h2>Recent searches</h2></div>{recent.length > 0 && <button className="text-link button-reset" onClick={() => { if (writeLocal("soungdify.searches", [])) setRecent([]); else onMessage("Could not clear search history from browser storage."); }}>Clear history</button>}</div>{recent.length ? <div className="recent-chips">{recent.map((term) => <button key={term} onClick={() => submitSearch(term)}><Clock3 size={14} />{term}</button>)}</div> : <p className="muted">Your searches stay on this device.</p>}</div>}
    {query.trim().length >= 2 && <><div className="search-tabs" role="tablist" aria-label="Search result type">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "selected" : ""} key={item} onClick={() => { setOffset(0); setTab(item); }}>{item === "artists" ? "Artists / users" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      {loading && <div className="inline-loading"><LoaderCircle className="spin" size={20} /> Searching Audius…</div>}
      {!loading && error && <ErrorState message={error} onRetry={() => setRetryCount((value) => value + 1)} />}
      {!loading && !error && tab === "all" && !results.tracks?.length && !results.artists?.length && !results.playlists?.length && <EmptyState title="No results found" body={`Nothing matched “${query}”. Try a different search.`} />}
      {!loading && !error && tab === "all" && results.tracks?.length > 0 && <section className="search-preview"><div className="section-heading small-heading"><div><h2>Tracks</h2></div><button className="text-link button-reset" onClick={() => setTab("tracks")}>See all</button></div><TrackList tracks={results.tracks} onMessage={onMessage} /></section>}
      {!loading && !error && tab === "all" && results.artists?.length > 0 && <section className="search-preview"><div className="section-heading small-heading"><div><h2>Artists</h2></div><button className="text-link button-reset" onClick={() => setTab("artists")}>See all</button></div>{showProfiles(results.artists)}</section>}
      {!loading && !error && tab === "all" && results.playlists?.length > 0 && <section className="search-preview"><div className="section-heading small-heading"><div><h2>Playlists & albums</h2></div><button className="text-link button-reset" onClick={() => setTab("playlists")}>See all</button></div>{showPlaylists(results.playlists)}</section>}
      {!loading && !error && tab === "tracks" && results.length > 0 && <><TrackList tracks={results} onMessage={onMessage} />{hasMore && <button className="button button-muted load-more" onClick={() => setOffset((value) => value + 30)}>Load more tracks</button>}</>}
      {!loading && !error && tab === "artists" && results.length > 0 && showProfiles(results)}
      {!loading && !error && tab === "playlists" && results.length > 0 && showPlaylists(results)}
      {!loading && !error && tab === "albums" && results.length > 0 && <PlaylistGrid playlists={results} />}
      {!loading && !error && tab === "tags" && <div className="tag-search-results"><p className="muted">Audius does not have a public tag catalog/search endpoint. Matching tracks are shown from track search; genre filters are available on Discover.</p>{(Array.isArray(results) ? results : []).filter((item) => (item.tags || "").toLowerCase().includes(query.toLowerCase())).length
        ? <TrackList tracks={(Array.isArray(results) ? results : []).filter((item) => (item.tags || "").toLowerCase().includes(query.toLowerCase()))} onMessage={onMessage} />
        : <EmptyState title="No matching track tags" body="Try a related keyword or search tracks directly." />}</div>}
      {!loading && !error && !["all", "tracks", "artists", "playlists", "albums", "tags"].includes(tab) && null}
    </>}
  </div>;
}

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch (error) {
    console.error(`Unable to read ${key} from browser storage.`, error);
    return fallback;
  }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.error(`Unable to persist ${key}.`, error); return false; }
}
function readLocalPlaylists() {
  return readLocal("soungdify.localPlaylists", []);
}
function saveLocalPlaylists(playlists) {
  if (!writeLocal("soungdify.localPlaylists", playlists)) return false;
  window.dispatchEvent(new Event("soungdify:playlists"));
  return true;
}

function LibraryPage({ onMessage }) {
  const { favorites, history } = usePlayer();
  const [tab, setTab] = useState("saved");
  const tracks = tab === "saved" ? favorites : history.map((entry) => entry.track);
  const unique = [...new Map(tracks.map((track) => [String(track.id), track])).values()];
  return <div className="page">
    <PageIntro eyebrow="YOUR LIBRARY" title="Your music, your way" description="Favorites and listening history are stored locally on this device." />
    <div className="search-tabs library-tabs" role="tablist" aria-label="Library section"><button role="tab" aria-selected={tab === "saved"} className={tab === "saved" ? "selected" : ""} onClick={() => setTab("saved")}>Saved tracks <span>{favorites.length}</span></button><button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "selected" : ""} onClick={() => setTab("history")}>Recently played <span>{history.length}</span></button></div>
    {unique.length ? <TrackList tracks={unique} compact onMessage={onMessage} /> : <EmptyState title={tab === "saved" ? "Your library starts here" : "No listening history yet"} body={tab === "saved" ? "Save tracks with the heart button. Favorites are local and are not synced to Audius." : "Play something from discovery and it will appear here."} />}
  </div>;
}

function LocalPlaylistsPage({ onMessage }) {
  const [playlists, setPlaylists] = useState(readLocalPlaylists);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    const refresh = () => setPlaylists(readLocalPlaylists());
    window.addEventListener("soungdify:playlists", refresh);
    return () => window.removeEventListener("soungdify:playlists", refresh);
  }, []);
  const create = (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    const playlist = { id: `local-${Date.now()}`, name: value, description: description.trim(), tracks: [], createdAt: Date.now() };
    if (!saveLocalPlaylists([playlist, ...playlists])) {
      onMessage("Could not save this playlist in browser storage.");
      return;
    }
    setName("");
    setDescription("");
    onMessage("Local playlist created");
  };
  const remove = (playlist) => {
    if (saveLocalPlaylists(playlists.filter((item) => item.id !== playlist.id))) onMessage(`Deleted ${playlist.name}`);
    else onMessage("Could not delete the playlist from browser storage.");
  };
  return <div className="page">
    <PageIntro eyebrow="YOUR DEVICE" title="My playlists" description="Create and manage playlists stored in this browser. These are private and are not uploaded to Audius." />
    <form className="playlist-create-form" onSubmit={create}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Playlist name" aria-label="Playlist name" maxLength={80} required /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" aria-label="Playlist description" maxLength={240} /><button className="button button-accent" type="submit"><Plus size={16} /> Create playlist</button></form>
    {playlists.length ? <div className="profile-grid local-playlists">{playlists.map((playlist) => <article className="profile-card" key={playlist.id}>
      <Link to={`/my-playlists/${encodeURIComponent(playlist.id)}`} className="local-playlist-link"><div className="artwork artwork-fallback profile-art"><ListMusic size={28} /></div><b>{playlist.name}</b><span>{playlist.description || "Local playlist"}</span><small>{playlist.tracks.length} tracks</small></Link>
      <button className="button button-muted local-playlist-delete" onClick={() => remove(playlist)}>Delete</button>
    </article>)}</div> : <EmptyState title="No playlists yet" body="Create a playlist here, then use the playlist button on any track to add songs." />}
  </div>;
}

function LocalPlaylistPage({ onMessage }) {
  const { id } = useParams();
  const [playlist, setPlaylist] = useState(() => readLocalPlaylists().find((item) => item.id === id));
  const [name, setName] = useState(playlist?.name || "");
  const [description, setDescription] = useState(playlist?.description || "");
  const { playFromQueue } = usePlayer();
  useEffect(() => {
    const refresh = () => {
      const current = readLocalPlaylists().find((item) => item.id === id);
      setPlaylist(current);
      if (current) { setName(current.name); setDescription(current.description || ""); }
    };
    window.addEventListener("soungdify:playlists", refresh);
    return () => window.removeEventListener("soungdify:playlists", refresh);
  }, [id]);
  if (!playlist) return <div className="page"><EmptyState title="Playlist not found" body="It may have been deleted from this browser." action={<Link className="text-link" to="/playlists">Back to playlists</Link>} /></div>;
  const remove = (trackId) => {
    const updated = readLocalPlaylists().map((item) => item.id === id ? { ...item, tracks: item.tracks.filter((track) => String(track.id) !== String(trackId)) } : item);
    if (saveLocalPlaylists(updated)) onMessage("Track removed from local playlist");
    else onMessage("Could not update browser storage.");
  };
  const moveTrack = (from, to) => {
    if (to < 0 || to >= playlist.tracks.length) return;
    const tracks = [...playlist.tracks];
    const [item] = tracks.splice(from, 1);
    tracks.splice(to, 0, item);
    if (!saveLocalPlaylists(readLocalPlaylists().map((entry) => entry.id === id ? { ...entry, tracks } : entry))) onMessage("Could not update browser storage.");
  };
  const updatePlaylist = (event) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;
    if (saveLocalPlaylists(readLocalPlaylists().map((entry) => entry.id === id ? { ...entry, name: nextName, description: description.trim() } : entry))) onMessage("Local playlist updated");
    else onMessage("Could not update browser storage.");
  };
  return <div className="page">
    <div className="playlist-hero local-hero"><div className="artwork artwork-fallback detail-art"><ListMusic size={54} /></div><div><span className="eyebrow">LOCAL PLAYLIST</span><h1>{playlist.name}</h1><p>{playlist.description || "Stored only in this browser"} · {playlist.tracks.length} tracks</p><div className="detail-actions"><button className="button button-accent" disabled={!playlist.tracks.length} onClick={() => playFromQueue(playlist.tracks)}><Play size={16} fill="currentColor" /> Play playlist</button><button className="button button-muted" disabled={!playlist.tracks.length} onClick={() => playFromQueue([...playlist.tracks].sort(() => Math.random() - 0.5))}><Shuffle size={16} /> Shuffle</button></div></div></div>
    <form className="playlist-create-form edit-playlist-form" onSubmit={updatePlaylist}><input value={name} onChange={(event) => setName(event.target.value)} aria-label="Edit playlist name" maxLength={80} required /><input value={description} onChange={(event) => setDescription(event.target.value)} aria-label="Edit playlist description" placeholder="Description (optional)" maxLength={240} /><button className="button button-muted" type="submit">Save details</button></form>
    {playlist.tracks.length ? <div className="list-table">{playlist.tracks.map((track, i) => <div className="list-row local-track-row" key={track.id}><button className="list-play" onClick={() => playFromQueue(playlist.tracks, i)} aria-label={`Play ${track.title}`}><Play size={15} /></button><Artwork item={track} className="list-art" /><div className="list-track-label"><Link to={`/tracks/${encodeURIComponent(track.id)}`}>{track.title || "Untitled track"}</Link><Link className="muted-link" to={`/artists/${encodeURIComponent(track.user?.id || "")}`}>{getArtist(track)}</Link></div><div className="local-track-actions"><button className="icon-button" onClick={() => moveTrack(i, i - 1)} aria-label="Move track up"><ArrowUp size={14} /></button><button className="icon-button" onClick={() => moveTrack(i, i + 1)} aria-label="Move track down"><ArrowDown size={14} /></button><button className="icon-button" onClick={() => remove(track.id)} aria-label="Remove track from local playlist"><X size={17} /></button></div></div>)}</div> : <EmptyState title="This playlist is empty" body="Use the playlist button next to any track to add it here." />}
    <p className="source-note">This playlist is local only; it is not an Audius playlist.</p>
  </div>;
}

function HistoryPage({ onMessage }) {
  const { history } = usePlayer();
  const { clearHistory } = usePlayer();
  const { playTrack } = usePlayer();
  return <div className="page"><PageIntro eyebrow="ON THIS DEVICE" title="Listening history" description="Recent plays, play duration, and completion status are private and stored only in this browser.">
    {history.length > 0 && <button className="button button-muted" onClick={() => { clearHistory(); onMessage("Listening history cleared"); }}>Clear history</button>}
  </PageIntro>
    {history.length ? <div className="list-table history-table">{history.map((entry) => <div className="list-row" key={`${entry.track.id}-${entry.playedAt}`}><button className="list-play" onClick={() => playTrack(entry.track)} aria-label={`Play ${entry.track.title}`}><Play size={15} /></button><Artwork item={entry.track} className="list-art" /><div className="list-track-label"><Link to={`/tracks/${encodeURIComponent(entry.track.id)}`}>{entry.track.title || "Untitled track"}</Link><span>{getArtist(entry.track)} · Played {new Date(entry.playedAt).toLocaleString()}</span></div><span className="history-play-meta">{formatTime(entry.playedDuration || 0)} {entry.completed ? "· Finished" : ""}</span></div>)}</div> : <EmptyState title="Nothing played yet" body="Explore Audius to start building a listening history." />}
  </div>;
}

function QueuePage({ onMessage }) {
  const { queue, current, removeFromQueue, clearQueue, playFromQueue, index, reorderQueue, addToQueue } = usePlayer();
  const [dragIndex, setDragIndex] = useState(-1);
  const upcoming = queue.map((track, queueIndex) => ({ track, queueIndex }))
    .filter(({ track, queueIndex }) => !(current && String(current.id) === String(track.id) && queueIndex === index));
  return <div className="page"><PageIntro eyebrow="UP NEXT" title="Your queue" description="Manage the tracks waiting to play." >
    {queue.length > 0 && <button className="button button-muted" onClick={clearQueue}>Clear queue</button>}
  </PageIntro>
    {current && <div className="queue-current"><span className="eyebrow">NOW PLAYING</span><div><Artwork item={current} className="list-art" /><div><b>{current.title}</b><span>{getArtist(current)}</span></div></div></div>}
    {upcoming.length ? <div className="list-table">{upcoming.map(({ track, queueIndex }) => <div
      className={`list-row queue-row ${dragIndex === queueIndex ? "dragging" : ""}`} key={`${track.id}-${queueIndex}`}
      draggable onDragStart={(event) => { setDragIndex(queueIndex); event.dataTransfer.setData("text/plain", String(queueIndex)); }}
      onDragEnd={() => setDragIndex(-1)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); reorderQueue(from, queueIndex); setDragIndex(-1); }}
    >
      <button className="list-play" onClick={() => playFromQueue(queue, queueIndex)} aria-label={`Play ${track.title}`}><Play size={15} /></button><Artwork item={track} className="list-art" /><div className="list-track-label"><Link to={`/tracks/${encodeURIComponent(track.id)}`}>{track.title || "Untitled track"}</Link><span>{getArtist(track)}</span></div>
      <div className="queue-row-actions"><button className="icon-button queue-move" onClick={() => reorderQueue(queueIndex, Math.max(0, queueIndex - 1))} aria-label="Move earlier"><ArrowUp size={14} /></button><button className="icon-button queue-move" onClick={() => reorderQueue(queueIndex, Math.min(queue.length - 1, queueIndex + 1))} aria-label="Move later"><ArrowDown size={14} /></button><button className="icon-button" onClick={() => onMessage(addToQueue(track, true) ? "Track queued to play next" : "Track is already up next")} aria-label="Play this track next"><SkipForward size={14} /></button><button className="icon-button" onClick={() => { removeFromQueue(track.id); onMessage("Removed from queue"); }} aria-label="Remove from queue"><X size={17} /></button></div>
    </div>)}</div> : !current && <EmptyState title="Your queue is empty" body="Add tracks from discovery to line up what plays next." />}
  </div>;
}

function TrackPage({ onMessage }) {
  const { id } = useParams();
  const { data: track, loading, error, retry } = usePageData((signal) => getTrack(id, signal), [id]);
  const { data: remixes, loading: remixesLoading } = usePageData((signal) => getTrackRemixes(id, signal), [id]);
  const { playTrack, addToQueue, toggleFavorite, favorites } = usePlayer();
  const { user } = useAuth();
  usePageMetadata(track?.title, track?.description || `Listen to ${track?.title || "this track"} by ${getArtist(track)} on Soungdify.`);
  if (loading) return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Loading Audius track…</div></div>;
  if (error || !track) return <div className="page"><ErrorState message={error || "Track not found."} onRetry={retry} /></div>;
  const liked = favorites.some((item) => String(item.id) === String(track.id));
  return <div className="page detail-page">
    <div className="track-hero"><Artwork item={track} className="detail-art" /><div><span className="eyebrow">AUDIOUS TRACK</span><h1>{track.title || "Untitled track"}</h1><Link to={`/artists/${encodeURIComponent(track.user?.id || track.user_id || "")}`} className="detail-artist">{getArtist(track)}</Link><p className="detail-tags">{[track.genre, track.mood, ...(typeof track.tags === "string" ? track.tags.split(",").filter(Boolean).slice(0, 4) : [])].filter(Boolean).join(" · ") || "Independent music"}</p><div className="detail-stats"><span><Play size={14} /> {formatCount(track.play_count)} plays</span><span><Heart size={14} /> {formatCount(track.favorite_count)} Audius favorites</span><span><Repeat size={14} /> {formatCount(track.repost_count)} reposts</span><span>{formatTime(track.duration || 0)}</span>{track.release_date && <span>{new Date(track.release_date).toLocaleDateString()}</span>}</div><div className="detail-actions"><button className="button button-accent" onClick={() => playTrack(track)}><Play size={16} fill="currentColor" /> Play track</button><button className="button button-muted" onClick={() => onMessage(addToQueue(track) ? "Added to queue" : "Track is already in the queue")}><Plus size={17} /> Add to queue</button><button className="button button-muted" onClick={() => toggleFavorite(track)}><Heart size={16} fill={liked ? "currentColor" : "none"} /> {liked ? "Saved locally" : "Save locally"}</button><DownloadButton track={track} onMessage={onMessage} /><AudiusTrackActions track={track} onMessage={onMessage} /><PlaylistPicker track={track} onMessage={onMessage} /></div>
      {track.playlist_id && <Link className="text-link detail-album-link" to={`/albums/${encodeURIComponent(track.playlist_id)}`}><Disc3 size={15} /> Open release</Link>}
    </div></div>
    {track.description && <section className="detail-description"><h2>About this track</h2><p>{track.description}</p></section>}
    <section className="track-related"><div className="section-heading"><div><div className="eyebrow">RELATED AUDIO</div><h2>Remixes</h2><p>Remixes listed by Audius for this track.</p></div></div>{remixesLoading ? <div className="inline-loading"><LoaderCircle className="spin" /> Loading remixes…</div> : <TrackList tracks={remixes || []} onMessage={onMessage} />}</section>
    <TrackComments trackId={track.track_id ?? id} />
    {!user && <div className="notice-box"><CircleHelp size={17} /><span>Local favorites stay on this device. Sign in with Audius to save or repost tracks to your Audius account.</span><Link className="text-link" to="/login">Sign in</Link></div>}
  </div>;
}

function TrackComments({ trackId }) {
  const [comments, setComments] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const { user, postTrackComment } = useAuth();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getTrackComments(trackId, controller.signal, { offset })
      .then((data) => {
        const page = Array.isArray(data) ? data : [];
        setComments((previous) => offset ? [...previous, ...page] : page);
        setHasMore(page.length === 20);
        setError("");
      })
      .catch((requestError) => { if (requestError.name !== "AbortError") setError(getErrorMessage(requestError)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [trackId, offset, retryCount]);
  const submitComment = async (event) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      await postTrackComment(trackId, text);
      setCommentText("");
      setOffset(0);
      setRetryCount((value) => value + 1);
    } catch (postError) {
      setError(postError.message || "Could not post your comment.");
    } finally {
      setPosting(false);
    }
  };
  return <section className="comments-section"><div className="section-heading"><div><div className="eyebrow">COMMUNITY</div><h2>Comments <span className="small-count">({comments.length})</span></h2></div></div>
    {user
      ? <form className="comment-form" onSubmit={submitComment}><textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={1000} placeholder="Write a comment…" aria-label="Write a comment" required /><button className="button button-accent" disabled={posting || !commentText.trim()}><MessageCircle size={16} /> {posting ? "Posting…" : "Post comment"}</button></form>
      : <p className="source-note"><Link className="text-link" to="/login">Sign in with Audius</Link> to join the conversation.</p>}
    {loading && <div className="inline-loading"><LoaderCircle className="spin" /> Loading public comments…</div>}
    {!loading && error && <ErrorState message={error} onRetry={() => setRetryCount((value) => value + 1)} />}
    {!loading && !error && comments.length > 0 && <div className="comment-list">{comments.map((comment) => <article className="comment-item" key={comment.id}><Artwork item={{ artwork: comment.user?.profile_picture }} className="comment-avatar" /><div><b>{comment.user?.name || comment.user?.handle || "Audius user"}</b><span>{comment.created_at ? new Date(comment.created_at).toLocaleString() : ""}</span><p>{comment.text || comment.message || ""}</p></div></article>)}</div>}
    {!loading && !error && !comments.length && <EmptyState title="No public comments" body="Audius returned no comments for this track." />}
    {!loading && !error && hasMore && <button className="button button-muted load-more" onClick={() => setOffset((value) => value + 20)}>Load more comments</button>}
    <p className="source-note">Comments are posted to Audius using your authorized account.</p>
  </section>;
}

function ArtistPage({ onMessage }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("overview");
  const [profileRefresh, setProfileRefresh] = useState(0);
  const { user, following, accountLibraryLoading, toggleFollowing } = useAuth();
  const content = usePageData(async (signal) => {
    if (tab === "overview") {
      const [tracks, albums, playlists] = await Promise.all([
        getUserTracks(id, signal), getUserAlbums(id, signal), getUserPlaylists(id, signal),
      ]);
      return { tracks, albums, playlists };
    }
    if (tab === "tracks") return getUserTracks(id, signal);
    if (tab === "albums") return getUserAlbums(id, signal);
    if (tab === "playlists") return getUserPlaylists(id, signal);
    if (tab === "reposts") return getUserReposts(id, signal);
    if (tab === "favorites") return getUserFavorites(id, signal);
    if (tab === "followers") return getUserFollowers(id, signal);
    return getUserFollowing(id, signal);
  }, [id, tab]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  usePageMetadata(profile?.name || profile?.handle, profile?.bio || `Discover tracks and releases from ${profile?.name || "this Audius artist"} on Soungdify.`);
  useEffect(() => {
    const controller = new AbortController();
    setProfileLoading(true);
    getUser(id, controller.signal)
      .then((user) => { setProfile(user); setProfileError(""); })
      .catch((requestError) => { if (requestError.name !== "AbortError") setProfileError(getErrorMessage(requestError)); })
      .finally(() => { if (!controller.signal.aborted) setProfileLoading(false); });
    return () => controller.abort();
  }, [id, profileRefresh]);
  if (profileLoading) return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Loading Audius artist…</div></div>;
  if (profileError) return <div className="page"><ErrorState message={profileError} onRetry={() => { setProfileLoading(true); setProfileRefresh((value) => value + 1); }} /></div>;
  const data = Array.isArray(content.data) ? content.data : [];
  const overviewData = !Array.isArray(content.data) ? content.data : null;
  const shareProfile = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: profile?.name || "Audius artist", url });
      else { await navigator.clipboard.writeText(url); onMessage("Artist link copied"); }
    } catch (error) {
      if (error.name !== "AbortError") onMessage("Could not share this profile from this browser.");
    }
  };
  const tabs = ["overview", "tracks", "albums", "playlists", "reposts", "favorites", "followers", "following"];
  const isFollowing = following.some((item) => {
    return getFollowedArtistId(item) === String(id);
  });
  const followArtist = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      const state = await toggleFollowing(id);
      onMessage(state ? `Following ${profile?.name || "artist"}` : `Unfollowed ${profile?.name || "artist"}`);
    } catch (followError) {
      onMessage(followError.message || "Could not update your following list.");
    }
  };
  return <div className="page">
    <div className="artist-hero"><Artwork item={{ artwork: profile?.cover_photo }} className="artist-cover" /><div className="artist-profile"><Artwork item={{ artwork: profile?.profile_picture }} className="artist-avatar" /><div><span className="eyebrow">AUDIOUS ARTIST</span><h1>{profile?.name || profile?.handle || "Artist"}</h1><p>@{profile?.handle || "artist"} · {formatCount(profile?.follower_count)} followers · {formatCount(profile?.followee_count)} following</p></div>{String(user?.userId) !== String(id) && <button className="button button-muted" onClick={followArtist} disabled={Boolean(user && accountLibraryLoading)}>{!user ? "Sign in to follow" : accountLibraryLoading ? "Loading…" : isFollowing ? "Following" : "Follow artist"}</button>}<button className="icon-button artist-share" onClick={shareProfile} aria-label="Share artist profile"><Share2 size={17} /></button></div></div>
    {profile?.bio && <p className="artist-bio">{profile.bio}</p>}
    <div className="search-tabs profile-tabs" role="tablist" aria-label="Artist profile sections">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {content.loading && <div className="inline-loading"><LoaderCircle className="spin" /> Loading public {tab}…</div>}
    {!content.loading && content.error && <ErrorState message={content.error} onRetry={content.retry} />}
    {!content.loading && !content.error && tab === "overview" && <div className="artist-overview">
      <div className="section-heading"><div><div className="eyebrow">RECENT PUBLIC TRACKS</div><h2>Tracks</h2></div><button className="text-link button-reset" onClick={() => setTab("tracks")}>See all</button></div>
      <TrackList tracks={overviewData?.tracks || []} onMessage={onMessage} />
      <div className="section-heading"><div><div className="eyebrow">PUBLIC RELEASES</div><h2>Albums</h2></div><button className="text-link button-reset" onClick={() => setTab("albums")}>See all</button></div>
      <PlaylistGrid playlists={overviewData?.albums || []} />
      <div className="section-heading"><div><div className="eyebrow">CURATED BY THE ARTIST</div><h2>Playlists</h2></div><button className="text-link button-reset" onClick={() => setTab("playlists")}>See all</button></div>
      <PlaylistGrid playlists={overviewData?.playlists || []} />
    </div>}
    {!content.loading && !content.error && ["tracks", "reposts", "favorites"].includes(tab) && <TrackList tracks={data.filter((item) => item.title)} onMessage={onMessage} />}
    {!content.loading && !content.error && ["albums", "playlists"].includes(tab) && <PlaylistGrid playlists={data} />}
    {!content.loading && !content.error && ["followers", "following"].includes(tab) && <UserGrid users={data} />}
    <p className="source-note">Public profile data is read from Audius. Follow actions are sent to Audius when you are signed in.</p>
  </div>;
}

function UserGrid({ users }) {
  const people = users.map((entry) => entry.user || entry).filter((user) => user?.id);
  if (!people.length) return <EmptyState title="No users to show" body="Audius returned no public profiles for this section." />;
  return <div className="profile-grid">{people.map((user) => <Link className="profile-card" to={`/artists/${encodeURIComponent(user.id)}`} key={user.id}>
    <Artwork item={{ artwork: user.profile_picture }} className="profile-art artist-grid-art" />
    <b>{user.name || user.handle || "Audius artist"}</b><span>@{user.handle || "artist"}</span><small>{formatCount(user.follower_count)} followers</small>
  </Link>)}</div>;
}

function PlaylistPage({ onMessage }) {
  const { id } = useParams();
  const { data: playlist, loading, error, retry } = usePageData((signal) => getPlaylist(id, signal), [id]);
  const { playFromQueue, addToQueue } = usePlayer();
  usePageMetadata(playlist?.playlist_name || playlist?.name, playlist?.description || "Listen to an Audius playlist on Soungdify.");
  if (loading) return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Loading Audius playlist…</div></div>;
  if (error || !playlist) return <div className="page"><ErrorState message={error || "Playlist not found."} onRetry={retry} /></div>;
  const tracks = playlist.tracks || [];
  const isAlbum = Boolean(playlist.is_album);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: playlist.playlist_name, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); onMessage("Link copied"); }
    } catch (error) {
      if (error.name !== "AbortError") onMessage("Could not share this link from this browser.");
    }
  };
  return <div className="page">
    <div className="playlist-hero"><Artwork item={playlist} className="detail-art" /><div><span className="eyebrow">AUDIOUS {isAlbum ? "ALBUM" : "PLAYLIST"}</span><h1>{playlist.playlist_name || playlist.name || (isAlbum ? "Album" : "Playlist")}</h1><p>{getArtist(playlist)} · {tracks.length} tracks{playlist.release_date ? ` · ${new Date(playlist.release_date).toLocaleDateString()}` : ""}</p><div className="detail-actions"><button className="button button-accent" disabled={!tracks.length} onClick={() => playFromQueue(tracks)}><Play size={16} fill="currentColor" /> Play {isAlbum ? "album" : "playlist"}</button><button className="button button-muted" disabled={!tracks.length} onClick={() => playFromQueue([...tracks].sort(() => Math.random() - 0.5))}><Shuffle size={16} /> Shuffle</button><button className="button button-muted" onClick={() => tracks.forEach((track) => addToQueue(track))}><Plus size={17} /> Add to queue</button><button className="button button-muted" onClick={share}><Share2 size={16} /> Share</button></div></div></div>
    <TrackList tracks={tracks} onMessage={onMessage} />
    {playlist.description && <section className="detail-description"><h2>About</h2><p>{playlist.description}</p></section>}
    <div className="notice-box"><CircleHelp size={17} /><span>Audius playlist editing and reordering are not enabled. Use My playlists for local editable playlists; account favorites are available when signed in.</span><Link className="text-link" to="/playlists">Manage local playlists</Link></div>
  </div>;
}

function SettingsPage({ onMessage, theme, setTheme }) {
  const { history, favorites, autoplay, setAutoplay, speed, setSpeed, listeningPreferences, setListeningPreferences, clearHistory: clearHistoryData } = usePlayer();
  const { user, error: authError, configured, login, logout } = useAuth();
  const [artistSearch, setArtistSearch] = useState("");
  const [artistResults, setArtistResults] = useState([]);
  const [artistSearchLoading, setArtistSearchLoading] = useState(false);
  const [artistSearchError, setArtistSearchError] = useState("");
  const { data: chartTracks } = usePageData(getTrendingTracks, []);
  const { data: popularPlaylists } = usePageData(getTrendingPlaylists, []);
  const { data: freshPlaylists } = usePageData(getRecentPlaylists, []);
  const listedArtists = [...new Map([
    ...(chartTracks || []).filter((track) => track.user?.id).map((track) => [String(track.user.id), track.user]),
    ...artistResults.filter((artist) => artist?.id).map((artist) => [String(artist.id), artist]),
    ...listeningPreferences.artists.filter((artist) => artist?.id).map((artist) => [String(artist.id), artist]),
  ]).values()];
  const listedPlaylists = [...new Map([
    ...(popularPlaylists || []),
    ...(freshPlaylists || []),
    ...listeningPreferences.playlists,
  ].filter((playlist) => getId(playlist)).map((playlist) => [getId(playlist), playlist])).values()];
  const togglePreference = (key, item) => {
    setListeningPreferences((current) => {
      const values = current[key] || [];
      const value = key === "genres" ? item : item;
      const itemId = key === "genres" ? String(value) : getId(value);
      return {
        ...current,
        [key]: values.some((entry) => (key === "genres" ? String(entry) : getId(entry)) === itemId)
          ? values.filter((entry) => (key === "genres" ? String(entry) : getId(entry)) !== itemId)
          : [...values, value],
      };
    });
  };
  const searchArtists = async (event) => {
    event.preventDefault();
    const term = artistSearch.trim();
    if (term.length < 2) {
      setArtistSearchError("Enter at least two characters to find an artist.");
      return;
    }
    setArtistSearchLoading(true);
    setArtistSearchError("");
    try {
      const result = await searchUsers(term);
      setArtistResults(result || []);
      if (!result?.length) setArtistSearchError("No matching artists found. Try another name.");
    } catch (searchError) {
      setArtistSearchError(getErrorMessage(searchError));
    } finally {
      setArtistSearchLoading(false);
    }
  };
  const clearHistory = () => {
    clearHistoryData();
    onMessage("Listening history cleared");
  };
  const clearSearches = () => {
    if (writeLocal("soungdify.searches", [])) onMessage("Search history cleared");
    else onMessage("Could not clear search history from browser storage.");
  };
  const clearAll = () => {
    if (!window.confirm("Clear local favorites, history, queue, playlists, searches, and playback preferences?")) return;
    try {
      for (const key of ["soungdify.favorites", "soungdify.history", "soungdify.queue", "soungdify.localPlaylists", "soungdify.searches", "soungdify.volume", "soungdify.shuffle", "soungdify.repeat", "soungdify.speed", "soungdify.autoplay", "soungdify.preferences", "soungdify.theme"]) localStorage.removeItem(key);
      onMessage("Local app data cleared");
      window.location.reload();
    } catch (error) {
      console.error("Unable to clear local app data.", error);
      onMessage("Could not clear all local data. Check browser storage permissions.");
    }
  };
  return <div className="page settings-page"><PageIntro eyebrow="PREFERENCES" title="Settings" description="Local controls and app information." />
    <section className="settings-card taste-preferences"><h2>What do you like to listen to?</h2><p>Choose genres, artists, and playlists. These preferences stay in this browser and personalize the choices shown on Home.</p>
      <h3>Favorite genres</h3><div className="preference-options">{genres.map((genre) => <label className="preference-option" key={genre}><input type="checkbox" checked={listeningPreferences.genres.includes(genre)} onChange={() => togglePreference("genres", genre)} /><span>{genre}</span></label>)}</div>
      <div className="preference-subheading"><div><h3>Artists / singers</h3><p>Pick artists from trending creators, or search for a singer by name.</p></div></div>
      <form className="preference-search" onSubmit={searchArtists}><input value={artistSearch} onChange={(event) => setArtistSearch(event.target.value)} placeholder="Search artist or singer name" aria-label="Search artist or singer" /><button className="button button-muted" type="submit" disabled={artistSearchLoading}>{artistSearchLoading ? "Searching…" : "Find artists"}</button></form>
      {artistSearchError && <p className={artistResults.length ? "muted" : "auth-error"} role="status">{artistSearchError}</p>}
      {listedArtists.length > 0 ? <div className="preference-artist-list">{listedArtists.map((artist) => {
        const selected = listeningPreferences.artists.some((entry) => getId(entry) === getId(artist));
        return <label className={`preference-artist ${selected ? "selected" : ""}`} key={getId(artist)}><input type="checkbox" checked={selected} onChange={() => togglePreference("artists", artist)} /><Artwork item={{ artwork: artist.profile_picture }} className="preference-artist-art" /><span><b>{artist.name || artist.handle || "Audius artist"}</b><small>@{artist.handle || "artist"}</small></span></label>;
      })}</div> : <p className="muted">Artist options will appear when Audius chart creators load.</p>}
      <div className="preference-subheading"><div><h3>Playlists</h3><p>Choose playlists you want featured on Home.</p></div></div>
      {listedPlaylists.length > 0 ? <div className="preference-playlist-list">{listedPlaylists.map((playlist) => {
        const selected = listeningPreferences.playlists.some((entry) => getId(entry) === getId(playlist));
        return <label className="preference-playlist" key={getId(playlist)}><input type="checkbox" checked={selected} onChange={() => togglePreference("playlists", playlist)} /><Artwork item={playlist} className="preference-playlist-art" /><span><b>{playlist.playlist_name || playlist.name || "Untitled playlist"}</b><small>{getArtist(playlist)}</small></span></label>;
      })}</div> : <p className="muted">Loading playlist choices from Audius…</p>}
    </section>
    <section className="settings-card"><h2>Appearance</h2><p>Choose the interface theme for this browser.</p><div className="theme-options"><button className={theme === "dark" ? "chosen" : ""} onClick={() => setTheme("dark")}><Moon size={16} /> Dark</button><button className={theme === "light" ? "chosen" : ""} onClick={() => setTheme("light")}><Sun size={16} /> Light</button><button className={theme === "system" ? "chosen" : ""} onClick={() => setTheme("system")}><Settings size={16} /> System</button></div></section>
    <section className="settings-card"><h2>Playback</h2><p>Control queue playback behavior and streaming speed.</p><label className="setting-toggle"><span><b>Autoplay next track</b><small>Continue through your queue, then use trending tracks if the queue ends.</small></span><input type="checkbox" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} /></label><label className="setting-select"><span>Playback speed</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5, 2].map((rate) => <option value={rate} key={rate}>{rate}×</option>)}</select></label><p className="muted">Crossfade and Audius audio-quality selection are not exposed by the public player API.</p></section>
    <section className="settings-card"><h2>Privacy & local data</h2><p>Local favorites ({favorites.length}), listening history ({history.length}), taste preferences, playback settings, and queue are stored in this browser only. Audius-account favorites remain on Audius.</p><div className="settings-actions"><button className="button button-muted" onClick={clearHistory}>Clear listening history</button><button className="button button-muted" onClick={clearSearches}>Clear search history</button></div></section>
    <section className="settings-card"><h2>Local playlists</h2><p>Manage playlists saved only in this browser.</p><Link className="button button-muted" to="/playlists">Open playlist manager</Link></section>
    <section className="settings-card"><h2>Audius account</h2><p>{user ? `Connected as @${user.handle || user.name}.` : configured ? "Sign in to sync favorites and use Audius account actions." : "Set an Audius API key and OAuth callback to enable account features."}</p>{authError && <p className="auth-error" role="alert">{authError}</p>}{user ? <div className="settings-actions"><Link className="button button-muted" to="/profile">Open Audius profile</Link><button className="button button-muted" onClick={logout}><LogOut size={16} /> Sign out</button></div> : <button className="button button-muted" onClick={login} disabled={!configured}><LogIn size={16} /> Sign in with Audius</button>}</section>
    <section className="settings-card"><h2>Clear all local data</h2><p>This removes browser-local favorites, listening history, playlists, queue, and preferences.</p><button className="button button-danger" onClick={clearAll}>Clear all local data</button></section>
    <section className="settings-card"><h2>Connected source</h2><p>Audius public discovery API</p><code>{getApiBase()}</code><p className="muted">Account actions use Audius OAuth with PKCE. The API key is a public client-side identifier; no app secret is used.</p></section>
  </div>;
}

function ShortcutsModal({ close }) {
  useEffect(() => {
    const escape = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={close}><section className="shortcuts-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="shortcuts-heading"><button className="icon-button modal-close" onClick={close} aria-label="Close shortcuts"><X size={18} /></button><div className="eyebrow">QUICK CONTROLS</div><h2 id="shortcuts-heading">Keyboard shortcuts</h2><dl>{[["Space", "Play / pause"], ["← / →", "Seek 5 seconds"], ["↑ / ↓", "Adjust volume"], ["M", "Mute / unmute"], ["N", "Next track"], ["P", "Previous track"], ["S", "Toggle shuffle"]].map(([key, action]) => <div key={key}><dt>{key}</dt><dd>{action}</dd></div>)}</dl></section></div>;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [theme, setTheme] = useState(() => readLocal("soungdify.theme", "dark"));
  const { togglePlayback, next, previous, setVolume, volume, setShuffle } = usePlayer();
  const navigate = useNavigate();
  const location = useLocation();
  const toastTimer = useRef(null);
  const notify = (message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };
  const startSearch = (term) => {
    const value = term.trim();
    if (value) {
      setQuery(value);
      const recent = readLocal("soungdify.searches", []);
      if (!writeLocal("soungdify.searches", [value, ...recent.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8))) notify("Search submitted, but local search history could not be saved.");
      navigate(`/search?q=${encodeURIComponent(value)}`);
    } else navigate("/search");
  };
  useEffect(() => {
    writeLocal("soungdify.theme", theme);
    const preference = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === "system" ? (preference.matches ? "light" : "dark") : theme;
    };
    applyTheme();
    if (theme === "system") {
      preference.addEventListener("change", applyTheme);
      return () => preference.removeEventListener("change", applyTheme);
    }
    return undefined;
  }, [theme]);
  useEffect(() => {
    const path = location.pathname;
    const pageTitle = path === "/" ? "Independent music discovery"
      : path.startsWith("/tracks/") ? "Track"
        : path.startsWith("/artists/") || path.startsWith("/users/") ? "Artist"
          : path.startsWith("/albums/") ? "Album"
            : path.startsWith("/playlists/") ? "Playlist"
              : path.startsWith("/search") ? "Search"
                : path === "/discover" || path === "/trending" ? "Discover"
                  : path === "/library" || path === "/liked" ? "Your library"
                    : path === "/history" ? "Listening history"
                      : path === "/queue" ? "Queue"
                        : path === "/settings" ? "Settings"
                          : path.replaceAll("/", " ").trim().replace(/-/g, " ") || "Music";
    document.title = `${pageTitle} · Soungdify`;
  }, [location.pathname]);
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      if (event.key === "ArrowRight") { event.preventDefault(); const audio = document.querySelector("audio"); if (audio) audio.currentTime += 5; }
      if (event.key === "ArrowLeft") { event.preventDefault(); const audio = document.querySelector("audio"); if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5); }
      if (event.key === "ArrowUp") { event.preventDefault(); setVolume(Math.min(1, volume + 0.05)); }
      if (event.key === "ArrowDown") { event.preventDefault(); setVolume(Math.max(0, volume - 0.05)); }
      if (event.key.toLowerCase() === "m") setVolume(volume === 0 ? 0.8 : 0);
      if (event.key.toLowerCase() === "n") next();
      if (event.key.toLowerCase() === "p") previous();
      if (event.key.toLowerCase() === "s") setShuffle((current) => !current);
      if (event.key === "?") setShowShortcuts(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous, setShuffle, setVolume, togglePlayback, volume]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  return <div className="app-shell">
    <Sidebar onMessage={notify} />
    <div className="main-shell">
      <Header onMessage={notify} query={query} setQuery={setQuery} onSearch={startSearch} />
      <main className="main-content" key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage onMessage={notify} />} />
          <Route path="/discover" element={<DiscoverPage onMessage={notify} />} />
          <Route path="/trending" element={<DiscoverPage onMessage={notify} />} />
          <Route path="/new-releases" element={<NewReleasesPage onMessage={notify} />} />
          <Route path="/genres/:genre" element={<DiscoverPage onMessage={notify} />} />
          <Route path="/moods/:mood" element={<MoodPage onMessage={notify} />} />
          <Route path="/for-you" element={<ForYouPage onMessage={notify} />} />
          <Route path="/search" element={<SearchPage onMessage={notify} query={query} setQuery={setQuery} />} />
          <Route path="/library" element={<LibraryPage onMessage={notify} />} />
          <Route path="/liked" element={<LibraryPage onMessage={notify} />} />
          <Route path="/player" element={<ExpandedPlayer close={() => navigate("/")} onMessage={notify} />} />
          <Route path="/playlists" element={<LocalPlaylistsPage onMessage={notify} />} />
          <Route path="/my-playlists/:id" element={<LocalPlaylistPage onMessage={notify} />} />
          <Route path="/history" element={<HistoryPage onMessage={notify} />} />
          <Route path="/queue" element={<QueuePage onMessage={notify} />} />
          <Route path="/tracks/:id" element={<TrackPage onMessage={notify} />} />
          <Route path="/artists/:id" element={<ArtistPage onMessage={notify} />} />
          <Route path="/users/:id" element={<ArtistPage onMessage={notify} />} />
          <Route path="/playlists/:id" element={<PlaylistPage onMessage={notify} />} />
          <Route path="/albums/:id" element={<PlaylistPage onMessage={notify} />} />
          <Route path="/feed" element={<UnavailableFeaturePage title="Social feed" feature="A personalized social feed" details="Audius feed activity is account- and follow-dependent. Browse public artists and their reposts from artist profiles instead." />} />
          <Route path="/notifications" element={<UnavailableFeaturePage title="Notifications" feature="Audius notifications" details="The public discovery API does not expose a user notification inbox. No fake notifications are generated." />} />
          <Route path="/remixes" element={<UnavailableFeaturePage title="Remix discovery" feature="A global remix catalog" details="Audius exposes remixes from individual track pages, but no public global remix catalog endpoint is available. Open a track page to view its remixes." />} />
          <Route path="/login" element={<AudiusLoginPage />} />
          <Route path="/callback" element={<AudiusCallbackPage />} />
          <Route path="/profile" element={<AudiusAccountPage onMessage={notify} />} />
          <Route path="/following" element={<AudiusAccountPage initialTab="following" onMessage={notify} />} />
          <Route path="/followers" element={<AudiusAccountPage initialTab="followers" onMessage={notify} />} />
          <Route path="/settings" element={<SettingsPage onMessage={notify} theme={theme} setTheme={setTheme} />} />
          <Route path="*" element={<div className="page"><EmptyState title="Page not found" body="The page you’re looking for doesn’t exist." action={<Link className="text-link" to="/">Back to home</Link>} /></div>} />
        </Routes>
      </main>
      <div className="bottom-mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/" end><Home size={19} /><span>Home</span></NavLink><NavLink to="/discover"><Sparkles size={19} /><span>Discover</span></NavLink><NavLink to="/search"><Search size={19} /><span>Search</span></NavLink><NavLink to="/library"><Heart size={19} /><span>Library</span></NavLink>
      </div>
    </div>
    {showQueue && <div className="queue-drawer"><div className="drawer-heading"><h2>Queue</h2><button className="icon-button" onClick={() => setShowQueue(false)} aria-label="Close queue"><X size={18} /></button></div><QueuePage onMessage={notify} /></div>}
    <PlayerBar onMessage={notify} onQueue={() => setShowQueue((open) => !open)} />
    <button className="help-shortcut" onClick={() => setShowShortcuts(true)} aria-label="Show keyboard shortcuts">?</button>
    {toast && <div className="toast" role="status">{toast}</div>}
    {showShortcuts && <ShortcutsModal close={() => setShowShortcuts(false)} />}
  </div>;
}
