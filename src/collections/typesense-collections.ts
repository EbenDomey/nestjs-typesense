import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { TypesenseClient } from "../client/typesense.client.js";
import { type TypesenseCollection, toSchema } from "../schema/collection.js";
import { resolveCollection } from "../schema/decorators.js";
import { TYPESENSE_MODULE_OPTIONS } from "../typesense.constants.js";
import type { TypesenseModuleOptions } from "../typesense.module-options.js";

/**
 * Reconciles declared collections with the live Typesense cluster at bootstrap,
 * according to the configured migration strategy.
 */
@Injectable()
export class TypesenseCollections implements OnApplicationBootstrap {
  private readonly logger = new Logger(TypesenseCollections.name);
  private readonly byName = new Map<string, TypesenseCollection>();

  constructor(
    @Inject(TYPESENSE_MODULE_OPTIONS) private readonly options: TypesenseModuleOptions,
    private readonly client: TypesenseClient,
  ) {
    for (const source of options.collections ?? []) {
      const collection = resolveCollection(source);
      this.byName.set(collection.name, collection);
    }
  }

  get(name: string): TypesenseCollection {
    const collection = this.byName.get(name);
    if (!collection) throw new Error(`Typesense collection "${name}" is not registered`);
    return collection;
  }

  all(): TypesenseCollection[] {
    return [...this.byName.values()];
  }

  async onApplicationBootstrap(): Promise<void> {
    const strategy = this.options.migrations ?? "create";
    if (strategy === "off") return;

    for (const collection of this.byName.values()) {
      await this.reconcile(collection, strategy);
    }
  }

  private async reconcile(
    collection: TypesenseCollection,
    strategy: Exclude<TypesenseModuleOptions["migrations"], "off" | undefined>,
  ): Promise<void> {
    const schema = toSchema(collection);
    const live = await this.retrieve(collection.name);

    if (!live) {
      await this.client.raw.collections().create(schema as never);
      this.logger.log(`Created collection "${collection.name}" (${collection.hash})`);
      return;
    }

    const liveNames = new Set((live.fields ?? []).map((f) => f.name));
    const declaredNames = new Set(schema.fields.map((f) => f.name));
    // `id` is implicit in Typesense: `toSchema` emits it, but `retrieve()` never lists it
    // and `update()` rejects it outright ("Field `id` cannot be altered"). Skip it on both
    // sides of the diff or every alter of a drifted collection fails with a 400.
    const added = schema.fields.filter((f) => f.name !== "id" && !liveNames.has(f.name));
    const removed = [...liveNames].filter((n) => n !== "id" && !declaredNames.has(n));

    if (added.length === 0 && removed.length === 0) return;

    const drift = `+${added.length} -${removed.length} field(s)`;

    if (strategy === "create") {
      this.logger.warn(
        `Collection "${collection.name}" has drifted (${drift}). Strategy is "create" — not altering. Set migrations: "alter" to apply.`,
      );
      return;
    }

    if (strategy === "recreate") {
      await this.client.raw.collections(collection.name).delete();
      await this.client.raw.collections().create(schema as never);
      this.logger.warn(
        `Recreated collection "${collection.name}" (${drift}). Documents dropped — reindex required.`,
      );
      return;
    }

    // Typesense refuses to add a required field to a collection that already holds
    // documents — the existing rows would have no value for it. Catch it here so the
    // failure names the fix instead of surfacing as a bare 400 during bootstrap.
    const documents = (live as { num_documents?: number }).num_documents ?? 0;
    const required = added.filter((f) => !f.optional).map((f) => f.name);

    if (documents > 0 && required.length > 0) {
      // Warn and skip rather than throw, matching the "create" branch above: unappliable
      // drift should not take an app down at bootstrap.
      this.logger.warn(
        `Collection "${collection.name}" not altered: ${required.join(", ")} ` +
          `${required.length === 1 ? "is" : "are"} required, and the collection already holds ` +
          `${documents} document(s) with no value for ${required.length === 1 ? "it" : "them"}. ` +
          'Declare the field optional, or use migrations: "recreate" and reindex.',
      );
      return;
    }

    await this.client.raw.collections(collection.name).update({
      fields: [...removed.map((name) => ({ name, drop: true })), ...added],
    } as never);
    this.logger.log(`Altered collection "${collection.name}" (${drift})`);
  }

  private async retrieve(name: string) {
    try {
      return await this.client.raw.collections(name).retrieve();
    } catch (error) {
      if ((error as { httpStatus?: number }).httpStatus === 404) return undefined;
      throw error;
    }
  }
}
