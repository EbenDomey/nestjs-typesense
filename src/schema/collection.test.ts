import { describe, expect, it } from "vitest";
import { defineCollection, type InferDocument, toSchema } from "./collection.js";
import { field } from "./field.js";

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

describe("defineCollection", () => {
  it("always prepends an indexed id field", () => {
    const schema = toSchema(videos);
    expect(schema.fields[0]).toEqual({
      name: "id",
      type: "string",
      index: true,
      optional: false,
      facet: false,
    });
  });

  it("applies field defaults and carries options through", () => {
    const byName = Object.fromEntries(toSchema(videos).fields.map((f) => [f.name, f]));

    expect(byName.title).toMatchObject({ type: "string", index: true, optional: false });
    expect(byName.tags).toMatchObject({ type: "string[]", facet: true });
    expect(byName.thumbnailUrl).toMatchObject({ index: false, optional: true });
    expect(byName.durationMs).toMatchObject({ sort: true });
  });

  it("passes the default sorting field through", () => {
    expect(toSchema(videos).default_sorting_field).toBe("durationMs");
  });

  it("hashes independently of field declaration order", () => {
    const reordered = defineCollection({
      name: "videos",
      fields: {
        tags: field.stringArray({ facet: true }),
        thumbnailUrl: field.string({ index: false, optional: true }),
        title: field.string({ facet: false }),
        durationMs: field.int32({ sort: true }),
      },
      defaultSortingField: "durationMs",
    });

    expect(reordered.hash).toBe(videos.hash);
  });

  it("changes the hash when a field changes", () => {
    const changed = defineCollection({
      name: "videos",
      fields: { ...videos.fields, title: field.string({ facet: true }) },
      defaultSortingField: "durationMs",
    });

    expect(changed.hash).not.toBe(videos.hash);
  });

  it("infers the document type, with optional fields optional", () => {
    const doc: InferDocument<typeof videos> = {
      id: "v1",
      title: "A clip",
      durationMs: 3200,
      tags: ["demo"],
    };

    // @ts-expect-error — durationMs is a number, not a string
    const bad: InferDocument<typeof videos> = { ...doc, durationMs: "3200" };

    expect(doc.id).toBe("v1");
    expect(bad.tags).toEqual(["demo"]);
  });

  /**
   * Regression guard. A `TypesenseField`-typed constraint on `defineCollection` becomes the
   * inference target for each field and resets `optional` to `boolean`, which silently makes
   * every optional field required. These assertions stop compiling if that regresses.
   */
  it("preserves the optional literal through defineCollection", () => {
    type Fields = (typeof videos)["fields"];
    type Assert<T extends true> = T;

    type _OptionalStaysTrue = Assert<
      Fields["thumbnailUrl"]["optional"] extends true ? true : false
    >;
    type _RequiredStaysFalse = Assert<Fields["title"]["optional"] extends false ? true : false>;

    // Compiles only if thumbnailUrl is genuinely omissible.
    const withoutOptional: InferDocument<typeof videos> = {
      id: "v2",
      title: "No thumbnail",
      durationMs: 10,
      tags: [],
    };

    // @ts-expect-error — title is required and cannot be omitted
    const missingRequired: InferDocument<typeof videos> = { id: "v3", durationMs: 1, tags: [] };

    expect(videos.fields.thumbnailUrl.optional).toBe(true);
    expect(videos.fields.title.optional).toBe(false);
    expect(withoutOptional.thumbnailUrl).toBeUndefined();
    expect(missingRequired.id).toBe("v3");
  });
});
