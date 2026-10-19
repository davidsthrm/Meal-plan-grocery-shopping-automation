import { describe, expect, it } from "vitest";
import { middleOf, readAddressSuggestions } from "./address-search";

const feature = (properties: Record<string, string>, lon = 9.88, lat = 48.22) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { countrycode: "DE", ...properties },
});

describe("readAddressSuggestions", () => {
  it("offers a house by its street and number, with its postal code and town", () => {
    const answer = {
      features: [
        feature({
          type: "house",
          osm_key: "building",
          street: "Biberacher Straße",
          housenumber: "12",
          postcode: "88471",
          city: "Laupheim",
        }),
      ],
    };
    expect(readAddressSuggestions(answer)).toEqual([
      {
        address: "Biberacher Straße 12",
        name: null,
        place: "88471 Laupheim",
        lat: 48.22,
        lon: 9.88,
      },
    ]);
  });

  it("offers a street without a number by its name", () => {
    const answer = {
      features: [
        feature({ type: "street", osm_key: "highway", name: "Ulmer Straße", postcode: "88471" }),
      ],
    };
    expect(readAddressSuggestions(answer)[0]).toMatchObject({
      address: "Ulmer Straße",
      name: null,
      place: "88471",
    });
  });

  it("names a shop OpenStreetMap knows, with its street", () => {
    const answer = {
      features: [
        feature({
          osm_key: "shop",
          type: "house",
          name: "Dilgers Hofladen",
          street: "Hauptstraße",
          housenumber: "5",
          city: "Laupheim",
        }),
      ],
    };
    // Photon calls a shop a "house" too; what it is says osm_key.
    expect(readAddressSuggestions(answer)[0]).toMatchObject({
      address: "Hauptstraße 5",
      name: "Dilgers Hofladen",
      place: "Laupheim",
    });
  });

  it("puts what lies in the household's postal code first", () => {
    const answer = {
      features: [
        feature({ type: "street", osm_key: "highway", name: "Kapellenstraße", postcode: "88480" }),
        feature({ type: "street", osm_key: "highway", name: "Kapellenstraße", postcode: "88471" }),
      ],
    };
    expect(readAddressSuggestions(answer, "88471").map((each) => each.place)).toEqual([
      "88471",
      "88480",
    ]);
  });

  it("leaves out towns, places abroad, the same address twice and broken answers", () => {
    const answer = {
      features: [
        feature({ type: "city", osm_key: "place", name: "Laupheim" }),
        feature({ type: "street", name: "Bahnhofstraße", countrycode: "AT" }),
        feature({ type: "street", name: "Bahnhofstraße", city: "Laupheim" }),
        feature({ type: "street", name: "Bahnhofstraße", city: "Laupheim" }, 9.9, 48.23),
        { properties: { street: "Ohne Ort" } },
      ],
    };
    expect(readAddressSuggestions(answer).map((each) => each.address)).toEqual(["Bahnhofstraße"]);
    expect(readAddressSuggestions(null)).toEqual([]);
    expect(readAddressSuggestions({ features: "nein" })).toEqual([]);
  });

  it("offers five at most", () => {
    const answer = {
      features: Array.from({ length: 8 }, (_, at) =>
        feature({ type: "house", street: "Kirchweg", housenumber: String(at + 1) }),
      ),
    };
    expect(readAddressSuggestions(answer)).toHaveLength(5);
  });
});

describe("middleOf", () => {
  it("is the middle of the places, or none without any", () => {
    expect(
      middleOf([
        { lat: 48, lon: 9 },
        { lat: 49, lon: 10 },
      ]),
    ).toEqual({ lat: 48.5, lon: 9.5 });
    expect(middleOf([])).toBeNull();
  });
});
