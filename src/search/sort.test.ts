import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../schema/collection.js";
import { field } from "../schema/field.js";
import { compileSearchParams, type SearchParams } from "./params.js";
import { compileSortBy, sortEval, sortEvalWeighted, sortTextMatch } from "./sort.js";

const products = defineCollection({
  name: "products",
  fields: {
    title: field.string(),
    brand: field.string({ facet: true }),
    categoryPathIds: field.stringArray({ facet: true }),
    minPriceMinor: field.int64(),
    popularity: field.int32(),
    publishedAt: field.int64(),
  },
});

const videos = defineCollection({
  name: "videos",
  fields: { title: field.string(), durationMs: field.int32() },
});

describe("sort builders", () => {
  it("sortEval compiles a typed filter", () => {
    expect(sortEval<typeof products>({ brand: "acme" }, "desc")).toBe("_eval(brand:=`acme`):desc");
    expect(sortEval<typeof products>({ minPriceMinor: { lt: 500 } }, "asc")).toBe(
      "_eval(minPriceMinor:<500):asc",
    );
  });

  it("sortEval passes a raw filter string through", () => {
    expect(sortEval("in_stock:true", "desc")).toBe("_eval(in_stock:true):desc");
  });

  it("sortEvalWeighted renders tiers, merged multi-field clauses included", () => {
    expect(
      sortEvalWeighted<typeof products>(
        [
          {
            filter: { categoryPathIds: { hasAny: ["c1"] }, minPriceMinor: { between: [100, 900] } },
            score: 3,
          },
          { filter: { categoryPathIds: { hasAny: ["c1"] } }, score: 2 },
        ],
        "desc",
      ),
    ).toBe(
      "_eval([ (categoryPathIds:=[`c1`] && minPriceMinor:[100..900]):3, (categoryPathIds:=[`c1`]):2 ]):desc",
    );
  });

  it("sortTextMatch renders buckets and bucket_size", () => {
    expect(sortTextMatch({ buckets: 10 }, "desc")).toBe("_text_match(buckets: 10):desc");
    expect(sortTextMatch({ bucketSize: 5 }, "asc")).toBe("_text_match(bucket_size: 5):asc");
  });

  it("refuses inputs Typesense would reject with an unhelpful 400", () => {
    expect(() => sortEval<typeof products>({}, "desc")).toThrow(/non-empty filter/);
    expect(() => sortEvalWeighted([], "desc")).toThrow(/at least one clause/);
    expect(() => sortEvalWeighted([{ filter: "a:1", score: 1.5 }], "desc")).toThrow(/integers/);
    expect(() => sortTextMatch({ buckets: 0 }, "desc")).toThrow(/positive integer/);
    // @ts-expect-error not a direction
    expect(() => sortEval("a:1", "up")).toThrow(/"asc" or "desc"/);
  });
});

describe("compileSortBy", () => {
  it("joins up to three expressions", () => {
    expect(compileSortBy(["_eval(a:1):desc", "popularity:desc", "publishedAt:desc"])).toBe(
      "_eval(a:1):desc,popularity:desc,publishedAt:desc",
    );
  });

  it("refuses a fourth expression, naming Typesense's limit", () => {
    expect(() => compileSortBy(["a:asc", "b:asc", "c:asc", "d:asc"])).toThrow(
      /at most 3 \("Only upto 3 sort fields are allowed"\)/,
    );
  });

  it("refuses a second _eval, pointing at sortEvalWeighted", () => {
    expect(() => compileSortBy(["_eval(a:1):desc", "_eval(b:1):desc"])).toThrow(
      /only one \("Only one sorting eval expression is allowed"\).*sortEvalWeighted/,
    );
  });

  it("is applied by compileSearchParams to a list assembled at runtime", () => {
    const assembled: string[] = ["_eval(a:1):desc", "_eval(b:1):desc"];
    expect(() =>
      compileSearchParams<typeof products>({
        q: "*",
        query_by: "title",
        sort_by: assembled as never,
      }),
    ).toThrow(/only one/);
  });
});

/** Compile-time guards — `bun run typecheck` checks these, vitest does not. */
describe("sort_by types", () => {
  it("accepts every builder in sort_by with no cast, inferring the collection", () => {
    const params: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      sort_by: [
        sortEvalWeighted(
          [
            {
              filter: { categoryPathIds: { hasAny: ["c1"] }, minPriceMinor: { lte: 900 } },
              score: 3,
            },
            { filter: { categoryPathIds: { hasAny: ["c1"] } }, score: 2 },
          ],
          "desc",
        ),
        "popularity:desc",
        "publishedAt:desc",
      ],
    };
    const textMatch: SearchParams<typeof products> = {
      q: "shoe",
      query_by: "title",
      sort_by: [sortTextMatch({ buckets: 10 }, "desc"), sortEval({ brand: "acme" }, "desc")],
    };
    const vector: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      sort_by: ["_vector_distance:asc", "popularity:desc"],
    };
    expect(compileSearchParams(params).sort_by).toMatch(/^_eval\(\[ /);
    expect([textMatch, vector]).toHaveLength(2);
  });

  it("checks the _eval filter against the collection it is used with", () => {
    const typo: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error "brnad" is not a field of products
      sort_by: [sortEval({ brnad: "acme" }, "desc")],
    };
    const wrongType: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error minPriceMinor is a number
      sort_by: sortEval({ minPriceMinor: { lt: "500" } }, "desc"),
    };
    // Built against one collection, refused by another.
    const forVideos = sortEval<typeof videos>({ durationMs: { gt: 1 } }, "desc");
    const crossed: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error an _eval built for videos
      sort_by: forVideos,
    };
    expect([typo, wrongType, crossed]).toHaveLength(3);
  });

  it("rejects a fourth sort field and a second _eval at compile time", () => {
    const four: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error Typesense allows at most three sort fields
      sort_by: ["popularity:desc", "publishedAt:desc", "minPriceMinor:asc", "_text_match:desc"],
    };
    const twoEvals: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error only one _eval per sort_by
      sort_by: [sortEval({ brand: "a" }, "desc"), sortEval({ brand: "b" }, "desc")],
    };
    const rawEval: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error a hand-written _eval skips the filter check; use sortEval
      sort_by: "_eval(brand:=`a`):desc",
    };
    expect([four, twoEvals, rawEval]).toHaveLength(3);
  });
});

describe('the README "For you" example', () => {
  it("compiles and renders", () => {
    const preferredCategoryIds = ["c1", "c2"];
    const band: [number, number] = [1000, 5000];
    const tiers = preferredCategoryIds.flatMap((categoryId, rank) => {
      const base = (preferredCategoryIds.length - rank) * 2;
      return [
        {
          filter: { categoryPathIds: { hasAny: [categoryId] }, minPriceMinor: { between: band } },
          score: base + 1,
        },
        { filter: { categoryPathIds: { hasAny: [categoryId] } }, score: base },
      ];
    });
    const compiled = compileSearchParams<typeof products>({
      q: "*",
      query_by: "title",
      sort_by: [sortEvalWeighted(tiers, "desc"), "popularity:desc", "publishedAt:desc"],
    });
    expect(compiled.sort_by).toBe(
      "_eval([ (categoryPathIds:=[`c1`] && minPriceMinor:[1000..5000]):5, (categoryPathIds:=[`c1`]):4, (categoryPathIds:=[`c2`] && minPriceMinor:[1000..5000]):3, (categoryPathIds:=[`c2`]):2 ]):desc,popularity:desc,publishedAt:desc",
    );
  });
});
