import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { defineCollection, type InferDocument } from "../schema/collection.js";
import {
  type DocumentOf,
  TypesenseInt32,
  TypesenseSchema,
  TypesenseString,
} from "../schema/decorators.js";
import { field } from "../schema/field.js";
import type { TypesenseModuleOptions } from "../typesense.module-options.js";
import { TypesenseCollections } from "./typesense-collections.js";

const videos = defineCollection({
  name: "videos",
  fields: {
    title: field.string(),
    durationMs: field.int32({ sort: true }),
    thumbnailUrl: field.string({ optional: true }),
  },
  defaultSortingField: "durationMs",
});

@TypesenseSchema({ name: "channels" })
class ChannelDocument {
  @TypesenseString() handle!: string;
  @TypesenseInt32() subscribers!: number;
}

const options: TypesenseModuleOptions = {
  nodes: [{ host: "127.0.0.1", port: 8108, protocol: "http" }],
  apiKey: "unused",
  collections: [videos, ChannelDocument],
};

// `get` and `all` never touch the client — only `onApplicationBootstrap` does.
function newRegistry(): TypesenseCollections {
  return new TypesenseCollections(options, undefined as never);
}

/**
 * Compile-time guard: a lookup by the declaration keeps the field types, so everything
 * downstream of the registry stays typed. Checked by `tsc --noEmit` — vitest transpiles
 * without typechecking, so the runtime cases below cannot catch a regression here.
 */
type Assert<T extends true> = T;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Never called. The lookup has to sit inside a body for `typeof` to name its result.
function _lookupKeepsFieldTypes(registry: TypesenseCollections): void {
  const registered = registry.get(videos);

  type _LookupKeepsFields = Assert<
    Equals<DocumentOf<typeof registered>, InferDocument<typeof videos>>
  >;
}

describe("TypesenseCollections", () => {
  it("registers both declaration styles under their collection names", () => {
    expect(
      newRegistry()
        .all()
        .map((c) => c.name),
    ).toEqual(["videos", "channels"]);
  });

  it("returns the registered collection for a declaration it was given", () => {
    const collections = newRegistry();
    expect(collections.get(videos)).toBe(videos);
    expect(collections.get(ChannelDocument).name).toBe("channels");
    expect(collections.get("videos")).toBe(videos);
  });

  it("names the collection it does not know", () => {
    expect(() => newRegistry().get("nope")).toThrow(/"nope" is not registered/);
  });
});
