import { coordinates, nearbyPlaces, fail } from "../web/lib/domain.js";

const BUSY =
  "The public map service is busy. Your progress is safe. Try again shortly, or explore the rehearsal.";
// Separate clients make tests isolated; the production client shares caches and upstream limits.
export function createPlaceDiscovery({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    inflight = new Map();
  const upstreams = [
    {
      url: "https://overpass.private.coffee/api/interpreter",
      dailyLimit: 1000,
      byteLimit: 50_000_000,
    },
    {
      url: "https://overpass-api.de/api/interpreter",
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
    const query = `[out:json][timeout:18];(nwr(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[leisure~"^(park|garden|recreation_ground)$"];nwr(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[tourism~"^(artwork|viewpoint)$"];node(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[natural=tree][name];node(around:${Math.ceil(radius) + 90},${origin.lat.toFixed(3)},${origin.lon.toFixed(3)})[amenity=fountain];);out tags center geom;`;
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
      try {
        let response = await fetchImpl(
          upstream.url + "?" + new URLSearchParams({ data: query }),
          {
            method: "GET",
            headers: {
              "User-Agent":
                "ASCEND/1.0 (+https://github.com/faraz-shamim/ascend)",
            },
            signal: AbortSignal.timeout(22000),
          },
        );
        if (
          !response.ok &&
          response.status >= 500 &&
          upstream.requests < upstream.dailyLimit
        ) {
          console.warn(
            "ASCEND map upstream",
            JSON.stringify({
              host: new URL(upstream.url).host,
              method: "GET",
              status: response.status,
            }),
          );
          upstream.requests++;
          response = await fetchImpl(upstream.url, {
            method: "POST",
            body: new URLSearchParams({ data: query }),
            headers: {
              "User-Agent":
                "ASCEND/1.0 (+https://github.com/faraz-shamim/ascend)",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            signal: AbortSignal.timeout(22000),
          });
        }
        if (!response.ok) {
          console.warn(
            "ASCEND map upstream",
            JSON.stringify({
              host: new URL(upstream.url).host,
              status: response.status,
            }),
          );
          const retry = Number(response.headers?.get("retry-after"));
          upstream.blockedUntil =
            now() +
            Math.max(
              response.status === 429 || response.status === 406
                ? 30_000
                : 10_000,
              Number.isFinite(retry) ? Math.min(retry * 1000, 86_400_000) : 0,
            );
          continue;
        }
        const raw = await response.text();
        upstream.bytes += Buffer.byteLength(raw);
        if (upstream.bytes > upstream.byteLimit) continue;
        const data = JSON.parse(raw);
        if (!Array.isArray(data.elements)) continue;
        if (cache.size >= 128) cache.delete(cache.keys().next().value);
        cache.set(key, { at: now(), elements: data.elements });
        return data.elements;
      } catch (error) {
        console.warn(
          "ASCEND map upstream",
          JSON.stringify({
            host: new URL(upstream.url).host,
            error: error.name,
            code: error.cause?.code,
          }),
        );
        upstream.blockedUntil = now() + 10_000;
      }
    }
    fail(BUSY, 503);
  }
  return async function discoverPlaces(origin, radius = 800) {
    coordinates(origin);
    if (!Number.isFinite(radius) || radius < 200 || radius > 2500)
      fail("Search radius must be between 200 and 2,500 metres.");
    // Round the upstream center to ~100 m and pad its query; filter against the actual origin.
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
