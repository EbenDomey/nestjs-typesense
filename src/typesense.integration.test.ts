import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { HealthCheckService, TerminusModule } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  defineCollection,
  field,
  RegisterTypesenseCollector,
  resolveCollection,
  TypesenseClient,
  TypesenseCollections,
  type TypesenseCollector,
  TypesenseHealthIndicator,
  TypesenseIndexer,
  TypesenseInt32,
  TypesenseModule,
  TypesenseSchema,
  TypesenseString,
} from "../dist/index.js";

/**
 * Runs against a real Typesense server, and deliberately imports the BUILT package
 * (`../dist`) rather than `src`: vitest transpiles with esbuild, which honours
 * `experimentalDecorators` but silently drops `emitDecoratorMetadata`, so Nest cannot
 * resolve constructor injection from source. `npm run test:integration` builds first.
 *
 * Runs against a real Typesense server. Start one with:
 *
 *   docker run -p 8108:8108 -v /tmp/ts:/data typesense/typesense:latest \
 *     --data-dir /data --api-key=xyz --enable-cors
 *
 * or `brew services start typesense-server`. Point elsewhere with TYPESENSE_HOST /
 * TYPESENSE_PORT / TYPESENSE_API_KEY.
 */
const HOST = process.env.TYPESENSE_HOST ?? "localhost";
const PORT = Number(process.env.TYPESENSE_PORT ?? 8108);
const API_KEY = process.env.TYPESENSE_API_KEY ?? "xyz";

const connection = {
  nodes: [{ host: HOST, port: PORT, protocol: "http" }],
  apiKey: API_KEY,
  connectionTimeoutSeconds: 5,
};

const videos = defineCollection({
  name: "it_videos",
  fields: {
    title: field.string({ facet: true }),
    channel: field.string({ facet: true }),
    durationMs: field.int32(),
    tags: field.stringArray({ optional: true }),
  },
  defaultSortingField: "durationMs",
});

@TypesenseSchema({ name: "it_videos_cls" })
class VideoDoc {
  @TypesenseString({ facet: true }) title!: string;
  @TypesenseInt32() durationMs!: number;
}

async function drop(client: TypesenseClient, name: string): Promise<void> {
  try {
    await client.raw.collections(name).delete();
  } catch (error) {
    if ((error as { httpStatus?: number }).httpStatus !== 404) throw error;
  }
}

