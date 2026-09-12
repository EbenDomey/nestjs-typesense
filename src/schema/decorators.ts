import "reflect-metadata";
import { TYPESENSE_COLLECTION, TYPESENSE_FIELDS } from "../typesense.constants.js";
import { defineCollection, isCollection, type TypesenseCollection } from "./collection.js";
import {
  createField,
  type TypesenseField,
  type TypesenseFieldOptions,
  type TypesenseFieldType,
  type TypesenseFieldTypeMap,
} from "./field.js";

/** A class decorated with `@TypesenseSchema`. */
export type TypesenseDocumentClass = abstract new (...args: never[]) => object;

/** Either declaration style is accepted wherever a collection is expected. */
export type TypesenseCollectionSource = TypesenseCollection | TypesenseDocumentClass;

/**
 * The property shape a field decorator demands of the class it annotates.
 *
 * This is what makes the decorators type-safe: `TOptional` and the field type both come
 * from the same decorator call, so TypeScript can check the annotated property against
 * them and reject a disagreement (as TS1240) at the declaration site. Splitting optionality
 * into a separate stacked decorator would break this — the two calls are checked
 * independently, so neither could see the other's flag.
 */
type PropTarget<
  TKey extends string,
  TType extends TypesenseFieldType,
  TOptional extends boolean,
> = TOptional extends true
  ? { [K in TKey]?: TypesenseFieldTypeMap[TType] }
  : { [K in TKey]: TypesenseFieldTypeMap[TType] };

type FieldMap = Map<string, TypesenseField>;

/** Property decorators receive the prototype; the metadata lives on the class itself. */
function constructorOf(prototype: object): object {
  return (prototype as { constructor: object }).constructor;
}

function recordField(target: object, key: string, definition: TypesenseField): void {
  const owner = constructorOf(target);
  // getOwnMetadata, not getMetadata: reflect-metadata resolves through the prototype
  // chain, so a subclass would otherwise mutate its base class's map in place.
  let fields = Reflect.getOwnMetadata(TYPESENSE_FIELDS, owner) as FieldMap | undefined;
  if (!fields) {
    fields = new Map();
    Reflect.defineMetadata(TYPESENSE_FIELDS, fields, owner);
  }
  fields.set(key, definition);
}

/** Walks base class -> derived so a subclass can override an inherited field. */
function collectFields(target: object): Record<string, TypesenseField> {
  const chain: object[] = [];
  for (
    let current: object | null = target;
    typeof current === "function" && current !== Function.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    chain.unshift(current);
  }

  const fields: Record<string, TypesenseField> = {};
  for (const link of chain) {
    const own = Reflect.getOwnMetadata(TYPESENSE_FIELDS, link) as FieldMap | undefined;
    if (!own) continue;
    for (const [key, definition] of own) fields[key] = definition;
  }
  return fields;
}

export interface TypesenseSchemaOptions<TSortField extends string = string> {
  /** Collection name in Typesense. Also the key used to resolve collectors. */
  name: string;
  /** Must name a decorated property. Typesense uses it to order unranked results. */
  defaultSortingField?: TSortField;
  tokenSeparators?: string[];
  symbolsToIndex?: string[];
}

/**
 * Declares a class as a Typesense collection, using the fields its properties declare.
 *
 * Builds the same object `defineCollection` returns — including the schema hash — so the
 * two declaration styles are interchangeable everywhere downstream.
 *
 * `TSortField` defaults to `never`, which makes the class constraint `Record<never, unknown>`
 * (i.e. no constraint) when `defaultSortingField` is omitted, and requires the named property
 * to exist on the class when it is given.
 */
