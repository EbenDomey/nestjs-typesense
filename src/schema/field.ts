/**
 * Typesense field types we support, mapped to the TypeScript value they hold.
 * `object`/`object[]` stay loose on purpose — Typesense does not constrain their shape.
 */
export interface TypesenseFieldTypeMap {
  string: string;
  "string[]": string[];
  int32: number;
  "int32[]": number[];
  int64: number;
  "int64[]": number[];
  float: number;
  "float[]": number[];
  bool: boolean;
  "bool[]": boolean[];
  geopoint: [number, number];
  "geopoint[]": [number, number][];
  object: Record<string, unknown>;
  "object[]": Record<string, unknown>[];
  auto: unknown;
}

export type TypesenseFieldType = keyof TypesenseFieldTypeMap;

/**
 * `TOptional` is threaded through as a literal (`true`/`false`) rather than widened to
 * `boolean`, so `InferDocument` can distinguish required fields from optional ones.
 */
export interface TypesenseFieldOptions<TOptional extends boolean = boolean> {
  /** Exclude from the search index. Stored and returned, but not queryable. Default true. */
  index?: boolean;
  /** Allow the field to be absent from a document. Default false. */
  optional?: TOptional;
  /** Enable faceting/aggregation on this field. Default false. */
  facet?: boolean;
  /** Enable sorting. Numeric fields are sortable by default; strings are not. */
  sort?: boolean;
}

export interface TypesenseField<
  TType extends TypesenseFieldType = TypesenseFieldType,
  TOptional extends boolean = boolean,
> {
  readonly type: TType;
  readonly index: boolean;
  readonly optional: TOptional;
  readonly facet: boolean;
  readonly sort?: boolean;
  /** Present only on auto-embedding fields — see `field.embedding`. */
  readonly embed?: TypesenseEmbedConfig;
  /** Vector dimensions. Typesense infers it for its built-in `ts/` models. */
  readonly numDim?: number;
}

/** The `model_config` block Typesense takes on an auto-embedding field. */
export interface TypesenseEmbedModelConfig {
  readonly model_name: string;
  readonly api_key?: string;
  readonly url?: string;
  readonly indexing_prefix?: string;
  readonly query_prefix?: string;
}

/**
 * The `embed` block of an auto-embedding field.
 *
 * `TFrom` keeps the source field names as a literal tuple so `defineCollection` and the
 * decorator can check them against the collection's own text fields.
 */
export interface TypesenseEmbedConfig<TFrom extends readonly string[] = readonly string[]> {
  readonly from: TFrom;
  readonly model_config: TypesenseEmbedModelConfig;
}

/** A `float[]` field Typesense fills in itself, by embedding the `from` fields. */
export interface TypesenseEmbeddingField<TFrom extends readonly string[] = readonly string[]>
  extends TypesenseField<"float[]", boolean> {
  readonly embed: TypesenseEmbedConfig<TFrom>;
}

declare const embeddingBrand: unique symbol;

/**
 * The value of an auto-embedding field: a `number[]` Typesense computed.
 *
 * Branded so the typed write path can tell it apart from an ordinary `float[]` field and
 * refuse it. Annotate a decorated class's embedding property with this type for the same
 * protection; a plain `number[]` annotation still works but stays writable.
 */
export type TypesenseEmbeddingVector = number[] & { readonly [embeddingBrand]: true };

export interface TypesenseEmbeddingOptions<TFrom extends readonly string[]> {
  /** The fields to embed. Must be `string` or `string[]` fields of the same collection. */
  from: TFrom;
  /** Model name, e.g. `ts/all-MiniLM-L12-v2` (built in) or `openai/text-embedding-3-small`. */
  model: string;
  /** For remote models (OpenAI, PaLM, ...). Not needed for `ts/` models. */
  apiKey?: string;
  /** A custom OpenAI-compatible endpoint. */
  url?: string;
  /** Prepended to each document's text before embedding (e.g. `passage:` for E5 models). */
  indexingPrefix?: string;
  /** Prepended to the query text before embedding (e.g. `query:` for E5 models). */
  queryPrefix?: string;
  /** Vector dimensions. Typesense infers it for its own models; leave unset unless required. */
  numDim?: number;
  /** Allow the field to be absent — needed when every `from` field can be absent. Default false. */
  optional?: boolean;
}

/**
 * Builds an auto-embedding field. Shared by `field.embedding` and `@TypesenseEmbedding`, for
 * the same byte-identical-hash reason as `createField`.
 *
 * Keys are only emitted when given, so a field without `apiKey` serialises — and hashes —
 * exactly as if the option did not exist.
 */
export function createEmbeddingField<const TFrom extends readonly string[]>(
  options: TypesenseEmbeddingOptions<TFrom>,
): TypesenseEmbeddingField<TFrom> {
  if (options.from.length === 0) {
    throw new Error("An embedding field needs at least one `from` field to embed");
  }
  if (options.numDim !== undefined && !(Number.isInteger(options.numDim) && options.numDim > 0)) {
    throw new TypeError(`numDim must be a positive integer, received ${options.numDim}`);
  }

  const model_config: TypesenseEmbedModelConfig = {
    model_name: options.model,
    ...(options.apiKey === undefined ? {} : { api_key: options.apiKey }),
    ...(options.url === undefined ? {} : { url: options.url }),
    ...(options.indexingPrefix === undefined ? {} : { indexing_prefix: options.indexingPrefix }),
    ...(options.queryPrefix === undefined ? {} : { query_prefix: options.queryPrefix }),
  };

  return {
    type: "float[]",
    index: true,
    optional: options.optional ?? false,
    facet: false,
    // Copied so a caller mutating its own array cannot change a declared schema.
    embed: { from: [...options.from] as unknown as TFrom, model_config },
    ...(options.numDim === undefined ? {} : { numDim: options.numDim }),
  };
}

/**
 * Builds a field descriptor. Shared by the `field.*` builders and the decorator API so
 * both declaration styles produce byte-identical field objects (and therefore hashes).
 */
export function createField<TType extends TypesenseFieldType, TOptional extends boolean = false>(
  type: TType,
  options: TypesenseFieldOptions<TOptional> = {},
): TypesenseField<TType, TOptional> {
  return {
    type,
    index: options.index ?? true,
    optional: (options.optional ?? false) as TOptional,
    facet: options.facet ?? false,
    ...(options.sort === undefined ? {} : { sort: options.sort }),
  };
}

/**
 * Field builders. Use these to declare a collection's fields:
 *
 *   fields: { title: field.string({ facet: true }), price: field.float() }
 */
export const field = {
  string: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("string", o),
  stringArray: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("string[]", o),
  int32: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("int32", o),
  int32Array: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("int32[]", o),
  int64: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("int64", o),
  int64Array: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("int64[]", o),
  float: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("float", o),
  floatArray: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("float[]", o),
  bool: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("bool", o),
  boolArray: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("bool[]", o),
  geopoint: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("geopoint", o),
  geopointArray: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("geopoint[]", o),
  object: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("object", o),
  objectArray: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("object[]", o),
  auto: <TOptional extends boolean = false>(o?: TypesenseFieldOptions<TOptional>) =>
    createField("auto", o),
  /**
   * An auto-embedding `float[]` field. Typesense computes it from `from` on every write, so
   * the typed write path neither requires nor accepts it.
   *
   *   embedding: field.embedding({ from: ["title", "tags"], model: "ts/all-MiniLM-L12-v2" })
   */
  embedding: <const TFrom extends readonly string[]>(o: TypesenseEmbeddingOptions<TFrom>) =>
    createEmbeddingField(o),
} as const;
