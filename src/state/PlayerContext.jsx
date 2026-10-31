import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getArtwork, getStreamUrl, getTrendingTracks } from "../api/audius.js";

const PlayerContext = createContext(null);
const STORAGE = {
  queue: "soungdify.queue",
  favorites: "soungdify.favorites",
  history: "soungdify.history",
  volume: "soungdify.volume",
  shuffle: "soungdify.shuffle",
  repeat: "soungdify.repeat",
  speed: "soungdify.speed",
  autoplay: "soungdify.autoplay",
  preferences: "soungdify.preferences",
};

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from browser storage.`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to persist ${key}.`, error);
  }
}

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const lastHistoryProgressRef = useRef(0);
  const queueRef = useRef([]);
  const indexRef = useRef(-1);
  const currentRef = useRef(null);
  const autoplayTracksRef = useRef([]);
  const streamRetryCountRef = useRef(0);
  const pendingSeekRef = useRef(0);
  const stallTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const recoveryResetTimerRef = useRef(null);
  const [queue, setQueue] = useState(() => readStorage(STORAGE.queue, []));
  const [index, setIndex] = useState(-1);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, Number(readStorage(STORAGE.volume, 0.8)) || 0)));
  const [shuffle, setShuffle] = useState(() => readStorage(STORAGE.shuffle, false));
  const [repeat, setRepeat] = useState(() => {
    const stored = readStorage(STORAGE.repeat, "off");
    if (stored === true) return "all";
    if (stored === false) return "off";
    return ["off", "all", "one"].includes(stored) ? stored : "off";
  });
  const [speed, setSpeed] = useState(() => {
    const stored = Number(readStorage(STORAGE.speed, 1));
    return [0.75, 1, 1.25, 1.5, 2].includes(stored) ? stored : 1;
  });
  const [autoplay, setAutoplay] = useState(() => readStorage(STORAGE.autoplay, true));
  const [favorites, setFavorites] = useState(() => readStorage(STORAGE.favorites, []));
  const [history, setHistory] = useState(() => readStorage(STORAGE.history, []));
  const [listeningPreferences, setListeningPreferences] = useState(() => {
    const stored = readStorage(STORAGE.preferences, {});
    return {
      genres: Array.isArray(stored.genres) ? stored.genres : [],
      artists: Array.isArray(stored.artists) ? stored.artists : [],
      playlists: Array.isArray(stored.playlists) ? stored.playlists : [],
    };
  });
  const [error, setError] = useState("");

  queueRef.current = queue;
  indexRef.current = index;
  currentRef.current = current;

  useEffect(() => writeStorage(STORAGE.queue, queue), [queue]);
  useEffect(() => writeStorage(STORAGE.favorites, favorites), [favorites]);
  useEffect(() => writeStorage(STORAGE.history, history), [history]);
  useEffect(() => writeStorage(STORAGE.volume, volume), [volume]);
  useEffect(() => writeStorage(STORAGE.shuffle, shuffle), [shuffle]);
  useEffect(() => writeStorage(STORAGE.repeat, repeat), [repeat]);
  useEffect(() => writeStorage(STORAGE.speed, speed), [speed]);
  useEffect(() => writeStorage(STORAGE.autoplay, autoplay), [autoplay]);
  useEffect(() => writeStorage(STORAGE.preferences, listeningPreferences), [listeningPreferences]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    setError("");
    streamRetryCountRef.current = 0;
    pendingSeekRef.current = 0;
    window.clearTimeout(stallTimerRef.current);
    window.clearTimeout(retryTimerRef.current);
    window.clearTimeout(recoveryResetTimerRef.current);
    lastHistoryProgressRef.current = 0;
    audio.src = getStreamUrl(current.id);
    audio.load();
    audio.play().catch((playError) => {
      if (playError.name === "NotAllowedError") setError("Playback was paused by the browser. Press play to continue.");
      else if (currentRef.current?.id === current.id) setError(`Could not start “${current.title || "this track"}”. Check your connection and try again.`);
      setIsPlaying(false);
    });
  }, [current]);

  useEffect(() => {
    if (!current || !autoplay) {
      autoplayTracksRef.current = [];
      return undefined;
    }
    const queuedNext = queue.slice(index + 1);
    if (queuedNext.length) {
      autoplayTracksRef.current = [];
      return undefined;
    }
    let active = true;
    getTrendingTracks(undefined, {
      limit: 24,
      time: "week",
      ...(current.genre ? { genre: current.genre } : {}),
    }).then((tracks) => {
      if (!active) return;
      const queuedIds = new Set(queue.map((track) => String(track.id)));
      const candidates = (tracks || []).filter((track) => (
        track?.id && !queuedIds.has(String(track.id))
      ));
      autoplayTracksRef.current = shuffle && candidates.length > 1
        ? candidates.sort(() => Math.random() - 0.5)
        : candidates;
    }).catch((loadError) => {
      if (loadError.name !== "AbortError") {
        autoplayTracksRef.current = [];
        console.error("Unable to load autoplay recommendations.", loadError);
      }
    });
    return () => { active = false; };
  }, [autoplay, current, index, queue, shuffle]);

  const retryCurrentStream = useCallback(() => {
    const audio = audioRef.current;
    const track = currentRef.current;
    if (!audio || !track) return;
    if (streamRetryCountRef.current >= 3) {
      setIsPlaying(false);
      setError("The stream keeps disconnecting. Check your connection and press play to retry.");
      return;
    }
    const delay = 750 * (2 ** streamRetryCountRef.current);
    streamRetryCountRef.current += 1;
    pendingSeekRef.current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => {
      if (currentRef.current?.id !== track.id || !audioRef.current) return;
      setError("");
      audioRef.current.src = getStreamUrl(track.id);
      audioRef.current.load();
      audioRef.current.play().catch((playError) => {
        if (playError.name === "NotAllowedError") {
          setError("Playback was paused by the browser. Press play to continue.");
          setIsPlaying(false);
        } else {
          retryCurrentStream();
        }
      });
    }, delay);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  const playTrack = useCallback((track, list = []) => {
    if (!track?.id) return;
    const tracks = list.length ? list : [track];
    const trackIndex = tracks.findIndex((item) => String(item.id) === String(track.id));
    setQueue(tracks);
    setIndex(trackIndex >= 0 ? trackIndex : 0);
    setCurrent(track);
    setTime(0);
    setError("");
    setHistory((previous) => [
      { track, playedAt: Date.now(), playedDuration: 0, completed: false },
      ...previous.filter((entry) => String(entry.track?.id) !== String(track.id)),
    ].slice(0, 100));
  }, []);

  const playFromQueue = useCallback((nextQueue, startIndex = 0) => {
    if (!nextQueue.length) return;
    setQueue(nextQueue);
    setIndex(startIndex);
    setCurrent(nextQueue[startIndex]);
    setTime(0);
    setError("");
    setHistory((previous) => [
      { track: nextQueue[startIndex], playedAt: Date.now(), playedDuration: 0, completed: false },
      ...previous.filter((entry) => String(entry.track?.id) !== String(nextQueue[startIndex].id)),
    ].slice(0, 100));
  }, []);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().catch(() => setError("Playback was blocked. Press play again to retry."));
    } else {
      audio.pause();
    }
  }, [current]);

  const playIndex = useCallback((nextIndex) => {
    if (!queue.length) return;
    const safeIndex = (nextIndex + queue.length) % queue.length;
    setIndex(safeIndex);
    setCurrent(queue[safeIndex]);
    setTime(0);
  }, [queue]);

  const next = useCallback(() => {
    if (!queue.length) return;
    if (shuffle && queue.length > 1) {
      let nextIndex = index;
      while (nextIndex === index) nextIndex = Math.floor(Math.random() * queue.length);
      playIndex(nextIndex);
    } else {
      playIndex(index + 1);
    }
  }, [index, playIndex, queue.length, shuffle]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    playIndex(index - 1);
  }, [index, playIndex]);

  const addToQueue = useCallback((track, playNext = false) => {
    if (!track?.id) return false;
    const nextQueue = [...queue];
    const oldIndex = nextQueue.findIndex((item) => String(item.id) === String(track.id));
    if (oldIndex >= 0 && !playNext) return false;
    if (oldIndex >= 0) nextQueue.splice(oldIndex, 1);
    let insertAt = playNext ? Math.max(index + 1, 0) : nextQueue.length;
    if (oldIndex >= 0 && oldIndex < insertAt) insertAt -= 1;
    insertAt = Math.min(insertAt, nextQueue.length);
    nextQueue.splice(insertAt, 0, track);
    setQueue(nextQueue);
    if (current) setIndex(nextQueue.findIndex((item) => String(item.id) === String(current.id)));
    return true;
  }, [current, index, queue]);

  const reorderQueue = useCallback((from, to) => {
    if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from === to) return;
    const nextQueue = [...queue];
    const [moved] = nextQueue.splice(from, 1);
    nextQueue.splice(to, 0, moved);
    setQueue(nextQueue);
    if (current) setIndex(nextQueue.findIndex((item) => String(item.id) === String(current.id)));
  }, [current, queue]);

  const removeFromQueue = useCallback((trackId) => {
    const removedIndex = queue.findIndex((item) => String(item.id) === String(trackId));
    if (removedIndex < 0) return;
    if (current && String(current.id) === String(trackId)) {
      setQueue(queue.filter((item) => String(item.id) !== String(trackId)));
      setCurrent(null);
      setIndex(-1);
      setIsPlaying(false);
      audioRef.current?.pause();
      return;
    }
    setQueue(queue.filter((item) => String(item.id) !== String(trackId)));
    if (removedIndex < index) setIndex(index - 1);
  }, [current, index, queue]);

  const toggleFavorite = useCallback((track) => {
    if (!track?.id) return;
    setFavorites((items) => (
      items.some((item) => String(item.id) === String(track.id))
        ? items.filter((item) => String(item.id) !== String(track.id))
        : [track, ...items]
    ));
  }, []);

  const seek = useCallback((value) => {
    if (audioRef.current && Number.isFinite(duration)) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, value));
    }
  }, [duration]);

  const persistPlaybackProgress = useCallback((seconds, completed = false) => {
    const activeTrack = currentRef.current;
    if (!activeTrack) return;
    setHistory((items) => items.map((entry) => (
      String(entry.track?.id) === String(activeTrack.id)
        ? { ...entry, playedDuration: Math.max(entry.playedDuration || 0, Math.floor(seconds || 0)), completed: entry.completed || completed }
        : entry
    )));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setIndex(-1);
    setCurrent(null);
    setIsPlaying(false);
    setTime(0);
    audioRef.current?.pause();
  }, []);

  const handleEnded = useCallback(async () => {
    const audio = audioRef.current;
    const activeQueue = queueRef.current;
    const activeIndex = indexRef.current;
    const activeTrack = currentRef.current;
    if (!audio || !activeTrack) return;
    persistPlaybackProgress(audio.duration || time, true);

    if (repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch((playError) => {
        setIsPlaying(false);
        setError(`Unable to replay this track: ${playError.message}`);
      });
      return;
    }

    let nextIndex = activeIndex + 1;
    let nextQueue = activeQueue;
    let recommendationFailure = false;
    if (shuffle && activeIndex < activeQueue.length - 1) {
      nextIndex = activeIndex + 1 + Math.floor(Math.random() * (activeQueue.length - activeIndex - 1));
    } else if (nextIndex >= activeQueue.length && repeat === "all" && activeQueue.length > 0) {
      nextIndex = 0;
    } else if (nextIndex >= activeQueue.length && autoplay) {
      let candidates = autoplayTracksRef.current;
      if (!candidates.length) {
        try {
          candidates = await getTrendingTracks(undefined, {
            limit: 24,
            time: "week",
            ...(activeTrack.genre ? { genre: activeTrack.genre } : {}),
          });
          const playedIds = new Set(activeQueue.map((track) => String(track.id)));
          candidates = (candidates || []).filter((track) => track?.id && !playedIds.has(String(track.id)));
        } catch (loadError) {
          recommendationFailure = true;
          setError(`The track finished, but the next track could not be loaded: ${loadError.message}`);
          candidates = [];
        }
      }
      if (currentRef.current?.id !== activeTrack.id || queueRef.current !== activeQueue) return;
      if (shuffle && candidates.length > 1) candidates = [...candidates].sort(() => Math.random() - 0.5);
      if (candidates.length) {
        nextQueue = [...activeQueue, ...candidates];
        nextIndex = activeQueue.length;
        autoplayTracksRef.current = candidates.slice(1);
      }
    }

    if (nextIndex >= 0 && nextIndex < nextQueue.length && (autoplay || repeat === "all")) {
      const nextTrack = nextQueue[nextIndex];
      setQueue(nextQueue);
      setIndex(nextIndex);
      setCurrent(nextTrack);
      setTime(0);
      setError("");
      setHistory((previous) => [
        { track: nextTrack, playedAt: Date.now(), playedDuration: 0, completed: false },
        ...previous.filter((entry) => String(entry.track?.id) !== String(nextTrack.id)),
      ].slice(0, 100));
      return;
    }
    if (autoplay && nextIndex >= nextQueue.length && !recommendationFailure) {
      setError("The track finished, but no next track was available. Add tracks to your queue or try again.");
    }
    setIsPlaying(false);
  }, [autoplay, persistPlaybackProgress, repeat, shuffle, time]);

  useEffect(() => () => {
    window.clearTimeout(stallTimerRef.current);
    window.clearTimeout(retryTimerRef.current);
    window.clearTimeout(recoveryResetTimerRef.current);
  }, []);

  useEffect(() => {
    if (!current || !("mediaSession" in navigator) || typeof MediaMetadata !== "function") return undefined;
    const artwork = getArtwork(current);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title || "Soungdify track",
      artist: current.user?.name || current.artist || "Soungdify",
      album: current.album || "",
      ...(artwork ? { artwork: [{ src: artwork, sizes: "480x480", type: "image/jpeg" }] } : {}),
    });
    const handlers = {
      play: () => {
        audioRef.current?.play().catch((playError) => setError(`Unable to resume playback: ${playError.message}`));
      },
      pause: () => audioRef.current?.pause(),
      nexttrack: () => next(),
      previoustrack: () => previous(),
      seekto: (event) => {
        if (Number.isFinite(event.seekTime)) seek(event.seekTime);
      },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        console.warn(`Media session action "${action}" is not supported.`, error);
      }
    }
    return () => {
      for (const action of ["play", "pause", "nexttrack", "previoustrack", "seekto"]) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch (error) {
          console.error(`Unable to clear media session action "${action}".`, error);
        }
      }
    };
  }, [current, next, previous, seek]);

  const clearHistory = useCallback(() => setHistory([]), []);

  const value = useMemo(() => ({
    audioRef, queue, index, current, isPlaying, time, duration, volume, setVolume,
    shuffle, setShuffle, repeat, setRepeat, speed, setSpeed, autoplay, setAutoplay,
    favorites, history, listeningPreferences, setListeningPreferences, error, setError,
    playTrack, playFromQueue, togglePlayback, next, previous, addToQueue,
    removeFromQueue, reorderQueue, toggleFavorite, seek, clearQueue, clearHistory,
  }), [
    queue, index, current, isPlaying, time, duration, volume, shuffle, repeat, speed, autoplay,
    favorites, history, listeningPreferences, error, playTrack, playFromQueue, togglePlayback, next,
    previous, addToQueue, removeFromQueue, reorderQueue, toggleFavorite, seek, clearQueue, clearHistory,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onPlay={() => {
          setIsPlaying(true);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        }}
        onPause={() => {
          setIsPlaying(false);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        }}
        onPlaying={() => {
          window.clearTimeout(stallTimerRef.current);
          window.clearTimeout(recoveryResetTimerRef.current);
          recoveryResetTimerRef.current = window.setTimeout(() => {
            streamRetryCountRef.current = 0;
          }, 30000);
          setIsPlaying(true);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        }}
        onWaiting={() => {
          window.clearTimeout(stallTimerRef.current);
          stallTimerRef.current = window.setTimeout(() => {
            if (audioRef.current && !audioRef.current.paused) retryCurrentStream();
          }, 12000);
        }}
        onStalled={() => {
          window.clearTimeout(stallTimerRef.current);
          stallTimerRef.current = window.setTimeout(() => {
            if (audioRef.current && !audioRef.current.paused) retryCurrentStream();
          }, 12000);
        }}
        onTimeUpdate={(event) => {
          const currentTime = event.currentTarget.currentTime;
          setTime(currentTime);
          if (currentTime - lastHistoryProgressRef.current >= 10) {
            lastHistoryProgressRef.current = currentTime;
            persistPlaybackProgress(currentTime);
          }
        }}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          if (pendingSeekRef.current > 0) {
            event.currentTarget.currentTime = Math.min(pendingSeekRef.current, event.currentTarget.duration || pendingSeekRef.current);
            pendingSeekRef.current = 0;
          }
        }}
        onEnded={handleEnded}
        onError={(event) => {
          if (event.currentTarget.error?.code !== window.MediaError?.MEDIA_ERR_ABORTED) retryCurrentStream();
        }}
      />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider.");
  return context;
}
