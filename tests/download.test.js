import test from "node:test";
import assert from "node:assert/strict";
import { createModelFetch } from "../web/lib/download.js";
const url =
  "https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX/resolve/" +
  "a".repeat(40) +
  "/onnx/model_q4.onnx_data";
const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
function part(start, end, etag = "fixture") {
  const last = Math.min(end, data.length - 1);
  return new Response(data.slice(start, last + 1), {
    status: 206,
    headers: {
      "Content-Range": `bytes ${start}-${last}/${data.length}`,
      ETag: etag,
    },
  });
}
test("Model chunks retry an interrupted range without duplicating or changing bytes", async () => {
  const starts = [];
  let failed = false;
  const fetchImpl = async (input, init) => {
    const match = /bytes=(\d+)-(\d+)/.exec(init.headers.get("Range"));
    const start = Number(match[1]);
    starts.push(start);
    if (start === 4 && !failed) {
      failed = true;
      throw new Error("connection reset");
    }
    return part(start, Number(match[2]));
  };
  const response = await createModelFetch({
    fetchImpl,
    chunkBytes: 4,
    wait: async () => {},
  })(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), "11");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), data);
  assert.deepEqual(starts, [0, 4, 4, 8]);
});
test("Model download refuses mixed artifact revisions", async () => {
  const fetchImpl = async (input, init) => {
    const match = /bytes=(\d+)-(\d+)/.exec(init.headers.get("Range"));
    return part(
      Number(match[1]),
      Number(match[2]),
      match[1] === "0" ? "original" : "changed",
    );
  };
  const response = await createModelFetch({
    fetchImpl,
    chunkBytes: 4,
    attempts: 1,
  })(url);
  await assert.rejects(response.arrayBuffer(), /changed/);
});
test("Servers without ranges and ordinary model metadata retain normal fetch behavior", async () => {
  const native = new Response("whole file", { status: 200 });
  const wrapped = createModelFetch({ fetchImpl: async () => native });
  assert.equal(await wrapped(url), native);
  let range;
  await createModelFetch({
    fetchImpl: async (input, init) => {
      range = new Headers(init.headers).get("Range");
      return new Response("{}");
    },
  })("https://huggingface.co/example/config.json");
  assert.equal(range, null);
});
