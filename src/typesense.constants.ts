/**
 * Injection tokens.
 *
 * `Symbol.for`, not `Symbol`: the package ships both CJS and ESM builds, and a consumer can
 * end up with both loaded at once — one dependency requiring it, another importing it. Plain
 * symbols are unique per copy, so `@Inject(TYPESENSE_MODULE_OPTIONS)` in one build would not
 * match the provider registered by the other and Nest would fail to resolve it at bootstrap.
 * The global registry makes the token the same object across every copy.
 */
export const TYPESENSE_MODULE_OPTIONS = Symbol.for("nestjs-typesense:module-options");
export const TYPESENSE_CLIENT = Symbol.for("nestjs-typesense:client");
export const TYPESENSE_COLLECTIONS = Symbol.for("nestjs-typesense:collections");
export const TYPESENSE_COLLECTOR = "typesense:collector";
/** Per-class map of decorated property name -> field descriptor. */
export const TYPESENSE_FIELDS = "typesense:fields";
/** The collection built from a class decorated with `@TypesenseCollection`. */
export const TYPESENSE_COLLECTION = "typesense:collection";
