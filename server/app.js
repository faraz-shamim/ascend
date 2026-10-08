import express from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { createStore } from "./store.js";
import { discoverPlaces } from "./places.js";
import {
  alias,
  emptyStats,
  buildQuest,
  arrival,
  validatePhoto,
  rewards,
  fail,
  cleanText,
  progression,
  weekKey,
  utcDay,
} from "../web/lib/domain.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const placeHashes = (place) =>
  [...new Set([place.id, place.cooldownId || place.id])].map(hash);
export function publicPlayer(p) {
  return {
    id: p.id,
    alias: p.alias,
    public: p.public,
    stats: p.stats,
    activeQuest: p.activeQuest || null,
    equipped: p.equipped || null,
    createdAt: p.createdAt,
  };
}
export async function createApp(options = {}) {
  const store = options.store || (await createStore());
  const discover = options.discover || discoverPlaces;
  const now = options.now || (() => Date.now());
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "24kb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Device APIs retain their default same-origin allowlists. The explicit header
    // caused camera tracks to end in the release browser compatibility check.
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    next();
  });
  const windows = new Map();
  app.use("/api", (req, res, next) => {
    const key = req.ip || "local",
      window = windows.get(key) || { at: now(), count: 0 };
    if (now() - window.at > 60000) {
      window.at = now();
      window.count = 0;
    }
    window.count++;
    windows.set(key, window);
    if (windows.size > 10000) windows.delete(windows.keys().next().value);
    if (window.count > 90) {
      res.setHeader("Retry-After", "60");
      return res
        .status(429)
        .json({ error: "Take a breath. Please try again in a minute." });
    }
    next();
  });
  const auth = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        fail(
          "Your explorer session is missing. Reconnect from the profile page.",
          401,
        );
      req.player = await store.auth(hash(token));
      if (!req.player)
        fail(
          "This explorer session is no longer available. Restore your session or create a new explorer.",
          401,
        );
      next();
    } catch (e) {
      next(e);
    }
  };
  app.get("/api/health", (req, res) =>
    res.json({
      ok: true,
      app: "ASCEND",
      storage: store.kind,
      durable: store.durable,
      model: "browser-local Gemma 3",
      version: "1.0.0",
      commit: process.env.RENDER_GIT_COMMIT || null,
    }),
  );
  app.post("/api/players", async (req, res, next) => {
    try {
      const token = randomBytes(32).toString("hex"),
        p = {
          id: randomUUID(),
          tokenHash: hash(token),
          alias: alias(req.body.alias || "Wanderer"),
          public: false,
          stats: emptyStats(),
          activeQuest: null,
          equipped: null,
          completed: [],
          createdAt: now(),
        };
      await store.create(p);
      res.status(201).json({ token, player: publicPlayer(p) });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/me", auth, (req, res) =>
    res.json({ player: publicPlayer(req.player) }),
  );
  app.patch("/api/me", auth, async (req, res, next) => {
    try {
      const updated = await store.update(req.player.id, (p) => {
        if (req.body.alias !== undefined) p.alias = alias(req.body.alias);
        if (req.body.public !== undefined) {
          if (typeof req.body.public !== "boolean")
            fail("Choose whether to appear in rankings.");
          p.public = req.body.public;
        }
        if (req.body.equipped !== undefined) {
          if (
            req.body.equipped !== null &&
            !p.stats.companions.includes(req.body.equipped)
          )
            fail("This companion has not been unlocked yet.");
          p.equipped = req.body.equipped;
        }
        return publicPlayer(p);
      });
      res.json({ player: updated });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/places", auth, async (req, res, next) => {
    try {
      const origin = { lat: Number(req.query.lat), lon: Number(req.query.lon) },
        radius = Number(req.query.radius || 800),
        result = await discover(origin, radius);
      const used = new Set(
        req.player.completed
          .filter((x) => x.at > now() - 24 * 60 * 60 * 1000)
          .flatMap((x) => x.places),
      );
      res.json({
        ...result,
        places: result.places.filter((p) =>
          placeHashes(p).every((id) => !used.has(id)),
        ),
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/places", auth, async (req, res, next) => {
    try {
      const origin = req.body.origin,
        radius = Number(req.body.radius || 800),
        result = await discover(origin, radius);
      const used = new Set(
        req.player.completed
          .filter((x) => x.at > now() - 24 * 60 * 60 * 1000)
          .flatMap((x) => x.places),
      );
      res.json({
        ...result,
        places: result.places.filter((p) =>
          placeHashes(p).every((id) => !used.has(id)),
        ),
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/quests", auth, async (req, res, next) => {
    try {
      const { origin, type, theme, minutes, narrative, placeIds } = req.body;
      if (!origin) fail("Find your nearby places first.");
      if (!Number.isInteger(minutes) || minutes < 10 || minutes > 60)
        fail("Choose 10–60 minutes.");
      const radius = Math.min(2500, Math.max(200, minutes * 35));
      const result = await discover(origin, radius);
      const selected =
        Array.isArray(placeIds) && placeIds.length
          ? placeIds
              .map((id) => result.places.find((p) => p.id === id))
              .filter(Boolean)
          : result.places;
      const quest = buildQuest({
        id: randomUUID(),
        places: selected,
        type,
        theme,
        minutes,
        origin,
        narrative,
        now: now(),
      });
      const player = await store.update(req.player.id, (p) => {
        const day = utcDay(now()),
          recent = p.completed.filter(
            (x) => x.at > now() - 24 * 60 * 60 * 1000,
          );
        if (recent.filter((x) => utcDay(x.at) === day).length >= 8)
          fail(
            "Eight adventures in one day is plenty. New quests are waiting tomorrow.",
            429,
          );
        if (
          recent.some((x) =>
            quest.checkpoints.some((c) =>
              placeHashes(c).some((id) => x.places.includes(id)),
            ),
          )
        )
          fail(
            "This place was already explored today. Choose a new place or return tomorrow.",
            409,
          );
        quest.index = 0;
        quest.checkIns = [];
        p.activeQuest = quest;
        return publicPlayer(p);
      });
      res.status(201).json({ quest: player.activeQuest, player });
    } catch (e) {
      next(e);
    }
  });
  app.delete("/api/quests/active", auth, async (req, res, next) => {
    try {
      const player = await store.update(req.player.id, (p) => {
        p.activeQuest = null;
        return publicPlayer(p);
      });
      res.json({ player });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/quests/:id/check-in", auth, async (req, res, next) => {
    try {
      const result = await store.update(req.player.id, (p) => {
        if (p.lastClaim?.id === req.params.id)
          return {
            completed: true,
            reward: p.lastClaim.reward,
            player: publicPlayer(p),
            duplicate: true,
          };
        const q = p.activeQuest;
        if (!q || q.id !== req.params.id)
          fail("This quest is no longer active.", 404);
        if (q.expiresAt < now())
          fail("This quest has expired. Generate a fresh adventure.", 410);
        if (!Number.isInteger(req.body.index) || req.body.index !== q.index)
          fail(
            "This checkpoint was already checked in, or is not the next checkpoint.",
            409,
          );
        const checkpoint = q.checkpoints[q.index],
          check = arrival(checkpoint, req.body.fix, now());
        if (!check.arrived)
          fail(
            `You are ${Math.round(check.meters)} m away. Check in within 80 m of the mapped location.`,
            422,
          );
        const isLast = q.index === q.checkpoints.length - 1;
        if (isLast && q.needsPhoto) {
          validatePhoto(req.body.photo, q.issuedAt, now());
          if (cleanText(req.body.observation, 240).length < 5)
            fail("Add a few words about your discovery.");
        }
        if (q.index > 0) {
          const previous = q.checkIns.at(-1);
          if (now() - previous.at < 15000)
            fail(
              "Checkpoints need at least 15 seconds between check-ins.",
              422,
            );
        }
        q.checkIns.push({
          at: now(),
          meters: Math.round(check.meters),
          accuracy: Math.round(check.accuracy),
        });
        q.index++;
        if (!isLast)
          return { completed: false, quest: q, player: publicPlayer(p) };
        const reward = rewards(p.stats, q, now());
        p.stats = reward.stats;
        p.completed.push({
          id: q.id,
          at: now(),
          type: q.type,
          places: [...new Set(q.checkpoints.flatMap(placeHashes))],
        });
        p.completed = p.completed.slice(-500);
        p.activeQuest = null;
        if (!p.equipped && p.stats.companions.length)
          p.equipped = p.stats.companions[0];
        p.lastClaim = {
          id: q.id,
          reward: {
            xp: reward.xp,
            companions: reward.companions,
            trophies: reward.trophies,
            rankUp: reward.rankUp,
          },
        };
        return {
          completed: true,
          reward: p.lastClaim.reward,
          player: publicPlayer(p),
        };
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/leaderboard", async (req, res, next) => {
    try {
      const weekly = req.query.period === "week",
        week = weekKey(now()),
        players = await store.publicPlayers();
      const rows = players
        .map((p) => ({
          alias: p.alias,
          xp: weekly
            ? p.stats.week === week
              ? p.stats.weekXp
              : 0
            : p.stats.xp,
          totalXp: p.stats.xp,
          quests: p.stats.quests,
          rank: progression(p.stats.xp).rank.name,
          companions: p.stats.companions.length,
        }))
        .sort(
          (a, b) =>
            b.xp - a.xp ||
            b.quests - a.quests ||
            a.alias.localeCompare(b.alias),
        )
        .slice(0, 50)
        .map((p, i) => ({ ...p, position: i + 1 }));
      res.json({
        rows,
        period: weekly ? "week" : "all",
        week,
        storage: store.kind,
        durable: store.durable,
      });
    } catch (e) {
      next(e);
    }
  });
  if (options.vite) app.use(options.vite.middlewares);
  else if (options.staticDir) {
    app.use(express.static(options.staticDir, { maxAge: "1h" }));
    app.get("/{*path}", (req, res) =>
      res.sendFile(resolve(options.staticDir, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    res.status(status).json({
      error:
        error.expose || status < 500
          ? error.message
          : "The guild is temporarily unavailable. Your saved progress is safe.",
    });
    if (status >= 500) console.error("ASCEND server error:", error.message);
  });
  return { app, store };
}