describe("integration: against a live Typesense server", () => {
  let app: TestingModule;
  let client: TypesenseClient;
  let collections: TypesenseCollections;

  beforeAll(async () => {
    // Fail loudly rather than silently skipping — a green run must mean the server was hit.
    const health = await fetch(`http://${HOST}:${PORT}/health`).catch(() => undefined);
    if (!health?.ok) {
      throw new Error(
        `No Typesense server at ${HOST}:${PORT}. See the comment at the top of this file.`,
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        TypesenseModule.forRoot({
          ...connection,
          collections: [videos, VideoDoc],
          migrations: "alter",
        }),
      ],
    }).compile();

    app = moduleRef;
    client = app.get(TypesenseClient);
    collections = app.get(TypesenseCollections);

    await drop(client, videos.name);
    await drop(client, "it_videos_cls");
    await drop(client, "it_drift");

    // Triggers onApplicationBootstrap -> the migration reconcile.
    await app.init();
  });

  afterAll(async () => {
    if (!client) return;
    await drop(client, videos.name);
    await drop(client, "it_videos_cls");
    await drop(client, "it_drift");
    await app?.close();
  });

  describe("bootstrap migrations", () => {
    it("creates a collection declared with defineCollection", async () => {
      const live = await client.raw.collections(videos.name).retrieve();
      const byName = Object.fromEntries((live.fields ?? []).map((f) => [f.name, f]));

      expect(live.name).toBe("it_videos");
      expect(byName.title?.type).toBe("string");
      expect(byName.title?.facet).toBe(true);
      expect(byName.durationMs?.type).toBe("int32");
      expect(byName.tags?.type).toBe("string[]");
      expect(byName.tags?.optional).toBe(true);
      expect(live.default_sorting_field).toBe("durationMs");
    });

    it("creates a collection declared with @TypesenseSchema", async () => {
      const live = await client.raw.collections("it_videos_cls").retrieve();
      const byName = Object.fromEntries((live.fields ?? []).map((f) => [f.name, f]));

      expect(live.name).toBe("it_videos_cls");
      expect(byName.title?.type).toBe("string");
      expect(byName.durationMs?.type).toBe("int32");
      // `id` is implicit: accepted on create, never echoed back by `retrieve()`.
      expect(byName.id).toBeUndefined();
    });

    it("alters a drifted collection in place, preserving documents", async () => {
      const before = defineCollection({
        name: "it_drift",
        fields: { title: field.string(), views: field.int32() },
        defaultSortingField: "views",
      });
      const after = defineCollection({
        name: "it_drift",
        fields: {
          title: field.string(),
          views: field.int32(),
          likes: field.int32({ optional: true, facet: true }),
        },
        defaultSortingField: "views",
      });

      const first = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({ ...connection, collections: [before], migrations: "alter" }),
        ],
      }).compile();
      await first.init();
      await first.get(TypesenseClient).upsert(before, [{ id: "d1", title: "keep me", views: 3 }]);
      await first.close();

      const second = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({ ...connection, collections: [after], migrations: "alter" }),
        ],
      }).compile();
      await second.init();

      const live = await client.raw.collections("it_drift").retrieve();
      expect((live.fields ?? []).map((f) => f.name)).toContain("likes");

      const kept = await client.raw.collections("it_drift").documents("d1").retrieve();
      expect((kept as { title: string }).title).toBe("keep me");
      await second.close();
    });

    it("drops a field that is no longer declared", async () => {
      const shrunk = defineCollection({
        name: "it_drift",
        fields: { title: field.string(), views: field.int32() },
        defaultSortingField: "views",
      });

      const moduleRef = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({ ...connection, collections: [shrunk], migrations: "alter" }),
        ],
      }).compile();
      await moduleRef.init();

      const live = await client.raw.collections("it_drift").retrieve();
      expect((live.fields ?? []).map((f) => f.name)).not.toContain("likes");
      await moduleRef.close();
    });

    it("skips — with an actionable warning — a required field added to a populated collection", async () => {
      const warnings: string[] = [];
      const spy = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation((message: unknown) => void warnings.push(String(message)));

      const withRequired = defineCollection({
        name: "it_drift",
        fields: { title: field.string(), views: field.int32(), author: field.string() },
        defaultSortingField: "views",
      });

      const moduleRef = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({
            ...connection,
            collections: [withRequired],
            migrations: "alter",
          }),
        ],
      }).compile();

      // Bootstrap must survive: unappliable drift is a warning, not an outage.
      await moduleRef.init();
      spy.mockRestore();

      const warning = warnings.find((w) => w.includes("it_drift"));
      expect(warning).toContain("author is required");
      expect(warning).toContain("already holds 1 document");
      expect(warning).toContain('migrations: "recreate"');

      const live = await client.raw.collections("it_drift").retrieve();
      expect((live.fields ?? []).map((f) => f.name)).not.toContain("author");
      await moduleRef.close();
    });

    it('leaves a drifted collection alone under the default "create" strategy', async () => {
      const drifted = defineCollection({
        name: "it_drift",
        fields: {
          title: field.string(),
          views: field.int32(),
          extra: field.string({ optional: true }),
        },
        defaultSortingField: "views",
      });

      const moduleRef = await Test.createTestingModule({
        imports: [TypesenseModule.forRoot({ ...connection, collections: [drifted] })],
      }).compile();
      await moduleRef.init();

      const live = await client.raw.collections("it_drift").retrieve();
      expect((live.fields ?? []).map((f) => f.name)).not.toContain("extra");
      await moduleRef.close();
    });
  });

  describe("querying", () => {
    beforeAll(async () => {
      await client.upsert(videos, [
        {
          id: "1",
          title: "Cats on skateboards",
          channel: "pets",
          durationMs: 90_000,
          tags: ["cat", "funny"],
        },
        {
          id: "2",
          title: "Dogs on skateboards",
          channel: "pets",
          durationMs: 120_000,
          tags: ["dog"],
        },
        { id: "3", title: "Advanced TypeScript generics", channel: "code", durationMs: 3_600_000 },
      ]);
      // Typesense indexes synchronously on import, but give the write a beat to settle.
      await client.raw.collections(videos.name).documents().export();
    });

    it("returns typed documents", async () => {
      const result = await client.search(videos, { q: "skateboards", query_by: "title" });

      expect(result.found).toBe(2);
      const titles = result.hits.map((h) => h.document.title).sort();
      expect(titles).toEqual(["Cats on skateboards", "Dogs on skateboards"]);

      const first = result.hits[0]?.document;
      expect(typeof first?.durationMs).toBe("number");
      expect(result.page).toBe(1);
    });

    it("honours optional fields being absent", async () => {
      const result = await client.search(videos, { q: "generics", query_by: "title" });
      expect(result.found).toBe(1);
      expect(result.hits[0]?.document.tags).toBeUndefined();
      expect(result.hits[0]?.document.id).toBe("3");
    });

    it("filters", async () => {
      const result = await client.search(videos, {
        q: "*",
        query_by: "title",
        filter_by: "durationMs:>100000",
      });
      expect(result.found).toBe(2);
    });

    it("facets", async () => {
      const result = await client.search(videos, {
        q: "*",
        query_by: "title",
        facet_by: "channel",
      });
      const counts = result.facets as {
        field_name: string;
        counts: { value: string; count: number }[];
      }[];
      const channel = counts.find((f) => f.field_name === "channel");
      expect(channel?.counts.find((c) => c.value === "pets")?.count).toBe(2);
    });

    it("paginates", async () => {
      const result = await client.search(videos, {
        q: "*",
        query_by: "title",
        per_page: 2,
        page: 2,
      });
      expect(result.found).toBe(3);
      expect(result.page).toBe(2);
      expect(result.hits).toHaveLength(1);
    });

    it("searches a decorated class passed directly, keeping its document type", async () => {
      // No cast on either call: the class instance type is the document type, so the
      // object literal is checked against it and `document.title` is already `string`.
      await client.upsert(VideoDoc, [{ id: "c1", title: "from a class", durationMs: 10 }]);

      const result = await client.search(VideoDoc, { q: "class", query_by: "title" });
      expect(result.found).toBe(1);
      expect(result.hits[0]?.document.title).toBe("from a class");
    });

    it("still accepts a collection resolved from a decorated class", async () => {
      const result = await client.search(resolveCollection(VideoDoc), {
        q: "class",
        query_by: "title",
      });
      expect(result.found).toBe(1);
    });

    it("searches a collection looked up by name from the registry", async () => {
      const result = await client.search(collections.get("it_videos"), {
        q: "skateboards",
        query_by: "title",
      });
      expect(result.found).toBe(2);
    });

    it("keeps field types when the registry is queried with the collection itself", async () => {
      const result = await client.search(collections.get(videos), {
        q: "skateboards",
        query_by: "title",
      });
      expect(result.found).toBe(2);
      // The annotation is the assertion: had the lookup erased the field types, `title`
      // would come back as the union of every field's value type and fail to compile.
      const title: string = result.hits[0]?.document.title ?? "";
      expect(title).toContain("skateboards");
    });
  });

  describe("writes", () => {
    it("upserts an existing document rather than duplicating it", async () => {
      await client.upsert(videos, [
        { id: "1", title: "Cats on skateboards (remastered)", channel: "pets", durationMs: 95_000 },
      ]);
      const result = await client.search(videos, { q: "remastered", query_by: "title" });
      expect(result.found).toBe(1);
      expect(result.hits[0]?.document.durationMs).toBe(95_000);
    });

    it("deletes documents", async () => {
      await client.delete(videos, ["2"]);
      const result = await client.search(videos, { q: "Dogs", query_by: "title" });
      expect(result.found).toBe(0);
    });

    it("treats deleting an absent document as success", async () => {
      await expect(client.delete(videos, ["does-not-exist"])).resolves.toBeUndefined();
    });

    it("reports an indexing failure through onError instead of throwing", async () => {
      const errors: unknown[] = [];
      const moduleRef = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({
            ...connection,
            collections: [videos],
            migrations: "off",
            onError: (e) => errors.push(e),
          }),
        ],
      }).compile();
      await moduleRef.init();

      // durationMs is int32; a string is rejected by the server.
      await moduleRef
        .get(TypesenseClient)
        .upsert(videos, [{ id: "bad", title: "x", channel: "y", durationMs: "nope" }] as never);

      expect(errors).toHaveLength(1);
      expect(String((errors[0] as Error).message)).toContain("failed to index");
      await moduleRef.close();
    });
  });

  describe("recreate strategy", () => {
    it("drops and rebuilds the collection, losing its documents", async () => {
      const before = defineCollection({
        name: "it_recreate",
        fields: { title: field.string(), views: field.int32() },
        defaultSortingField: "views",
      });
      const after = defineCollection({
        name: "it_recreate",
        fields: { title: field.string(), score: field.int32() },
        defaultSortingField: "score",
      });

      const first = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({ ...connection, collections: [before], migrations: "recreate" }),
        ],
      }).compile();
      await first.init();
      await first.get(TypesenseClient).upsert(before, [{ id: "r1", title: "doomed", views: 1 }]);
      await first.close();

      const second = await Test.createTestingModule({
        imports: [
          TypesenseModule.forRoot({ ...connection, collections: [after], migrations: "recreate" }),
        ],
      }).compile();
      await second.init();

      const live = await client.raw.collections("it_recreate").retrieve();
      const names = (live.fields ?? []).map((f) => f.name);
      expect(names).toContain("score");
      expect(names).not.toContain("views");
      // Documents are dropped with the collection — that is the point of "recreate".
      expect((live as { num_documents?: number }).num_documents).toBe(0);
      await second.close();
    });
  });

  describe("the indexer", () => {
    const catalogue = defineCollection({
      name: "it_catalogue",
      fields: { title: field.string(), price: field.int32() },
      defaultSortingField: "price",
    });

    interface Row {
      id: string;
      title: string;
      price: number;
      updatedAt: Date;
      deletedAt?: Date;
    }

    const rows: Row[] = [
      { id: "p1", title: "Desk", price: 100, updatedAt: new Date("2026-01-01") },
      { id: "p2", title: "Chair", price: 200, updatedAt: new Date("2026-01-01") },
      { id: "p3", title: "Lamp", price: 300, updatedAt: new Date("2026-06-01") },
    ];

    @RegisterTypesenseCollector(catalogue)
    class CatalogueCollector implements TypesenseCollector<typeof catalogue> {
      transform(entities: unknown[]) {
        return (entities as Row[]).map((r) => ({ id: r.id, title: r.title, price: r.price }));
      }

      async *fetchAll(ids?: string[]) {
        const selected = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
        // Two batches, to prove streaming rather than one big array.
        yield selected.slice(0, 2);
        if (selected.length > 2) yield selected.slice(2);
      }

      async *fetchChanged(since: Date) {
        yield rows.filter((r) => r.updatedAt > since && !r.deletedAt);
      }

      async *fetchRemoved(since: Date) {
        yield rows.filter((r) => r.deletedAt && r.deletedAt > since).map((r) => r.id);
      }
    }

    let app: TestingModule;
    let indexer: TypesenseIndexer;

    beforeAll(async () => {
      await drop(client, catalogue.name);
      app = await Test.createTestingModule({
        imports: [TypesenseModule.forRoot({ ...connection, collections: [catalogue] })],
        providers: [CatalogueCollector],
      }).compile();
      await app.init();
      indexer = app.get(TypesenseIndexer);
    });

    afterAll(async () => {
      await drop(client, catalogue.name);
      await app?.close();
    });

    it("reindexes every row, streaming in batches", async () => {
      const result = await indexer.reindex(catalogue);

      expect(result).toEqual({ collection: "it_catalogue", indexed: 3, removed: 0 });
      const all = await client.search(catalogue, { q: "*", query_by: "title" });
      expect(all.found).toBe(3);
    });

    it("reindexes a subset by id", async () => {
      const result = await indexer.reindex(catalogue, ["p1"]);
      expect(result.indexed).toBe(1);
    });

    it("resolves a collection by name", async () => {
      const result = await indexer.reindex("it_catalogue");
      expect(result.collection).toBe("it_catalogue");
    });

    it("syncs only what changed, and removes what was deleted", async () => {
      rows.push({
        id: "p4",
        title: "Rug",
        price: 400,
        updatedAt: new Date("2026-07-01"),
      });
      const chair = rows.find((r) => r.id === "p2");
      if (chair) chair.deletedAt = new Date("2026-07-01");

      const result = await indexer.sync(catalogue, new Date("2026-03-01"));

      // p3 (June) and p4 (July) changed; p2 was deleted.
      expect(result.indexed).toBe(2);
      expect(result.removed).toBe(1);

      const gone = await client.search(catalogue, { q: "Chair", query_by: "title" });
      expect(gone.found).toBe(0);
      const added = await client.search(catalogue, { q: "Rug", query_by: "title" });
      expect(added.found).toBe(1);
    });

    it("syncs every collection that has a collector", async () => {
      const results = await indexer.syncAll(new Date("2026-08-01"));
      expect(results.map((r) => r.collection)).toEqual(["it_catalogue"]);
    });

    it("fails loudly when a collection has no collector", async () => {
      await expect(indexer.reindex(videos)).rejects.toThrow(/No collector registered/);
    });
  });
});

