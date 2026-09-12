import type { DocumentOf, TypesenseCollectionSource } from "../schema/decorators.js";

/** Every field name that can be filtered, sorted or faceted on, `id` included. */
export type SearchFieldName<TSource extends TypesenseCollectionSource> = Extract<
  keyof DocumentOf<TSource>,
  string
>;

/** The value a field holds, with the optional-ness stripped — `undefined` is not filterable. */
type FieldValueOf<
  TSource extends TypesenseCollectionSource,
  TName extends SearchFieldName<TSource>,
> = NonNullable<DocumentOf<TSource>[TName]>;

export interface StringFilter {
  /** `field:=value`, or `field:=[a,b]` for several. Exact match. */
  eq?: string | string[];
  ne?: string | string[];
  /** `field:value` — token match rather than exact. */
  match?: string;
}

export interface NumberFilter {
  eq?: number | number[];
  ne?: number | number[];
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  /** Inclusive on both ends: `field:[low..high]`. */
  between?: [number, number];
}

export interface BoolFilter {
  eq?: boolean;
  ne?: boolean;
}

export interface ArrayFilter<TElement> {
  /** The array contains this value. */
  has?: TElement;
  /** The array contains at least one of these. */
  hasAny?: TElement[];
  /** The array contains all of these. Compiles to one clause per value, ANDed. */
  hasAll?: TElement[];
  ne?: TElement | TElement[];
}

export interface GeoRadius {
  lat: number;
  lng: number;
  radius: number;
  /** Default `km`. */
  unit?: "km" | "mi";
}

export interface GeoFilter {
  /** Within `radius` of a point. */
  near?: GeoRadius;
  /** Inside a polygon, given as its vertices. Typesense closes the ring for you. */
  within?: [number, number][];
}

/**
 * Picks the operator set for a field from the TypeScript value it holds.
 *
 * The geopoint branch has to come first: a `[number, number]` is assignable to `number[]`,
 * so testing the array branch earlier would swallow geopoints into it and offer `has`/`hasAny`
 * on a coordinate pair. Each branch also accepts a bare value as shorthand for its
 * equality operator.
 */
type FilterFor<TValue> = [TValue] extends [[number, number]]
  ? GeoFilter
  : TValue extends readonly (infer TElement)[]
    ? ArrayFilter<TElement> | TElement | TElement[]
    : TValue extends string
      ? StringFilter | string | string[]
      : TValue extends number
        ? NumberFilter | number | number[]
        : TValue extends boolean
          ? BoolFilter | boolean
          : never;

/**
 * A filter expression over a collection's declared fields.
 *
 * Entries are ANDed. `$or` and `$and` nest further expressions; they are prefixed so they
 * cannot collide with a declared field name. There is no `$not` — see the note below.
 */
export type TypesenseFilter<TSource extends TypesenseCollectionSource> = {
  [TName in SearchFieldName<TSource>]?: FilterFor<FieldValueOf<TSource, TName>>;
} & {
  $and?: TypesenseFilter<TSource>[];
  $or?: TypesenseFilter<TSource>[];
};

// There is deliberately no `$not`. Typesense has no general negation operator in `filter_by`
// — only the per-field `:!=`, which is what `ne` compiles to. A `$not` would have to be
// pushed down through De Morgan onto each leaf, and `match` and `has` have no negated form
// at all, so it could not be honoured in general. Offering it would mean either a runtime
// throw for expressions that typecheck, or a filter that quietly means something else.
