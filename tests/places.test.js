import test from "node:test";
import assert from "node:assert/strict";
import { createPlaceDiscovery } from "../server/places.js";
const origin = { lat: 51.5072, lon: -0.1276 };
const park = {
  type: "node",
  id: 1,
  ...origin,
  tags: { leisure: "park", name: "Fixture Park" },
};
const ok = () =>
  new Response(JSON.stringify({ elements: [park] }), { status: 200 });

test("Concurrent map searches share one lookup and cache results", async () => {
  let calls = 0;
  const discover = createPlaceDiscovery({
    fetchImpl: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return ok();
    },
  });
  const results = await Promise.all([
    discover(origin, 700),
    discover(origin, 700),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0].places[0].name, "Fixture Park");
  assert.equal((await discover(origin, 700)).cached, true);
  assert.equal(calls, 1);
});
test("Rate-limited upstream pauses before retry while fallback remains available", async () => {
  let at = 100000;
  const calls = [];
  const discover = createPlaceDiscovery({
    now: () => at,
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes("private.coffee")
        ? new Response("", { status: 429 })
        : ok();
    },
  });
  await discover(origin, 700);
  at += 1000;
  await discover(origin, 800);
  assert.equal(calls.filter((url) => url.includes("private.coffee")).length, 1);
  at += 30000;
  await discover(origin, 900);
  assert.equal(calls.filter((url) => url.includes("private.coffee")).length, 2);
});
test("All map services unavailable produces a playable-rehearsal fallback", async () => {
  const discover = createPlaceDiscovery({
    fetchImpl: async () => new Response("", { status: 503 }),
  });
  await assert.rejects(
    discover(origin, 700),
    (error) => error.status === 503 && error.message.includes("rehearsal"),
  );
});

test("Primary outage switches to a public fallback with the same coarse search", async () => {
  const requests = [];
  const discover = createPlaceDiscovery({
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        method: options.method,
        query:
          options.body?.get("data") || new URL(url).searchParams.get("data"),
      });
      return url.includes("private.coffee")
        ? new Response("", { status: 500 })
        : ok();
    },
  });
  const result = await discover(origin, 700);
  assert.equal(result.places[0].source, "https://www.openstreetmap.org/node/1");
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).hostname, "maps.mail.ru");
  assert.equal(requests[0].query, requests[1].query);
  assert.equal(requests[0].method, "POST");
  assert.ok(!requests[0].url.includes("?"));
  assert.equal(requests[1].method, "GET");
  assert.ok(requests[0].query.includes("51.507,-0.128"));
  assert.ok(!requests[0].query.includes("51.5072"));
});