/**
 * The point of this suite is that `@nestjs/terminus` is a devDependency here and nothing in
 * `src` imports it. It exists to check the one inference `TypesenseHealthIndicator` is built
 * on: that terminus' current API reads the status off the object a check RETURNS, rather
 * than requiring a thrown `HealthCheckError`. If that is wrong, the indicator silently
 * reports healthy for a dead cluster — so it is verified against the real service, not
 * assumed from the docs.
 */
describe("TypesenseHealthIndicator with @nestjs/terminus", () => {
  let moduleRef: TestingModule;
  let health: HealthCheckService;
  let indicator: TypesenseHealthIndicator;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TerminusModule, TypesenseModule.forRoot({ ...connection, migrations: "off" })],
    }).compile();
    await moduleRef.init();

    health = moduleRef.get(HealthCheckService);
    indicator = moduleRef.get(TypesenseHealthIndicator);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it("is injectable from the module without terminus being a dependency of the package", () => {
    expect(indicator).toBeInstanceOf(TypesenseHealthIndicator);
  });

  it("reports ok through terminus when the cluster answers", async () => {
    const result = await health.check([() => indicator.isHealthy("typesense")]);

    expect(result.status).toBe("ok");
    expect(result.info?.typesense?.status).toBe("up");
    expect(result.error).toEqual({});
  });

  it("reports error through terminus when the cluster does not answer", async () => {
    const dead = new TypesenseHealthIndicator(
      new TypesenseClient({
        nodes: [{ host: "127.0.0.1", port: 1, protocol: "http" }],
        apiKey: "unused",
        connectionTimeoutSeconds: 1,
        numRetries: 0,
      }),
    );

    // terminus throws a 503 ServiceUnavailableException once any indicator is down.
    const failure = await health.check([() => dead.isHealthy("typesense")]).catch((e) => e);

    const response = (
      failure as { response?: { status?: string; error?: Record<string, unknown> } }
    ).response;
    expect(response?.status).toBe("error");
    expect(response?.error?.typesense).toMatchObject({ status: "down" });
  });
});
