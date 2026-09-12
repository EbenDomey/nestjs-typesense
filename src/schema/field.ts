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
} as const;
