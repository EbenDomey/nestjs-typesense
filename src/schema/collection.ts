import { createHash } from "node:crypto";
import type {
  TypesenseEmbedConfig,
  TypesenseEmbeddingVector,
  TypesenseField,
  TypesenseFieldType,
  TypesenseFieldTypeMap,
} from "./field.js";

/**
 * Constraint for a collection's field map.
 *
 * The `optional` flag is left as `any` rather than `boolean` on purpose: a `boolean` here
 * widens the literal `true`/`false` carried by each field during inference, which would
 * collapse the required/optional split that `InferDocument` depends on.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — `boolean` widens the literal.
export type TypesenseFieldRecord = Record<string, TypesenseField<TypesenseFieldType, any>>;

/** An auto-embedding field, recognised by its `embed` block. */
type IsEmbedding<TField> = TField extends { readonly embed: object } ? true : false;

/** Resolves a field declaration to its TypeScript value type, honouring `optional`. */
type FieldValue<TField extends TypesenseField> =
  IsEmbedding<TField> extends true
    ? TypesenseEmbeddingVector
    : TypesenseFieldTypeMap[TField["type"]];

// An embedding field is always optional in the document, whatever its `optional` flag says:
// Typesense computes it, so a document read back may or may not carry it, and a document
// written must not (see `WritableDocument`).
type RequiredKeys<TFields extends TypesenseFieldRecord> = {
  [K in keyof TFields]: IsEmbedding<TFields[K]> extends true
    ? never
    : TFields[K]["optional"] extends true
      ? never
      : K;
}[keyof TFields];

type OptionalKeys<TFields extends TypesenseFieldRecord> = {
  [K in keyof TFields]: IsEmbedding<TFields[K]> extends true
    ? K
    : TFields[K]["optional"] extends true
      ? K
      : never;
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

/**
 * A document as written through the typed API: auto-embedding fields removed, and declared
 * `never` so a document that still carries one is a compile error rather than a 400.
 *
 * Keyed off the `TypesenseEmbeddingVector` brand rather than the field map, so it works for
 * a decorated class too — there the instance type is all the type system can see.
 */
export type WritableDocument<TDocument> = [EmbeddingKeys<TDocument>] extends [never]
  ? // Left untouched when there is nothing to strip, so a collection without embeddings keeps
    // exactly the document type — and the error messages — it had before they existed.
    TDocument
  : { [K in keyof TDocument as K extends EmbeddingKeys<TDocument> ? never : K]: TDocument[K] } & {
      [K in EmbeddingKeys<TDocument>]?: never;
    };

type EmbeddingKeys<TDocument> = {
  [K in keyof TDocument]-?: NonNullable<TDocument[K]> extends TypesenseEmbeddingVector ? K : never;
}[keyof TDocument];

/** Field names whose declared type Typesense accepts as an embedding source. */
type TextFieldName<TFields> = {
  [K in keyof TFields]: TFields[K] extends { readonly type: "string" | "string[]" } ? K : never;
}[keyof TFields];

/** Every `from` entry, across all embedding fields, that is not a text field of the collection. */
type BadEmbedSources<TFields> = {
  [K in keyof TFields]: TFields[K] extends {
    readonly embed: { readonly from: readonly (infer S)[] };
  }
    ? Exclude<S, TextFieldName<TFields>>
    : never;
}[keyof TFields];

/**
 * Rejects an embedding whose `from` names a field that does not exist or is not text.
 *
 * Intersected onto the parameter rather than placed in `TFields`' constraint: a constraint
 * would poison inference of each field's `optional` literal (see `defineCollection`). As an
 * intersection member it only adds a required property — whose type is the message — when
 * something is wrong, so the error lands on the definition itself.
 */
export type EmbedSourceCheck<TFields> = [BadEmbedSources<TFields>] extends [never]
  ? unknown
  : {
      readonly embeddingSourceError: `embedding "from" names "${BadEmbedSources<TFields> & string}", which is not a string or string[] field of this collection`;
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

/** One field as handed to the Typesense HTTP API. */
export interface TypesenseFieldSchema {
  name: string;
  type: string;
  index: boolean;
  optional: boolean;
  facet: boolean;
  sort?: boolean;
  embed?: TypesenseEmbedConfig;
  num_dim?: number;
}

/** Serialised form handed to the Typesense HTTP API. */
export interface TypesenseCollectionSchema {
  name: string;
  fields: TypesenseFieldSchema[];
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
      // Appended, and only when present, so every pre-existing field serialises exactly as
      // it did before embeddings existed — and existing collections keep their hashes.
      ...(f.embed === undefined
        ? {}
        : { embed: { from: [...f.embed.from], model_config: { ...f.embed.model_config } } }),
      ...(f.numDim === undefined ? {} : { num_dim: f.numDim }),
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
 *
 * `TFields` is intentionally unconstrained. A constraint mentioning `TypesenseField` becomes
 * the inference target for each property and resets the field's `optional` flag to `boolean`,
 * which would collapse the required/optional split in `InferDocument`. Validation therefore
 * happens in the return type, where it cannot interfere with inference.
 */
export function defineCollection<TFields>(
  definition: TypesenseCollectionDefinition<TFields> & EmbedSourceCheck<TFields>,
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
    .update(JSON.stringify(withoutSecrets(toSchema(collection))))
    .digest("hex");

  return { ...collection, hash: hash.slice(0, 16) } as never;
}

/**
 * The schema minus embedding API keys, for hashing.
 *
 * A key is a credential, not part of the collection's shape: rotating it must not look like
 * schema drift, or a consumer that versions collections by hash would rebuild the index on
 * every rotation. It stays in `toSchema` — Typesense needs it to create the collection.
 */
function withoutSecrets(schema: TypesenseCollectionSchema): TypesenseCollectionSchema {
  return {
    ...schema,
    fields: schema.fields.map((f) => {
      if (!f.embed?.model_config.api_key) return f;
      const { api_key: _secret, ...model_config } = f.embed.model_config;
      return { ...f, embed: { ...f.embed, model_config } };
    }),
  };
}

export function isCollection(value: unknown): value is TypesenseCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TypesenseCollection).name === "string" &&
    typeof (value as TypesenseCollection).hash === "string"
  );
}
