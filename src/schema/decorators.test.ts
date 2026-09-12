import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { defineCollection, toSchema } from "./collection.js";
import {
  getTypesenseCollection,
  resolveCollection,
  TypesenseArray,
  TypesenseGeopoint,
  TypesenseInt32,
  TypesenseSchema,
  TypesenseString,
} from "./decorators.js";
import { field } from "./field.js";

@TypesenseSchema({ name: "videos", defaultSortingField: "durationMs" })
class VideoDocument {
  @TypesenseString({ facet: false }) title!: string;
  @TypesenseInt32({ sort: true }) durationMs!: number;
  @TypesenseArray({ type: "string", facet: true }) tags!: string[];
  @TypesenseString({ index: false, optional: true }) thumbnailUrl?: string;
}

// The exact same collection, declared the other way.
const videos = defineCollection({
  name: "videos",
  fields: {
    title: field.string({ facet: false }),
    durationMs: field.int32({ sort: true }),
    tags: field.stringArray({ facet: true }),
    thumbnailUrl: field.string({ index: false, optional: true }),
  },
  defaultSortingField: "durationMs",
});

describe("@TypesenseSchema", () => {
  it("produces a collection identical to defineCollection, hash included", () => {
    const decorated = getTypesenseCollection(VideoDocument);
    expect(decorated).toBeDefined();
    expect(toSchema(decorated as never)).toEqual(toSchema(videos));
    expect(decorated?.hash).toBe(videos.hash);
  });

  it("maps an array element type to its Typesense array type", () => {
    const byName = Object.fromEntries(
      toSchema(getTypesenseCollection(VideoDocument) as never).fields.map((f) => [f.name, f]),
    );
    expect(byName.tags?.type).toBe("string[]");
    expect(byName.tags?.facet).toBe(true);
  });

  it("drops a declared string id rather than emitting it twice", () => {
    @TypesenseSchema({ name: "with-id" })
    class WithId {
      @TypesenseString() id!: string;
      @TypesenseString() title!: string;
    }

    const ids = toSchema(getTypesenseCollection(WithId) as never).fields.filter(
      (f) => f.name === "id",
    );
    expect(ids).toHaveLength(1);
    expect(ids[0]).toEqual({
      name: "id",
      type: "string",
      index: true,
      optional: false,
      facet: false,
    });
  });

  it("rejects an id declared as anything but a string", () => {
    expect(() => {
      @TypesenseSchema({ name: "bad-id" })
      class BadId {
        @TypesenseInt32() id!: number;
      }
      return BadId;
    }).toThrow(/id is implicit/);
  });
});

describe("inheritance", () => {
  @TypesenseSchema({ name: "base-doc" })
  class BaseDoc {
    @TypesenseString() common!: string;
  }

  @TypesenseSchema({ name: "derived-doc" })
  class DerivedDoc extends BaseDoc {
    @TypesenseString({ facet: true }) common = "";
    @TypesenseGeopoint() location!: [number, number];
  }

  it("collects fields declared on a base class", () => {
    const names = toSchema(getTypesenseCollection(DerivedDoc) as never).fields.map((f) => f.name);
    expect(names).toEqual(["id", "common", "location"]);
  });

  it("lets a subclass override an inherited field without mutating the base", () => {
    const derived = Object.fromEntries(
      toSchema(getTypesenseCollection(DerivedDoc) as never).fields.map((f) => [f.name, f]),
    );
    const base = Object.fromEntries(
      toSchema(getTypesenseCollection(BaseDoc) as never).fields.map((f) => [f.name, f]),
    );

    expect(derived.common?.facet).toBe(true);
    expect(base.common?.facet).toBe(false);
    expect(base.location).toBeUndefined();
  });
});

describe("resolveCollection", () => {
  it("accepts both declaration styles", () => {
    expect(resolveCollection(videos)).toBe(videos);
    expect(resolveCollection(VideoDocument).name).toBe("videos");
  });

  it("explains itself when handed an undecorated class", () => {
    class NotACollection {}
    expect(() => resolveCollection(NotACollection)).toThrow(/@TypesenseSchema/);
  });
});

/**
 * Compile-time guards. Each `@ts-expect-error` fails the build if the error it expects
 * stops being reported, so these are checked by `tsc --noEmit`, not by the test runner.
 */
describe("type safety", () => {
  it("rejects declarations that disagree with the property", () => {
    @TypesenseSchema({ name: "guards" })
    class Guards {
      // @ts-expect-error int32 declared on a string property
      @TypesenseInt32() wrongScalar!: string;

      // @ts-expect-error required field declared on an optional property
      @TypesenseString() requiredOnOptional?: string;

      // @ts-expect-error string element declared on a number array
      @TypesenseArray({ type: "string" }) wrongElement!: number[];

      // @ts-expect-error array field declared on a non-array property
      @TypesenseArray({ type: "string" }) notAnArray!: string;

      // @ts-expect-error "auto" has no array counterpart
      @TypesenseArray({ type: "auto" }) noAutoArray!: unknown[];

      // @ts-expect-error not a field type at all
      @TypesenseArray({ type: "typo" }) typo!: string[];
    }
    expect(getTypesenseCollection(Guards)).toBeDefined();
  });

  it("rejects a defaultSortingField that names no declared property", () => {
    // @ts-expect-error "missing" is not a property of this class
    @TypesenseSchema({ name: "bad-sort", defaultSortingField: "missing" })
    class BadSort {
      @TypesenseInt32() durationMs!: number;
    }
    expect(BadSort).toBeDefined();
  });
});
