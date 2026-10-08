export const QUEST_TYPES = {
  gate: {
    name: "Reach a gate",
    xp: 100,
    icon: "portal",
    description: "Reach one nearby mapped place and check in.",
  },
  discover: {
    name: "Make a discovery",
    xp: 150,
    icon: "camera",
    description: "Reach a mapped place and capture something you notice.",
  },
  trail: {
    name: "Follow a trail",
    xp: 250,
    icon: "route",
    description: "Check in at three nearby places, one at a time.",
  },
};
export const COMPANIONS = [
  {
    id: "fernfox",
    name: "Fernfox",
    element: "Verdant",
    rarity: "Common",
    row: 0,
    col: 0,
    description: "A little courage with leaf-shaped ears.",
    unlock: 1,
  },
  {
    id: "mosstone",
    name: "Mosstone",
    element: "Earth",
    rarity: "Uncommon",
    row: 0,
    col: 1,
    description: "Slow steps. Deep roots. Unshakable loyalty.",
    unlock: 3,
  },
  {
    id: "veilwing",
    name: "Veilwing",
    element: "Air",
    rarity: "Uncommon",
    row: 0,
    col: 2,
    description: "A quiet reminder to notice the small things.",
    unlock: 6,
  },
  {
    id: "noctowl",
    name: "Noctelle",
    element: "Moon",
    rarity: "Rare",
    row: 1,
    col: 0,
    description: "Collector of stories hidden in plain sight.",
    unlock: 10,
  },
  {
    id: "cinder",
    name: "Cinderkin",
    element: "Ember",
    rarity: "Rare",
    row: 1,
    col: 1,
    description: "Every ordinary walk starts a little spark.",
    unlock: 15,
  },
  {
    id: "astradeer",
    name: "Astradeer",
    element: "Astral",
    rarity: "Legendary",
    row: 1,
    col: 2,
    description: "The world rewards those who keep returning.",
    unlock: 25,
  },
];
export const TROPHIES = [
  {
    id: "first",
    name: "The awakening",
    text: "Finish your first quest.",
    icon: "sparkles",
    test: (s) => s.quests >= 1,
  },
  {
    id: "wanderer",
    name: "Wanderer",
    text: "Finish three quests.",
    icon: "compass",
    test: (s) => s.quests >= 3,
  },
  {
    id: "observer",
    name: "Eyes wide open",
    text: "Make three photo discoveries.",
    icon: "camera",
    test: (s) => s.discoveries >= 3,
  },
  {
    id: "trail",
    name: "Trailblazer",
    text: "Finish a checkpoint trail.",
    icon: "route",
    test: (s) => s.trails >= 1,
  },
  {
    id: "steady",
    name: "Return to the wild",
    text: "Go questing on three different days.",
    icon: "sun",
    test: (s) => (s.days?.length || 0) >= 3,
  },
  {
    id: "guild",
    name: "The rising",
    text: "Reach 1,000 XP.",
    icon: "trophy",
    test: (s) => s.xp >= 1000,
  },
];
export const RANKS = [
  { name: "E", xp: 0, title: "Awakened" },
  { name: "D", xp: 500, title: "Wayfinder" },
  { name: "C", xp: 1500, title: "Pathkeeper" },
  { name: "B", xp: 3500, title: "Gatekeeper" },
  { name: "A", xp: 7000, title: "Vanguard" },
  { name: "S", xp: 12000, title: "Ascendant" },
];
export const THEMES = { verdant: "Verdant", astral: "Astral", ember: "Ember" };
export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function coordinates(p) {
  if (
    !p ||
    !Number.isFinite(p.lat) ||
    !Number.isFinite(p.lon) ||
    Math.abs(p.lat) > 90 ||
    Math.abs(p.lon) > 180
  )
    fail("A valid latitude and longitude are required.");
  return { lat: p.lat, lon: p.lon };
}
export function distance(a, b) {
  coordinates(a);
  coordinates(b);
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
export function cleanText(value, max = 180) {
  return String(value ?? "")
    .replace(/[<>\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);
}
export function alias(value) {
  const a = cleanText(value, 20);
  if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(a))
    fail(
      "Use 2–20 letters, numbers, spaces, underscores, or dashes for your alias.",
    );
  return a;
}
export function emptyStats() {
  return {
    xp: 0,
    quests: 0,
    discoveries: 0,
    trails: 0,
    days: [],
    companions: [],
    trophies: [],
    weekXp: 0,
    week: weekKey(),
  };
}
export function progression(xp) {
  const rank = [...RANKS].reverse().find((r) => xp >= r.xp) || RANKS[0],
    next = RANKS[RANKS.indexOf(rank) + 1];
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  return {
    rank,
    nextRank: next || null,
    level,
    levelStart: 100 * (level - 1) ** 2,
    levelEnd: 100 * level ** 2,
  };
}
export function weekKey(now = Date.now()) {
  const d = new Date(now),
    day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
export function rewards(stats, quest, now = Date.now()) {
  const type = QUEST_TYPES[quest.type];
  if (!type) fail("Unknown quest type.");
  const next = structuredClone(stats);
  next.xp += type.xp;
  next.quests++;
  next.discoveries += quest.type === "discover" ? 1 : 0;
  next.trails += quest.type === "trail" ? 1 : 0;
  next.days = [...new Set([...next.days, utcDay(now)])].slice(-90);
  const week = weekKey(now);
  next.weekXp = (next.week === week ? next.weekXp : 0) + type.xp;
  next.week = week;
  next.companions = COMPANIONS.filter((c) => next.quests >= c.unlock).map(
    (c) => c.id,
  );
  next.trophies = TROPHIES.filter((t) => t.test(next)).map((t) => t.id);
  return {
    stats: next,
    xp: type.xp,
    companions: next.companions.filter((x) => !stats.companions.includes(x)),
    trophies: next.trophies.filter((x) => !stats.trophies.includes(x)),
    rankUp: progression(next.xp).rank.name !== progression(stats.xp).rank.name,
  };
}
export function validateFix(fix, now = Date.now()) {
  coordinates(fix);
  if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 65)
    fail(
      "GPS accuracy needs to be 65 m or better. Wait outdoors and try again.",
    );
  if (!Number.isFinite(fix.timestamp) || Math.abs(now - fix.timestamp) > 30000)
    fail("Get a fresh GPS fix before checking in.");
  return fix;
}
export function arrival(checkpoint, fix, now = Date.now()) {
  validateFix(fix, now);
  const meters = distance(checkpoint, fix);
  return { arrived: meters <= 80, meters, accuracy: fix.accuracy, radius: 80 };
}
export function validatePhoto(photo, issuedAt, now = Date.now()) {
  if (
    !photo ||
    !Number.isFinite(photo.capturedAt) ||
    photo.capturedAt < issuedAt ||
    Math.abs(now - photo.capturedAt) > 5 * 60 * 1000
  )
    fail("Take a fresh camera photo during this quest.");
  if (
    !/^[a-f0-9]{64}$/.test(photo.hash || "") ||
    !Number.isFinite(photo.width) ||
    !Number.isFinite(photo.height) ||
    photo.width < 320 ||
    photo.height < 240 ||
    photo.width > 4096 ||
    photo.height > 4096
  )
    fail("The camera image is too small. Capture another photo.");
  return {
    hash: photo.hash,
    capturedAt: photo.capturedAt,
    width: photo.width,
    height: photo.height,
  };
}
export function nearbyPlaces(elements, origin, radius) {
  coordinates(origin);
  const seen = new Set(),
    result = [];
  for (const e of elements || []) {
    const t = e.tags || {};
    if (
      ["private", "no", "customers", "permit"].includes(t.access) ||
      t.indoor === "yes" ||
      t.area === "no"
    )
      continue;
    const kind = t.leisure || t.tourism || t.natural || t.amenity;
    if (
      ![
        "park",
        "garden",
        "recreation_ground",
        "artwork",
        "viewpoint",
        "tree",
        "fountain",
      ].includes(kind)
    )
      continue;
    let p = e.lat !== undefined ? { lat: e.lat, lon: e.lon } : e.center;
    if (e.geometry?.length)
      p =
        e.geometry
          .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon))
          .sort((a, b) => distance(origin, a) - distance(origin, b))[0] || p;
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const meters = distance(origin, p);
    if (meters > radius) continue;
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = cleanText(
      t.name || t["name:en"] || `Nearby ${kind.replaceAll("_", " ")}`,
      70,
    );
    result.push({
      id,
      name,
      kind,
      lat: p.lat,
      lon: p.lon,
      meters: Math.round(meters),
      access: t.access || "not specified",
      source: `https://www.openstreetmap.org/${id}`,
      mapped: true,
    });
  }
  return result.sort((a, b) => a.meters - b.meters).slice(0, 18);
}
export function normalizeStory(value) {
  const raw = String(value || "");
  if (/```|\b(def |function |print\(|<script)/i.test(raw)) return null;
  const text = cleanText(raw.replace(/[*`#]/g, ""), 900).replace(/\s+/g, " ");
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((x) => x && !x.endsWith("?"))
    .slice(0, 2);
  const brief = sentences.join(" ").slice(0, 420);
  if (
    brief.length < 20 ||
    /\b(battle|defeat|fight|perilous|treacherous|attack|trespass|climb|swim|rival factions|secret passage|shortcut)\b/i.test(
      brief,
    )
  )
    return null;
  return brief;
}
export function discoveryFocus(text, kind) {
  if (["artwork", "viewpoint", "fountain"].includes(kind))
    return /sky|sunlight|cloud/i.test(text)
      ? "sky and light"
      : "a shape or texture";
  if (/leaf|leaves/i.test(text)) return "leaf shapes";
  if (/tree|canopy|branch/i.test(text)) return "a tree detail";
  if (/flower|petal/i.test(text)) return "a flower or plant";
  if (/sky|sunlight|cloud/i.test(text)) return "sky and light";
  return "a shape or texture";
}
export function buildQuest({
  id,
  places,
  type,
  theme = "verdant",
  minutes = 20,
  origin,
  narrative,
  now = Date.now(),
  demo = false,
}) {
  coordinates(origin);
  if (!QUEST_TYPES[type]) fail("Choose a valid quest type.");
  if (!THEMES[theme]) fail("Choose a valid realm.");
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 60)
    fail("Choose 10–60 minutes.");
  if (!places?.length)
    fail(
      "No eligible mapped places are available here. Try a larger search area.",
    );
  const needed = type === "trail" ? 3 : 1;
  if (places.length < needed)
    fail("A checkpoint trail needs three nearby mapped places.");
  const chosen = places.slice(0, needed);
  const phrases = {
    verdant: [
      "The Verdant Gate",
      "The Leafbound Discovery",
      "The Emerald Trail",
    ],
    astral: [
      "The Astral Gate",
      "A Starlit Discovery",
      "The Constellation Trail",
    ],
    ember: ["The Ember Gate", "The Hidden Spark", "The Cinder Trail"],
  };
  const title = phrases[theme][["gate", "discover", "trail"].indexOf(type)];
  const curated = {
    gate: "A gate is waiting in a place you might have walked past. Follow the real world, and let the story meet you there.",
    discover:
      "The smallest details hold the best stories. At your destination, photograph one thing that catches your eye.",
    trail:
      "Three places. One small adventure. Let the gaps between the checkpoints be part of the journey.",
  };
  const generated = normalizeStory(narrative?.text);
  const brief = generated || curated[type];
  const checkpoints = chosen.map((p, i) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    kind: p.kind,
    source: p.source,
    index: i,
    access: p.access || "not specified",
  }));
  let routeMeters = distance(origin, chosen[0]);
  for (let i = 1; i < chosen.length; i++)
    routeMeters += distance(chosen[i - 1], chosen[i]);
  return {
    id,
    type,
    theme,
    title,
    brief,
    minutes,
    xp: QUEST_TYPES[type].xp,
    checkpoints,
    routeMeters: Math.round(routeMeters),
    issuedAt: now,
    expiresAt: now + 4 * 60 * 60 * 1000,
    needsPhoto: type === "discover",
    focus: type === "discover" ? discoveryFocus(brief, chosen[0].kind) : null,
    demo,
    ai:
      generated && narrative?.model
        ? {
            model: cleanText(narrative.model, 100),
            runtime: cleanText(narrative.runtime, 20),
            durationMs: Math.max(
              0,
              Math.min(600000, Number(narrative.durationMs) || 0),
            ),
            revision: cleanText(narrative.revision, 64),
          }
        : null,
  };
}
export function voiceCommand(text) {
  const t = String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z ]/g, "");
  if (/\b(start|begin)\b/.test(t)) return "start";
  if (/\b(repeat|briefing)\b/.test(t)) return "repeat";
  if (/\b(status|progress)\b/.test(t)) return "status";
  if (/\b(pause|stop)\b/.test(t)) return "pause";
  if (/\b(resume|continue)\b/.test(t)) return "resume";
  if (/\b(check|arrived)\b/.test(t)) return "checkin";
  return null;
}
export const DEMO_ORIGIN = { lat: 27.7172, lon: 85.324 };
export const DEMO_PLACES = [
  {
    id: "demo/1",
    name: "The Lantern Garden",
    kind: "park",
    lat: 27.71745,
    lon: 85.3243,
    meters: 40,
    access: "rehearsal",
    mapped: false,
  },
  {
    id: "demo/2",
    name: "Mossbridge Corner",
    kind: "garden",
    lat: 27.718,
    lon: 85.325,
    meters: 130,
    access: "rehearsal",
    mapped: false,
  },
  {
    id: "demo/3",
    name: "The Starfall Grove",
    kind: "park",
    lat: 27.7184,
    lon: 85.3256,
    meters: 210,
    access: "rehearsal",
    mapped: false,
  },
];
