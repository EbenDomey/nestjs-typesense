import type { TypesenseCollectionSource } from "../schema/decorators.js";
import { compileFilter } from "./compile-filter.js";
import type { SearchFieldName, TypesenseFilter } from "./filter.js";

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

/** `field:asc` / `field:desc`, plus Typesense's relevance pseudo-field. */
export type SortExpression<TSource extends TypesenseCollectionSource> =
  | `${SearchFieldName<TSource>}:asc`
  | `${SearchFieldName<TSource>}:desc`
  | "_text_match:asc"
  | "_text_match:desc";

export type SortSelection<TSource extends TypesenseCollectionSource> =
  | SortExpression<TSource>
  | SortExpression<TSource>[];

export interface SearchParams<TSource extends TypesenseCollectionSource> {
  q: string;
  query_by: FieldSelection<TSource>;
  /** A typed expression, or a raw Typesense filter string as the escape hatch. */
  filter_by?: TypesenseFilter<TSource> | string;
  sort_by?: SortSelection<TSource>;
  facet_by?: FieldSelection<TSource>;
  page?: number;
  per_page?: number;
  /** Anything else Typesense accepts, passed through untouched. */
  [key: string]: unknown;
}

function csv(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(",") : value;
}

/** Lowers typed search params to the flat string form the Typesense API takes. */
export function compileSearchParams<TSource extends TypesenseCollectionSource>(
  params: SearchParams<TSource>,
): Record<string, unknown> {
  const { query_by, filter_by, sort_by, facet_by, ...rest } = params;

  const filter =
    typeof filter_by === "string" ? filter_by : filter_by ? compileFilter(filter_by) : undefined;

  return {
    ...rest,
    query_by: csv(query_by),
    // An expression that compiles to nothing is dropped rather than sent as an empty
    // string, which Typesense rejects.
    ...(filter ? { filter_by: filter } : {}),
    ...(sort_by ? { sort_by: csv(sort_by) } : {}),
    ...(facet_by ? { facet_by: csv(facet_by) } : {}),
  };
}
