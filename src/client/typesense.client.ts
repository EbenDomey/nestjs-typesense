import { Inject, Injectable, Logger } from "@nestjs/common";
import { Client } from "typesense";
import {
  type DocumentOf,
  resolveCollection,
  type TypesenseCollectionSource,
} from "../schema/decorators.js";
import type { MultiSearchQueries, MultiSearchResults } from "../search/multi-search.js";
import { compileSearchParams, type SearchParams } from "../search/params.js";
import { type SearchResult, toSearchResult } from "../search/result.js";
import { TYPESENSE_MODULE_OPTIONS } from "../typesense.constants.js";
import type { TypesenseModuleOptions } from "../typesense.module-options.js";

/** Per-document outcome from a bulk import. */
interface ImportResult {
  success: boolean;
  error?: string;
}

/**
 * Thin wrapper over the official Typesense client, typed against collection definitions.
 * Deliberately does not impose a pagination or error envelope — callers keep their own.
 */
@Injectable()
export class TypesenseClient {
  private readonly logger = new Logger(TypesenseClient.name);
  readonly raw: Client;

  constructor(@Inject(TYPESENSE_MODULE_OPTIONS) private readonly options: TypesenseModuleOptions) {
    const { collections: _c, migrations: _m, onError: _e, ...config } = options;
    this.raw = new Client(config);
  }

  async search<TSource extends TypesenseCollectionSource>(
    collection: TSource,
    params: SearchParams<TSource>,
  ): Promise<SearchResult<DocumentOf<TSource>>> {
    const { name } = resolveCollection(collection);
    const result = await this.raw
      .collections<DocumentOf<TSource> & object>(name)
      .documents()
      .search(compileSearchParams(params) as never);

    return toSearchResult<DocumentOf<TSource>>(result, name);
  }

  /**
   * Several queries in one round trip, each typed to its own collection.
   *
   * Results come back positionally — `results[0]` is typed against the first query's
   * collection, not as a union of every document type in the batch:
   *
   *   const [videos, channels] = await client.multiSearch([
   *     { collection: videoCollection, q: "x", query_by: "title" },
   *     { collection: ChannelDocument, q: "x", query_by: "handle" },
   *   ])
   */
  async multiSearch<const TSources extends readonly TypesenseCollectionSource[]>(
    queries: MultiSearchQueries<TSources>,
  ): Promise<MultiSearchResults<TSources>> {
    if (queries.length === 0) return [] as unknown as MultiSearchResults<TSources>;

    const names: string[] = [];
    const searches = queries.map((query) => {
      const { collection, ...params } = query;
      const { name } = resolveCollection(collection as TypesenseCollectionSource);
      names.push(name);
      return { collection: name, ...compileSearchParams(params as never) };
    });

    const response = await this.raw.multiSearch.perform({ searches } as never);
    const results = (response as { results?: unknown[] }).results ?? [];

    // Typesense answers 200 even when an individual query failed, reporting the failure
    // inside its slot; `toSearchResult` turns that into a throw naming the collection.
    return results.map((result, index) =>
      toSearchResult(result, names[index] ?? `query ${index}`),
    ) as MultiSearchResults<TSources>;
  }

  async upsert<TSource extends TypesenseCollectionSource>(
    collection: TSource,
    documents: DocumentOf<TSource>[],
  ): Promise<void> {
    if (documents.length === 0) return;

    const { name } = resolveCollection(collection);

    // typesense-js throws `ImportError` when any document is rejected rather than
    // returning the per-document results, so the failure path lives in the catch.
    // Transport errors carry no `importResults` and are rethrown — only per-document
    // rejections are routed through `onError`.
    try {
      const results = await this.raw
        .collections(name)
        .documents()
        .import(documents, { action: "upsert" });

      this.reportImportFailures(results, documents.length, name);
    } catch (error) {
      const results = (error as { importResults?: ImportResult[] }).importResults;
      if (!results) throw error;
      this.reportImportFailures(results, documents.length, name);
    }
  }

  private reportImportFailures(results: ImportResult[], total: number, name: string): void {
    const failures = results.filter((r) => !r.success);
    if (failures.length === 0) return;

    this.handleError(
      new Error(
        `${failures.length}/${total} documents failed to index into "${name}": ${failures[0]?.error}`,
      ),
    );
  }

  async delete(collection: TypesenseCollectionSource, ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const { name } = resolveCollection(collection);

    await Promise.all(
      ids.map(async (id) => {
        try {
          await this.raw.collections(name).documents(id).delete();
        } catch (error) {
          // A document already gone is not a failure — the desired end state holds.
          if ((error as { httpStatus?: number }).httpStatus !== 404) this.handleError(error);
        }
      }),
    );
  }

  private handleError(error: unknown): void {
    if (this.options.onError) {
      this.options.onError(error);
      return;
    }
    this.logger.error(error instanceof Error ? error.message : String(error));
  }
}
