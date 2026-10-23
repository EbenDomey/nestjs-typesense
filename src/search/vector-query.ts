import type { TypesenseCollection } from "../schema/collection.js";
import type { DocumentOf, TypesenseCollectionSource } from "../schema/decorators.js";

/**
 * Fields a `vector_query` can target.
 *
 * For a `defineCollection` collection that is every `float[]` field, auto-embedding or not.
 * A decorated class only exposes its instance type, so there it is every `number[]`
 * property — the class cannot tell a `float[]` from an `int32[]`. Geopoints are excluded on
 * both: a `[number, number]` is a `number[]` too.
 */
export type VectorFieldName<TSource extends TypesenseCollectionSource> =
  TSource extends TypesenseCollection<infer TFields>
    ? {
        [K in keyof TFields]: TFields[K] extends { readonly type: "float[]" } ? K : never;
      }[keyof TFields] &
        string
    : {
        [K in keyof DocumentOf<TSource>]-?: NonNullable<DocumentOf<TSource>[K]> extends [
          number,
          number,
        ]
          ? never
          : NonNullable<DocumentOf<TSource>[K]> extends number[]
            ? K
            : never;
      }[keyof DocumentOf<TSource>] &
        string;

/** `field:(...)` — the shape Typesense takes, with the field name checked by `SearchParams`. */
export type VectorQueryExpression<TField extends string = string> = `${TField}:(${string})`;

export interface VectorQueryTuning {
  /** Nearest neighbours to return. */
  k?: number;
  /** Drop hits further than this (cosine distance, 0..2). */
  distanceThreshold?: number;
  /** Hybrid search: weight of the vector score against the text score, 0..1. */
  alpha?: number;
  /** HNSW search breadth. */
  ef?: number;
  /** Below this many candidates, search exhaustively instead of through the HNSW graph. */
  flatSearchCutoff?: number;
}

/**
 * Exactly one source of the query vector: a document's own embedding (`id`), an explicit
 * vector, or neither — the empty form, which with `q` and the field in `query_by` tunes a
 * hybrid or semantic search.
 */
export type VectorQueryOptions = VectorQueryTuning &
  (
    | { id: string; vector?: never }
    | { vector: readonly number[]; id?: never }
    | { id?: never; vector?: never }
  );

function finite(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`vectorQuery ${name} must be a finite number, received ${value}`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`vectorQuery ${name} must be a positive integer, received ${value}`);
  }
  return value;
}

/**
 * Builds a `vector_query`:
 *
 *   vectorQuery("embedding", { id: "doc-id", k: 24, distanceThreshold: 0.6 })
 *   // => "embedding:([], id: doc-id, k: 24, distance_threshold: 0.6)"
 *
 *   vectorQuery("embedding", { vector: [0.1, 0.2], k: 10 })
 *   // => "embedding:([0.1,0.2], k: 10)"
 *
 * The result is typed `` `embedding:(${string})` ``, so assigning it to
 * `SearchParams.vector_query` checks the field against the collection's float[] fields.
 */
export function vectorQuery<const TField extends string>(
  field: TField,
  options: VectorQueryOptions,
): VectorQueryExpression<TField> {
  const { id, vector } = options;
  if (id !== undefined && vector !== undefined) {
    throw new Error("vectorQuery takes an id or a vector, not both");
  }

  const parts: string[] = [];
  if (vector !== undefined) {
    if (vector.length === 0) throw new Error("vectorQuery vector cannot be empty");
    parts.push(`[${vector.map((v) => finite(v, "vector entry")).join(",")}]`);
  } else {
    parts.push("[]");
  }

  if (id !== undefined) {
    // The id is interpolated bare — Typesense has no quoted form here — so a delimiter in it
    // would be read as syntax. Refuse rather than emit a query that means something else.
    if (id.length === 0 || /[,()[\]\s]/.test(id)) {
      throw new Error(
        `vectorQuery id ${JSON.stringify(id)} is empty or contains a delimiter (, ( ) [ ] or ` +
          "whitespace), which Typesense would read as query syntax.",
      );
    }
    parts.push(`id: ${id}`);
  }

  if (options.k !== undefined) parts.push(`k: ${positiveInteger(options.k, "k")}`);
  if (options.distanceThreshold !== undefined) {
    parts.push(`distance_threshold: ${finite(options.distanceThreshold, "distanceThreshold")}`);
  }
  if (options.alpha !== undefined) {
    const alpha = finite(options.alpha, "alpha");
    if (alpha < 0 || alpha > 1)
      throw new RangeError(`vectorQuery alpha must be 0..1, received ${alpha}`);
    parts.push(`alpha: ${alpha}`);
  }
  if (options.ef !== undefined) parts.push(`ef: ${positiveInteger(options.ef, "ef")}`);
  if (options.flatSearchCutoff !== undefined) {
    parts.push(
      `flat_search_cutoff: ${positiveInteger(options.flatSearchCutoff, "flatSearchCutoff")}`,
    );
  }

  return `${field}:(${parts.join(", ")})` as VectorQueryExpression<TField>;
}
