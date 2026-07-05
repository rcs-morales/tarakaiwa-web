# 🗣️ TaraKaiwa

TaraKaiwa (from the Filipino word “Tara = let’s” and the Japanese word “Kaiwa = talk”) is a browser-based JLPT speaking practice app. It helps learners practice speaking, listening, translation, and grammar feedback with AI-powered tools that run entirely in the client.

**🌍 Live Demo**: Vercel (https://tarakaiwa-web.vercel.app/)  
Add a Groq API key in Settings for speech recognition and AI grading. Voicevox remains optional for cloud text-to-speech.

## ✨ What’s New

- **AI Study Assistant** for grammar explanations, vocabulary help, and follow-up study guidance.
- **Translation Tool** for quick English-to-Japanese phrase practice with voice input and playback.
- **Cleaner Japanese rendering** in the translation panel for more readable phrase display.
- **Expanded test coverage** for parser and assistant behavior using Vitest.
- **Offline-friendly persistence** via local storage and IndexedDB for settings, keys, and cached audio.

## ✨ Core Features

- **AI-powered speech recognition** using Groq Whisper or the browser’s Web Speech API.
- **Intelligent grading** with grammar and vocabulary feedback, with strictness tuned for JLPT levels N5–N3.
- **AI study assistant** for clarifying doubts and guiding practice.
- **AI translation tool** for quick phrase translation and speaking practice.
- **Immersive audio and visuals** with browser voices or VOICEVOX plus a Live2D-style avatar experience.
- **Offline audio caching** so repeated Voicevox requests are faster and more reliable.
- **Guided practice** with romaji support, randomized sessions, and starter datasets.
- **Local privacy** with no backend required; API keys and data are stored in the browser.

## 🚀 Getting Started

This project is a SvelteKit single-page app (SPA mode, no server rendering) built with Vite. The UI logic is still plain ES modules under `src/lib/`; SvelteKit provides the shell, routing, and the `/api/*` proxy endpoints.

### Prerequisites

1. A modern browser. Chrome or Edge is recommended for voice-recognition workflows.
2. A free [Groq API key](https://console.groq.com/keys) for AI speech recognition and grading.
3. *(Optional)* VOICEVOX support via the free community API at api.tts.quest.
4. *(Optional for faster TTS)* Install [VOICEVOX](https://voicevox.hiroshiba.jp/) locally to avoid community-server latency.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rcs-morales/tarakaiwa-web.git
   ```
2. Navigate to the project folder:
   ```bash
   cd tarakaiwa-web
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open the printed URL (usually http://localhost:5173) in your browser.
6. If you are setting up Groq for the first time, use the in-app setup guide or open /groq-guide.html for setup help.

For a production build: `npm run build` (output in `.svelte-kit/cloudflare/`), then `npm run preview` to serve it locally.

### Testing

Run the regression suite with:

```bash
npm test
```

## 📖 How to Use

1. **Configure AI**: Paste your Groq API key into the AI Settings area and save it.
2. **Adjust settings**: Choose the speech engine, TTS mode, grading strictness, and voice.
3. **Import data**: Import Japanese Q&A data in JSON, CSV, or Excel format.
4. **Practice**: Start a session and the app will prompt you, record your response, and give feedback.
5. **Use the translation or assistant tools**: Open the translation panel for quick phrase practice or the study assistant for grammar help.

## 🏗️ Project Structure

| File/Folder | Role |
|-------------|------|
| src/app.html | SvelteKit page template (fonts, Cubism Core script, stylesheet) |
| src/routes/+page.svelte | Main markup and application layout (single SPA route) |
| src/routes/api/ | SvelteKit server endpoints proxying Groq (`chat`, `transcribe`) that hide the key |
| src/lib/server/ | Shared proxy helpers: JWT auth check, quota enforcement |
| public/assets/style.css | Layout, theme, and UI styling |
| src/lib/app.js | Main entry point and app orchestration (`initApp()`) |
| src/lib/ai/ | AI modules for grading, Groq requests, Whisper, and study assistance |
| src/lib/session.js | Practice-session flow and state |
| src/lib/settings.js | Persistent configuration management |
| src/lib/auth.js | Supabase auth (magic link / Google) session handling |
| src/lib/sync.js | localStorage ⇄ Supabase sync for settings, decks, and results |
| src/lib/supabase.js | Supabase client initialization |
| supabase/migrations/ | SQL migrations for accounts, sync, and quota tables |
| src/lib/db.js | IndexedDB wrapper for cached audio and local data |
| src/lib/import.js | Parsing and import of external Q&A datasets |
| src/lib/stt.js | Speech-to-text logic |
| src/lib/tts.js | Text-to-speech logic |
| src/lib/avatar.js | Avatar rendering and voice mapping |
| src/lib/parser.js | Text parsing and translation rendering helpers |
| src/lib/ui.js | DOM updates and UI state management |
| src/lib/translate-ui.js | Translation tool UI and behavior |
| src/lib/assistant-ui.js | Study assistant UI |
| src/lib/data.js | Default starter Q&A dataset |
| tests/ | Unit and integration tests |
| public/groq-guide.html | Groq setup guide |

## ☁️ Accounts & Cloud Sync (optional)

Signing in is **optional** — the app is fully functional offline, storing everything
in the browser. When a user signs in (passwordless email magic link, or Google), their
settings, imported decks, and practice scores sync to Supabase and follow them across
devices. Logged-out behaviour is unchanged.

**What syncs, what doesn't:**

- ✅ Synced: JLPT level, STT/TTS mode, voice, avatar, grading model, and other preferences → `user_settings`; imported Q&A decks → `decks`; completed runs → `session_results`.
- 🔒 Never synced: your Groq API key and provider (per-device secret), and device-only flags.

### One-time Supabase setup (dashboard)

1. **Apply the migration** in `supabase/migrations/0001_phase2_accounts_sync.sql`
   (SQL Editor → paste & run, or `supabase db push` with the CLI). It's additive and
   leaves the existing `bug_reports` table / `bug-screenshots` bucket untouched.
2. **Enable email auth**: Authentication → Providers → Email (magic link / OTP is on by default).
3. **Add redirect URLs**: Authentication → URL Configuration → add your site origin(s)
   (e.g. `http://localhost:5173` for `npm run dev`, and your Cloudflare Pages / Vercel URL).
4. *(Optional)* **Google OAuth**: enable the Google provider and paste OAuth client
   credentials. The "Continue with Google" button is a no-op until this is configured.

### Keep the free tier awake

Supabase free projects pause after ~7 idle days. A GitHub Actions workflow
(`.github/workflows/keepalive.yml`) pings the REST API twice weekly. Add two repo
secrets so it can run: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## 🔑 Hidden API key & quotas (server proxy)

By default the app never exposes a Groq key in the browser. AI requests route by
priority:

1. **Your own Groq key** (optional, entered in Settings → Step 2): sent directly
   to Groq, unlimited and quota-free — the personal escape hatch.
2. **Signed in, no key**: routed through a Cloudflare Pages Function
   (`/api/chat`, `/api/transcribe`) that verifies your Supabase session, enforces
   a shared daily quota, and forwards the request using a server-side key you
   never see.
3. **Neither**: local offline grading + browser speech recognition.

### Cloudflare setup (one-time)

The proxy lives in `src/routes/api/*/+server.js` and is bundled into the site's
worker by `@sveltejs/adapter-cloudflare`. In the Cloudflare Pages project set:

- **Build command**: `npm run build`
- **Build output directory**: `.svelte-kit/cloudflare`

Add these as **encrypted environment variables** in the
Cloudflare Pages project (Settings → Environment variables):

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | Your Groq secret key (`gsk_…`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service-role** key (Settings → API) — server-only, never ship to the client |

Then apply migration `supabase/migrations/0002_api_usage_quota.sql` (adds the
atomic `increment_api_usage()` quota function). Daily limits live in
`src/lib/server/quota.js` (defaults: 200 chat requests, 600 Whisper-seconds).

### Testing the proxy locally

Under `npm run dev` / `npm run preview` the `/api/*` endpoints exist but have no
Cloudflare env bindings (`platform.env`), so they return a clean 500 — a
signed-in user without a BYO key can't reach AI locally. To exercise the proxy
with real bindings, run the built worker through Cloudflare's emulator:

```bash
npm run build
npx wrangler pages dev .svelte-kit/cloudflare --compatibility-date=2024-01-01
```

(supply the same env vars via `--binding` / a `.dev.vars` file). Or just test the
BYO-key path locally, which talks to Groq directly.

## 🗺️ Roadmap

- [x] JLPT-style speaking practice support
- [x] AI grading and speech recognition
- [x] AI study assistant and translation tool
- [x] Voicevox cloud TTS and offline audio caching
- [x] Hybrid avatar system
- [ ] Add more N4/N3 datasets
- [ ] Improve mobile responsiveness and polish

## 📄 License & Credits

This project is open-source and available for educational use.

**Live2D Avatar Credits**: This app uses sample model data provided by Live2D Inc. under the applicable Free Material License terms.

**VOICEVOX Audio Generation**: Audio synthesis is powered by VOICEVOX and served through the free community API at api.tts.quest. Please follow the relevant character terms of service when using VOICEVOX characters.
