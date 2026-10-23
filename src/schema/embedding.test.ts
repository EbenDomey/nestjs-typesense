import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  defineCollection,
  type InferDocument,
  toSchema,
  type WritableDocument,
} from "./collection.js";
import {
  type DocumentOf,
  resolveCollection,
  TypesenseArray,
  TypesenseEmbedding,
  TypesenseInt64,
  TypesenseSchema,
  TypesenseString,
} from "./decorators.js";
import { field, type TypesenseEmbeddingVector } from "./field.js";

type Assert<T extends true> = T;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const products = defineCollection({
  name: "products",
  fields: {
    title: field.string(),
    categoryNames: field.stringArray({ facet: true }),
    tagNames: field.stringArray({ optional: true }),
    optionValues: field.stringArray({ optional: true }),
    priceMinor: field.int64(),
    embedding: field.embedding({
      from: ["title", "categoryNames", "tagNames", "optionValues"],
      model: "ts/all-MiniLM-L12-v2",
    }),
  },
});

describe("field.embedding", () => {
  it("emits a float[] field carrying the embed block", () => {
    const embedding = toSchema(products).fields.find((f) => f.name === "embedding");
    expect(embedding).toEqual({
      name: "embedding",
      type: "float[]",
      index: true,
      optional: false,
      facet: false,
      embed: {
        from: ["title", "categoryNames", "tagNames", "optionValues"],
        model_config: { model_name: "ts/all-MiniLM-L12-v2" },
      },
    });
  });

  it("emits every documented model_config key, and num_dim, only when given", () => {
    const remote = defineCollection({
      name: "remote",
      fields: {
        body: field.string(),
        embedding: field.embedding({
          from: ["body"],
          model: "openai/text-embedding-3-small",
          apiKey: "sk-test",
          url: "https://llm.internal/v1",
          indexingPrefix: "passage:",
          queryPrefix: "query:",
          numDim: 1536,
          optional: true,
        }),
      },
    });
    const embedding = toSchema(remote).fields.find((f) => f.name === "embedding");
    expect(embedding).toEqual({
      name: "embedding",
      type: "float[]",
      index: true,
      optional: true,
      facet: false,
      embed: {
        from: ["body"],
        model_config: {
          model_name: "openai/text-embedding-3-small",
          api_key: "sk-test",
          url: "https://llm.internal/v1",
          indexing_prefix: "passage:",
          query_prefix: "query:",
        },
      },
      num_dim: 1536,
    });
  });

  it("refuses an empty from list and a non-integer num_dim", () => {
    expect(() => field.embedding({ from: [], model: "ts/all-MiniLM-L12-v2" })).toThrow(
      /at least one `from` field/,
    );
    expect(() =>
      field.embedding({ from: ["title"], model: "ts/all-MiniLM-L12-v2", numDim: 1.5 }),
    ).toThrow(/positive integer/);
  });

  it("copies from, so mutating the caller's array cannot change the schema", () => {
    const from = ["title"];
    const built = field.embedding({ from, model: "ts/all-MiniLM-L12-v2" });
    from.push("oops");
    expect(built.embed.from).toEqual(["title"]);
  });
});

describe("schema hash", () => {
  it("is unchanged for a collection without embeddings (pinned from 0.2.0)", () => {
    // Computed with 0.2.0 before embeddings existed. Downstream code versions collections by
    // hash, so a release that moved it would force every consumer to rebuild its index.
    const videos = defineCollection({
      name: "videos",
      fields: {
        title: field.string({ facet: true }),
        durationMs: field.int32({ sort: true }),
        tags: field.stringArray({ optional: true }),
        thumb: field.string({ index: false, optional: true }),
      },
      defaultSortingField: "durationMs",
    });
    expect(videos.hash).toBe("e12074aa0bdb62eb");
  });

  it("ignores the embedding API key, so rotating it is not drift", () => {
    const withKey = (apiKey: string) =>
      defineCollection({
        name: "remote",
        fields: {
          body: field.string(),
          embedding: field.embedding({ from: ["body"], model: "openai/x", apiKey }),
        },
      });
    expect(withKey("old").hash).toBe(withKey("new").hash);
    // ...while still sending it to Typesense.
    expect(toSchema(withKey("old")).fields[2]?.embed?.model_config.api_key).toBe("old");
  });

  it("moves when the embedding sources or model change", () => {
    const make = (from: readonly ["title"] | readonly ["title", "body"], model: string) =>
      defineCollection({
        name: "x",
        fields: {
          title: field.string(),
          body: field.string(),
          e: field.embedding({ from, model }),
        },
      }).hash;
    const base = make(["title"], "ts/all-MiniLM-L12-v2");
    expect(make(["title", "body"], "ts/all-MiniLM-L12-v2")).not.toBe(base);
    expect(make(["title"], "ts/e5-small")).not.toBe(base);
  });
});

