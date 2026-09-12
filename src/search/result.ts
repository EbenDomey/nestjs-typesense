export interface SearchResult<TDocument> {
  found: number;
  page: number;
  hits: { document: TDocument; highlights?: unknown[] }[];
  facets?: unknown[];
}

/** The raw Typesense search response, plus the per-query error shape multi-search can return. */
interface RawSearchResponse {
  found?: number;
  page?: number;
  hits?: unknown[];
  facet_counts?: unknown[];
  error?: string;
  code?: number;
}

/**
 * Normalises one Typesense response.
 *
 * `label` names the collection for the error path: `multi_search` answers 200 and reports a
 * failed query *inside* its results array, so a query that failed would otherwise surface as
 * `found: 0` — indistinguishable from a query that legitimately matched nothing.
 */
export function toSearchResult<TDocument>(
  response: unknown,
  label: string,
): SearchResult<TDocument> {
  const raw = response as RawSearchResponse;

  if (raw.error) {
    throw new Error(
      `Typesense search on "${label}" failed (${raw.code ?? "no code"}): ${raw.error}`,
    );
  }

  return {
    found: raw.found ?? 0,
    page: raw.page ?? 1,
    hits: (raw.hits ?? []) as SearchResult<TDocument>["hits"],
    ...(raw.facet_counts ? { facets: raw.facet_counts } : {}),
  };
}
