import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../schema/collection.js";
import {
  TypesenseArray,
  TypesenseEmbedding,
  TypesenseGeopoint,
  TypesenseSchema,
  TypesenseString,
} from "../schema/decorators.js";
import { field, type TypesenseEmbeddingVector } from "../schema/field.js";
import { compileSearchParams, type SearchParams } from "./params.js";
import type { SearchResult } from "./result.js";
import { vectorQuery } from "./vector-query.js";

const products = defineCollection({
  name: "products",
  fields: {
    title: field.string(),
    scores: field.int32Array(),
    imageVector: field.floatArray({ optional: true }),
    location: field.geopoint({ optional: true }),
    embedding: field.embedding({ from: ["title"], model: "ts/all-MiniLM-L12-v2" }),
  },
});

@TypesenseSchema({ name: "articles" })
class ArticleDocument {
  @TypesenseString() title!: string;
  @TypesenseArray({ type: "string" }) tags!: string[];
  @TypesenseGeopoint({ optional: true }) at?: [number, number];
  @TypesenseEmbedding({ from: ["title", "tags"], model: "ts/all-MiniLM-L12-v2" })
  embedding?: TypesenseEmbeddingVector;
}

describe("vectorQuery", () => {
  it("renders a similar-to-document query", () => {
    expect(vectorQuery("embedding", { id: "doc-id", k: 24, distanceThreshold: 0.6 })).toBe(
      "embedding:([], id: doc-id, k: 24, distance_threshold: 0.6)",
    );
  });

  it("renders an explicit vector", () => {
    expect(vectorQuery("embedding", { vector: [0.1, -0.2, 3], k: 10 })).toBe(
      "embedding:([0.1,-0.2,3], k: 10)",
    );
  });

  it("renders the empty form and the remaining tuning keys", () => {
    expect(vectorQuery("embedding", {})).toBe("embedding:([])");
    expect(vectorQuery("embedding", { k: 5, alpha: 0.3, ef: 64, flatSearchCutoff: 20 })).toBe(
      "embedding:([], k: 5, alpha: 0.3, ef: 64, flat_search_cutoff: 20)",
    );
  });

  it("refuses ids that would be read as query syntax, and bad numbers", () => {
    expect(() => vectorQuery("e", { id: "a, k: 1" })).toThrow(/delimiter/);
    expect(() => vectorQuery("e", { id: "a)" })).toThrow(/delimiter/);
    expect(() => vectorQuery("e", { id: "" })).toThrow(/empty/);
    expect(() => vectorQuery("e", { vector: [] })).toThrow(/cannot be empty/);
    expect(() => vectorQuery("e", { vector: [Number.NaN] })).toThrow(/finite/);
    expect(() => vectorQuery("e", { k: 0 })).toThrow(/positive integer/);
    expect(() => vectorQuery("e", { alpha: 2 })).toThrow(/0\.\.1/);
    // @ts-expect-error id and vector are exclusive
    expect(() => vectorQuery("e", { id: "a", vector: [1] })).toThrow(/not both/);
  });

  it("is passed through by compileSearchParams", () => {
    const compiled = compileSearchParams<typeof products>({
      q: "*",
      query_by: "title",
      vector_query: vectorQuery("embedding", { id: "p1", k: 3 }),
      exclude_fields: "embedding",
    });
    expect(compiled).toMatchObject({
      vector_query: "embedding:([], id: p1, k: 3)",
      exclude_fields: "embedding",
    });
  });
});

/** Compile-time guards — `bun run typecheck` checks these, vitest does not. */
describe("vector_query types", () => {
  it("accepts embedding and float[] fields of the collection", () => {
    const onEmbedding: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      vector_query: vectorQuery("embedding", { id: "p1" }),
    };
    const onFloatArray: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      vector_query: vectorQuery("imageVector", { vector: [1, 2] }),
    };
    const onClass: SearchParams<typeof ArticleDocument> = {
      q: "*",
      query_by: "title",
      vector_query: vectorQuery("embedding", { id: "a1" }),
    };
    expect([onEmbedding, onFloatArray, onClass]).toHaveLength(3);
  });

  it("rejects a field that is not a vector", () => {
    const text: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error title is a string field
      vector_query: vectorQuery("title", { id: "p1" }),
    };
    const ints: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error scores is int32[], not float[]
      vector_query: vectorQuery("scores", { id: "p1" }),
    };
    const geo: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error a geopoint is not a vector
      vector_query: vectorQuery("location", { id: "p1" }),
    };
    const typo: SearchParams<typeof products> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error no such field
      vector_query: "embeding:([], id: p1)",
    };
    const classGeo: SearchParams<typeof ArticleDocument> = {
      q: "*",
      query_by: "title",
      // @ts-expect-error a geopoint property is not a vector
      vector_query: vectorQuery("at", { id: "a1" }),
    };
    expect([text, ints, geo, typo, classGeo]).toHaveLength(5);
  });

  it("types vector_distance on hits", () => {
    type Hit = SearchResult<unknown>["hits"][number];
    const hit: Hit = { document: {}, vector_distance: 0.27 };
    expect(hit.vector_distance).toBe(0.27);
  });
});
