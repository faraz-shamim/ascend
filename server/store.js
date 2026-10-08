import { createPostgresStore } from "./postgres-store.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MongoClient } from "mongodb";
import { fail } from "../web/lib/domain.js";
export async function createStore(options = {}) {
  const connectionString =
    options.databaseUrl ??
    (options.path ? undefined : process.env.DATABASE_URL);
  if (connectionString) return createPostgresStore(connectionString);
  const uri =
    options.uri ?? (options.path ? undefined : process.env.MONGODB_URI);
  if (uri) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 12000,
    });
    await client.connect();
    const collection = client
      .db(options.database || process.env.MONGODB_DATABASE || "ascend")
      .collection("players");
    await collection.createIndex({ tokenHash: 1 }, { unique: true });
    return {
      kind: "mongodb",
      durable: true,
      async create(p) {
        await collection.insertOne({ _id: p.id, ...p, version: 0 });
        return p;
      },
      async auth(hash) {
        return collection.findOne(
          { tokenHash: hash },
          { projection: { _id: 0 } },
        );
      },
      async get(id) {
        return collection.findOne({ id }, { projection: { _id: 0 } });
      },
      async update(id, mutate) {
        for (let i = 0; i < 5; i++) {
          const p = await this.get(id);
          if (!p) fail("Player not found.", 404);
          const result = mutate(p);
          const version = p.version || 0;
          p.version = version + 1;
          const changed = await collection.replaceOne(
            { id, version: p.version - 1 },
            { ...p, _id: p.id },
          );
          if (changed.modifiedCount) return result;
        }
        fail("Another check-in is finishing. Please try again.", 409);
      },
      async publicPlayers() {
        return collection
          .find(
            { public: true },
            { projection: { _id: 0, id: 1, alias: 1, stats: 1 } },
          )
          .limit(5000)
          .toArray();
      },
      async purgeExpired(now) {
        await collection.updateMany(
          { "activeQuest.expiresAt": { $lt: now } },
          { $set: { activeQuest: null }, $inc: { version: 1 } },
        );
      },
      async close() {
        await client.close();
      },
    };
  }
  const path =
    options.path || process.env.SQLITE_PATH || ".runtime/ascend.sqlite";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, document TEXT NOT NULL);",
  );
  return {
    kind: "sqlite",
    durable: !process.env.RENDER,
    async create(p) {
      p.version = 0;
      db.prepare("INSERT INTO players VALUES (?, ?, ?)").run(
        p.id,
        p.tokenHash,
        JSON.stringify(p),
      );
      return p;
    },
    async auth(hash) {
      const row = db
        .prepare("SELECT document FROM players WHERE token_hash = ?")
        .get(hash);
      return row ? JSON.parse(row.document) : null;
    },
    async get(id) {
      const row = db
        .prepare("SELECT document FROM players WHERE id = ?")
        .get(id);
      return row ? JSON.parse(row.document) : null;
    },
    async update(id, mutate) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db
          .prepare("SELECT document FROM players WHERE id = ?")
          .get(id);
        if (!row) fail("Player not found.", 404);
        const p = JSON.parse(row.document),
          result = mutate(p);
        p.version++;
        db.prepare("UPDATE players SET document = ? WHERE id = ?").run(
          JSON.stringify(p),
          id,
        );
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async publicPlayers() {
      return db
        .prepare("SELECT document FROM players")
        .all()
        .map((x) => JSON.parse(x.document))
        .filter((p) => p.public)
        .slice(0, 5000);
    },
    async purgeExpired(now) {
      const rows = db.prepare("SELECT id,document FROM players").all();
      for (const row of rows) {
        const p = JSON.parse(row.document);
        if (p.activeQuest?.expiresAt < now) {
          p.activeQuest = null;
          p.version++;
          db.prepare("UPDATE players SET document=? WHERE id=?").run(
            JSON.stringify(p),
            row.id,
          );
        }
      }
    },
    async close() {
      db.close();
    },
  };
}
