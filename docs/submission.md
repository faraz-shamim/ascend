---
title: "ASCEND: Turn a Small Walk into a Real-World Quest with Local Gemma"
published: false
tags: devchallenge, hf26challenge, gemma, webdev
cover_image: https://raw.githubusercontent.com/faraz-shamim/ascend/main/web/public/art/ascend-cover.webp
description: "An anime-inspired outdoor adventure with real mapped quests, local Gemma stories, private discoveries, and companions worth stepping outside for."
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge: Week 1 — Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).*

A nearby park can feel ordinary. Give it a mysterious gate, a small story, and a leaf-eared companion waiting at the end, and the same walk becomes an adventure.

That is the idea behind **ASCEND**. The next level is somewhere outside your front door.

## What I Built

ASCEND is a browser-based outdoor quest game. It combines the anticipation of anime progression with the joy of finding things in the real world. You start at E-rank, finish small adventures, collect original companions, unlock trophies, and gradually work toward S-rank.

The game begins with your location and the time you have. It finds nearby parks, gardens, outdoor artwork, viewpoints, and other eligible places in OpenStreetMap. **Gemma runs on your device** and writes a short fantasy atmosphere for the mapped destination. The story also helps choose a bounded observation prompt for a discovery quest.

There are three ways to explore:

| Quest | What you do | Reward |
| --- | --- | --- |
| Reach a gate | Walk to one mapped place and check in | 100 XP |
| Make a discovery | Arrive, photograph something you notice, and write a few words | 150 XP |
| Follow a trail | Check in at three places in order | 250 XP |

Your first completed quest unlocks **Fernfox**. Later adventures introduce a moss-covered tortoise, a luminous moth, a moonlit owl, an ember salamander, and an astral fawn. They are original characters with original generated artwork.