export function TypesenseSchema<TSortField extends string = never>(
  options: TypesenseSchemaOptions<TSortField>,
) {
  return <TClass extends abstract new (...args: never[]) => Record<TSortField, unknown>>(
    target: TClass,
  ): TClass => {
    const fields = collectFields(target);

    // `id` is always emitted by toSchema, so a decorated `id` would produce a duplicate.
    // Declaring `id: string` on the class is legitimate (it is part of the document), so
    // drop it silently; anything else is a real mismatch and worth failing on.
    const declaredId = fields.id;
    if (declaredId) {
      if (declaredId.type !== "string") {
        throw new Error(
          `Collection "${options.name}" declares "id" as ${declaredId.type}; ` +
            "Typesense always stores id as a string. Remove the decorator — id is implicit.",
        );
      }
      delete fields.id;
    }

    const collection = defineCollection({
      name: options.name,
      fields,
      ...(options.defaultSortingField ? { defaultSortingField: options.defaultSortingField } : {}),
      ...(options.tokenSeparators ? { tokenSeparators: options.tokenSeparators } : {}),
      ...(options.symbolsToIndex ? { symbolsToIndex: options.symbolsToIndex } : {}),
    });

    Reflect.defineMetadata(TYPESENSE_COLLECTION, collection, target);
    return target;
  };
}

/**
 * Declares a field, naming its Typesense type explicitly.
 *
 * The per-type decorators below are the same thing with the type baked in; use whichever
 * reads better. Both reject a property whose TypeScript type disagrees with the field.
 */
export function TypesenseProp<TType extends TypesenseFieldType, TOptional extends boolean = false>(
  options: TypesenseFieldOptions<TOptional> & { type: TType },
) {
  return <TKey extends string, TTarget extends PropTarget<TKey, TType, TOptional>>(
    target: TTarget,
    key: TKey,
  ): void => {
    recordField(target as object, key, createField(options.type, options));
  };
}

function makeProp<TType extends TypesenseFieldType>(type: TType) {
  return <TOptional extends boolean = false>(options?: TypesenseFieldOptions<TOptional>) =>
    <TKey extends string, TTarget extends PropTarget<TKey, TType, TOptional>>(
      target: TTarget,
      key: TKey,
    ): void => {
      recordField(target as object, key, createField(type, options));
    };
}

export const TypesenseString = makeProp("string");
export const TypesenseInt32 = makeProp("int32");
export const TypesenseInt64 = makeProp("int64");
export const TypesenseFloat = makeProp("float");
export const TypesenseBool = makeProp("bool");
export const TypesenseGeopoint = makeProp("geopoint");
export const TypesenseObject = makeProp("object");
export const TypesenseAuto = makeProp("auto");

/**
 * Scalars that have an array counterpart. `auto` is absent from this union because
 * `TypesenseFieldTypeMap` has no `auto[]` key — the exclusion is structural, not hardcoded.
 */
export type TypesenseArrayElementType =
  | "string"
  | "int32"
  | "int64"
  | "float"
  | "bool"
  | "geopoint"
  | "object";

type ArrayOf<TElement extends TypesenseArrayElementType> = `${TElement}[]` & TypesenseFieldType;

/** Declares an array field. One decorator covers all seven array types. */
export function TypesenseArray<
  TElement extends TypesenseArrayElementType,
  TOptional extends boolean = false,
>(options: TypesenseFieldOptions<TOptional> & { type: TElement }) {
  return <TKey extends string, TTarget extends PropTarget<TKey, ArrayOf<TElement>, TOptional>>(
    target: TTarget,
    key: TKey,
  ): void => {
    const type = `${options.type}[]` as ArrayOf<TElement>;
    recordField(target as object, key, createField(type, options));
  };
}

/** The collection built for a decorated class, or undefined if it has no `@TypesenseSchema`. */
export function getTypesenseCollection(target: object): TypesenseCollection | undefined {
  return Reflect.getOwnMetadata(TYPESENSE_COLLECTION, target) as TypesenseCollection | undefined;
}

/** Normalises either declaration style to a collection. */
export function resolveCollection(source: TypesenseCollectionSource): TypesenseCollection {
  if (isCollection(source)) return source;

  const collection = getTypesenseCollection(source as object);
  if (!collection) {
    const name = (source as { name?: string }).name ?? String(source);
    throw new Error(
      `"${name}" is not a Typesense collection. Decorate the class with @TypesenseSchema(), ` +
        "or pass the result of defineCollection().",
    );
  }
  return collection;
}
