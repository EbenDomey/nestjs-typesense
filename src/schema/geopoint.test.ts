import { describe, expect, it } from "vitest";
import { createGeopoint, isGeopoint, parseGeopoint } from "./geopoint.js";

describe("geopoint helpers", () => {
  it("round-trips lat/lng through the stored tuple", () => {
    const point = createGeopoint(48.8584, 2.2945);

    expect(point).toEqual([48.8584, 2.2945]);
    expect(parseGeopoint(point)).toEqual({ lat: 48.8584, lng: 2.2945 });
  });

  it("round-trips back to the same tuple", () => {
    const point = createGeopoint(-33.8688, 151.2093);
    const { lat, lng } = parseGeopoint(point);

    expect(createGeopoint(lat, lng)).toEqual(point);
  });

  it("accepts the extremes of both ranges", () => {
    expect(createGeopoint(90, 180)).toEqual([90, 180]);
    expect(createGeopoint(-90, -180)).toEqual([-90, -180]);
    expect(createGeopoint(0, 0)).toEqual([0, 0]);
  });

  it("rejects a transposed pair when the latitude gives it away", () => {
    // Paris as [lng, lat] would be [2.2945, 48.8584] — valid. Sydney's longitude is past
    // 90, so the swap is detectable; this is the case the range check is worth having for.
    expect(() => createGeopoint(151.2093, -33.8688)).toThrow(RangeError);
    expect(() => createGeopoint(151.2093, -33.8688)).toThrow(/-90\.\.90/);
  });

  it("rejects out-of-range and non-finite coordinates", () => {
    expect(() => createGeopoint(91, 0)).toThrow(RangeError);
    expect(() => createGeopoint(0, 181)).toThrow(RangeError);
    expect(() => createGeopoint(Number.NaN, 0)).toThrow(TypeError);
    expect(() => createGeopoint(0, Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it("validates on the way out as well as in", () => {
    expect(() => parseGeopoint([200, 0])).toThrow(RangeError);
  });

  it("narrows unknown values", () => {
    expect(isGeopoint([1, 2])).toBe(true);
    expect(isGeopoint([1, 2, 3])).toBe(false);
    expect(isGeopoint([91, 2])).toBe(false);
    expect(isGeopoint(["1", "2"])).toBe(false);
    expect(isGeopoint(null)).toBe(false);
    expect(isGeopoint(undefined)).toBe(false);
  });
});
