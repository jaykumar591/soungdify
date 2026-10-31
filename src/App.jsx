import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, AudioLines, ChevronDown, CircleHelp, Clock3, Disc3, Heart,
  Home, ListMusic, LoaderCircle, Music2, Pause, Play, Plus, Search, Settings,
  Share2, Shuffle, SkipBack, SkipForward, Sparkles, Sun, Moon, Volume2, VolumeX, X,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AudiusError, getApiBase, getArtist, getArtwork, getId, getPlaylist, getTrack,
  getTrendingPlaylists, getTrendingTracks, getUser, getUserTracks, searchPlaylists,
  searchTracks, searchUsers,
} from "./api/audius.js";
import { usePlayer } from "./state/PlayerContext.jsx";

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

function usePageData(loader, dependencies = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
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
  }, dependencies);
  return state;
}

function getErrorMessage(error) {
  if (error instanceof AudiusError && error.status === 404) return "This Audius item could not be found.";
  return error?.message || "Unable to load Audius content. Check your connection and retry.";
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
        <button className="icon-button" onClick={() => { addToQueue(track); onMessage("Added to queue"); }} aria-label="Add to queue" title="Add to queue"><Plus size={17} /></button>
        <button className="icon-button" onClick={share} aria-label="Share track" title="Share"><Share2 size={16} /></button>
      </div>
    </article>
  );
}

function TrackGrid({ tracks, onMessage }) {
  if (!tracks?.length) return <EmptyState title="No tracks here yet" body="Audius did not return any tracks for this section." />;
  return <div className="track-grid">{tracks.map((track) => <TrackCard key={track.id} track={track} tracks={tracks} onMessage={onMessage} />)}</div>;
}

