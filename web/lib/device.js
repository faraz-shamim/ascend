import { cleanText, voiceCommand } from "./domain.js";
let worker = null,
  pending = null;
export const aiState = {
  ready: false,
  model: null,
  runtime: null,
  status: "Optional local quest writer",
  error: null,
  last: null,
};
export function onAIState(fn) {
  window.addEventListener("ascend:ai", (e) => fn(e.detail));
}
function broadcast() {
  window.dispatchEvent(
    new CustomEvent("ascend:ai", { detail: { ...aiState } }),
  );
}
export function runGemma({
  type = "generate",
  prompt = "",
  mode = "small",
} = {}) {
  if (pending)
    return Promise.reject(new Error("The quest writer is already working."));
  if (!worker) {
    worker = new Worker(new URL("../gemma-worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (data.type === "status") {
        aiState.status = data.text;
        broadcast();
      }
      if (data.type === "progress" && data.progress !== undefined) {
        aiState.status = `Downloading model: ${Math.round(data.progress)}%`;
        broadcast();
      }
      if (data.type === "ready") {
        aiState.ready = true;
        aiState.model = data.model;
        aiState.runtime = data.runtime;
        broadcast();
      }
      if (data.type === "token") {
        aiState.status = "Gemma is writing your story…";
        broadcast();
      }
      if (data.type === "done" || data.type === "loaded") {
        const job = pending;
        pending = null;
        clearTimeout(job?.timer);
        aiState.error = null;
        aiState.status =
          data.type === "done"
            ? "Quest story generated on this device"
            : "Local Gemma is ready";
        aiState.last = data;
        broadcast();
        job?.resolve(data);
      }
      if (data.type === "error") {
        const job = pending;
        pending = null;
        clearTimeout(job?.timer);
        aiState.error = data.text;
        aiState.status = "Local model unavailable. Curated briefing is ready.";
        broadcast();
        job?.reject(new Error(data.text));
      }
    };
    worker.onerror = () => {
      const job = pending;
      pending = null;
      clearTimeout(job?.timer);
      worker?.terminate();
      worker = null;
      aiState.error = "Worker failed";
      broadcast();
      job?.reject(
        new Error("The local quest writer could not start on this device."),
      );
    };
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(
      () => {
        worker?.terminate();
        worker = null;
        pending = null;
        aiState.ready = false;
        aiState.error = "Model loading timed out";
        aiState.status =
          "Use a curated briefing or try again on another device.";
        broadcast();
        reject(
          new Error(
            "The model took too long to load. Your adventure can still use a curated briefing.",
          ),
        );
      },
      8 * 60 * 1000,
    );
    pending = { id, resolve, reject, timer };
    worker.postMessage({ id, type, prompt, mode });
  });
}
export function cancelGemma() {
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Quest writer cancelled."));
    pending = null;
  }
  worker?.terminate();
  worker = null;
  aiState.ready = false;
  aiState.status = "Quest writer paused";
  broadcast();
}
export function questPrompt(place, type, theme) {
  return `Give a short fairy-tale description of a quiet walk in ${cleanText(place, 70)}. Describe nature and a friendly animal. Write two sentences. No battles or questions.`;
}
export function speechStatus() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return {
    synthesis: !!window.speechSynthesis,
    local: voices.filter((v) => v.localService),
    recognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
export function speak(text, onEnd = () => {}) {
  if (!window.speechSynthesis) return false;
  const status = speechStatus(),
    voice =
      status.local.find((v) => v.lang.startsWith("en")) || status.local[0];
  if (!voice) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.rate = 0.95;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}
export function listen(onCommand, onStatus) {
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    onStatus(
      "Voice commands are unavailable here. The large buttons work everywhere.",
    );
    return null;
  }
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const command = voiceCommand(text);
    onStatus(
      command
        ? `Heard: ${text}`
        : `Heard “${text}”. Try repeat, status, pause, resume, or check in.`,
    );
    if (command) onCommand(command);
  };
  recognition.onerror = (e) =>
    onStatus(
      e.error === "not-allowed"
        ? "Microphone access was declined. Use the large buttons."
        : `Voice recognition: ${e.error}. Try again or use a button.`,
    );
  recognition.onend = () =>
    onStatus("Tap the microphone to speak another command.");
  recognition.start();
  return recognition;
}
export function getFix() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(
        new Error(
          "Location is unavailable in this browser. Try the rehearsal.",
        ),
      );
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Location permission was declined. Rehearsal is still available."
              : e.code === 2
                ? "Your location could not be found. Try outdoors."
                : "GPS timed out. Try again outdoors.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  });
}
export async function hashPhoto(blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
