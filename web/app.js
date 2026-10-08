import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { shell, statsFor, playerFor } from "./lib/views.js";
import { icon, esc, sprite } from "./lib/ui.js";
import {
  COMPANIONS,
  TROPHIES,
  QUEST_TYPES,
  DEMO_ORIGIN,
  DEMO_PLACES,
  emptyStats,
  buildQuest,
  rewards,
  formatDistance,
  distance,
  progression,
} from "./lib/domain.js";
import {
  runGemma,
  cancelGemma,
  onAIState,
  aiState,
  questPrompt,
  speechStatus,
  speak,
  listen,
  getFix,
  hashPhoto,
} from "./lib/device.js";
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const s = {
  view: location.hash.slice(1) || "quests",
  demo: false,
  player: read("ascend:player", null),
  demoPlayer: read("ascend:demo", null),
  places: [],
  origin: null,
  fix: null,
  distance: 0,
  minutes: read("ascend:minutes", 20),
  theme: read("ascend:theme", "verdant"),
  modelMode: read("ascend:model", "small"),
  aiStatus: "Local AI · no paid tokens",
  period: "all",
  leaderboard: null,
  leaderboardError: null,
  journal: [],
  photo: null,
  observation: "",
  paused: false,
  offline: false,
  busy: false,
};
let map = null,
  watch = null,
  cameraStream = null,
  recognition = null,
  modalKind = null,
  pocket = false,
  makePlayerJob = null,
  cancelledAI = null;
const app = document.querySelector("#app"),
  modalRoot = document.querySelector("#modal-root");
