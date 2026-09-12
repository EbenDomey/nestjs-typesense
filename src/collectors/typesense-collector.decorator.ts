import "reflect-metadata";
import { Injectable } from "@nestjs/common";
import { resolveCollection, type TypesenseCollectionSource } from "../schema/decorators.js";
import { TYPESENSE_COLLECTOR } from "../typesense.constants.js";

/**
 * Marks a provider as the collector for a collection. The class must implement
 * `TypesenseCollector`. Applies `@Injectable()` so the class can be listed directly
 * in a module's `providers`.
 */
export function RegisterTypesenseCollector(
  collection: TypesenseCollectionSource | string,
): ClassDecorator {
  // Resolved rather than read off `.name` directly: on a decorated class that property is
  // `Function.name` — the class name, not the collection name.
  const name = typeof collection === "string" ? collection : resolveCollection(collection).name;

  return (target) => {
    Reflect.defineMetadata(TYPESENSE_COLLECTOR, name, target);
    Injectable()(target);
  };
}

export function isTypesenseCollector(target: object): boolean {
  return Reflect.hasMetadata(TYPESENSE_COLLECTOR, target);
}

export function getCollectorCollectionName(target: object): string | undefined {
  return Reflect.getMetadata(TYPESENSE_COLLECTOR, target) as string | undefined;
}