function PlaylistGrid({ playlists }) {
  if (!playlists?.length) return <EmptyState title="No playlists available" body="Audius did not return any trending playlists." />;
  return <div className="profile-grid playlist-grid">{playlists.map((playlist) => (
    <Link className="profile-card playlist-card" to={`/playlists/${encodeURIComponent(getId(playlist))}`} key={getId(playlist)}>
      <Artwork item={playlist} className="profile-art" />
      <b>{playlist.playlist_name || "Untitled playlist"}</b>
      <span>{getArtist(playlist)}</span>
      <small>{formatCount(playlist.track_count)} tracks</small>
    </Link>
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
          <button className="icon-button" onClick={() => { addToQueue(track); onMessage("Added to queue"); }} aria-label={`Add ${track.title || "track"} to queue`}><Plus size={17} /></button>
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
    <button className="avatar-button" onClick={() => onMessage("Sign-in is not enabled. Public Audius browsing is available.")} aria-label="Audius account">S</button>
  </header>;
}

function Sidebar({ onMessage }) {
  return <aside className="sidebar">
    <Link className="brand" to="/"><span className="brand-mark"><AudioLines size={23} /></span><span>soungdify</span></Link>
    <div className="side-label">Discover</div>
    <nav className="side-nav">
      <NavLink to="/" end><Home size={18} /> Home</NavLink>
      <NavLink to="/discover"><Sparkles size={18} /> Discover</NavLink>
      <NavLink to="/search"><Search size={18} /> Search</NavLink>
    </nav>
    <div className="side-label library-label">Your library</div>
    <nav className="side-nav">
      <NavLink to="/library"><Heart size={18} /> Saved tracks</NavLink>
      <NavLink to="/history"><Clock3 size={18} /> Listening history</NavLink>
      <NavLink to="/queue"><ListMusic size={18} /> Queue</NavLink>
    </nav>
    <div className="sidebar-note"><div className="note-icon"><Disc3 size={17} /></div><b>Independent sound</b><p>Discover music from artists on Audius.</p><span>Free · Open discovery</span></div>
    <NavLink className="settings-link" to="/settings"><Settings size={17} /> Settings <ChevronDown size={14} /></NavLink>
  </aside>;
}

function PlayerBar({ onMessage, onQueue }) {
  const { current, isPlaying, togglePlayback, next, previous, time, duration, volume, setVolume, shuffle, setShuffle, repeat, setRepeat, seek, error, setError, favorites, toggleFavorite } = usePlayer();
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
        {current ? <Artwork item={current} className="now-art" /> : <div className="artwork artwork-fallback now-art"><AudioLines size={22} /></div>}
        <div className="now-label">{current ? <><Link to={`/tracks/${encodeURIComponent(current.id)}`}>{current.title || "Untitled track"}</Link><span>{getArtist(current)}</span></> : <><b>Ready when you are</b><span>Pick a track to start listening</span></>}</div>
        {current && <button className={`icon-button favorite-button now-favorite ${isFavorite ? "active" : ""}`} onClick={() => toggleFavorite(current)} aria-label={isFavorite ? "Remove local favorite" : "Save to local library"}><Heart size={17} fill={isFavorite ? "currentColor" : "none"} /></button>}
      </div>
      <div className="playback">
        <div className="playback-controls">
          <button className={`icon-button control-secondary ${shuffle ? "control-active" : ""}`} onClick={() => setShuffle(!shuffle)} aria-label="Toggle shuffle" title="Shuffle"><Shuffle size={17} /></button>
          <button className="icon-button" onClick={previous} aria-label="Previous track"><SkipBack size={18} fill="currentColor" /></button>
          <button className="play-button" onClick={togglePlayback} disabled={!current} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
          <button className="icon-button" onClick={next} aria-label="Next track"><SkipForward size={18} fill="currentColor" /></button>
          <button className={`icon-button control-secondary ${repeat ? "control-active" : ""}`} onClick={() => setRepeat(!repeat)} aria-label="Toggle repeat" title="Repeat"><span className="repeat-glyph">↻</span></button>
        </div>
        <div className="progress-row">
          <span>{formatTime(time)}</span>
          <input type="range" min="0" max={duration || 1} value={Math.min(time, duration || 1)} onChange={(event) => seek(Number(event.target.value))} onKeyDown={keySeek} aria-label="Track progress" style={{ "--progress": `${percent}%` }} disabled={!current} />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="player-extras">
        <button className="icon-button queue-toggle" onClick={onQueue} aria-label="Open queue" title="Queue"><ListMusic size={18} /></button>
        <div className="volume-control"><button className="icon-button" aria-label={volume === 0 ? "Unmute" : "Mute"} onClick={() => setVolume(volume === 0 ? 0.8 : 0)}>{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" style={{ "--progress": `${volume * 100}%` }} /></div>
      </div>
    </footer>
  </>;
}

function HomePage({ onMessage }) {
  const { data: tracks, loading, error } = usePageData(getTrendingTracks, []);
  const { data: playlists, loading: playlistsLoading, error: playlistsError } = usePageData(getTrendingPlaylists, []);
  const navigate = useNavigate();
  const artists = [...new Map((tracks || []).filter((track) => track.user?.id).map((track) => [track.user.id, track.user])).values()].slice(0, 6);
  return <div className="page home-page">
    <section className="hero">
      <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
      <div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> Powered by Audius</span><h1>Find your next<br /><em>favorite sound.</em></h1><p>Independent music discovery, made for the curious.</p><button className="button button-accent" onClick={() => navigate("/discover")}><Sparkles size={17} /> Explore what’s trending</button></div>
      <div className="hero-art" aria-hidden="true"><div className="hero-record"><div className="record-groove" /><div className="record-label"><AudioLines size={34} /></div></div><div className="hero-sticker">NEW<br />SOUNDS<br /><span>DAILY</span></div></div>
    </section>
    <div className="section-heading"><div><div className="eyebrow">AUDIOUS CHARTS</div><h2>Trending right now</h2><p>Tracks listeners are discovering across Audius.</p></div><Link className="text-link" to="/discover">Explore all <ArrowRight size={15} /></Link></div>
    {loading && <LoadingGrid />}
    {!loading && error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
    {!loading && !error && <TrackGrid tracks={tracks || []} onMessage={onMessage} />}
    <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">COMMUNITY PICKS</div><h2>Trending playlists</h2><p>Public playlists currently popular on Audius.</p></div></div>
      {playlistsLoading && <LoadingGrid />}
      {!playlistsLoading && playlistsError && <ErrorState message={playlistsError} onRetry={() => window.location.reload()} />}
      {!playlistsLoading && !playlistsError && <PlaylistGrid playlists={playlists || []} />}
    </section>
    {artists.length > 0 && <section className="discovery-section">
      <div className="section-heading"><div><div className="eyebrow">CREATORS IN THE CHARTS</div><h2>Artists behind trending tracks</h2><p>Profiles attached to the tracks shown above.</p></div></div>
      <ArtistGrid artists={artists} />
    </section>}
    <section className="genre-section">
      <div className="section-heading"><div><div className="eyebrow">FOLLOW A FEELING</div><h2>Explore by sound</h2><p>Search Audius tracks by a style you love.</p></div></div>
      <div className="genre-grid">{genres.map((genre, i) => <button className={`genre-tile genre-${i % 5}`} key={genre} onClick={() => navigate(`/search?q=${encodeURIComponent(genre)}`)}><span>{genre}</span><ArrowRight size={17} /></button>)}</div>
    </section>
    <p className="source-note">Music, metadata, and artwork are supplied by Audius. Availability and playback depend on the source track.</p>
  </div>;
}

function DiscoverPage({ onMessage }) {
  const { data: tracks, loading, error } = usePageData(getTrendingTracks, []);
  return <div className="page">
    <PageIntro eyebrow="DISCOVERY" title="Explore the soundscape" description="Browse real tracks currently trending on Audius." />
    {loading && <LoadingGrid />}
    {!loading && error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
    {!loading && !error && <TrackList tracks={tracks || []} onMessage={onMessage} />}
    <p className="source-note">Public discovery only. Personalized recommendations are not provided by this page.</p>
  </div>;
}

function PageIntro({ eyebrow, title, description, children }) {
  return <div className="page-intro"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p>{children}</div>;
}

function SearchPage({ onMessage, query, setQuery }) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("tracks");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(null);
  const search = (term) => {
    const next = term.trim();
    if (!next) return;
    setQuery(next);
    setParams({ q: next });
    const past = readLocal("soungdify.searches", []);
    writeLocal("soungdify.searches", [next, ...past.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 8));
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
        const loader = tab === "tracks" ? searchTracks : tab === "artists" ? searchUsers : searchPlaylists;
        const data = await loader(term, controller.signal);
        setResults(Array.isArray(data) ? data : []);
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
  }, [query, tab]);
  const recent = readLocal("soungdify.searches", []);
  const tabs = ["tracks", "artists", "playlists"];
  return <div className="page search-page">
    <PageIntro eyebrow="SEARCH AUDIOUS" title="What are you in the mood for?" description="Search public Audius tracks, artists, and playlists." />
    <form className="search-page-form" onSubmit={(event) => { event.preventDefault(); search(query); }}><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a track, artist, or genre" autoFocus aria-label="Search query" /><button className="button button-accent" type="submit">Search</button></form>
    {query.trim().length < 2 && <div className="recent-searches"><div className="section-heading small-heading"><div><h2>Recent searches</h2></div>{recent.length > 0 && <button className="text-link button-reset" onClick={() => writeLocal("soungdify.searches", [])}>Clear history</button>}</div>{recent.length ? <div className="recent-chips">{recent.map((term) => <button key={term} onClick={() => search(term)}><Clock3 size={14} />{term}</button>)}</div> : <p className="muted">Your searches stay on this device.</p>}</div>}
    {query.trim().length >= 2 && <><div className="search-tabs" role="tablist" aria-label="Search result type">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "selected" : ""} key={item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      {loading && <div className="inline-loading"><LoaderCircle className="spin" size={20} /> Searching Audius…</div>}
      {!loading && error && <ErrorState message={error} onRetry={() => setQuery(`${query} `)} />}
      {!loading && !error && results.length === 0 && <EmptyState title="No results found" body={`No ${tab} matched “${query}”. Try a different search.`} />}
      {!loading && !error && tab === "tracks" && results.length > 0 && <TrackList tracks={results} onMessage={onMessage} />}
      {!loading && !error && tab === "artists" && results.length > 0 && <div className="profile-grid">{results.map((user) => <Link className="profile-card" to={`/artists/${encodeURIComponent(user.id)}`} key={user.id}><Artwork item={{ artwork: user?.profile_picture }} className="profile-art" /><b>{user.name || user.handle || "Audius artist"}</b><span>@{user.handle || "artist"}</span><small>{formatCount(user.follower_count)} followers</small></Link>)}</div>}
      {!loading && !error && tab === "playlists" && results.length > 0 && <div className="profile-grid">{results.map((playlist) => <Link className="profile-card playlist-card" to={`/playlists/${encodeURIComponent(getId(playlist))}`} key={getId(playlist)}><Artwork item={playlist} className="profile-art" /><b>{playlist.playlist_name || playlist.name || "Untitled playlist"}</b><span>{getArtist(playlist)}</span><small>{formatCount(playlist.track_count)} tracks</small></Link>)}</div>}
    </>}
  </div>;
}

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.error(`Unable to persist ${key}.`, error); }
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

function HistoryPage({ onMessage }) {
  const { history } = usePlayer();
  const tracks = history.map((entry) => entry.track);
  return <div className="page"><PageIntro eyebrow="ON THIS DEVICE" title="Listening history" description="Your recent plays are private and stored only in this browser." />
    {tracks.length ? <TrackList tracks={tracks} onMessage={onMessage} /> : <EmptyState title="Nothing played yet" body="Explore Audius to start building a listening history." />}
  </div>;
}

function QueuePage({ onMessage }) {
  const { queue, current, removeFromQueue, clearQueue, playFromQueue, index } = usePlayer();
  const upcoming = queue.filter((track, i) => !(current && String(current.id) === String(track.id) && i === index));
  return <div className="page"><PageIntro eyebrow="UP NEXT" title="Your queue" description="Manage the tracks waiting to play." >
    {queue.length > 0 && <button className="button button-muted" onClick={clearQueue}>Clear queue</button>}
  </PageIntro>
    {current && <div className="queue-current"><span className="eyebrow">NOW PLAYING</span><div><Artwork item={current} className="list-art" /><div><b>{current.title}</b><span>{getArtist(current)}</span></div></div></div>}
    {upcoming.length ? <div className="list-table">{upcoming.map((track) => <div className="list-row" key={track.id}><button className="list-play" onClick={() => playFromQueue(queue, queue.findIndex((item) => String(item.id) === String(track.id)))} aria-label={`Play ${track.title}`}><Play size={15} /></button><Artwork item={track} className="list-art" /><div className="list-track-label"><Link to={`/tracks/${encodeURIComponent(track.id)}`}>{track.title || "Untitled track"}</Link><span>{getArtist(track)}</span></div><button className="icon-button" onClick={() => { removeFromQueue(track.id); onMessage("Removed from queue"); }} aria-label="Remove from queue"><X size={17} /></button></div>)}</div> : !current && <EmptyState title="Your queue is empty" body="Add tracks from discovery to line up what plays next." />}
  </div>;
}

function TrackPage({ onMessage }) {
  const { id } = useParams();
  const { data: track, loading, error } = usePageData((signal) => getTrack(id, signal), [id]);
  const { playTrack, addToQueue, toggleFavorite, favorites } = usePlayer();
  if (loading) return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Loading Audius track…</div></div>;
  if (error || !track) return <div className="page"><ErrorState message={error || "Track not found."} onRetry={() => window.location.reload()} /></div>;
  const liked = favorites.some((item) => String(item.id) === String(track.id));
  return <div className="page detail-page">
    <div className="track-hero"><Artwork item={track} className="detail-art" /><div><span className="eyebrow">AUDIOUS TRACK</span><h1>{track.title || "Untitled track"}</h1><Link to={`/artists/${encodeURIComponent(track.user?.id || track.user_id || "")}`} className="detail-artist">{getArtist(track)}</Link><p className="detail-tags">{[track.genre, track.mood].filter(Boolean).join(" · ") || "Independent music"}</p><div className="detail-stats"><span><Play size={14} /> {formatCount(track.play_count)} plays</span><span><Heart size={14} /> {formatCount(track.favorite_count)} Audius favorites</span><span>{formatTime(track.duration || 0)}</span></div><div className="detail-actions"><button className="button button-accent" onClick={() => playTrack(track)}><Play size={16} fill="currentColor" /> Play track</button><button className="button button-muted" onClick={() => { addToQueue(track); onMessage("Added to queue"); }}><Plus size={17} /> Add to queue</button><button className="button button-muted" onClick={() => toggleFavorite(track)}><Heart size={16} fill={liked ? "currentColor" : "none"} /> {liked ? "Saved locally" : "Save locally"}</button></div></div></div>
    {track.description && <section className="detail-description"><h2>About this track</h2><p>{track.description}</p></section>}
    <div className="notice-box"><CircleHelp size={17} /><span>Comments, reposts, and Audius-synced favorites require account authorization and are not enabled here.</span></div>
  </div>;
}

function ArtistPage({ onMessage }) {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([getUser(id, controller.signal), getUserTracks(id, controller.signal)])
      .then(([user, userTracks]) => { setProfile(user); setTracks(Array.isArray(userTracks) ? userTracks : []); setError(""); })
      .catch((requestError) => { if (requestError.name !== "AbortError") setError(getErrorMessage(requestError)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  if (loading) return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Loading Audius artist…</div></div>;
  if (error) return <div className="page"><ErrorState message={error} onRetry={() => window.location.reload()} /></div>;
  return <div className="page">
    <div className="artist-hero"><Artwork item={{ artwork: profile?.cover_photo }} className="artist-cover" /><div className="artist-profile"><Artwork item={{ artwork: profile?.profile_picture }} className="artist-avatar" /><div><span className="eyebrow">AUDIOUS ARTIST</span><h1>{profile?.name || profile?.handle || "Artist"}</h1><p>@{profile?.handle || "artist"} · {formatCount(profile?.follower_count)} followers</p></div><button className="button button-muted" onClick={() => onMessage("Following artists requires Audius account authorization, which is not enabled.")}>Follow unavailable</button></div></div>
    {profile?.bio && <p className="artist-bio">{profile.bio}</p>}
    <div className="section-heading"><div><div className="eyebrow">PUBLIC RELEASES</div><h2>Tracks</h2></div></div>
    <TrackList tracks={tracks} onMessage={onMessage} />
  </div>;
}

function PlaylistPage({ onMessage }) {
  const { id } = useParams();
  const { data: playlist, loading, error } = usePageData((signal) => getPlaylist(id, signal), [id]);
  const { playFromQueue, addToQueue } = usePlayer();
  if (loading) return <div className="page"><div className="inline-loading"><LoaderCircle className="spin" /> Loading Audius playlist…</div></div>;
  if (error || !playlist) return <div className="page"><ErrorState message={error || "Playlist not found."} onRetry={() => window.location.reload()} /></div>;
  const tracks = playlist.tracks || [];
  return <div className="page">
    <div className="playlist-hero"><Artwork item={playlist} className="detail-art" /><div><span className="eyebrow">AUDIOUS PLAYLIST</span><h1>{playlist.playlist_name || playlist.name || "Playlist"}</h1><p>{getArtist(playlist)} · {tracks.length} tracks</p><div className="detail-actions"><button className="button button-accent" disabled={!tracks.length} onClick={() => playFromQueue(tracks)}><Play size={16} fill="currentColor" /> Play playlist</button><button className="button button-muted" onClick={() => tracks.forEach((track) => addToQueue(track))}><Plus size={17} /> Add tracks to queue</button></div></div></div>
    <TrackList tracks={tracks} onMessage={onMessage} />
    <div className="notice-box"><CircleHelp size={17} /><span>Playlist editing and Audius favorites require account authorization and are not enabled here.</span></div>
  </div>;
}

function SettingsPage({ onMessage, theme, setTheme }) {
  const { history, favorites } = usePlayer();
  const clearHistory = () => {
    writeLocal("soungdify.history", []);
    window.location.reload();
  };
  const clearSearches = () => {
    writeLocal("soungdify.searches", []);
    onMessage("Search history cleared");
  };
  return <div className="page settings-page"><PageIntro eyebrow="PREFERENCES" title="Settings" description="Local controls and app information." />
    <section className="settings-card"><h2>Appearance</h2><p>Choose the interface theme for this browser.</p><div className="theme-options"><button className={theme === "dark" ? "chosen" : ""} onClick={() => setTheme("dark")}><Moon size={16} /> Dark</button><button className={theme === "light" ? "chosen" : ""} onClick={() => setTheme("light")}><Sun size={16} /> Light</button></div></section>
    <section className="settings-card"><h2>Privacy & local data</h2><p>Favorites ({favorites.length}), listening history ({history.length}), playback settings, and queue are stored in this browser only.</p><div className="settings-actions"><button className="button button-muted" onClick={clearHistory}>Clear listening history</button><button className="button button-muted" onClick={clearSearches}>Clear search history</button></div></section>
    <section className="settings-card"><h2>Connected source</h2><p>Audius public discovery API</p><code>{getApiBase()}</code><p className="muted">No account token or paid API is configured. Private or write operations are intentionally unavailable.</p></section>
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
      navigate(`/search?q=${encodeURIComponent(value)}`);
    } else navigate("/search");
  };
  useEffect(() => {
    writeLocal("soungdify.theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
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
          <Route path="/search" element={<SearchPage onMessage={notify} query={query} setQuery={setQuery} />} />
          <Route path="/library" element={<LibraryPage onMessage={notify} />} />
          <Route path="/history" element={<HistoryPage onMessage={notify} />} />
          <Route path="/queue" element={<QueuePage onMessage={notify} />} />
          <Route path="/tracks/:id" element={<TrackPage onMessage={notify} />} />
          <Route path="/artists/:id" element={<ArtistPage onMessage={notify} />} />
          <Route path="/playlists/:id" element={<PlaylistPage onMessage={notify} />} />
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
