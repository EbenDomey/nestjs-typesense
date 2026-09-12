export { TypesenseClient } from "./client/typesense.client.js";
export { TypesenseCollections } from "./collections/typesense-collections.js";
export {
  getCollectorCollectionName,
  isTypesenseCollector,
  RegisterTypesenseCollector,
} from "./collectors/typesense-collector.decorator.js";
export type { TypesenseCollector } from "./collectors/typesense-collector.js";
export type { IndexResult } from "./collectors/typesense-indexer.js";
export { TypesenseIndexer } from "./collectors/typesense-indexer.js";
export type {
  TypesenseHealthDetail,
  TypesenseHealthResult,
} from "./health/typesense.health.js";
export { TypesenseHealthIndicator } from "./health/typesense.health.js";
export type {
  InferDocument,
  InvalidCollectionFields,
  TypesenseCollection,
  TypesenseCollectionDefinition,
  TypesenseCollectionSchema,
  TypesenseFieldRecord,
} from "./schema/collection.js";
export { defineCollection, isCollection, toSchema } from "./schema/collection.js";
export type {
  DocumentOf,
  TypesenseArrayElementType,
  TypesenseCollectionSource,
  TypesenseDocumentClass,
  TypesenseSchemaOptions,
} from "./schema/decorators.js";
export {
  getTypesenseCollection,
  resolveCollection,
  TypesenseArray,
  TypesenseAuto,
  TypesenseBool,
  TypesenseFloat,
  TypesenseGeopoint,
  TypesenseInt32,
  TypesenseInt64,
  TypesenseObject,
  TypesenseProp,
  TypesenseSchema,
  TypesenseString,
} from "./schema/decorators.js";
export type {
  TypesenseField,
  TypesenseFieldOptions,
  TypesenseFieldType,
  TypesenseFieldTypeMap,
} from "./schema/field.js";
export { createField, field } from "./schema/field.js";
export type { Geopoint, LatLng } from "./schema/geopoint.js";
export { createGeopoint, isGeopoint, parseGeopoint } from "./schema/geopoint.js";
export { compileFilter } from "./search/compile-filter.js";
export type {
  ArrayFilter,
  BoolFilter,
  GeoFilter,
  GeoRadius,
  NumberFilter,
  SearchFieldName,
  StringFilter,
  TypesenseFilter,
} from "./search/filter.js";
export type {
  MultiSearchQueries,
  MultiSearchQuery,
  MultiSearchResults,
} from "./search/multi-search.js";
export type {
  FieldSelection,
  SearchParams,
  SortExpression,
  SortSelection,
} from "./search/params.js";
export type { SearchResult } from "./search/result.js";
export {
  TYPESENSE_CLIENT,
  TYPESENSE_COLLECTION,
  TYPESENSE_COLLECTIONS,
  TYPESENSE_COLLECTOR,
  TYPESENSE_FIELDS,
  TYPESENSE_MODULE_OPTIONS,
} from "./typesense.constants.js";
export type { TypesenseModuleAsyncOptions } from "./typesense.module.js";
export { TypesenseModule } from "./typesense.module.js";
export type {
  TypesenseMigrationStrategy,
  TypesenseModuleOptions,
} from "./typesense.module-options.js";
