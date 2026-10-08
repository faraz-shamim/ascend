// Keep large, pinned model downloads below a single long-lived CDN connection.
// This uses the library's documented env.fetch hook; model bytes are unchanged.
export function createModelFetch({
  fetchImpl = globalThis.fetch.bind(globalThis),
  chunkBytes = 8 * 1024 * 1024,
  attempts = 3,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  return async function modelFetch(input, init = {}) {
    const url = new URL(String(input));
    if (
      (init.method || "GET") !== "GET" ||
      url.hostname !== "huggingface.co" ||
      !/^\/onnx-community\/gemma-3-270m-it-ONNX\/resolve\/[a-f0-9]{40}\/onnx\/[^/]+\.onnx(?:_data)?$/.test(
        url.pathname,
      )
    )
      return fetchImpl(input, init);
    const controller = new AbortController();
    const baseSignal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    async function range(start, end, expectedTotal, expectedEtag) {
      let failure;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const headers = new Headers(init.headers);
          headers.set("Range", `bytes=${start}-${end}`);
          const response = await fetchImpl(input, {
            ...init,
            headers,
            signal: AbortSignal.any([baseSignal, AbortSignal.timeout(30000)]),
          });
          if (start === 0 && response.status === 200)
            return { passthrough: response };
          if (response.status !== 206)
            throw new Error(
              "The model download is temporarily unavailable. Try again shortly.",
            );
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
            response.headers.get("Content-Range") || "",
          );
          if (!match || Number(match[1]) !== start)
            throw new Error(
              "The model provider returned an unexpected download range.",
            );
          const total = Number(match[3]),
            etag = response.headers.get("ETag");
          if (
            total > 1024 * 1024 * 1024 ||
            total <= 0 ||
            (expectedTotal && total !== expectedTotal) ||
            (expectedEtag && etag !== expectedEtag)
          )
            throw new Error(
              "The model file changed during download. Please try again.",
            );
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== Number(match[2]) - start + 1)
            throw new Error("The model download was interrupted.");
          return { response, bytes, total, etag };
        } catch (error) {
          failure = error;
          if (baseSignal.aborted) throw error;
          if (attempt + 1 < attempts) await wait(500 * (attempt + 1));
        }
      }
      throw failure;
    }
    const first = await range(0, chunkBytes - 1);
    if (first.passthrough) return first.passthrough;
    const headers = new Headers(first.response.headers);
    headers.delete("Content-Range");
    headers.set("Content-Length", String(first.total));
    let initial = first.bytes,
      offset = 0;
    return new Response(
      new ReadableStream({
        async pull(stream) {
          try {
            const bytes =
              initial ||
              (
                await range(
                  offset,
                  Math.min(first.total - 1, offset + chunkBytes - 1),
                  first.total,
                  first.etag,
                )
              ).bytes;
            initial = null;
            offset += bytes.length;
            stream.enqueue(bytes);
            if (offset >= first.total) stream.close();
          } catch (error) {
            controller.abort();
            stream.error(error);
          }
        },
        cancel() {
          controller.abort();
        },
      }),
      { status: 200, headers },
    );
  };
}
