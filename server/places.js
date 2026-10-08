import { coordinates, nearbyPlaces, fail } from "../web/lib/domain.js";
import { wikidataQuery, wikidataElements } from "./wikidata.js";

const BUSY =
  "The public map service is busy. Your progress is safe. Try again shortly, or explore the rehearsal.";
// Separate clients make tests isolated; production shares caches and upstream limits.
export function createPlaceDiscovery({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    inflight = new Map();
  const upstreams = [
    {
      url: "https://overpass.private.coffee/api/interpreter",
      method: "POST",
      dailyLimit: 1000,
      byteLimit: 50_000_000,
    },
    {
      url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      method: "GET",
      dailyLimit: 500,
      byteLimit: 25_000_000,
    },
    // This independent open-data source also works when the Overpass gateways are unavailable.
    {
      url: "https://query.wikidata.org/sparql",
      method: "GET",
      kind: "wikidata",
      minimumInterval: 30000,
      dailyLimit: 100,
      byteLimit: 10_000_000,
    },
    {
      url: "https://overpass-api.de/api/interpreter",
      method: "POST",
      dailyLimit: 100,
      byteLimit: 10_000_000,
    },
  ].map((config) => ({
    ...config,
    day: "",
    requests: 0,
    bytes: 0,
    blockedUntil: 0,
  }));
  let queue = Promise.resolve();
  async function lookup(origin, radius, key) {
    const query = `[out:json][timeout:18][maxsize:67108864];(nwr(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[leisure~"^(park|garden|recreation_ground)$"];nwr(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[tourism~"^(artwork|viewpoint)$"];node(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[natural=tree][name];node(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[amenity=fountain];);out tags center geom;`;
    let emptyResult = null;
    for (const upstream of upstreams) {
      const day = new Date(now()).toISOString().slice(0, 10);
      if (upstream.day !== day)
        Object.assign(upstream, { day, requests: 0, bytes: 0 });
      if (
        now() < upstream.blockedUntil ||
        upstream.requests >= upstream.dailyLimit ||
        upstream.bytes >= upstream.byteLimit
      )
        continue;
      upstream.requests++;
      if (upstream.minimumInterval)
        upstream.blockedUntil = now() + upstream.minimumInterval;
      try {
        const params = new URLSearchParams(
          upstream.kind === "wikidata"
            ? { query: wikidataQuery(origin, radius), format: "json" }
            : { data: query },
        );
        const url =
          upstream.method === "GET"
            ? upstream.url + "?" + params
            : upstream.url;
        const response = await fetchImpl(url, {
          method: upstream.method,
          ...(upstream.method === "POST" ? { body: params } : {}),
          headers: {
            "User-Agent":
              "ASCEND/1.0 (+https://github.com/faraz-shamim/ascend)",
            "Content-Type": "application/x-www-form-urlencoded",
            Accept:
              upstream.kind === "wikidata"
                ? "application/sparql-results+json"
                : "application/json",
          },
          signal: AbortSignal.timeout(
            upstream.kind === "wikidata" ? 25000 : 35000,
          ),
        });
        if (!response.ok) {
          const rejection = await response.text().catch(() => "");
          upstream.bytes += Buffer.byteLength(rejection);
          const reason = /timed out|timeout/i.test(rejection)
            ? "query-timeout"
            : /dispatcher|quota|resource|not enough/i.test(rejection)
              ? "resource-unavailable"
              : /<html|<!doctype/i.test(rejection)
                ? "provider-html-error"
                : "provider-response-error";
          console.warn(
            "ASCEND map upstream",
            JSON.stringify({
              host: new URL(upstream.url).host,
              status: response.status,
              reason,
            }),
          );
          const retry = Number(response.headers?.get("retry-after"));
          upstream.blockedUntil = Math.max(
            upstream.blockedUntil,
            now() +
              Math.max(
                response.status === 429 ||
                  response.status === 406 ||
                  response.status >= 500
                  ? 30000
                  : 10000,
                Number.isFinite(retry) ? Math.min(retry * 1000, 86400000) : 0,
              ),
          );
          continue;
        }
        const raw = await response.text();
        upstream.bytes += Buffer.byteLength(raw);
        if (upstream.bytes > upstream.byteLimit) continue;
        const data = JSON.parse(raw);
        const elements =
          upstream.kind === "wikidata"
            ? wikidataElements(data, now())
            : data.elements;
        if (!Array.isArray(elements)) continue;
        // An empty valid map is different from an outage; another source may have coverage.
        if (!nearbyPlaces(elements, origin, radius).length) {
          emptyResult = elements;
          continue;
        }
        return remember(key, elements);
      } catch (error) {
        console.warn(
          "ASCEND map upstream",
          JSON.stringify({
            host: new URL(upstream.url).host,
            error: error.name,
            code: error.cause?.code,
          }),
        );
        upstream.blockedUntil = Math.max(upstream.blockedUntil, now() + 10000);
      }
    }
    if (emptyResult) return remember(key, emptyResult);
    fail(BUSY, 503);
  }
  function remember(key, elements) {
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), elements });
    return elements;
  }
  return async function discoverPlaces(origin, radius = 800) {
    coordinates(origin);
    if (!Number.isFinite(radius) || radius < 200 || radius > 2500)
      fail("Search radius must be between 200 and 2,500 metres.");
    // Round the upstream center to ~100 m and pad it; filter against the actual origin.
    const key = `${origin.lat.toFixed(3)},${origin.lon.toFixed(3)},${Math.ceil(radius)}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < 15 * 60 * 1000)
      return {
        places: nearbyPlaces(cached.elements, origin, radius),
        cached: true,
      };
    if (!inflight.has(key)) {
      // Serialize upstream queries across all explorers and coalesce duplicate searches.
      const job = queue.catch(() => {}).then(() => lookup(origin, radius, key));
      queue = job;
      inflight.set(key, job);
      job.finally(() => inflight.delete(key)).catch(() => {});
    }
    const elements = await inflight.get(key);
    return { places: nearbyPlaces(elements, origin, radius), cached: false };
  };
}
export const discoverPlaces = createPlaceDiscovery();
