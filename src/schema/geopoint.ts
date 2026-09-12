import type { TypesenseFieldTypeMap } from "./field.js";

/** A Typesense geopoint: the positional `[latitude, longitude]` pair it stores. */
export type Geopoint = TypesenseFieldTypeMap["geopoint"];

/** The same point with its ends named. */
export interface LatLng {
  lat: number;
  lng: number;
}

const LAT_RANGE = 90;
const LNG_RANGE = 180;

function assertInRange(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError(`Geopoint must be two finite numbers, received [${lat}, ${lng}]`);
  }
  if (Math.abs(lat) > LAT_RANGE) {
    throw new RangeError(`Latitude ${lat} is outside -90..90. Did you pass [lng, lat]?`);
  }
  if (Math.abs(lng) > LNG_RANGE) {
    // No transposition hint here: a real latitude is always <= 90, so a swapped pair can
    // never overflow the longitude range. Only the latitude check above can catch one.
    throw new RangeError(`Longitude ${lng} is outside -180..180`);
  }
}

/**
 * Builds the `[lat, lng]` tuple Typesense stores.
 *
 * The tuple is positional, so a transposed pair stays a structurally valid geopoint and
 * only shows up later as matches from the wrong hemisphere. Naming the arguments removes
 * the guess, and the range check catches the transposition outright whenever the latitude
 * exceeds 90 — which covers most of the populated longitudes.
 */
export function createGeopoint(lat: number, lng: number): Geopoint {
  assertInRange(lat, lng);
  return [lat, lng];
}

/** Reads a stored geopoint back into named coordinates. */
export function parseGeopoint(point: Geopoint): LatLng {
  const [lat, lng] = point;
  assertInRange(lat, lng);
  return { lat, lng };
}

/** Narrows an unknown value to a geopoint. Useful when mapping loosely typed source rows. */
export function isGeopoint(value: unknown): value is Geopoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= LAT_RANGE &&
    Math.abs(value[1]) <= LNG_RANGE
  );
}
