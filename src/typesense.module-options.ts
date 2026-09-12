import type { ConfigurationOptions } from "typesense/lib/Typesense/Configuration.js";
import type { TypesenseCollectionSource } from "./schema/decorators.js";

/**
 * What to do at bootstrap when a collection's declared schema no longer matches
 * the one Typesense is holding.
 *
 * - `off`      never touch the live collection; log the drift only.
 * - `create`   create collections that do not exist yet; leave drifted ones alone. (default)
 * - `alter`    additionally add new fields and drop removed ones in place.
 * - `recreate` drop and rebuild the collection. Destroys its documents — pair with a reindex.
 */
export type TypesenseMigrationStrategy = "off" | "create" | "alter" | "recreate";

export interface TypesenseModuleOptions extends ConfigurationOptions {
  /**
   * Collections this application owns. Registered and migrated at bootstrap.
   * Accepts `defineCollection()` results and `@TypesenseSchema()` classes alike.
   */
  collections?: TypesenseCollectionSource[];
  /** Default `create`. */
  migrations?: TypesenseMigrationStrategy;
  /** Called on client transport errors instead of throwing. Useful for OTel/Sentry capture. */
  onError?: (error: unknown) => void;
}
