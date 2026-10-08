# ASCEND — The world is your quest

A location-based outdoor adventure game built for Hacktoberfest Week 1, October 8, 2026. Browser-local Gemma turns a nearby mapped place into a short fantasy story. GPS check-ins, camera discoveries, companions, achievements, and optional world rankings give a small walk a little more wonder.

![ASCEND](web/public/art/ascend-cover.webp)

## Play

[Play ASCEND](https://ascend-quests.onrender.com). Explorer state and world rankings use persistent Render Postgres. Run the complete app locally with the commands below. The permission-free rehearsal uses labelled fictional places and simulated check-ins; its rewards never enter world rankings.

## Features

- Three quest types: one-place gates, camera discoveries, and three-checkpoint trails.
- Live nearby-place lookup through OpenStreetMap Overpass, plus an independent Wikidata fallback for urban parks, monuments, and fountains. Known private/indoor access tags are filtered and every destination retains its source link.
- Gemma 3 270M ONNX in a worker, WebGPU where available and a CPU-compatible WASM revision otherwise. First use downloads hundreds of MB; prompts and inference stay on the device.
- Concise generated stories with a separate, deterministic location and reward engine. Camera discovery focuses come from a bounded set of observation categories.
- GPS check-ins within 80 m, accuracy at most 65 m, and fixes at most 30 seconds old. Browser coordinates can be spoofed; this supports friendly play, not strong anti-cheat.
- Fresh camera capture and a private, device-local journal of the latest 30 memories. No image pixels are uploaded.
- E-to-S ranks, six original companions, equipment selection, and six achievement trophies. No penalties for missing a day.
- Optional alias-only weekly and all-time world rankings. Rehearsal and real profiles are separate.
- Installed local speech voices, optional browser voice commands, a pocket guide, and large-button fallbacks. No ElevenLabs or paid AI API.
- Anonymous device sessions with private session export/restore. Session export restores access; it does not back up the server database.
- Responsive 390 px mobile layout, installable app manifest, app-shell caching, and reduced-motion support.

## Run locally

Node 22.13+ is required; Node 24 is used for the release.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4174`. Localhost supports browser GPS/camera secure-context APIs. Choose **Try the rehearsal** to play without device permissions or an account.

```sh
npm run build
npm start
```

SQLite persists local development data in `.runtime/ascend.sqlite`. For a public deployment, configure a persistent database using `.env` or the hosting provider's secret environment variables:

- `DATABASE_URL`: Postgres, tested with a real embedded Postgres engine.
- `MONGODB_URI`: optional MongoDB Atlas adapter, plus `MONGODB_DATABASE=ascend`. This adapter is included for portability; no Atlas deployment is claimed.

Never place database credentials in frontend code, a public repository, or article text.

## Deploy on Render for $0

`render.yaml` creates a **Free** Node web service and a **Free** Postgres database in Singapore. Build: `npm ci --include=dev && npm run build`. Start: `npm start`. Health: `/api/health`.

Render's free web service sleeps after 15 idle minutes and may take about a minute to wake. Its filesystem is ephemeral, so a public deployment needs the external database. Free Render Postgres expires after 30 days and has no backups. Before expiry, export the server database or move to a separately configured free database. This project does not authorize a paid upgrade. Shared free hours, bandwidth, and build limits still apply. See [Render's current free-plan limits](https://render.com/docs/free).

## Verify

```sh
npm test
npm run build
npm run test:browser
node scripts/gemma-qa.mjs
```

The browser QA script currently uses an installed Windows Chrome path. Set `ASCEND_BROWSER_PATH` to another installed Chromium executable when running elsewhere. The unit/API/Postgres tests and production build run in GitHub Actions on Linux.

- 33 automated checks cover coordinate validation, camera metadata, grounded destinations, XP/progression, auth/privacy, concurrent duplicate claims, cooldowns, weekly scores, quest expiry, Postgres rollback, and cleanup.
- 19 browser QA scenarios exercise the main UI and server flows with **simulated GPS and a synthetic camera feed**, including responsive screens and journal privacy. It is not evidence of an outdoor visit.
- Genuine local Gemma inference is recorded in [docs/gemma-inference.json](docs/gemma-inference.json). The compact model produced a story in about 5.1 seconds on the test browser's GPU; the first download and generation took about 98.5 seconds. This is one device measurement, not a universal performance guarantee.
- CPU/WASM inference was also run with WebGPU disabled: about 33.1 seconds to generate, 170.4 seconds including the first download. See [docs/gemma-cpu-inference.json](docs/gemma-cpu-inference.json). Interrupted model downloads recover through verified 8 MiB ranges with bounded retries.
- Browser speech capability detection, button fallback, and voice-command actions using a synthesized transcript were tested. Playback controls and button fallback were exercised; audible playback and live microphone transcription still require physical-device testing.
- [docs/browser-qa.json](docs/browser-qa.json), [docs/map-service-check.json](docs/map-service-check.json), and screenshots document the checks.

## Privacy and limits

Location is requested when the explorer asks for nearby quests. Coordinates are used by ASCEND for the public map lookup and check-in validation. Public map providers (Private.coffee, VK Maps, FOSSGIS Overpass, and Wikidata) receive a search area rounded to approximately 100 m. OpenStreetMap receives tiles for the displayed area. Searches are cached for 15 minutes, duplicate requests are coalesced, and upstream calls are serialized and capped. Wikidata searches are limited to 100 per day and spaced at least 30 seconds apart. Its conservative fallback excludes broad residential-garden/amusement-park classes and known indoor, dissolved, or future places; missing access information still needs checking. No continuous movement trail is saved.

The server temporarily holds active-quest destinations. Expired destinations are cleared by a periodic cleanup, within 15 minutes after the four-hour quest expiry. Completed records contain hashes of place IDs and completion metadata for cooldowns. Public rankings expose only aliases and aggregate game statistics.

Camera pixels and journal entries stay in this browser. The completion request includes a photo hash, dimensions, capture time, and an observation; the server validates metadata and does not analyse the image. Browser storage is not encrypted by ASCEND. Clearing browser data removes the journal and session unless exported.

Speech playback uses local voices only. Optional SpeechRecognition support varies; a browser may send microphone audio to its own recognition provider. Commands start only after opt-in and a microphone-button press. Large buttons and quest cards remain available.

Web geolocation updates pause when the document is hidden or locked. ASCEND resumes on visibility and supports checkpoint check-ins. It does not provide continuous locked-phone background tracking. Use public pedestrian paths and check local opening hours: map data does not prove that a place is accessible.

## Open pieces and provenance

Code is MIT. Gemma weights are not bundled and retain [Gemma's terms](https://ai.google.dev/gemma/terms). Runtime: [Transformers.js](https://huggingface.co/docs/transformers.js/), ONNX Runtime, Express, Leaflet, and Postgres/SQLite. Map data is © OpenStreetMap contributors, ODbL. Structured Wikidata destinations are [CC0](https://www.wikidata.org/wiki/Wikidata:Data_access), with individual item links shown in the app. Original generated artwork, final prompts, and asset attribution are in [docs/artwork.md](docs/artwork.md).

The concept borrows the feeling of anime progression and location-based collecting; all names, characters, art, and implementation are original. No Solo Leveling or Pokemon game assets are used. This new repository was begun during the Week 1 challenge window. Any commits after the October 11, 2026 submission deadline will be noted here.

Local Gemma runtime compatibility work draws on my earlier [Stillroot](https://github.com/faraz-shamim/stillroot) experiments. ASCEND's quests, progression, server, databases, interface, original artwork, and verification suite were built as this new Week 1 project. Development and this submission were assisted by Codex; the generated illustration is credited separately.
