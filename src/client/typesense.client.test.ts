import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { defineCollection, type InferDocument } from "../schema/collection.js";
import {
  TypesenseArray,
  type TypesenseCollectionSource,
  TypesenseInt32,
  TypesenseSchema,
  TypesenseString,
} from "../schema/decorators.js";
import { field } from "../schema/field.js";
import { TypesenseClient } from "./typesense.client.js";

const videos = defineCollection({
  name: "videos",
  fields: {
    title: field.string(),
    durationMs: field.int32({ sort: true }),
    tags: field.stringArray({ facet: true }),
    thumbnailUrl: field.string({ optional: true }),
  },
  defaultSortingField: "durationMs",
});

@TypesenseSchema({ name: "videos", defaultSortingField: "durationMs" })
class VideoDocument {
  @TypesenseString() title!: string;
  @TypesenseInt32({ sort: true }) durationMs!: number;
  @TypesenseArray({ type: "string", facet: true }) tags!: string[];
  @TypesenseString({ optional: true }) thumbnailUrl?: string;
}

function newClient(): TypesenseClient {
  return new TypesenseClient({
    nodes: [{ host: "127.0.0.1", port: 8108, protocol: "http" }],
    apiKey: "unused",
    connectionTimeoutSeconds: 1,
  });
}

/**
 * Compile-time guards on the search result type. Declared rather than constructed: nothing
 * here runs, and `tsc --noEmit` is what checks it — vitest transpiles without typechecking.
 */
declare const client: TypesenseClient;

type Assert<T extends true> = T;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type SearchedDocument<TSource extends TypesenseCollectionSource> = Awaited<
  ReturnType<typeof client.search<TSource>>
>["hits"][number]["document"];

type _CollectionSearchIsTyped = Assert<
  Equals<SearchedDocument<typeof videos>, InferDocument<typeof videos>>
>;
type _ClassSearchIsTyped = Assert<
  Equals<SearchedDocument<typeof VideoDocument>, { id: string } & VideoDocument>
>;

type UpsertedDocument<TSource extends TypesenseCollectionSource> = Parameters<
  typeof client.upsert<TSource>
>[1][number];

type _ClassUpsertIsTyped = Assert<
  Equals<UpsertedDocument<typeof VideoDocument>, { id: string } & VideoDocument>
>;

describe("TypesenseClient", () => {
  it("accepts a decorated class wherever it accepts a collection", async () => {
    const typesense = newClient();

    // Both short-circuit before any network call, so this needs no server. What is being
    // exercised is that the class typechecks as a source and resolves to a name at runtime.
    await expect(typesense.upsert(VideoDocument, [])).resolves.toBeUndefined();
    await expect(typesense.delete(VideoDocument, [])).resolves.toBeUndefined();
    await expect(typesense.upsert(videos, [])).resolves.toBeUndefined();
    await expect(typesense.delete(videos, [])).resolves.toBeUndefined();
  });

  it("rejects a class that was never decorated", async () => {
    class NotACollection {}
    await expect(newClient().delete(NotACollection, ["1"])).rejects.toThrow(/@TypesenseSchema/);
  });

  it("checks upserted documents against the class instance type", () => {
    const ok: { id: string } & VideoDocument = {
      id: "v1",
      title: "A clip",
      durationMs: 10,
      tags: [],
    };

    // @ts-expect-error — durationMs is a number on the class
    const bad: { id: string } & VideoDocument = { ...ok, durationMs: "10" };

    expect(ok.title).toBe("A clip");
    expect(bad.id).toBe("v1");
  });
});
