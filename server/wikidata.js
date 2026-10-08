import { coordinates } from "../web/lib/domain.js";

// Urban parks deliberately exclude the broader garden/park classes, which include
// private residential gardens and indoor amusement parks. Access still needs checking.
export function wikidataQuery(origin, radius) {
  coordinates(origin);
  const lat = origin.lat.toFixed(3),
    lon = origin.lon.toFixed(3);
  const kilometers = ((Math.ceil(radius) + 90) / 1000).toFixed(3);
  return `SELECT DISTINCT ?place ?placeLabel ?coord ?kind ?ended ?created ?opened ?indoorType
  WITH {
    SELECT DISTINCT ?place ?coord ?kind WHERE {
      hint:SubQuery hint:optimizer "None" .
      SERVICE wikibase:around {
        ?place wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral;
          wikibase:radius "${kilometers}" .
      }
      VALUES (?root ?kind) {
        (wd:Q22746 "park") (wd:Q4989906 "artwork") (wd:Q483453 "fountain")
      }
      ?place wdt:P31/wdt:P279* ?root . hint:Prior hint:gearing "forward" .
    } LIMIT 60
  } AS %nearby
  WHERE {
    INCLUDE %nearby .
    OPTIONAL { ?place wdt:P576 ?ended . }
    OPTIONAL { ?place wdt:P571 ?created . }
    OPTIONAL { ?place wdt:P1619 ?opened . }
    OPTIONAL {
      ?place wdt:P276 ?location . ?location wdt:P31 ?indoorType .
      VALUES ?indoorType { wd:Q41176 wd:Q33506 wd:Q207694 wd:Q16560 wd:Q3947 }
    }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
  } LIMIT 40`;
}

// Normalize only the query's bounded destination types and known Wikidata entity IDs.
// Never trust a provider-supplied URL or unvalidated coordinate as an app destination.
export function wikidataElements(data, now = Date.now()) {
  if (!Array.isArray(data?.results?.bindings)) return null;
  const elements = [];
  for (const row of data.results.bindings.slice(0, 40)) {
    if (
      row.ended ||
      row.indoorType ||
      [row.created?.value, row.opened?.value].some(
        (date) => Date.parse(date) > now,
      )
    )
      continue;
    const id = /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(
      row.place?.value || "",
    )?.[1];
    const point = /^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(
      row.coord?.value || "",
    );
    const name = row.placeLabel?.value,
      kind = row.kind?.value;
    if (
      !id ||
      !point ||
      typeof name !== "string" ||
      !name.trim() ||
      /^Q\d+$/.test(name) ||
      !["park", "artwork", "fountain"].includes(kind)
    )
      continue;
    const lon = Number(point[1]),
      lat = Number(point[2]);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    elements.push({
      type: "wikidata",
      id,
      lat,
      lon,
      tags: {
        name,
        wikidata: id,
        ...(kind === "park"
          ? { leisure: kind }
          : kind === "fountain"
            ? { amenity: kind }
            : { tourism: kind }),
      },
    });
  }
  return elements;
}
