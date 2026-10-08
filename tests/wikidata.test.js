import test from "node:test";
import assert from "node:assert/strict";
import { wikidataElements } from "../server/wikidata.js";
import { nearbyPlaces } from "../web/lib/domain.js";

test("Wikidata normalization rejects untrusted IDs, coordinates, labels, and destination types", () => {
  const valid = {
    place: { value: "http://www.wikidata.org/entity/Q123" },
    placeLabel: { value: "Public Monument" },
    coord: { value: "Point(-0.1276 51.5072)" },
    kind: { value: "artwork" },
  };
  const rows = [
    valid,
    { ...valid, ended: { value: "2000-01-01T00:00:00Z" } },
    { ...valid, created: { value: "2099-01-01T00:00:00Z" } },
    { ...valid, opened: { value: "2099-01-01T00:00:00Z" } },
    {
      ...valid,
      indoorType: { value: "http://www.wikidata.org/entity/Q33506" },
    },
    { ...valid, place: { value: "https://evil.example/Q123" } },
    { ...valid, coord: { value: "Point(190 100)" } },
    { ...valid, coord: { value: "not a point" } },
    { ...valid, kind: { value: "garden" } },
    { ...valid, placeLabel: { value: "Q999" } },
    { ...valid, placeLabel: { value: "" } },
  ];
  const elements = wikidataElements({ results: { bindings: rows } });
  assert.equal(elements.length, 1);
  assert.equal(wikidataElements({ error: "unavailable" }), null);
  const origin = { lat: 51.5072, lon: -0.1276 };
  const places = nearbyPlaces(
    [
      {
        type: "node",
        id: 1,
        ...origin,
        tags: { tourism: "artwork", name: "Public Monument", wikidata: "Q123" },
      },
      ...elements,
    ],
    origin,
    700,
  );
  assert.equal(places.length, 1);
  assert.equal(places[0].cooldownId, "wikidata/Q123");
  assert.equal(places[0].source, "https://www.openstreetmap.org/node/1");
  assert.deepEqual(
    nearbyPlaces([{ ...elements[0], id: "../../bad" }], origin, 700),
    [],
  );
});
