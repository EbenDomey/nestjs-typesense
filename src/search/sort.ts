import type { TypesenseCollectionSource } from "../schema/decorators.js";
import { compileFilter } from "./compile-filter.js";
import type { TypesenseFilter } from "./filter.js";

export type SortDirection = "asc" | "desc";

declare const evalSource: unique symbol;

/**
 * An `_eval(...)` sort clause, built by `sortEval` or `sortEvalWeighted`.
 *
 * Branded with the collection its filter was checked against. The brand is what lets
 * `sort_by` infer that collection for the builder from context — so the filter's field names
 * are checked without the caller naming the collection — and what stops an `_eval` built for
 * one collection from being passed to another.
 */
export type EvalSortExpression<TSource extends TypesenseCollectionSource> =
  `_eval(${string}):${SortDirection}` & { readonly [evalSource]: TSource };

/** `_text_match(buckets: n):dir` / `_text_match(bucket_size: n):dir`. */
export type TextMatchSortExpression = `_text_match(${string}):${SortDirection}`;

/** One clause of a weighted `_eval`. */
export interface WeightedEvalClause<TSource extends TypesenseCollectionSource> {
  filter: TypesenseFilter<TSource> | string;
  score: number;
}

/** Compiles a filter for use inside `_eval`, refusing one that compiles to nothing. */
function evalFilter<TSource extends TypesenseCollectionSource>(
  filter: TypesenseFilter<TSource> | string,
): string {
  const compiled = typeof filter === "string" ? filter.trim() : compileFilter(filter);
  if (compiled.length === 0) {
    // An empty `_eval()` is a 400 from Typesense that does not say which clause was empty.
    throw new Error("_eval needs a non-empty filter");
  }
  return compiled;
}

function direction(value: unknown): SortDirection {
  if (value !== "asc" && value !== "desc") {
    throw new TypeError(
      `Sort direction must be "asc" or "desc", received ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Ranks documents matching `filter` above (`desc`) or below (`asc`) the rest:
 *
 *   sort_by: [sortEval({ brand: "acme" }, "desc"), "popularity:desc"]
 *
 * Inside `sort_by` the collection is inferred from the search, so the filter is checked
 * against its fields. Built anywhere else, name the collection: `sortEval<typeof products>(...)`.
 */
export function sortEval<TSource extends TypesenseCollectionSource>(
  filter: TypesenseFilter<TSource> | string,
  dir: SortDirection,
): EvalSortExpression<TSource> {
  return `_eval(${evalFilter(filter)}):${direction(dir)}` as EvalSortExpression<TSource>;
}

/**
 * Ranks documents into tiers by the first clause they match:
 *
 *   sortEvalWeighted([
 *     { filter: { categoryPathIds: { hasAny: [id] }, minPriceMinor: { between: [lo, hi] } }, score: 3 },
 *     { filter: { categoryPathIds: { hasAny: [id] } }, score: 2 },
 *   ], "desc")
 *   // => _eval([ (categoryPathIds:=[`id`] && minPriceMinor:[lo..hi]):3, (categoryPathIds:=[`id`]):2 ]):desc
 *
 * Two Typesense rules (measured on 30.2) shape how to use it:
 * - A document takes the score of the FIRST clause it matches, not the sum or the maximum.
 *   Order clauses most specific first; a broad clause listed early swallows narrower ones.
 * - `sort_by` may hold only one `_eval`. Fold every tier into this one call rather than
 *   adding a second `sortEval`; `compileSearchParams` refuses a second one before sending.
 */
export function sortEvalWeighted<TSource extends TypesenseCollectionSource>(
  clauses: readonly WeightedEvalClause<TSource>[],
  dir: SortDirection,
): EvalSortExpression<TSource> {
  if (clauses.length === 0) throw new Error("sortEvalWeighted needs at least one clause");

  const rendered = clauses.map(({ filter, score }) => {
    if (!Number.isInteger(score)) {
      throw new TypeError(`_eval scores must be integers, received ${JSON.stringify(score)}`);
    }
    return `(${evalFilter(filter)}):${score}`;
  });
  return `_eval([ ${rendered.join(", ")} ]):${direction(dir)}` as EvalSortExpression<TSource>;
}

/**
 * Text relevance, bucketed so that a secondary sort decides order within a bucket:
 *
 *   sort_by: [sortTextMatch({ buckets: 10 }, "desc"), "popularity:desc"]
 *
 * `buckets` divides the results into that many groups; `bucketSize` groups every n results.
 */
export function sortTextMatch(
  options: { buckets: number; bucketSize?: never } | { bucketSize: number; buckets?: never },
  dir: SortDirection,
): TextMatchSortExpression {
  const [key, value] =
    options.buckets !== undefined
      ? (["buckets", options.buckets] as const)
      : (["bucket_size", options.bucketSize] as const);
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`_text_match ${key} must be a positive integer, received ${value}`);
  }
  return `_text_match(${key}: ${value}):${direction(dir)}`;
}

/** Typesense's documented sort_by limit. */
const MAX_SORT_FIELDS = 3;

/**
 * Validates and joins a sort selection for the wire.
 *
 * The types already reject these for a literal `sort_by`; the checks are for one assembled
 * at runtime, where the server would otherwise answer with a 400 that names neither the
 * offending expression nor the fix.
 */
export function compileSortBy(sort: string | readonly string[] | undefined): string | undefined {
  if (sort === undefined) return undefined;
  const list = typeof sort === "string" ? (sort.length > 0 ? [sort] : []) : [...sort];
  if (list.length === 0) return undefined;

  if (list.length > MAX_SORT_FIELDS) {
    throw new Error(
      `sort_by has ${list.length} expressions, but Typesense allows at most ${MAX_SORT_FIELDS} ` +
        `("Only upto 3 sort fields are allowed"): ${list.join(", ")}`,
    );
  }

  const evals = list.filter((s) => s.startsWith("_eval("));
  if (evals.length > 1) {
    throw new Error(
      `sort_by has ${evals.length} _eval expressions, but Typesense allows only one ` +
        `("Only one sorting eval expression is allowed"). Combine them into a single ` +
        "sortEvalWeighted([...]) — note a document scores by the first clause it matches.",
    );
  }

  return list.join(",");
}
