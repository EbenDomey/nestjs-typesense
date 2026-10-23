import type { TypesenseCollectionSource } from "../schema/decorators.js";
import { compileFilter } from "./compile-filter.js";
import type { SearchFieldName, TypesenseFilter } from "./filter.js";
import {
  compileSortBy,
  type EvalSortExpression,
  type SortDirection,
  type TextMatchSortExpression,
} from "./sort.js";
import type { VectorFieldName, VectorQueryExpression } from "./vector-query.js";

/**
 * Fields to search, sort or facet on.
 *
 * A field name or an array of them, rather than the comma-separated string Typesense takes
 * on the wire. Validating a CSV *string* would mean capturing it in a generic type parameter
 * on `search` so the literal survives, which makes the signature — and much more so its
 * error messages — considerably worse. An array is checked element by element and
 * autocompletes; it is joined before the request goes out.
 */
export type FieldSelection<TSource extends TypesenseCollectionSource> =
  | SearchFieldName<TSource>
  | SearchFieldName<TSource>[];

/** Every sort expression except `_eval`, which is limited to one per `sort_by`. */
type PlainSortExpression<TSource extends TypesenseCollectionSource> =
  | `${SearchFieldName<TSource>}:${SortDirection}`
  | `_text_match:${SortDirection}`
  | TextMatchSortExpression
  | `_vector_distance:${SortDirection}`;

/**
 * `field:asc` / `field:desc`, Typesense's relevance and vector-distance pseudo-fields,
 * bucketed `_text_match` (`sortTextMatch`) and `_eval` (`sortEval` / `sortEvalWeighted`).
 */
export type SortExpression<TSource extends TypesenseCollectionSource> =
  | PlainSortExpression<TSource>
  | EvalSortExpression<TSource>;

/**
 * One sort expression, or up to three of them with at most one `_eval`.
 *
 * Both limits are Typesense's ("Only upto 3 sort fields are allowed", "Only one sorting
 * eval expression is allowed"); spelling them out as tuples makes a literal that breaks
 * either a compile error. A list assembled at runtime is re-checked before sending.
 */
export type SortSelection<TSource extends TypesenseCollectionSource> =
  | SortExpression<TSource>
  | SortTuple<PlainSortExpression<TSource>, EvalSortExpression<TSource>>;

type SortTuple<P, E> =
  | readonly []
  | readonly [P | E]
  | readonly [P, P]
  | readonly [E, P]
  | readonly [P, E]
  | readonly [P, P, P]
  | readonly [E, P, P]
  | readonly [P, E, P]
  | readonly [P, P, E];

export interface SearchParams<TSource extends TypesenseCollectionSource> {
  q: string;
  query_by: FieldSelection<TSource>;
  /** A typed expression, or a raw Typesense filter string as the escape hatch. */
  filter_by?: TypesenseFilter<TSource> | string;
  sort_by?: SortSelection<TSource>;
  facet_by?: FieldSelection<TSource>;
  /**
   * Nearest-neighbour query on a float[] / embedding field — build it with `vectorQuery`.
   * The field name is checked against the collection.
   */
  vector_query?: VectorQueryExpression<VectorFieldName<TSource>>;
  page?: number;
  per_page?: number;
  /** Anything else Typesense accepts, passed through untouched. */
  [key: string]: unknown;
}

/**
 * Joins a field selection for the wire.
 *
 * An empty selection returns `undefined` rather than `""`. Typesense rejects an empty
 * `sort_by`/`facet_by` with a 400 that does not name the parameter, so sending one turns a
 * `facet_by: []` — which a caller naturally writes when the facet list is built up
 * conditionally — into an error about the search rather than about the field list.
 */
function csv(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.length > 0 ? value.join(",") : undefined;
  return value.length > 0 ? value : undefined;
}

/** Lowers typed search params to the flat string form the Typesense API takes. */
export function compileSearchParams<TSource extends TypesenseCollectionSource>(
  params: SearchParams<TSource>,
): Record<string, unknown> {
  const { query_by, filter_by, sort_by, facet_by, ...rest } = params;

  const filter =
    typeof filter_by === "string" ? filter_by : filter_by ? compileFilter(filter_by) : undefined;

  const compiledQueryBy = csv(query_by);
  const compiledSortBy = compileSortBy(sort_by);
  const compiledFacetBy = csv(facet_by);
  if (compiledQueryBy === undefined) {
    // Required by Typesense. Caught here so the message names the parameter, rather than
    // letting the server answer with a generic 400.
    throw new Error("search requires a non-empty query_by");
  }

  return {
    ...rest,
    query_by: compiledQueryBy,
    // An expression that compiles to nothing is dropped rather than sent as an empty
    // string, which Typesense rejects.
    ...(filter ? { filter_by: filter } : {}),
    // Keyed off the compiled value, not the raw one: `[]` is truthy, so testing the input
    // would spread `sort_by: undefined` and put the key back on the request.
    ...(compiledSortBy ? { sort_by: compiledSortBy } : {}),
    ...(compiledFacetBy ? { facet_by: compiledFacetBy } : {}),
  };
}
