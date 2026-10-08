import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { DEMO_ORIGIN, DEMO_PLACES } from "../web/lib/domain.js";
let clock = Date.UTC(2026, 9, 8, 9, 0),
  server,
  base,
  store,
  token,
  player,
  quest;
async function request(path, body, method, auth = token) {
  const res = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}
async function newQuest(type = "gate", index = 0) {
  const result = await request("/api/quests", {
    origin: DEMO_ORIGIN,
    type,
    theme: "verdant",
    minutes: 20,
    placeIds: DEMO_PLACES.slice(index, index + (type === "trail" ? 3 : 1)).map(
      (x) => x.id,
    ),
    narrative: { text: "A small adventure awaits.", model: "test-fixture" },
  });
  assert.equal(result.status, 201);
  return result.body.quest;
}
function fix(p) {
  return { ...p, accuracy: 5, timestamp: clock };
}
test.before(async () => {
  store = await createStore({ path: ":memory:", uri: "" });
  const result = await createApp({
    store,
    now: () => clock,
    discover: async () => ({ places: DEMO_PLACES, cached: true }),
  });
  server = result.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await store.close();
});
test("Create a private explorer; session token never appears in profile", async () => {
  const r = await request("/api/players", { alias: "Test Explorer" });
  assert.equal(r.status, 201);
  token = r.body.token;
  player = r.body.player;
  assert.equal(player.public, false);
  assert.equal(player.stats.xp, 0);
  assert.equal(player.tokenHash, undefined);
});
test("Protected endpoints reject missing and wrong sessions", async () => {
  assert.equal((await request("/api/me", null, "GET", null)).status, 401);
  assert.equal(
    (await request("/api/me", null, "GET", "a".repeat(64))).status,
    401,
  );
});
test("Quest creation rejects invalid types and unknown mapped IDs", async () => {
  assert.equal(
    (
      await request("/api/quests", {
        origin: DEMO_ORIGIN,
        type: "bad",
        theme: "verdant",
        minutes: 20,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/quests", {
        origin: DEMO_ORIGIN,
        type: "gate",
        theme: "verdant",
        minutes: 20,
        placeIds: ["invented/place"],
      })
    ).status,
    400,
  );
});
test("Gate check-in rejects poor GPS then awards once under duplicate requests", async () => {
  quest = await newQuest();
  const q = quest.checkpoints[0];
  assert.equal(
    (
      await request(`/api/quests/${quest.id}/check-in`, {
        index: 0,
        fix: { ...fix(q), accuracy: 100 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/quests/${quest.id}/check-in`, {
        index: 0,
        fix: fix({ ...q, lat: q.lat + 0.01 }),
      })
    ).status,
    422,
  );
  const results = await Promise.all([
    request(`/api/quests/${quest.id}/check-in`, { index: 0, fix: fix(q) }),
    request(`/api/quests/${quest.id}/check-in`, { index: 0, fix: fix(q) }),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  const p = (await request("/api/me")).body.player;
  assert.equal(p.stats.xp, 100);
  assert.equal(p.stats.quests, 1);
  assert.deepEqual(p.stats.companions, ["fernfox"]);
  assert.equal(p.activeQuest, null);
});
test("Same-place cooldown and locked companion protections", async () => {
  assert.equal(
    (
      await request("/api/quests", {
        origin: DEMO_ORIGIN,
        type: "gate",
        theme: "verdant",
        minutes: 20,
        placeIds: [DEMO_PLACES[0].id],
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/api/me", { equipped: "astradeer" }, "PATCH")).status,
    400,
  );
});
test("Completed destinations disappear from suggestions and cannot reappear later in a trail", async () => {
  const listed = (
    await request(
      `/api/places?lat=${DEMO_ORIGIN.lat}&lon=${DEMO_ORIGIN.lon}&radius=700`,
    )
  ).body.places;
  assert.ok(!listed.some((p) => p.id === DEMO_PLACES[0].id));
  assert.equal(listed.length, 2);
  assert.equal(
    (
      await request("/api/quests", {
        origin: DEMO_ORIGIN,
        type: "trail",
        theme: "verdant",
        minutes: 20,
        placeIds: [DEMO_PLACES[1].id, DEMO_PLACES[0].id, DEMO_PLACES[2].id],
      })
    ).status,
    409,
  );
});
test("Discovery needs fresh camera metadata and an observation", async () => {
  const q = await newQuest("discover", 1);
  assert.equal(
    (
      await request(`/api/quests/${q.id}/check-in`, {
        index: 0,
        fix: fix(q.checkpoints[0]),
      })
    ).status,
    400,
  );
  const photo = {
    hash: "b".repeat(64),
    width: 640,
    height: 480,
    capturedAt: clock,
  };
  assert.equal(
    (
      await request(`/api/quests/${q.id}/check-in`, {
        index: 0,
        fix: fix(q.checkpoints[0]),
        photo,
        observation: "A bright leaf.",
      })
    ).status,
    200,
  );
  const p = (await request("/api/me")).body.player;
  assert.equal(p.stats.xp, 250);
  assert.equal(p.stats.discoveries, 1);
  assert.equal(JSON.stringify(p).includes(photo.hash), false);
});
test("Leaderboard opt-in only exposes approved public fields", async () => {
  let rows = (await request("/api/leaderboard")).body.rows;
  assert.equal(rows.length, 0);
  await request("/api/me", { alias: "Explorer One", public: true }, "PATCH");
  rows = (await request("/api/leaderboard")).body.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].xp, 250);
  for (const name of [
    "token",
    "tokenHash",
    "id",
    "completed",
    "activeQuest",
    "location",
  ])
    assert.equal(rows[0][name], undefined);
});
test("Trail enforces checkpoint order and spacing; awards only at the end", async () => {
  clock += 25 * 60 * 60 * 1000;
  const q = await newQuest("trail");
  assert.equal(
    (
      await request(`/api/quests/${q.id}/check-in`, {
        index: 1,
        fix: fix(q.checkpoints[1]),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/quests/${q.id}/check-in`, {
        index: 0,
        fix: fix(q.checkpoints[0]),
      })
    ).body.completed,
    false,
  );
  assert.equal(
    (
      await request(`/api/quests/${q.id}/check-in`, {
        index: 1,
        fix: fix(q.checkpoints[1]),
      })
    ).status,
    422,
  );
  clock += 16000;
  await request(`/api/quests/${q.id}/check-in`, {
    index: 1,
    fix: fix(q.checkpoints[1]),
  });
  clock += 16000;
  const last = await request(`/api/quests/${q.id}/check-in`, {
    index: 2,
    fix: fix(q.checkpoints[2]),
  });
  assert.equal(last.body.completed, true);
  assert.equal(last.body.player.stats.xp, 500);
  assert.ok(last.body.player.stats.trophies.includes("trail"));
});
test("Expired quests cannot award XP", async () => {
  clock += 25 * 60 * 60 * 1000;
  const q = await newQuest("gate", 2);
  clock += 5 * 60 * 60 * 1000;
  assert.equal(
    (
      await request(`/api/quests/${q.id}/check-in`, {
        index: 0,
        fix: fix(q.checkpoints[0]),
      })
    ).status,
    410,
  );
});
test("Abandoning quests and invalid profile data", async () => {
  assert.equal(
    (await request("/api/quests/active", null, "DELETE")).body.player
      .activeQuest,
    null,
  );
  assert.equal(
    (await request("/api/me", { public: "yes" }, "PATCH")).status,
    400,
  );
  assert.equal((await request("/api/me", { alias: "x" }, "PATCH")).status, 400);
});
