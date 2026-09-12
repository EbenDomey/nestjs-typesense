import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../schema/collection.js";
import {
  TypesenseArray,
  TypesenseGeopoint,
  TypesenseInt32,
  TypesenseSchema,
  TypesenseString,
} from "../schema/decorators.js";
import { field } from "../schema/field.js";
import { compileSearchParams, type SearchParams } from "./params.js";

const videos = defineCollection({
  name: "videos",
  fields: {
    title: field.string(),
    channel: field.string({ facet: true }),
    durationMs: field.int32({ sort: true }),
    published: field.bool(),
    tags: field.stringArray({ facet: true }),
    location: field.geopoint(),
  },
  defaultSortingField: "durationMs",
});

@TypesenseSchema({ name: "channels" })
class ChannelDocument {
  @TypesenseString() handle!: string;
  @TypesenseInt32() subscribers!: number;
  @TypesenseArray({ type: "string" }) topics!: string[];
  @TypesenseGeopoint() hq!: [number, number];
}

describe("compileSearchParams", () => {
  it("joins field selections into the comma-separated form Typesense takes", () => {
    const compiled = compileSearchParams<typeof videos>({
      q: "x",
      query_by: ["title", "channel"],
      facet_by: ["tags"],
      sort_by: ["durationMs:desc", "_text_match:desc"],
    });

    expect(compiled.query_by).toBe("title,channel");
    expect(compiled.facet_by).toBe("tags");
    expect(compiled.sort_by).toBe("durationMs:desc,_text_match:desc");
  });

  it("accepts a single field without an array", () => {
    expect(compileSearchParams<typeof videos>({ q: "x", query_by: "title" }).query_by).toBe(
      "title",
    );
  });

  it("compiles a filter expression", () => {
    const compiled = compileSearchParams<typeof videos>({
      q: "x",
      query_by: "title",
      filter_by: { channel: "pets", durationMs: { gt: 100 } },
    });

    expect(compiled.filter_by).toBe("channel:=`pets` && durationMs:>100");
  });

  it("passes a raw filter string through untouched", () => {
    const compiled = compileSearchParams<typeof videos>({
      q: "x",
      query_by: "title",
      filter_by: "durationMs:>100 && channel:=`pets`",
    });

    expect(compiled.filter_by).toBe("durationMs:>100 && channel:=`pets`");
  });

  it("omits filter_by entirely when the expression compiles to nothing", () => {
    // Typesense rejects an empty filter_by, so it must be absent rather than "".
    const compiled = compileSearchParams<typeof videos>({
      q: "x",
      query_by: "title",
      filter_by: { channel: undefined },
    });

    expect("filter_by" in compiled).toBe(false);
  });

  it("passes unrecognised Typesense params through", () => {
    const compiled = compileSearchParams<typeof videos>({
      q: "x",
      query_by: "title",
      num_typos: 2,
      prefix: false,
    });

    expect(compiled).toMatchObject({ num_typos: 2, prefix: false });
  });
});

/**
 * Compile-time guards. `tsc --noEmit` checks these; vitest transpiles without typechecking,
 * so nothing here is verified by the run above.
 */
describe("search param types", () => {
  it("constrains field names to the collection's declared fields", () => {
    const ok: SearchParams<typeof videos> = {
      q: "x",
      query_by: ["title", "channel"],
      filter_by: { durationMs: { gt: 1 }, tags: { has: "music" } },
      sort_by: "durationMs:desc",
      facet_by: ["tags", "channel"],
    };

    const bad: SearchParams<typeof videos> = {
      q: "x",
      // @ts-expect-error "titel" is not a declared field
      query_by: ["titel"],
    };

    const badFilter: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error "duratonMs" is not a declared field
      filter_by: { duratonMs: { gt: 1 } },
    };

    const badSort: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error the direction is required, and "duration" is not a field
      sort_by: "duration:desc",
    };

    expect([ok, bad, badFilter, badSort]).toHaveLength(4);
  });

  it("checks comparison values against the field's type", () => {
    const wrongNumber: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error durationMs is int32, not a string
      filter_by: { durationMs: { gt: "100" } },
    };

    const wrongString: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error channel is a string, not a number
      filter_by: { channel: 4 },
    };

    const wrongBool: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error published is a bool
      filter_by: { published: "true" },
    };

    const wrongElement: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error tags holds strings
      filter_by: { tags: { has: 7 } },
    };

    expect([wrongNumber, wrongString, wrongBool, wrongElement]).toHaveLength(4);
  });

  it("offers only the operators that suit the field's type", () => {
    const noRangeOnString: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error `gt` is not offered on a string field
      filter_by: { channel: { gt: "a" } },
    };

    const noMembershipOnScalar: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error `has` is for arrays, not a scalar string
      filter_by: { channel: { has: "a" } },
    };

    // A geopoint is a [number, number], which is assignable to number[] — so if the array
    // branch were tested first it would offer `has`/`hasAny` on a coordinate pair.
    const geoIsNotAnArray: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      // @ts-expect-error a geopoint takes `near`/`within`, not array membership
      filter_by: { location: { hasAny: [1, 2] } },
    };

    const geoOk: SearchParams<typeof videos> = {
      q: "x",
      query_by: "title",
      filter_by: { location: { near: { lat: 1, lng: 2, radius: 5 } } },
    };

    expect([noRangeOnString, noMembershipOnScalar, geoIsNotAnArray, geoOk]).toHaveLength(4);
  });

  it("applies the same checks to a decorated class", () => {
    const ok: SearchParams<typeof ChannelDocument> = {
      q: "x",
      query_by: ["handle", "topics"],
      filter_by: {
        subscribers: { gte: 1000 },
        topics: { hasAll: ["news", "tech"] },
        hq: { near: { lat: 1, lng: 2, radius: 10 } },
      },
      sort_by: "subscribers:desc",
    };

    const bad: SearchParams<typeof ChannelDocument> = {
      q: "x",
      // @ts-expect-error "handel" is not a property of the class
      query_by: "handel",
    };

    const wrongType: SearchParams<typeof ChannelDocument> = {
      q: "x",
      query_by: "handle",
      // @ts-expect-error subscribers is a number on the class
      filter_by: { subscribers: { gte: "1000" } },
    };

    expect([ok, bad, wrongType]).toHaveLength(3);
  });

  it("still allows id, and a raw filter string", () => {
    const byId: SearchParams<typeof videos> = {
      q: "*",
      query_by: "title",
      filter_by: { id: ["v1", "v2"] },
    };

    const raw: SearchParams<typeof videos> = {
      q: "*",
      query_by: "title",
      filter_by: "anything Typesense accepts",
    };

    expect([byId, raw]).toHaveLength(2);
  });
});
