import pg from "pg";
import { fail } from "../web/lib/domain.js";
export async function createPostgresStore(
  connectionString,
  { pool: providedPool } = {},
) {
  const pool =
    providedPool ||
    new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  await pool.query(
    "CREATE TABLE IF NOT EXISTS ascend_players (id text PRIMARY KEY, token_hash text UNIQUE NOT NULL, document jsonb NOT NULL)",
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS ascend_public_xp ON ascend_players (((document->'stats'->>'xp')::integer) DESC) WHERE document->>'public' = 'true'",
  );
  return {
    kind: "postgres",
    durable: true,
    async create(p) {
      p.version = 0;
      await pool.query(
        "INSERT INTO ascend_players (id,token_hash,document) VALUES ($1,$2,$3::jsonb)",
        [p.id, p.tokenHash, JSON.stringify(p)],
      );
      return p;
    },
    async auth(tokenHash) {
      return (
        (
          await pool.query(
            "SELECT document FROM ascend_players WHERE token_hash=$1",
            [tokenHash],
          )
        ).rows[0]?.document || null
      );
    },
    async get(id) {
      return (
        (
          await pool.query("SELECT document FROM ascend_players WHERE id=$1", [
            id,
          ])
        ).rows[0]?.document || null
      );
    },
    async update(id, mutate) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const p = (
          await client.query(
            "SELECT document FROM ascend_players WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0]?.document;
        if (!p) fail("Player not found.", 404);
        const result = mutate(p);
        p.version = (p.version || 0) + 1;
        await client.query(
          "UPDATE ascend_players SET document=$1::jsonb WHERE id=$2",
          [JSON.stringify(p), id],
        );
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async publicPlayers() {
      return (
        await pool.query(
          "SELECT document FROM ascend_players WHERE document->>'public'='true' ORDER BY (document->'stats'->>'xp')::integer DESC LIMIT 5000",
        )
      ).rows.map((r) => r.document);
    },
    async purgeExpired(now) {
      await pool.query(
        "UPDATE ascend_players SET document=jsonb_set(document,'{activeQuest}','null'::jsonb) WHERE (document->'activeQuest'->>'expiresAt')::bigint < $1",
        [now],
      );
    },
    async close() {
      await pool.end();
    },
  };
}
