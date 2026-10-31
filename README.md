# Soungdify

Soungdify is a free React music discovery and streaming app using Audius public discovery and streaming endpoints. It includes no bundled/mock tracks, paid API, Spotify integration, or YouTube music source.

## What works

- **Audius discovery:** trending tracks and playlists, recently created public playlists, genre/time chart filters, track/user/playlist search, artist profiles, profile tracks/albums/playlists/reposts/favorites/followers/following, and public playlist/album pages. The Home trending feed paginates as you scroll.
- **Track details:** public metadata, artist/release links, play/favorite/repost counts, readable comments, and per-track remix listings when Audius returns them.
- **Artist-enabled downloads:** active download buttons use Audius's official track-download endpoint and appear only for tracks marked downloadable by Audius. Tracks with downloads disabled by the artist cannot be downloaded here.
- **Audius account actions:** OAuth 2.0 PKCE sign-in, session restore/revocation, cloud favorites, artist follow/unfollow, track reposts, posting comments, and create/edit/delete/add-track operations for your Audius playlists. These work after configuring a free Audius API key and registered callback URL.
- **Search:** debounced all/tracks/artists/albums/playlists/tags tabs, recent searches stored locally, and additional track search results.
- **Player:** one audio element across app routes; playback, seek, volume, speed, previous/next, shuffle, repeat off/all/one, autoplay through the queue and trending recommendations, mini/full-screen player, and an editable persistent queue with drag and keyboard-accessible reorder controls. Stream interruptions are retried while playback is active, and supported browsers expose lock-screen/media-key controls. Background playback still depends on browser, device, network, and power-management policies.
- **Local library:** device-only saved tracks, play history with duration/completion, editable local playlists, and local metadata-based recommendations. These do not sync to Audius.
- **Settings and app shell:** the top-right settings shortcut opens taste preferences for genres, searched/listed artists, and playlists; choices are stored locally and inform Home recommendations. Also includes dark/light/system theme, playback preferences, local-data clearing, responsive desktop/mobile layouts, reduced motion, keyboard shortcuts, error/loading states, and a PWA offline shell.

All displayed music, artists, play counts, artwork, and public comments come from Audius. Chart ranking features such as “most loved” sort the currently loaded real chart results by Audius metadata; they are not additional Audius chart endpoints. “New releases” shows recent release dates within the weekly trending results, not a complete global release feed. “For you” ranks the public trending candidate set locally using saved/recent track genres and tags; it is not Audius’s recommendation engine.

## Features intentionally unavailable

Audius does not expose a supported public endpoint for every requested feature. To avoid fake functionality, these remain unavailable:

- Editing or deleting posted comments, and reordering tracks already in an Audius playlist.
- A personalized social feed/notification inbox, global remix catalog (per-track remixes are available), a canonical public genre/mood/tag directory, and complete global new-release catalog.
- Wallets, coins, sales, transactions, purchases, gated content, and other blockchain actions.
- Downloading tracks whose artists have disabled downloads. The app does not bypass track permissions or scrape audio.
- Crossfade and server-selected audio quality.

Unauthenticated users can still browse and use the device-local library. Playlists in My playlists remain local to the browser; Audius playlists are managed from the signed-in profile. Account actions are sent to Audius and report API errors instead of showing success when a request fails.

## Requirements and local development

- Node.js 20.19 or newer
- npm
- Network access to Audius public endpoints

```sh
npm install
cp .env.example .env
npm run dev
```

The Vite server binds to `0.0.0.0`, uses `PORT` when hosted (otherwise port `5173`), and allows `soungdify.onrender.com` plus Render's `RENDER_EXTERNAL_HOSTNAME`. The preview server uses `PORT` or `4173`.

Optional public configuration:

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_AUDIUS_API_BASE_URL` | Audius discovery API base URL | `https://discoveryprovider.audius.co/v1` |
| `VITE_AUDIUS_APP_NAME` | App identifier added to public requests | `soungdify` |
| `VITE_AUDIUS_API_KEY` | Free Audius developer API key used as the public OAuth client ID | unset |
| `VITE_AUDIUS_REDIRECT_URI` | OAuth callback URL registered in your Audius developer app | `<origin>/callback` |

To enable account actions, create a free API key in [Audius Developer Apps](https://audius.co/settings), register both your local callback (`http://localhost:5173/callback`) and deployed callback (for example `https://soungdify.onrender.com/callback`), then set the key and the matching callback URI in the host's environment. Use the local callback URI in `.env` during development. The API key is safe to expose in browser code; never place an Audius app secret or bearer token in a `VITE_*` variable.

Sign-in uses Audius's documented browser OAuth 2.0 Authorization Code flow with PKCE. The app stores the resulting session tokens in browser local storage so the session can survive reloads; signing out revokes the refresh token with Audius.

## Build and preview

```sh
npm run build
npm run preview
```

Deploy `dist/` to a static host configured to serve `index.html` for SPA routes. No paid service is required. The optional service worker caches only the same-origin app shell/assets; it does not cache cross-origin Audius responses or audio.

## API behavior

The centralized client is in `src/api/audius.js`. It validates response shape, reports HTTP and rate-limit failures, sends the app name, and keeps short-lived in-memory response caches. Update that module if Audius changes public endpoints or request limits.