function store() {
  try {
    if (s.player)
      localStorage.setItem("ascend:player", JSON.stringify(s.player));
    if (s.demoPlayer)
      localStorage.setItem("ascend:demo", JSON.stringify(s.demoPlayer));
    localStorage.setItem("ascend:minutes", JSON.stringify(s.minutes));
    localStorage.setItem("ascend:theme", JSON.stringify(s.theme));
    localStorage.setItem("ascend:model", JSON.stringify(s.modelMode));
  } catch {
    toast("Device storage is full. Export your session from settings.");
  }
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 5000);
}
function modal(title, body, kind = "generic") {
  closeModal(false);
  modalKind = kind;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal ${kind === "pocket" ? "pocket-modal" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><button class="modal-close icon-button" data-action="close-modal" aria-label="Close dialog">${icon("x")}</button><h2>${title}</h2>${body}</section></div>`;
  modalRoot.querySelector("button:not(.modal-close),input,select")?.focus();
}
function closeModal(cancel = true) {
  if (
    cancel &&
    (modalKind === "ai-progress" || (modalKind === "ai-settings" && s.busy))
  ) {
    cancelledAI = "stop";
    cancelGemma();
  }
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  recognition?.abort?.();
  recognition = null;
  modalRoot.innerHTML = "";
  modalKind = null;
  pocket = false;
}
function render() {
  map?.remove();
  map = null;
  app.innerHTML = shell(s);
  requestAnimationFrame(initMap);
  store();
}
function setView(view) {
  if (
    ![
      "quests",
      "collection",
      "trophies",
      "guild",
      "journal",
      "profile",
    ].includes(view)
  )
    view = "quests";
  s.view = view;
  location.hash = view;
  render();
  if (view === "guild") loadGuild();
}
async function api(path, body, method) {
  const token = localStorage.getItem("ascend:token");
  const response = await fetch(path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The guild returned an unreadable response. Try again shortly.",
    );
  }
  if (!response.ok) {
    const e = new Error(data.error || "The guild is unavailable.");
    e.status = response.status;
    throw e;
  }
  return data;
}
async function ensurePlayer() {
  if (s.player && localStorage.getItem("ascend:token")) return s.player;
  if (makePlayerJob) return makePlayerJob;
  makePlayerJob = api("/api/players", { alias: "Wanderer" })
    .then((data) => {
      localStorage.setItem("ascend:token", data.token);
      s.player = data.player;
      s.offline = false;
      store();
      return s.player;
    })
    .finally(() => (makePlayerJob = null));
  return makePlayerJob;
}
async function sync() {
  try {
    const health = await api("/api/health");
    if (
      !health.durable &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    )
      toast(
        "This deployment uses temporary server storage. Explorer progress may reset after a service restart.",
      );
    if (localStorage.getItem("ascend:token"))
      s.player = (await api("/api/me")).player;
    s.offline = false;
    if (s.player?.activeQuest) {
      s.origin = s.player.activeQuest.checkpoints[0];
      startTracking();
    }
    render();
  } catch (e) {
    s.offline = true;
    render();
    if (e.status === 401) toast(e.message);
  }
}
function enterDemo() {
  stopTracking();
  s.demo = true;
  s.demoPlayer = s.demoPlayer || {
    id: "rehearsal",
    alias: "Wanderer",
    stats: emptyStats(),
    activeQuest: null,
    equipped: null,
    public: false,
  };
  s.origin = { ...DEMO_ORIGIN };
  s.places = structuredClone(DEMO_PLACES);
  s.fix = null;
  s.photo = null;
  s.observation = "";
  s.view = "quests";
  location.hash = "quests";
  render();
  toast("Rehearsal is ready. No real location or account is needed.");
}
function exitDemo() {
  s.demo = false;
  s.places = [];
  s.origin = null;
  s.photo = null;
  s.fix = null;
  s.observation = "";
  render();
  if (s.player?.activeQuest) startTracking();
}
function locationDialog() {
  if (s.demo) {
    s.places = structuredClone(DEMO_PLACES);
    render();
    toast("Rehearsal places refreshed.");
    return;
  }
  modal(
    "Find the world around you",
    `<div class="dialog-symbol">${icon("compass")}</div><p>Share a fresh GPS fix to find mapped parks, gardens, landmarks, and other outdoor places within your chosen adventure time.</p><ul class="privacy-list"><li>Coordinates go to ASCEND’s server for a map lookup. Overpass providers receive an approximate search area: <a href="https://overpass.private.coffee/" target="_blank" rel="noopener">Private.coffee</a>, with <a href="https://maps.mail.ru/osm/tools/overpass/" target="_blank" rel="noopener">VK Maps</a> and <a href="https://overpass-api.de/" target="_blank" rel="noopener">FOSSGIS</a> as fallbacks.</li><li>Map tiles reveal the displayed area to OpenStreetMap.</li><li>Camera photos stay on your device. Public rankings never show locations.</li></ul><label class="dialog-label">Time available<select id="find-minutes">${[10, 20, 30, 45, 60].map((m) => `<option value="${m}" ${s.minutes === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></label><div class="dialog-actions"><button class="button primary" data-action="locate">${icon("pin")} Use my location</button><button class="button subtle" data-action="demo-modal">Try without permissions</button></div><p class="small-print">Mapped access is incomplete. Check opening hours and use public pedestrian paths. Distances are straight-line estimates.</p>`,
    "location",
  );
}
async function locate() {
  if (s.busy) return;
  s.busy = true;
  s.minutes = Number(
    document.querySelector("#find-minutes")?.value || s.minutes,
  );
  modal(
    "Finding nearby places",
    `<div class="spinner"></div><p>Getting a fresh GPS fix, then looking for nearby outdoor places…</p>`,
    "loading",
  );
  try {
    await ensurePlayer();
    s.origin = await getFix();
    s.fix = s.origin;
    const result = await api("/api/places", {
      origin: { lat: s.origin.lat, lon: s.origin.lon },
      radius: Math.min(2500, Math.max(200, s.minutes * 35)),
    });
    s.places = result.places;
    s.view = "quests";
    closeModal(false);
    render();
    toast(
      s.places.length
        ? `${s.places.length} mapped places found. Pick your adventure.`
        : "No eligible places are mapped close by. Try more time or a different location.",
    );
  } catch (e) {
    closeModal(false);
    toast(e.message);
  } finally {
    s.busy = false;
  }
}
function selectedPlaces(type) {
  return type === "discover" && s.places.length > 1
    ? [s.places[1]]
    : s.places.slice(0, type === "trail" ? 3 : 1);
}
function generationDialog(type) {
  if (playerFor(s)?.activeQuest) {
    toast("Finish or leave your active quest first.");
    return;
  }
  const places = selectedPlaces(type);
  if (!places.length) return locationDialog();
  s.pendingType = type;
  modal(
    "Let the world become a story",
    `<div class="dialog-symbol">${icon("sparkles")}</div><span class="element-tag">${QUEST_TYPES[type].name.toUpperCase()}</span><h3>${esc(places[0].name)}</h3><p>Gemma writes a short fantasy atmosphere on this device. Mapped destinations, objectives, check-ins, and XP come from the quest engine.</p><label class="dialog-label">Choose your local writer<select id="generate-model"><option value="small" ${s.modelMode === "small" ? "selected" : ""}>Gemma 3 270M · compact</option></select></label><p class="small-print">First use downloads hundreds of MB from Hugging Face. Your prompt is processed locally. GPU support and memory vary between devices.</p><div class="dialog-actions"><button class="button primary" data-action="generate-ai">${icon("sparkles")} Write with Gemma</button><button class="button subtle" data-action="generate-curated">Use a curated briefing</button></div>`,
    "generation",
  );
}
async function generate(useAI) {
  if (s.busy) return;
  s.busy = true;
  const type = s.pendingType,
    places = selectedPlaces(type);
  s.modelMode = document.querySelector("#generate-model")?.value || s.modelMode;
  let narrative = null;
  cancelledAI = null;
  try {
    if (useAI) {
      modal(
        "Your field guide is writing",
        `<div class="spinner"></div><p id="modal-ai-status">Loading local Gemma. The first download may take several minutes.</p><p class="small-print">The model stays on your device. Once loaded, later stories are faster.</p><button class="button subtle" data-action="skip-ai">Continue with a curated briefing</button>`,
        "ai-progress",
      );
      try {
        narrative = await runGemma({
          mode: s.modelMode,
          prompt: questPrompt(places[0].name, type, s.theme),
        });
      } catch (e) {
        if (cancelledAI === "stop") return;
        if (cancelledAI !== "curated") {
          closeModal(false);
          modal(
            "Your device needs another route",
            `<p>This browser could not run the local quest writer. Try another device, or keep exploring with the curated briefing.</p><p>The curated briefing keeps this adventure available and will be labelled clearly.</p><button class="button primary" data-action="generate-curated">Use curated briefing</button>`,
            "generation",
          );
          return;
        }
      }
    }
    const spec = {
      type,
      theme: s.theme,
      minutes: s.minutes,
      origin: s.origin,
      narrative,
      placeIds: places.map((p) => p.id),
    };
    if (s.demo) {
      s.demoPlayer.activeQuest = {
        ...buildQuest({
          ...spec,
          id: crypto.randomUUID(),
          places,
          now: Date.now(),
          demo: true,
        }),
        index: 0,
        checkIns: [],
      };
    } else {
      await ensurePlayer();
      const data = await api("/api/quests", spec);
      s.player = data.player;
    }
    s.paused = false;
    s.photo = null;
    s.observation = "";
    closeModal(false);
    render();
    startTracking();
    toast(
      narrative
        ? "Your local Gemma story is ready. Start your adventure."
        : "Your curated adventure is ready.",
    );
  } catch (e) {
    closeModal(false);
    toast(e.message);
  } finally {
    s.busy = false;
    store();
  }
}
function updateFix(fix) {
  s.fix = fix;
  const q = playerFor(s)?.activeQuest;
  if (!q) return;
  const c = q.checkpoints[q.index || 0];
  s.distance = distance(c, fix);
  const distanceEl = document.querySelector("#gps-distance");
  if (distanceEl)
    distanceEl.textContent = `${formatDistance(s.distance)} to checkpoint`;
  const accuracyEl = document.querySelector("#gps-accuracy");
  if (accuracyEl)
    accuracyEl.textContent = `Accuracy ±${Math.round(fix.accuracy)} m · ${s.distance <= 80 ? "Within check-in range" : "Follow a public pedestrian route"}`;
  const pocketStatus = document.querySelector("#pocket-status");
  if (pocketStatus)
    pocketStatus.textContent = `${formatDistance(s.distance)} to ${c.name}`;
}
function stopTracking() {
  if (watch !== null) navigator.geolocation?.clearWatch(watch);
  watch = null;
}
function startTracking() {
  stopTracking();
  if (
    s.demo ||
    s.paused ||
    document.hidden ||
    !playerFor(s)?.activeQuest ||
    !navigator.geolocation
  )
    return;
  watch = navigator.geolocation.watchPosition(
    (p) =>
      updateFix({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        accuracy: p.coords.accuracy,
        timestamp: p.timestamp,
      }),
    (e) =>
      toast(
        e.code === 1
          ? "GPS permission was declined. Use rehearsal or allow location to check in."
          : "GPS is still looking for a fix. Try again outdoors.",
      ),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}
function pause() {
  s.paused = !s.paused;
  if (s.paused) {
    stopTracking();
    window.speechSynthesis?.cancel();
  } else startTracking();
  render();
  if (pocket) pocketGuide();
  toast(s.paused ? "Quest paused. GPS and speech stopped." : "Quest resumed.");
}
function briefing() {
  const q = playerFor(s)?.activeQuest;
  if (!q) return "Choose a quest to begin your adventure.";
  return `${q.title}. ${q.brief} Your next checkpoint is ${q.checkpoints[q.index || 0].name}. Reopen this app when you arrive, and use check in. ${q.needsPhoto ? "At the destination, take a fresh photo of something you notice." : ""}`;
}
function readBrief() {
  if (!speak(briefing()))
    toast(
      "No installed local voice was found. Your quest card has the same briefing.",
    );
}
function pocketGuide() {
  const q = playerFor(s)?.activeQuest;
  if (!q) {
    toast("Start a quest to open your pocket guide.");
    return;
  }
  modal(
    "Your pocket guide",
    `<div class="pocket-orb">${icon("portal")}</div><span class="eyebrow">${s.demo ? "REHEARSAL" : "YOUR NEXT CHECKPOINT"}</span><h3>${esc(q.checkpoints[q.index || 0].name)}</h3><p id="pocket-status">${s.demo ? "Simulated check-in is available" : s.fix ? formatDistance(s.distance) + " to checkpoint" : "GPS will update while this page is visible"}</p><p class="pocket-instruction">Listen to your briefing. Pocket your phone.<br/>Reopen at the checkpoint.</p><div class="pocket-buttons"><button class="button primary" data-action="checkin">${icon("check")} ${s.demo ? "Simulate arrival" : "Check in"}</button><button class="button subtle" data-action="repeat">${icon("volume")} Repeat briefing</button><button class="button subtle" data-action="mic">${icon("mic")} Voice command</button><button class="button subtle" data-action="pause">${icon(s.paused ? "play" : "pause")} ${s.paused ? "Resume" : "Pause"}</button></div><p id="voice-status" class="small-print">GPS pauses when the browser is hidden or your phone is locked. Walking directions are available on the quest card.</p>`,
    "pocket",
  );
  pocket = true;
}
function voiceSettings() {
  const st = speechStatus();
  modal(
    "Your device, your voice",
    `<div class="dialog-symbol">${icon("volume")}</div><p>Briefings use installed local voices. No ElevenLabs or paid speech tokens.</p><div class="support-row"><span>Local speech playback</span><strong>${st.local.length ? "Ready" : "No local voice detected"}</strong></div><div class="support-row"><span>Voice command API</span><strong>${st.recognition ? "Available" : "Unavailable here"}</strong></div><p class="small-print">Some browsers send microphone audio to their speech recognition provider. Commands start only when you tap the microphone. Use buttons if you prefer.</p><div class="dialog-actions"><button class="button primary" data-action="test-voice">${icon("volume")} Test a local voice</button>${playerFor(s)?.activeQuest ? '<button class="button subtle" data-action="pocket">Open pocket guide</button>' : ""}</div>`,
    "voice",
  );
}
function microphone() {
  const run = () => {
    recognition = listen(
      (command) => {
        if (command === "repeat" || command === "start") readBrief();
        else if (command === "status") {
          const q = playerFor(s)?.activeQuest;
          speak(
            q
              ? `${q.index} of ${q.checkpoints.length} checkpoints checked in. ${s.demo ? "Rehearsal mode." : s.fix ? `${Math.round(s.distance)} metres to your next checkpoint.` : "Waiting for GPS."}`
              : "Choose a quest to start.",
          );
        } else if (command === "pause") {
          if (!s.paused) pause();
        } else if (command === "resume") {
          if (s.paused) pause();
        } else if (command === "checkin") checkin();
      },
      (text) => {
        const e = document.querySelector("#voice-status");
        if (e) e.textContent = text;
        else toast(text);
      },
    );
  };
  if (localStorage.getItem("ascend:voice-consent") === "yes") {
    run();
    return;
  }
  modal(
    "Enable optional voice commands?",
    `<p>Your browser may send microphone audio to its speech recognition provider. ASCEND does not store audio.</p><p>Say <strong>repeat, status, pause, resume,</strong> or <strong>check in</strong>. Buttons remain available.</p><button class="button primary" data-action="enable-mic">Enable voice commands</button>`,
    "voice-consent",
  );
  s.afterVoiceConsent = run;
}
async function camera() {
  const q = playerFor(s)?.activeQuest;
  if (!q) {
    toast("Start a discovery quest first.");
    return;
  }
  if (s.demo) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#163529"/><path d="M240 280V90m0 100c-100-10-110-100-90-100 100 0 100 90 90 100m0-35c100-10 110-100 90-100-100 0-100 90-90 100" fill="#a5e2a6"/><text x="28" y="300" font-family="sans-serif" font-size="16" fill="white">REHEARSAL IMAGE · NOT A REAL PHOTO</text></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    s.photo = {
      blob,
      url: URL.createObjectURL(blob),
      hash: await hashPhoto(blob),
      width: 480,
      height: 320,
      capturedAt: Date.now(),
    };
    render();
    toast("A labelled rehearsal image is attached. No camera was used.");
    return;
  }
  modal(
    "Capture a small discovery",
    `<p>Photograph something you notice: a leaf, a texture, a landmark. Keep other people out of the frame. The photo stays on this device.</p><video id="camera-preview" autoplay playsinline muted></video><p id="camera-message" class="small-print">Tap start camera to grant access.</p><div class="dialog-actions"><button class="button primary" data-action="start-camera">${icon("camera")} Start camera</button><button class="button subtle" data-action="capture-photo" disabled>Capture discovery</button></div>`,
    "camera",
  );
}
async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera access is unavailable. Use an HTTPS browser on a phone or try rehearsal.",
      );
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { min: 320, ideal: 1280 },
        height: { min: 240, ideal: 720 },
      },
      audio: false,
    });
    const video = document.querySelector("#camera-preview");
    if (!video) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
      return;
    }
    video.srcObject = cameraStream;
    await video.play();
    document.querySelector('[data-action="capture-photo"]').disabled = false;
    document.querySelector("#camera-message").textContent =
      "Camera ready. Your image stays in this browser.";
  } catch (e) {
    const msg = document.querySelector("#camera-message");
    if (msg)
      msg.textContent =
        e.name === "NotAllowedError"
          ? "Camera permission was declined. You can choose a gate quest instead."
          : e.message;
  }
}
async function capturePhoto() {
  const video = document.querySelector("#camera-preview");
  if (
    !video ||
    video.readyState < 2 ||
    video.videoWidth < 320 ||
    video.videoHeight < 240
  ) {
    toast("Wait for a clear camera preview, then try capturing again.");
    return;
  }
  const canvas = document.createElement("canvas");
  const factor = Math.min(1, 960 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * factor);
  canvas.height = Math.round(video.videoHeight * factor);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.84));
  if (!blob) {
    toast("The camera image could not be captured.");
    return;
  }
  if (s.photo?.url) URL.revokeObjectURL(s.photo.url);
  s.photo = {
    blob,
    url: URL.createObjectURL(blob),
    hash: await hashPhoto(blob),
    width: canvas.width,
    height: canvas.height,
    capturedAt: Date.now(),
  };
  closeModal(false);
  render();
  toast("Discovery captured. Add a few words, then check in.");
}
async function checkin() {
  if (s.busy) return;
  const p = playerFor(s),
    q = p?.activeQuest;
  if (!q) return;
  if (s.paused) {
    toast("Resume your quest before checking in.");
    return;
  }
  s.observation =
    document.querySelector("#observation")?.value || s.observation;
  if (q.needsPhoto && !s.photo) {
    closeModal(false);
    return camera();
  }
  if (q.needsPhoto && s.observation.trim().length < 5) {
    closeModal(false);
    render();
    document.querySelector("#observation")?.focus();
    toast("Add a few words about what you noticed.");
    return;
  }
  s.busy = true;
  try {
    let result;
    if (s.demo) {
      q.index++;
      if (q.index < q.checkpoints.length)
        result = { completed: false, quest: q, player: s.demoPlayer };
      else {
        const reward = rewards(s.demoPlayer.stats, q);
        s.demoPlayer.stats = reward.stats;
        if (!s.demoPlayer.equipped) s.demoPlayer.equipped = "fernfox";
        s.demoPlayer.activeQuest = null;
        result = { completed: true, reward, player: s.demoPlayer };
      }
    } else {
      const fix = await getFix();
      updateFix(fix);
      const body = {
        index: q.index,
        fix,
        observation: s.observation,
        ...(s.photo
          ? {
              photo: {
                hash: s.photo.hash,
                capturedAt: s.photo.capturedAt,
                width: s.photo.width,
                height: s.photo.height,
              },
            }
          : {}),
      };
      result = await api(`/api/quests/${q.id}/check-in`, body);
      s.player = result.player;
      if (result.completed) {
        const visited = new Set(q.checkpoints.map((c) => c.id));
        s.places = s.places.filter((p) => !visited.has(p.id));
      }
    }
    closeModal(false);
    if (result.completed) {
      stopTracking();
      await addJournal({
        id: q.id,
        title: q.title,
        type: q.type,
        xp: q.xp,
        at: Date.now(),
        observation: s.observation,
        demo: s.demo,
        photo: s.photo?.blob || null,
      });
      s.photo = null;
      s.observation = "";
      render();
      const companion = COMPANIONS.find(
        (c) => c.id === result.reward.companions?.[0],
      );
      modal(
        "Quest complete",
        `<div class="reward-burst">${icon("sparkles")}</div><span class="eyebrow">${s.demo ? "REHEARSAL REWARD" : "A LITTLE FURTHER. A LEVEL HIGHER."}</span><h3 class="reward-xp">+${result.reward.xp} <span>XP</span></h3><p>${esc(q.title)} is now part of your story.</p>${companion ? `<div class="reward-companion">${sprite(companion)}<span class="element-tag">NEW COMPANION</span><h3>${companion.name}</h3><p>${companion.description}</p></div>` : ""}${result.reward.trophies?.length ? `<p class="reward-achievement">${icon("trophy")} ${result.reward.trophies.map((id) => TROPHIES.find((t) => t.id === id)?.name).join(" · ")}</p>` : ""}<button class="button primary" data-action="reward-done">Keep exploring ${icon("arrow")}</button>`,
        "reward",
      );
    } else {
      render();
      toast("Checkpoint reached. Your next gate is waiting.");
      startTracking();
    }
  } catch (e) {
    toast(e.message);
  } finally {
    s.busy = false;
    store();
  }
}
async function abandon() {
  const q = playerFor(s)?.activeQuest;
  if (!q) return;
  modal(
    "Leave this adventure?",
    `<p>No progress is lost from completed quests. This unfinished quest will close so you can choose another.</p><button class="button primary" data-action="confirm-abandon">Leave quest</button><button class="button subtle" data-action="close-modal">Keep exploring</button>`,
    "abandon",
  );
}
async function confirmAbandon() {
  if (s.demo) s.demoPlayer.activeQuest = null;
  else s.player = (await api("/api/quests/active", undefined, "DELETE")).player;
  stopTracking();
  s.photo = null;
  closeModal(false);
  render();
}
function initMap() {
  const el = document.querySelector("#world-map");
  if (!el || !s.origin || s.demo) return;
  el.innerHTML = "";
  map = L.map(el, { scrollWheelZoom: false }).setView(
    [s.origin.lat, s.origin.lon],
    16,
  );
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  const q = playerFor(s)?.activeQuest,
    places = q ? q.checkpoints : s.places;
  places.forEach((p) =>
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: "leaflet-gate",
        html: icon("portal"),
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      }),
    })
      .addTo(map)
      .bindPopup(
        `<strong>${esc(p.name)}</strong><br>Mapped ${esc(p.kind)}. Check local access.`,
      ),
  );
  L.circleMarker([s.origin.lat, s.origin.lon], {
    radius: 6,
    color: "#b2ffc4",
    fillColor: "#4d9e76",
    fillOpacity: 1,
    weight: 3,
  }).addTo(map);
}
async function loadGuild() {
  s.leaderboard = null;
  s.leaderboardError = null;
  render();
  try {
    const data = await api(`/api/leaderboard?period=${s.period}`);
    s.leaderboard = data.rows;
  } catch (e) {
    s.leaderboard = [];
    s.leaderboardError = e.message;
  }
  if (s.view === "guild") render();
}
let journalDB;
async function db() {
  if (journalDB) return journalDB;
  journalDB = await new Promise((resolve, reject) => {
    const request = indexedDB.open("ascend-journal", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("entries", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return journalDB;
}
async function getJournal() {
  try {
    const database = await db();
    const entries = await new Promise((resolve, reject) => {
      const r = database.transaction("entries").objectStore("entries").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    s.journal.forEach((e) => e.photoUrl && URL.revokeObjectURL(e.photoUrl));
    s.journal = entries
      .sort((a, b) => b.at - a.at)
      .map((e) => ({
        ...e,
        photoUrl: e.photo ? URL.createObjectURL(e.photo) : null,
      }));
  } catch {
    s.journal = [];
  }
}
async function addJournal(entry) {
  try {
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction("entries", "readwrite");
      tx.objectStore("entries").put(entry);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await getJournal();
    if (s.journal.length > 30) {
      const tx = database.transaction("entries", "readwrite");
      s.journal
        .slice(30)
        .forEach((e) => tx.objectStore("entries").delete(e.id));
      await new Promise((r) => (tx.oncomplete = r));
      await getJournal();
    }
  } catch {
    toast(
      "Quest reward saved. The private journal could not be written on this device.",
    );
  }
}
async function saveProfile() {
  const name = document.querySelector("#alias-input")?.value || "Wanderer",
    isPublic = !!document.querySelector("#public-input")?.checked;
  if (s.demo) {
    s.demoPlayer.alias = name;
    store();
    render();
    return toast("Rehearsal explorer saved.");
  }
  await ensurePlayer();
  s.player = (
    await api("/api/me", { alias: name, public: isPublic }, "PATCH")
  ).player;
  render();
  toast("Your explorer settings are saved.");
}
async function equip(id) {
  if (s.demo) s.demoPlayer.equipped = id;
  else s.player = (await api("/api/me", { equipped: id }, "PATCH")).player;
  render();
  toast(`${COMPANIONS.find((c) => c.id === id)?.name} is travelling with you.`);
}
function exportSession() {
  if (s.demo)
    return toast(
      "Rehearsal progress stays on this device. Exit rehearsal to export your real session.",
    );
  const token = localStorage.getItem("ascend:token");
  if (!token)
    return toast(
      "Create your explorer first by saving a profile or finding a quest.",
    );
  const blob = new Blob(
      [
        JSON.stringify(
          { app: "ASCEND", version: 1, token, alias: s.player?.alias },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "ascend-private-session.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(
    "Session exported. Keep it private: it grants access to your explorer.",
  );
}
function privacy() {
  modal(
    "A smaller digital footprint",
    `<ul class="privacy-list"><li><strong>Location:</strong> requested only when you explore. Coordinates go to ASCEND for map lookups and fresh check-in validation. Public map services receive the requested area.</li><li><strong>Tracking:</strong> GPS watches only run while an active quest is visible and unpaused. No continuous location trail is saved. Hidden and locked browser pages pause updates.</li><li><strong>Photos:</strong> camera pixels stay in this browser’s private journal. The server receives an image hash, size, capture time, and your completion request; image content is not analysed on the server.</li><li><strong>Journal:</strong> the most recent 30 memories stay on this device. Clearing browser storage also removes them.</li><li><strong>Rankings:</strong> opt in with an alias. Public fields are alias, XP, rank, completed quests, and companion count.</li><li><strong>Gemma:</strong> model files download from Hugging Face. Inference and prompts run on your device. Curated stories are labelled.</li><li><strong>Voice:</strong> playback uses local installed voices. Optional browser recognition can send audio to the browser’s provider. No voice recording is stored by ASCEND.</li><li><strong>Check-ins:</strong> GPS, freshness checks, and camera metadata support friendly play. They cannot prove a physical visit or prevent spoofing.</li></ul><p class="small-print">Use mapped places only when open and accessible. </p>`,
    "privacy",
  );
}
function aiSettings() {
  modal(
    "Meet your local quest writer",
    `<div class="dialog-symbol">${icon("sparkles")}</div><p>Gemma’s open weights turn a mapped destination into a short, original fantasy atmosphere. Objectives and XP are deterministic and validated separately.</p><label class="dialog-label">Model<select id="load-model"><option value="small" ${s.modelMode === "small" ? "selected" : ""}>Gemma 3 270M · compact</option></select></label><p class="small-print">The first download is hundreds of MB. Your device needs sufficient memory. WebGPU is used when available; CPU loading can be slower.</p><div id="modal-ai-status" class="ai-status-box">${esc(s.aiStatus)}</div><button class="button primary" data-action="load-ai">Load on this device ${icon("arrow")}</button>`,
    "ai-settings",
  );
}
async function loadAI() {
  if (s.busy) return;
  s.busy = true;
  s.modelMode = document.querySelector("#load-model")?.value || s.modelMode;
  try {
    await runGemma({ type: "load", mode: s.modelMode });
    toast("Gemma is ready on this device.");
  } catch (e) {
    toast(e.message);
  } finally {
    s.busy = false;
    store();
  }
}
const actions = {
  view: (b) => setView(b.dataset.view),
  find: locationDialog,
  locate,
  demo: enterDemo,
  "demo-modal": () => {
    closeModal(false);
    enterDemo();
  },
  "exit-demo": exitDemo,
  generate: (b) => generationDialog(b.dataset.type),
  "generate-ai": () => generate(true),
  "generate-curated": () => generate(false),
  "skip-ai": () => {
    cancelledAI = "curated";
    cancelGemma();
  },
  "close-modal": () => closeModal(),
  camera,
  "start-camera": startCamera,
  "capture-photo": capturePhoto,
  checkin,
  pocket: pocketGuide,
  pause,
  repeat: readBrief,
  mic: microphone,
  "enable-mic": () => {
    localStorage.setItem("ascend:voice-consent", "yes");
    const run = s.afterVoiceConsent;
    pocketGuide();
    run?.();
  },
  "voice-settings": voiceSettings,
  "test-voice": () => {
    if (!speak("Welcome, explorer. A little further. A level higher."))
      toast(
        "No local voice is available. Your quest card contains the same guidance.",
      );
  },
  abandon,
  "confirm-abandon": confirmAbandon,
  "reward-done": () => {
    closeModal(false);
    render();
  },
  "ai-settings": aiSettings,
  "load-ai": loadAI,
  period: (b) => {
    s.period = b.dataset.period;
    loadGuild();
  },
  "load-guild": loadGuild,
  "save-profile": saveProfile,
  equip: (b) => equip(b.dataset.id),
  export: exportSession,
  privacy,
  place: (b) =>
    toast(
      s.places.find((p) => p.id === b.dataset.id)?.name ||
        "Rehearsal checkpoint",
    ),
  "clear-journal": () =>
    modal(
      "Clear this device’s journal?",
      `<p>Your private photos and reflections in this browser will be removed. Your XP, companions, and completed quests stay with your explorer.</p><button class="button primary" data-action="confirm-clear-journal">Clear local journal</button>`,
      "clear-journal",
    ),
  "confirm-clear-journal": async () => {
    const database = await db();
    await new Promise((resolve, reject) => {
      const tx = database.transaction("entries", "readwrite");
      tx.objectStore("entries").clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await getJournal();
    closeModal(false);
    render();
    toast("This device’s journal is clear.");
  },
};
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const action = actions[b.dataset.action];
  if (!action) return;
  try {
    await action(b);
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "minutes") s.minutes = Number(e.target.value);
  if (e.target.id === "theme") s.theme = e.target.value;
  if (e.target.id === "model-mode") s.modelMode = e.target.value;
  store();
  if (e.target.id === "restore-session") {
    try {
      const file = e.target.files[0];
      if (!file || file.size > 4096)
        throw new Error("Choose a valid ASCEND session file.");
      const data = JSON.parse(await file.text());
      if (data.app !== "ASCEND" || !/^[a-f0-9]{64}$/.test(data.token || ""))
        throw new Error("This is not a valid ASCEND session.");
      const previous = localStorage.getItem("ascend:token");
      localStorage.setItem("ascend:token", data.token);
      try {
        s.player = (await api("/api/me")).player;
        s.demo = false;
        s.offline = false;
        render();
        toast("Explorer session restored.");
      } catch (error) {
        if (previous) localStorage.setItem("ascend:token", previous);
        else localStorage.removeItem("ascend:token");
        throw error;
      }
    } catch (error) {
      toast(error.message);
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "observation") s.observation = e.target.value;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab" && modalKind) {
    const focusable = [
      ...modalRoot.querySelectorAll("button:not([disabled]),input,select,a"),
    ];
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopTracking();
    window.speechSynthesis?.cancel();
    recognition?.abort?.();
  } else startTracking();
});
window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (view && view !== s.view) setView(view);
});
window.addEventListener("offline", () => {
  s.offline = true;
  toast("Connection paused. Your saved progress stays on this device.");
});
window.addEventListener("online", sync);
onAIState((data) => {
  s.aiStatus = data.status;
  document
    .querySelectorAll("#ai-status,#modal-ai-status")
    .forEach((e) => (e.textContent = data.status));
});
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
render();
getJournal().then(() => {
  if (s.view === "journal") render();
});
sync();
if (s.view === "guild") loadGuild();
