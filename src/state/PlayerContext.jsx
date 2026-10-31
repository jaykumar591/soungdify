import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getStreamUrl } from "../api/audius.js";

const PlayerContext = createContext(null);
const STORAGE = {
  queue: "soungdify.queue",
  favorites: "soungdify.favorites",
  history: "soungdify.history",
  volume: "soungdify.volume",
  shuffle: "soungdify.shuffle",
  repeat: "soungdify.repeat",
};

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
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
  const [queue, setQueue] = useState(() => readStorage(STORAGE.queue, []));
  const [index, setIndex] = useState(-1);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => readStorage(STORAGE.volume, 0.8));
  const [shuffle, setShuffle] = useState(() => readStorage(STORAGE.shuffle, false));
  const [repeat, setRepeat] = useState(() => readStorage(STORAGE.repeat, false));
  const [favorites, setFavorites] = useState(() => readStorage(STORAGE.favorites, []));
  const [history, setHistory] = useState(() => readStorage(STORAGE.history, []));
  const [error, setError] = useState("");

  useEffect(() => writeStorage(STORAGE.queue, queue), [queue]);
  useEffect(() => writeStorage(STORAGE.favorites, favorites), [favorites]);
  useEffect(() => writeStorage(STORAGE.history, history), [history]);
  useEffect(() => writeStorage(STORAGE.volume, volume), [volume]);
  useEffect(() => writeStorage(STORAGE.shuffle, shuffle), [shuffle]);
  useEffect(() => writeStorage(STORAGE.repeat, repeat), [repeat]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    setError("");
    audio.src = getStreamUrl(current.id);
    audio.load();
    audio.play().catch((playError) => {
      if (playError.name !== "NotAllowedError") {
        setError("This track could not be played. Try another track.");
      }
      setIsPlaying(false);
    });
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

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
      { track, playedAt: Date.now() },
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
      { track: nextQueue[startIndex], playedAt: Date.now() },
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
    if (!track?.id) return;
    setQueue((currentQueue) => {
      if (currentQueue.some((item) => String(item.id) === String(track.id))) return currentQueue;
      const nextQueue = [...currentQueue];
      const insertAt = playNext ? Math.max(index + 1, 0) : nextQueue.length;
      nextQueue.splice(insertAt, 0, track);
      return nextQueue;
    });
  }, [index]);

  const removeFromQueue = useCallback((trackId) => {
    setQueue((items) => items.filter((item) => String(item.id) !== String(trackId)));
    if (current && String(current.id) === String(trackId)) {
      setCurrent(null);
      setIndex(-1);
      setIsPlaying(false);
      audioRef.current?.pause();
    }
  }, [current]);

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

  const clearQueue = useCallback(() => {
    setQueue([]);
    setIndex(-1);
    setCurrent(null);
    setIsPlaying(false);
    setTime(0);
    audioRef.current?.pause();
  }, []);

  const value = useMemo(() => ({
    audioRef, queue, index, current, isPlaying, time, duration, volume, setVolume,
    shuffle, setShuffle, repeat, setRepeat, favorites, history, error, setError,
    playTrack, playFromQueue, togglePlayback, next, previous, addToQueue,
    removeFromQueue, toggleFavorite, seek, clearQueue,
  }), [
    queue, index, current, isPlaying, time, duration, volume, shuffle, repeat,
    favorites, history, error, playTrack, playFromQueue, togglePlayback, next,
    previous, addToQueue, removeFromQueue, toggleFavorite, seek, clearQueue,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => {
          if (repeat && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => setIsPlaying(false));
          } else {
            next();
          }
        }}
        onError={() => current && setError("Unable to stream this Audius track right now.")}
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
