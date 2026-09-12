import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { TypesenseClient } from "../client/typesense.client.js";
import { defineCollection, type InferDocument } from "../schema/collection.js";
import { TypesenseInt32, TypesenseSchema, TypesenseString } from "../schema/decorators.js";
import { field } from "../schema/field.js";

const videos = defineCollection({
  name: "videos",
  fields: { title: field.string(), durationMs: field.int32({ sort: true }) },
  defaultSortingField: "durationMs",
});

const products = defineCollection({
  name: "products",
  fields: { sku: field.string(), price: field.float(), inStock: field.bool() },
});

@TypesenseSchema({ name: "channels" })
class ChannelDocument {
  @TypesenseString() handle!: string;
  @TypesenseInt32() subscribers!: number;
}

type Assert<T extends true> = T;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * The acceptance criterion for this feature, and the thing most likely to silently regress:
 * results must stay positional. If the tuple inference collapses, every slot becomes the
 * same union of every document type in the batch and these assertions fail.
 *
 * Never called — `tsc --noEmit` is what checks it.
 */
async function _resultsAreTypedPerQuery(client: TypesenseClient): Promise<void> {
  const results = await client.multiSearch([
    { collection: videos, q: "a", query_by: "title" },
    { collection: products, q: "b", query_by: "sku" },
    { collection: ChannelDocument, q: "c", query_by: "handle" },
  ]);

  type _FirstIsVideo = Assert<
    Equals<(typeof results)[0]["hits"][number]["document"], InferDocument<typeof videos>>
  >;
  type _SecondIsProduct = Assert<
    Equals<(typeof results)[1]["hits"][number]["document"], InferDocument<typeof products>>
  >;
  type _ThirdIsChannel = Assert<
    Equals<(typeof results)[2]["hits"][number]["document"], { id: string } & ChannelDocument>
  >;

  // Length is fixed, so destructuring is exhaustive.
  const [video, product, channel] = results;
  const title: string | undefined = video.hits[0]?.document.title;
  const price: number | undefined = product.hits[0]?.document.price;
  const handle: string | undefined = channel.hits[0]?.document.handle;
  void title;
  void price;
  void handle;

  // @ts-expect-error there is no fourth query
  void results[3].found;
}

async function _paramsAreCheckedAgainstTheirOwnCollection(client: TypesenseClient): Promise<void> {
  await client.multiSearch([
    { collection: videos, q: "a", query_by: "title" },
    // @ts-expect-error "title" is a field of videos, not of products
    { collection: products, q: "b", query_by: "title" },
  ]);

  await client.multiSearch([
    // @ts-expect-error price is a float on products, not a string
    { collection: products, q: "b", query_by: "sku", filter_by: { price: { gt: "1" } } },
  ]);
}

describe("multiSearch", () => {
  it("returns an empty array without a round trip when given no queries", async () => {
    const client = new TypesenseClient({
      nodes: [{ host: "127.0.0.1", port: 1, protocol: "http" }],
      apiKey: "unused",
      connectionTimeoutSeconds: 1,
    });

    // Port 1 never answers, so this resolving at all proves nothing was sent.
    await expect(client.multiSearch([])).resolves.toEqual([]);
  });

  it("refuses a short result set rather than returning undefined in a typed slot", async () => {
    const client = new TypesenseClient({
      nodes: [{ host: "127.0.0.1", port: 1, protocol: "http" }],
      apiKey: "unused",
      connectionTimeoutSeconds: 1,
    });

    // Two queries, one result back. The declared return type is a 2-tuple, so returning
    // what arrived would put `undefined` where a SearchResult is promised.
    vi.spyOn(client.raw.multiSearch, "perform").mockResolvedValue({
      results: [{ found: 0, page: 1, hits: [] }],
    } as never);

    await expect(
      client.multiSearch([
        { collection: videos, q: "a", query_by: "title" },
        { collection: products, q: "b", query_by: "sku" },
      ]),
    ).rejects.toThrow(/sent 2 queries but Typesense returned 1/);
  });

  it("keeps the type-only guards referenced", () => {
    expect([_resultsAreTypedPerQuery, _paramsAreCheckedAgainstTheirOwnCollection]).toHaveLength(2);
  });
});
