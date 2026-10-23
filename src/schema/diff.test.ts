import { describe, expect, it } from "vitest";
import { defineCollection } from "./collection.js";
import { diffSchema, type LiveFieldSchema } from "./diff.js";
import { field } from "./field.js";

const products = defineCollection({
  name: "products",
  fields: {
    title: field.string(),
    tags: field.stringArray(),
    price: field.int32(),
    embedding: field.embedding({ from: ["title", "tags"], model: "ts/all-MiniLM-L12-v2" }),
  },
});

/**
 * Verbatim `GET /collections/probe_emb` from Typesense 30.2 (brew, 2026-10-23), for a
 * collection created from exactly the declaration above. Every key the server added —
 * `num_dim`, `hnsw_params`, `vec_dist`, `infix`, `stem`, ... — must be tolerated.
 */
const live30_2: { fields: LiveFieldSchema[] } = {
  fields: [
    {
      facet: false,
      index: true,
      infix: false,
      locale: "",
      name: "title",
      optional: false,
      sort: false,
      stem: false,
      stem_dictionary: "",
      store: true,
      truncate_len: 100,
      type: "string",
    },
    {
      facet: false,
      index: true,
      infix: false,
      locale: "",
      name: "tags",
      optional: false,
      sort: false,
      stem: false,
      stem_dictionary: "",
      store: true,
      truncate_len: 100,
      type: "string[]",
    },
    {
      facet: false,
      index: true,
      infix: false,
      locale: "",
      name: "price",
      optional: false,
      sort: true,
      stem: false,
      stem_dictionary: "",
      store: true,
      truncate_len: 100,
      type: "int32",
    },
    {
      embed: { from: ["title", "tags"], model_config: { model_name: "ts/all-MiniLM-L12-v2" } },
      facet: false,
      hnsw_params: { M: 16, ef_construction: 200 },
      index: true,
      infix: false,
      locale: "",
      name: "embedding",
      num_dim: 384,
      optional: false,
      sort: false,
      stem: false,
      stem_dictionary: "",
      store: true,
      truncate_len: 100,
      type: "float[]",
      vec_dist: "cosine",
    },
  ],
};

const withField = (name: string, patch: Partial<LiveFieldSchema>) => ({
  fields: live30_2.fields.map((f) => (f.name === name ? { ...f, ...patch } : f)),
});

describe("diffSchema", () => {
  it("treats the live 30.2 embedding field as matching its declaration", () => {
    expect(diffSchema(products, live30_2)).toEqual({
      added: [],
      removed: [],
      changed: [],
      inSync: true,
    });
  });

  it("reports a changed model or source list on the embedding", () => {
    const diff = diffSchema(
      products,
      withField("embedding", {
        embed: { from: ["title"], model_config: { model_name: "ts/e5-small" } },
      }),
    );
    expect(diff.changed).toEqual([
      {
        name: "embedding",
        mismatches: [
          { property: "embed.from", declared: ["title", "tags"], live: ["title"] },
          {
            property: "embed.model_config.model_name",
            declared: "ts/all-MiniLM-L12-v2",
            live: "ts/e5-small",
          },
        ],
      },
    ]);
  });

  it("compares num_dim only when it is declared", () => {
    const pinned = defineCollection({
      name: "products",
      fields: {
        title: field.string(),
        tags: field.stringArray(),
        price: field.int32(),
        embedding: field.embedding({
          from: ["title", "tags"],
          model: "ts/all-MiniLM-L12-v2",
          numDim: 768,
        }),
      },
    });
    expect(diffSchema(pinned, live30_2).changed).toEqual([
      { name: "embedding", mismatches: [{ property: "num_dim", declared: 768, live: 384 }] },
    ]);
  });

  it("ignores the API key, which the server may redact and which rotates", () => {
    const remote = defineCollection({
      name: "products",
      fields: {
        title: field.string(),
        tags: field.stringArray(),
        price: field.int32(),
        embedding: field.embedding({
          from: ["title", "tags"],
          model: "ts/all-MiniLM-L12-v2",
          apiKey: "sk",
        }),
      },
    });
    expect(diffSchema(remote, live30_2).inSync).toBe(true);
  });

  it("reports a plain float[] declared over a live embedding field", () => {
    const plain = defineCollection({
      name: "products",
      fields: {
        title: field.string(),
        tags: field.stringArray(),
        price: field.int32(),
        embedding: field.floatArray(),
      },
    });
    expect(diffSchema(plain, live30_2).changed[0]?.mismatches.map((m) => m.property)).toEqual([
      "embed",
    ]);
  });

  it("reports added, removed and ordinary property changes", () => {
    const live = {
      fields: [
        ...withField("title", { facet: true }).fields.filter((f) => f.name !== "price"),
        {
          name: "legacy",
          type: "string",
        },
      ],
    };
    const diff = diffSchema(products, live);
    expect(diff.added.map((f) => f.name)).toEqual(["price"]);
    expect(diff.removed).toEqual(["legacy"]);
    expect(diff.changed).toEqual([
      { name: "title", mismatches: [{ property: "facet", declared: false, live: true }] },
    ]);
    expect(diff.inSync).toBe(false);
  });
});
