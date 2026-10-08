import { resolve } from "node:path";
import { createApp } from "./app.js";
const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
let vite;
if (!production) {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
}
const { app, store } = await createApp({
  vite,
  staticDir: production ? resolve("dist") : null,
});
const port = Number(process.env.PORT || 4174);
const server = app.listen(port, production ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(
    `ASCEND ready at http://127.0.0.1:${port}; storage=${store.kind}; durable=${store.durable}`,
  ),
);
const cleanup = setInterval(
  () => store.purgeExpired?.(Date.now()).catch(() => {}),
  15 * 60 * 1000,
);
cleanup.unref();
async function stop() {
  clearInterval(cleanup);
  server.close();
  await store.close();
  await vite?.close();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
