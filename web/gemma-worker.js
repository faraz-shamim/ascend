import { pipeline, env, TextStreamer } from "@huggingface/transformers";
env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
let generator, runtime, selected;
const modes = {
  small: {
    id: "onnx-community/gemma-3-270m-it-ONNX",
    gpu: "2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0",
    cpu: "cfd5c04f84a64766d63efc5bb1d2cf31f34a4a90",
  },
};
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) {
    self.postMessage({
      type: "error",
      id: data.id,
      text: "The quest writer is already working.",
    });
    return;
  }
  busy = true;
  try {
    const mode = "small";
    if (!generator || selected !== mode) {
      await generator?.dispose?.();
      generator = null;
      let adapter = null;
      try {
        adapter = await self.navigator.gpu?.requestAdapter();
      } catch {}
      runtime = adapter ? "webgpu" : "wasm";
      selected = mode;
      const model = modes[mode];
      self.postMessage({
        type: "status",
        id: data.id,
        text: `Loading Gemma ${mode === "rich" ? "1B" : "270M"} on your ${adapter ? "GPU" : "CPU"}. First use downloads the model.`,
      });
      generator = await pipeline("text-generation", model.id, {
        revision: adapter ? model.gpu : model.cpu,
        dtype: "q4",
        device: runtime,
        progress_callback: (p) =>
          self.postMessage({
            type: "progress",
            id: data.id,
            status: p.status,
            file: p.file,
            progress: p.progress,
          }),
      });
      self.postMessage({
        type: "ready",
        id: data.id,
        model: model.id,
        runtime,
      });
    }
    if (data.type === "load") {
      self.postMessage({
        type: "loaded",
        id: data.id,
        model: modes[selected].id,
        runtime,
      });
      return;
    }
    let text = "";
    const start = performance.now();
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk) => {
        text += chunk;
        self.postMessage({ type: "token", id: data.id, text });
      },
    });
    const output = await generator([{ role: "user", content: data.prompt }], {
      max_new_tokens: 100,
      do_sample: false,
      repetition_penalty: 1.08,
      streamer,
    });
    self.postMessage({
      type: "done",
      id: data.id,
      text: text || output[0].generated_text.at(-1).content,
      model: modes[selected].id,
      runtime,
      revision: modes[selected][runtime === "webgpu" ? "gpu" : "cpu"],
      durationMs: Math.round(performance.now() - start),
    });
  } catch (e) {
    self.postMessage({
      type: "error",
      id: data.id,
      text: String(e.message || e),
    });
  } finally {
    busy = false;
  }
};
