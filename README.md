# Soungdify

Soungdify is a free, responsive music discovery and streaming app powered by the public Audius discovery API. It uses React, Vite, React Router, the HTML audio element, and browser storage; it does not depend on paid services or bundled sample music.

## Features

- Live Audius trending tracks, track search, artist search, playlist search, artist pages, track details, and public playlist playback.
- One persistent audio player across routes with seek, volume, previous/next, shuffle, repeat, and a queue drawer.
- Device-local favorites, queue, listening history, search history, and theme preferences.
- Keyboard controls: Space play/pause, left/right seek, up/down volume, M mute, N next, P previous, S shuffle, and `?` for the shortcut list.
- Responsive layouts, loading and error states, artwork fallbacks, reduced-motion support, and a dark/light appearance setting.

Audius content and playback availability are controlled by Audius and by the track owner. Soungdify does not include or generate sample tracks, social counts, comments, or recommendation data.

## Requirements

- Node.js 20.19 or newer (required by the current Vite version)
- npm
- Network access to Audius public discovery endpoints

## Local development

```sh
npm install
cp .env.example .env
npm run dev
```

Vite binds to `0.0.0.0` so hosted services such as Render can detect it. The development server uses Render's `PORT` environment variable when provided, or `5173` locally (strict port). The preview server uses `PORT` when provided, or `4173`. The Render hostname `soungdify.onrender.com` and the hostname in Render's `RENDER_EXTERNAL_HOSTNAME` variable are explicitly allowed.

Environment variables are optional:

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_AUDIUS_API_BASE_URL` | Audius discovery API base URL | `https://discoveryprovider.audius.co/v1` |
| `VITE_AUDIUS_APP_NAME` | App identifier included in API requests | `soungdify` |

These are public frontend settings. Do not put secret credentials in `VITE_*` variables or commit a real `.env` file.

## Build and preview

```sh
npm run build
npm run preview
```

The generated static site can be deployed to any free static hosting provider. Configure SPA fallback/rewrite behavior so nested routes return `index.html`.

## API behavior and limitations

The app uses Audius public read endpoints for trending tracks, track/user/playlist search, track details, public artist profiles and tracks, public playlists, and audio streaming. Requests are cached in memory briefly, responses and HTTP errors are checked, and rate-limit errors are surfaced to the user.

This version does not implement Audius OAuth or a backend. Therefore, account login, cloud-synced favorites, follow/repost/comment writes, playlist management, notifications, gated content, wallet/coin actions, and downloads are not available. Local favorites and history are explicitly device-local and do not write to Audius. No unauthorized audio download or token operation is provided.

If Audius changes public endpoints or rate limits, update the centralized API client in `src/api/audius.js`; no requests are made to Spotify or YouTube.