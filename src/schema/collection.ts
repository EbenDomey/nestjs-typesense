import { createHash } from "node:crypto";
import type { TypesenseField, TypesenseFieldType, TypesenseFieldTypeMap } from "./field.js";

/**
 * Constraint for a collection's field map.
 *
 * The `optional` flag is left as `any` rather than `boolean` on purpose: a `boolean` here
 * widens the literal `true`/`false` carried by each field during inference, which would
 * collapse the required/optional split that `InferDocument` depends on.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — `boolean` widens the literal.
export type TypesenseFieldRecord = Record<string, TypesenseField<TypesenseFieldType, any>>;

/** Resolves a field declaration to its TypeScript value type, honouring `optional`. */
type FieldValue<TField extends TypesenseField> = TypesenseFieldTypeMap[TField["type"]];

type RequiredKeys<TFields extends TypesenseFieldRecord> = {
  [K in keyof TFields]: TFields[K]["optional"] extends true ? never : K;
}[keyof TFields];

type OptionalKeys<TFields extends TypesenseFieldRecord> = {
  [K in keyof TFields]: TFields[K]["optional"] extends true ? K : never;
}[keyof TFields];

/**
 * The document shape for a collection, inferred from its field declarations.
 * `id` is always present — Typesense requires it and we always index it.
 */
export type InferDocument<TCollection extends TypesenseCollection> = { id: string } & {
  [K in RequiredKeys<TCollection["fields"]>]: FieldValue<TCollection["fields"][K]>;
} & {
  [K in OptionalKeys<TCollection["fields"]>]?: FieldValue<TCollection["fields"][K]>;
};

export interface TypesenseCollectionDefinition<TFields> {
  /** Collection name in Typesense. Also the key used to resolve collectors. */
  name: string;
  fields: TFields;
  /** Must name an int32/int64/float field. Typesense uses it to order unranked results. */
  defaultSortingField?: keyof TFields & string;
  /** Fields whose tokens are used for typo-tolerant matching by default. */
  tokenSeparators?: string[];
  symbolsToIndex?: string[];
}

/**
 * Returned instead of a collection when `fields` was not built with the `field.*` helpers.
 * Surfaces as a type error at the definition site with a readable message.
 */
export interface InvalidCollectionFields<TMessage extends string> {
  readonly __typesenseError: TMessage;
}

export interface TypesenseCollection<TFields extends TypesenseFieldRecord = TypesenseFieldRecord> {
  readonly name: string;
  readonly fields: TFields;
  readonly defaultSortingField?: string;
  readonly tokenSeparators?: string[];
  readonly symbolsToIndex?: string[];
  /** Stable hash of the schema. Changes whenever the shape changes. */
  readonly hash: string;
}

/** Serialised form handed to the Typesense HTTP API. */
export interface TypesenseCollectionSchema {
  name: string;
  fields: {
    name: string;
    type: string;
    index: boolean;
    optional: boolean;
    facet: boolean;
    sort?: boolean;
  }[];
  default_sorting_field?: string;
  token_separators?: string[];
  symbols_to_index?: string[];
}

export function toSchema(collection: TypesenseCollection): TypesenseCollectionSchema {
  const fields = Object.entries(collection.fields)
    // Sort by name so the emitted schema — and therefore the hash — is order-independent.
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, f]) => ({
      name,
      type: f.type,
      index: f.index,
      optional: f.optional,
      facet: f.facet,
      ...(f.sort === undefined ? {} : { sort: f.sort }),
    }));

  return {
    name: collection.name,
    fields: [{ name: "id", type: "string", index: true, optional: false, facet: false }, ...fields],
    ...(collection.defaultSortingField
      ? { default_sorting_field: collection.defaultSortingField }
      : {}),
    ...(collection.tokenSeparators ? { token_separators: collection.tokenSeparators } : {}),
    ...(collection.symbolsToIndex ? { symbols_to_index: collection.symbolsToIndex } : {}),
  };
}

/**
 * Declares a collection. The returned object carries a schema hash used to detect drift
 * between the code definition and the live collection at bootstrap.
 */
/**
 * Declares a collection. The returned object carries a schema hash used to detect drift
 * between the code definition and the live collection at bootstrap.
 *
 * `TFields` is intentionally unconstrained. A constraint mentioning `TypesenseField` becomes
 * the inference target for each property and resets the field's `optional` flag to `boolean`,
 * which would collapse the required/optional split in `InferDocument`. Validation therefore
 * happens in the return type, where it cannot interfere with inference.
 */
export function defineCollection<TFields>(
  definition: TypesenseCollectionDefinition<TFields>,
): TFields extends TypesenseFieldRecord
  ? TypesenseCollection<TFields>
  : InvalidCollectionFields<"`fields` must be declared with the `field.*` builders"> {
  const collection = {
    name: definition.name,
    fields: definition.fields,
    ...(definition.defaultSortingField
      ? { defaultSortingField: definition.defaultSortingField }
      : {}),
    ...(definition.tokenSeparators ? { tokenSeparators: definition.tokenSeparators } : {}),
    ...(definition.symbolsToIndex ? { symbolsToIndex: definition.symbolsToIndex } : {}),
    hash: "",
  } as unknown as TypesenseCollection;

  const hash = createHash("sha256")
    .update(JSON.stringify(toSchema(collection)))
    .digest("hex");

  return { ...collection, hash: hash.slice(0, 16) } as never;
}

export function isCollection(value: unknown): value is TypesenseCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TypesenseCollection).name === "string" &&
    typeof (value as TypesenseCollection).hash === "string"
  );
}
