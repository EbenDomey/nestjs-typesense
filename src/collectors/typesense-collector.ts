import type { TypesenseCollection } from "../schema/collection.js";
import type { DocumentOf, TypesenseCollectionSource } from "../schema/decorators.js";

/**
 * Feeds documents into a collection.
 *
 * This is deliberately pull-based rather than driven by database change events, so it
 * works over any store. With Postgres each method is an ordinary query — `fetchChanged`
 * is a `WHERE updated_at > $1`, `fetchRemoved` reads your soft-delete or tombstone table.
 *
 * Every method yields batches so a full reindex streams instead of loading the table
 * into memory.
 */
export interface TypesenseCollector<
  TSource extends TypesenseCollectionSource = TypesenseCollection,
> {
  /** Map a batch of source rows to Typesense documents. */
  transform(entities: unknown[]): DocumentOf<TSource>[];

  /** Every row, for a full rebuild. Optionally narrowed to specific ids. */
  fetchAll(ids?: string[]): AsyncGenerator<unknown[], void, void>;

  /** Rows created or updated since `since`, for an incremental pass. */
  fetchChanged(since: Date): AsyncGenerator<unknown[], void, void>;

  /** Ids deleted since `since`. Omit if the source never hard-deletes. */
  fetchRemoved?(since: Date): AsyncGenerator<string[], void, void>;
}
