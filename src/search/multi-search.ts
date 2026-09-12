import type { DocumentOf, TypesenseCollectionSource } from "../schema/decorators.js";
import type { SearchParams } from "./params.js";
import type { SearchResult } from "./result.js";

/** One query in a multi-search: the collection to run it against, plus that collection's params. */
export type MultiSearchQuery<TSource extends TypesenseCollectionSource> = {
  collection: TSource;
} & SearchParams<TSource>;

/**
 * The queries, as a tuple.
 *
 * Written as a mapped type over `TSources` so TypeScript infers the source of each element
 * separately from its own `collection`. That is what keeps the results positional instead of
 * collapsing to one union of every document type.
 */
export type MultiSearchQueries<TSources extends readonly TypesenseCollectionSource[]> = readonly [
  ...{ [TIndex in keyof TSources]: MultiSearchQuery<TSources[TIndex]> },
];

/** Results in the order the queries were given, each typed to its own collection. */
export type MultiSearchResults<TSources extends readonly TypesenseCollectionSource[]> = {
  -readonly [TIndex in keyof TSources]: SearchResult<DocumentOf<TSources[TIndex]>>;
};
