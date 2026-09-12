import { describe, expect, it } from "vitest";
import { defineCollection } from "../schema/collection.js";
import { field } from "../schema/field.js";
import { compileFilter } from "./compile-filter.js";

const videos = defineCollection({
  name: "videos",
  fields: {
    title: field.string(),
    channel: field.string({ facet: true }),
    durationMs: field.int32({ sort: true }),
    rating: field.float(),
    published: field.bool(),
    tags: field.stringArray({ facet: true }),
    location: field.geopoint(),
  },
  defaultSortingField: "durationMs",
});

type Filter = Parameters<typeof compileFilter<typeof videos>>[0];
const compile = (f: Filter): string => compileFilter<typeof videos>(f);

describe("compileFilter", () => {
  it("ANDs the entries of one object", () => {
    expect(compile({ channel: "pets", published: true })).toBe(
      "channel:=`pets` && published:=true",
    );
  });

  it("treats a bare value as equality and a bare array as any-of", () => {
    expect(compile({ channel: "pets" })).toBe("channel:=`pets`");
    expect(compile({ channel: ["pets", "diy"] })).toBe("channel:=[`pets`,`diy`]");
    expect(compile({ durationMs: 60_000 })).toBe("durationMs:=60000");
  });

  it("renders the numeric comparisons", () => {
    expect(compile({ durationMs: { gt: 1, gte: 2, lt: 3, lte: 4 } })).toBe(
      "durationMs:>1 && durationMs:>=2 && durationMs:<3 && durationMs:<=4",
    );
    expect(compile({ rating: { between: [1.5, 4.5] } })).toBe("rating:[1.5..4.5]");
  });

  it("renders string equality, negation and token match distinctly", () => {
    expect(compile({ title: { eq: "a" } })).toBe("title:=`a`");
    expect(compile({ title: { ne: "a" } })).toBe("title:!=`a`");
    expect(compile({ title: { ne: ["a", "b"] } })).toBe("title:!=[`a`,`b`]");
    expect(compile({ title: { match: "a" } })).toBe("title:`a`");
  });

  it("renders array membership, with hasAll grouped", () => {
    expect(compile({ tags: { has: "music" } })).toBe("tags:=`music`");
    expect(compile({ tags: { hasAny: ["music", "live"] } })).toBe("tags:=[`music`,`live`]");
    // No "contains all" operator exists; it becomes one clause per value, parenthesised so
    // it survives being ORed with something else.
    expect(compile({ tags: { hasAll: ["music", "live"] } })).toBe(
      "(tags:=`music` && tags:=`live`)",
    );
  });

  it("renders geo radius and polygon", () => {
    expect(compile({ location: { near: { lat: 48.85, lng: 2.29, radius: 5 } } })).toBe(
      "location:(48.85, 2.29, 5 km)",
    );
    expect(compile({ location: { near: { lat: 48.85, lng: 2.29, radius: 3, unit: "mi" } } })).toBe(
      "location:(48.85, 2.29, 3 mi)",
    );
    expect(
      compile({
        location: {
          within: [
            [48.8, 2.2],
            [48.9, 2.3],
            [48.7, 2.4],
          ],
        },
      }),
    ).toBe("location:(48.8, 2.2, 48.9, 2.3, 48.7, 2.4)");
  });

  it("parenthesises $or so it cannot bind against its sibling clauses", () => {
    expect(
      compile({ published: true, $or: [{ channel: "pets" }, { durationMs: { lt: 10 } }] }),
    ).toBe("published:=true && (channel:=`pets` || durationMs:<10)");
  });

  it("nests groups", () => {
    expect(
      compile({
        $or: [{ $and: [{ channel: "pets" }, { published: true }] }, { durationMs: { gt: 100 } }],
      }),
    ).toBe("((channel:=`pets` && published:=true) || durationMs:>100)");
  });

  it("skips undefined values so optional query inputs need no branching", () => {
    const channel: string | undefined = undefined;
    expect(compile({ published: true, channel })).toBe("published:=true");
    expect(compile({ durationMs: { gt: undefined, lt: 5 } })).toBe("durationMs:<5");
  });

  it("returns an empty string for an empty expression", () => {
    expect(compile({})).toBe("");
    expect(compile({ $or: [] })).toBe("");
  });

  it("backtick-wraps strings so a value cannot break out of the expression", () => {
    // Without wrapping, each of these would be read as filter syntax rather than data.
    expect(compile({ channel: "pets && published:=false" })).toBe(
      "channel:=`pets && published:=false`",
    );
    expect(compile({ channel: "a,b" })).toBe("channel:=`a,b`");
    expect(compile({ channel: "with space" })).toBe("channel:=`with space`");
    expect(compile({ channel: "quote'and\"double" })).toBe("channel:=`quote'and\"double`");
  });

  it("refuses a value containing a backtick rather than emitting a broken filter", () => {
    expect(() => compile({ channel: "a`b" })).toThrow(/backtick/);
  });

  it("rejects empty lists and degenerate polygons", () => {
    expect(() => compile({ tags: { hasAny: [] } })).toThrow(/empty/);
    expect(() => compile({ tags: { hasAll: [] } })).toThrow(/empty/);
    expect(() =>
      compile({
        location: {
          within: [
            [1, 1],
            [2, 2],
          ],
        },
      }),
    ).toThrow(/at least 3 points/);
  });

  it("names an unknown operator, for JavaScript callers the types cannot reach", () => {
    expect(() => compile({ channel: { contains: "x" } } as never)).toThrow(
      /Unknown filter operator "contains" on field "channel"/,
    );
  });
});
