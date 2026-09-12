import { Inject, Injectable, Logger } from "@nestjs/common";
import { Client } from "typesense";
import {
  type DocumentOf,
  resolveCollection,
  type TypesenseCollectionSource,
} from "../schema/decorators.js";
import { compileSearchParams, type SearchParams } from "../search/params.js";
import { TYPESENSE_MODULE_OPTIONS } from "../typesense.constants.js";
import type { TypesenseModuleOptions } from "../typesense.module-options.js";

/** Per-document outcome from a bulk import. */
interface ImportResult {
  success: boolean;
  error?: string;
}

export interface SearchResult<TDocument> {
  found: number;
  page: number;
  hits: { document: TDocument; highlights?: unknown[] }[];
  facets?: unknown[];
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

    return {
      found: result.found,
      page: result.page,
      hits: (result.hits ?? []) as SearchResult<DocumentOf<TSource>>["hits"],
      ...(result.facet_counts ? { facets: result.facet_counts } : {}),
    };
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