![ASCEND’s companion collection, shown with labelled rehearsal progress](https://raw.githubusercontent.com/faraz-shamim/ascend/main/docs/ascend-companions.png)

*Companions are earned through completed quests. Rehearsal rewards stay separate from real-world rankings.*

There is no streak punishment. A quiet walk tomorrow is still welcome if you missed today.

## Demo

**[Play ASCEND](https://ascend-quests.onrender.com)**

Start with **Try the rehearsal** to explore all three quest types without GPS, camera permissions, or an account. Its places and arrivals are explicitly fictional, and its scores never enter the global leaderboard.

For a real quest, choose **Find my next quest**, allow location, and select an adventure. Try the local Gemma writer, read or listen to the briefing, then open the pocket guide. At the checkpoint, reopen the app and check in.

![The actual ASCEND quest board](https://raw.githubusercontent.com/faraz-shamim/ascend/main/docs/ascend-desktop.png)

The pocket guide has large controls for repeating the briefing, pausing, and checking in. Installed device voices can read the briefing. Optional browser recognition supports commands such as “repeat,” “status,” “pause,” and “check in.” No ElevenLabs is used. When a browser lacks voice support, the same actions are available on screen.

Browser GPS pauses when the page is hidden or the phone is locked, so ASCEND asks you to reopen at checkpoints. The phone helps launch the adventure and record its ending; the walk happens between those moments.

## Code

[Source, setup, tests, and deployment configuration](https://github.com/faraz-shamim/ascend)

{% github https://github.com/faraz-shamim/ascend %}

The code is MIT-licensed. The generated art has its own attribution instructions, and downloaded model weights retain Gemma’s terms.

## How I Built It

### A story layer grounded in an actual map

The map service uses Overpass to find eligible nearby places. Private.coffee is the primary provider; VK Maps and FOSSGIS supply bounded fallbacks when it is unavailable. Searches are cached and shared across concurrent explorers. Known private and indoor locations are filtered out. Access tags and OpenStreetMap source links remain visible because a mapped place is not proof that it is open or reachable by a pedestrian route.

Gemma writes the story; a separate quest engine pins the destinations, objectives, and XP. The model cannot invent a destination or grant rewards. Long, code-like, or unsuitable narratives fall back to a clearly labelled curated briefing.

The small model taught a useful lesson: a complicated formatting prompt could produce code or an overly dramatic story. A short request for two peaceful fairy-tale sentences worked better. I kept the output guard even after improving the prompt.

### Local Gemma, measured rather than assumed

The app uses **Gemma 3 270M**, Transformers.js, and ONNX Runtime in a worker. WebGPU is used when available; a separately pinned compatible model revision supports WASM on CPU. The first use downloads hundreds of megabytes, so the app explains that before loading.

A genuine browser inference produced this line:

> The Lantern Garden whispered secrets as the sun warmed the mossy leaves, a gentle breeze rustled the silver petals of the flowers.

On the tested browser, generation took **5.1 seconds**. The first model download plus generation took **98.5 seconds**. Those are measurements from one machine, not a promise for every phone. The full prompt, output, revision, and timings are recorded in [the inference report](https://github.com/faraz-shamim/ascend/blob/main/docs/gemma-inference.json).

The CPU fallback was tested with WebGPU disabled: **33.1 seconds** for generation and **170.4 seconds** including the first download, on the same computer. Its [separate report](https://github.com/faraz-shamim/ascend/blob/main/docs/gemma-cpu-inference.json) records actual WASM inference.

Large model downloads also exposed interrupted CDN transfers during testing. The loader now fetches pinned artifacts in verified 8 MiB ranges, retries interrupted chunks, and rejects mismatched revisions. This made both real GPU and CPU runs complete.

![A real local Gemma story for the explicitly fictional rehearsal destination](https://raw.githubusercontent.com/faraz-shamim/ascend/main/docs/ascend-gemma-small.png)

The model’s narration is fictional. The report confirms that generating it left the checkpoint coordinates unchanged.

### Render for the shared game, the device for private memories

The frontend and Express API run on Render. The release configuration uses a free web service and free Postgres in Singapore. Reward updates use database transactions, including protection against duplicate simultaneous check-ins. Real sessions survive service restarts once the database is connected.

GPS check-ins require a recent fix, acceptable accuracy, and proximity to the checkpoint. Previously completed destinations disappear from suggestions for 24 hours. Trail checkpoints must be completed in order.

World rankings are opt-in and publish an alias with aggregate game statistics. They do not expose destinations or photos. Camera images and the latest 30 journal memories remain in the device’s IndexedDB; the server receives photo metadata rather than pixels. A private session export lets you restore access to your explorer.

Render’s free service can take about a minute to wake, and its free Postgres expires after 30 days. The README documents those limits and the need to export or migrate before expiry. This entry uses free services and no paid AI API.

### What I actually verified

- **29 automated tests** cover auth, GPS validation, camera metadata, progression, cooldowns, duplicate rewards, map caching and backoff, and Postgres rollback and cleanup.
- **19 browser scenarios** cover the quest flows, camera capture, companions, trophies, rankings, session export/restore, journal deletion, and every screen at 390 px width.
- A separate check returned **18 real mapped landmarks** near a public central London test coordinate.
- Gemma’s inference ran for real in the browser; its measured output is linked above.

The browser suite uses **simulated GPS and a synthetic camera feed**. Voice-command actions were tested with a synthesized transcript. Audible local speech and live microphone transcription still need testing on a physical phone. I have not claimed an outdoor field trial, and browser-reported GPS remains spoofable: these rankings support friendly play.

## Why Does Open Innovation Matter?

A location-aware game can easily become another stream of private information sent to a remote model. Open weights let ASCEND generate its story on the explorer’s device. The prompt does not need a hosted AI endpoint, a per-story charge, or an AI API key.

OpenStreetMap supplies inspectable destinations. Transformers.js and ONNX Runtime make browser inference practical. The quest engine is readable, so someone can change reward rules, add companions, swap a model, or host their own version.

Local inference does not make the whole app offline: new map lookups and shared rankings still need a connection. It does let the creative part run locally after the model is downloaded, on a capable device. That is a useful boundary for a game built around stepping outside.

## Build Notes and Credits

ASCEND’s new repository, gameplay, API, databases, interface, artwork, and tests were built during this Week 1 window. Local-model compatibility work draws on my earlier [Stillroot](https://github.com/faraz-shamim/stillroot) experiments. The anime progression and location-collecting inspirations are acknowledged; no Solo Leveling or Pokémon game assets are used.

Codex assisted with implementation, testing, and this write-up. The cover and companion illustrations were generated for this project; [their prompts and provenance are documented](https://github.com/faraz-shamim/ascend/blob/main/docs/artwork.md).

## Prize Categories

- **Best Use of Gemma:** genuine device-local Gemma inference writes the grounded adventure’s fantasy story and contributes to the discovery focus.
- **Best Use of Render:** Render hosts the playable frontend and shared quest API, with Postgres for explorer progression and rankings.

Your next gate might be a garden you have walked past a hundred times. Bring a little curiosity. Fernfox will meet you there.
