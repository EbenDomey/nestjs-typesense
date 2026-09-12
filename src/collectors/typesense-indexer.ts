import { Injectable, Logger } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { TypesenseClient } from "../client/typesense.client.js";
import { TypesenseCollections } from "../collections/typesense-collections.js";
import type { TypesenseCollection } from "../schema/collection.js";
import { getCollectorCollectionName } from "./typesense-collector.decorator.js";
import type { TypesenseCollector } from "./typesense-collector.js";

export interface IndexResult {
  collection: string;
  indexed: number;
  removed: number;
}

/**
 * Drives the registered collectors. Call `reindex` from a CLI command or a startup task,
 * and `sync` from a cron job for incremental catch-up.
 */
@Injectable()
export class TypesenseIndexer {
  private readonly logger = new Logger(TypesenseIndexer.name);

  constructor(
    private readonly modules: ModulesContainer,
    private readonly client: TypesenseClient,
    private readonly collections: TypesenseCollections,
  ) {}

  /** Full rebuild of one collection. Existing documents are upserted, not dropped. */
  async reindex(collection: TypesenseCollection | string, ids?: string[]): Promise<IndexResult> {
    const resolved = this.resolve(collection);
    const collector = this.collectorFor(resolved.name);
    let indexed = 0;

    for await (const batch of collector.fetchAll(ids)) {
      const documents = collector.transform(batch);
      await this.client.upsert(resolved, documents);
      indexed += documents.length;
    }

    this.logger.log(`Reindexed ${indexed} document(s) into "${resolved.name}"`);
    return { collection: resolved.name, indexed, removed: 0 };
  }

  /** Incremental pass: everything created, updated or deleted since `since`. */
  async sync(collection: TypesenseCollection | string, since: Date): Promise<IndexResult> {
    const resolved = this.resolve(collection);
    const collector = this.collectorFor(resolved.name);
    let indexed = 0;
    let removed = 0;

    for await (const batch of collector.fetchChanged(since)) {
      const documents = collector.transform(batch);
      await this.client.upsert(resolved, documents);
      indexed += documents.length;
    }

    if (collector.fetchRemoved) {
      for await (const ids of collector.fetchRemoved(since)) {
        await this.client.delete(resolved, ids);
        removed += ids.length;
      }
    }

    return { collection: resolved.name, indexed, removed };
  }

  /** Runs `sync` for every collection that has a collector. */
  async syncAll(since: Date): Promise<IndexResult[]> {
    const results: IndexResult[] = [];

    for (const collection of this.collections.all()) {
      if (!this.findCollector(collection.name)) continue;
      results.push(await this.sync(collection, since));
    }

    return results;
  }

  private resolve(collection: TypesenseCollection | string): TypesenseCollection {
    return typeof collection === "string" ? this.collections.get(collection) : collection;
  }

  private collectorFor(name: string): TypesenseCollector {
    const collector = this.findCollector(name);
    if (!collector) {
      throw new Error(
        `No collector registered for collection "${name}". Decorate a provider with @RegisterTypesenseCollector().`,
      );
    }
    return collector;
  }

  /**
   * Scans the Nest container for providers carrying the collector metadata. Done lazily
   * rather than at construction so collectors declared in any module are visible.
   */
  private findCollector(name: string): TypesenseCollector | undefined {
    for (const module of this.modules.values()) {
      for (const provider of module.providers.values()) {
        const instance = provider.instance as object | undefined;
        if (!instance || typeof instance !== "object") continue;
        if (getCollectorCollectionName(instance.constructor) === name) {
          return instance as TypesenseCollector;
        }
      }
    }
    return undefined;
  }
}