/** Compile-time guards — `bun run typecheck` checks these, vitest does not. */
describe("embedding types", () => {
  it("makes the embedding optional on the read side, typed as a vector", () => {
    type Doc = InferDocument<typeof products>;
    type _Optional = Assert<Equals<Doc["embedding"], TypesenseEmbeddingVector | undefined>>;
    // Optional source fields stay optional; required ones stay required.
    type _TagsOptional = Assert<undefined extends Doc["tagNames"] ? true : false>;
    type _TitleRequired = Assert<undefined extends Doc["title"] ? false : true>;

    const read: Doc = { id: "p1", title: "t", categoryNames: [], priceMinor: 1 };
    expect(read.embedding).toBeUndefined();
  });

  it("neither requires nor accepts the embedding on the write side", () => {
    type Write = WritableDocument<DocumentOf<typeof products>>;

    const ok: Write = { id: "p1", title: "t", categoryNames: [], priceMinor: 1 };

    const carrying: Write = {
      ...ok,
      // @ts-expect-error Typesense computes the embedding; a document may not carry one
      embedding: [0.1, 0.2],
    };

    // @ts-expect-error title is still required on write
    const missing: Write = { id: "p1", categoryNames: [], priceMinor: 1 };

    expect([ok, carrying, missing]).toHaveLength(3);
  });

  it("rejects a from entry that is not a text field of the collection", () => {
    // @ts-expect-error "titel" is not a field
    const typo = defineCollection({
      name: "bad",
      fields: { title: field.string(), e: field.embedding({ from: ["titel"], model: "m" }) },
    });

    // @ts-expect-error priceMinor is int64, and Typesense only embeds string / string[]
    const numeric = defineCollection({
      name: "bad",
      fields: {
        priceMinor: field.int64(),
        e: field.embedding({ from: ["priceMinor"], model: "m" }),
      },
    });

    expect([typo, numeric]).toHaveLength(2);
  });
});

describe("@TypesenseEmbedding", () => {
  @TypesenseSchema({ name: "products" })
  class ProductDocument {
    @TypesenseString() title!: string;
    @TypesenseArray({ type: "string", facet: true }) categoryNames!: string[];
    @TypesenseArray({ type: "string", optional: true }) tagNames?: string[];
    @TypesenseArray({ type: "string", optional: true }) optionValues?: string[];
    @TypesenseInt64() priceMinor!: number;
    @TypesenseEmbedding({
      from: ["title", "categoryNames", "tagNames", "optionValues"],
      model: "ts/all-MiniLM-L12-v2",
    })
    embedding?: TypesenseEmbeddingVector;
  }

  it("produces the same field object and hash as field.embedding", () => {
    const fromClass = resolveCollection(ProductDocument);
    expect(fromClass.fields.embedding).toEqual(products.fields.embedding);
    expect(fromClass.hash).toBe(products.hash);
  });

  it("strips the branded embedding from the class's write type", () => {
    type Write = WritableDocument<DocumentOf<typeof ProductDocument>>;
    const ok: Write = { id: "p1", title: "t", categoryNames: [], priceMinor: 1 };
    // @ts-expect-error the embedding is computed by Typesense
    const carrying: Write = { ...ok, embedding: [0.1] };
    expect([ok, carrying]).toHaveLength(2);
  });

  it("rejects a from entry that is not a text property of the class", () => {
    class Bad {
      @TypesenseInt64() priceMinor!: number;
      @TypesenseString({ optional: true }) note?: string;
      // @ts-expect-error priceMinor is a number, "titel" does not exist
      @TypesenseEmbedding({ from: ["priceMinor", "titel"], model: "m" })
      e1?: TypesenseEmbeddingVector;
      // An optional text property is a valid source.
      @TypesenseEmbedding({ from: ["note"], model: "m" })
      e2?: TypesenseEmbeddingVector;
    }
    expect(Bad).toBeDefined();
  });
});
