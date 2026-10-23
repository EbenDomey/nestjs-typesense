import { type TypesenseCollection, type TypesenseFieldSchema, toSchema } from "./collection.js";

/**
 * A field as `collections(name).retrieve()` returns it. Loose on purpose: the server adds
 * keys between releases (30.2 answers with `infix`, `locale`, `stem`, `store`,
 * `truncate_len`, `hnsw_params`, `vec_dist`, ...), and none of them are ours to compare.
 */
export interface LiveFieldSchema {
  name: string;
  type: string;
  index?: boolean;
  optional?: boolean;
  facet?: boolean;
  sort?: boolean;
  embed?: {
    from?: readonly string[];
    model_config?: Record<string, unknown>;
  };
  num_dim?: number;
  [key: string]: unknown;
}

/** One declared property whose live value differs. */
export interface FieldMismatch {
  /** Dotted path into the field, e.g. `facet` or `embed.model_config.model_name`. */
  property: string;
  declared: unknown;
  live: unknown;
}

export interface SchemaDiff {
  /** Declared but absent from the live collection. */
  added: TypesenseFieldSchema[];
  /** Live but no longer declared. */
  removed: string[];
  /** Present on both sides, with at least one declared property that differs. */
  changed: { name: string; mismatches: FieldMismatch[] }[];
  /** True when there is nothing in any of the three lists. */
  inSync: boolean;
}

/**
 * Compares a declared collection with the live one, property by property.
 *
 * Only what the declaration states is compared. Typesense fills in everything else, and
 * what it fills in is not drift: an auto-embedding field comes back with the `num_dim` the
 * model implies, plus `hnsw_params` and `vec_dist`, so a deep-equal would report every
 * embedding collection as drifted on every check. Likewise `sort` — Typesense turns it on
 * for numeric fields — is compared only when declared.
 *
 * `embed.model_config.api_key` is never compared: it is a credential that rotates, and it
 * is excluded from the schema hash for the same reason.
 *
 * `id` is skipped on both sides; Typesense never lists it.
 */
export function diffSchema(
  collection: TypesenseCollection,
  live: { fields?: readonly LiveFieldSchema[] },
): SchemaDiff {
  const declared = toSchema(collection).fields.filter((f) => f.name !== "id");
  const liveByName = new Map((live.fields ?? []).map((f) => [f.name, f]));
  const declaredNames = new Set(declared.map((f) => f.name));

  const added: TypesenseFieldSchema[] = [];
  const changed: SchemaDiff["changed"] = [];

  for (const field of declared) {
    const liveField = liveByName.get(field.name);
    if (!liveField) {
      added.push(field);
      continue;
    }
    const mismatches = compareField(field, liveField);
    if (mismatches.length > 0) changed.push({ name: field.name, mismatches });
  }

  const removed = [...liveByName.keys()].filter((n) => n !== "id" && !declaredNames.has(n));

  return {
    added,
    removed,
    changed,
    inSync: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

function compareField(declared: TypesenseFieldSchema, live: LiveFieldSchema): FieldMismatch[] {
  const pairs: [string, unknown, unknown][] = [
    ["type", declared.type, live.type],
    // A server that omits one of these is using its default, which is ours too.
    ["index", declared.index, live.index ?? true],
    ["optional", declared.optional, live.optional ?? false],
    ["facet", declared.facet, live.facet ?? false],
  ];
  if (declared.sort !== undefined) pairs.push(["sort", declared.sort, live.sort]);
  if (declared.num_dim !== undefined) pairs.push(["num_dim", declared.num_dim, live.num_dim]);

  if (declared.embed) {
    pairs.push(["embed.from", declared.embed.from, live.embed?.from]);
    const liveConfig = live.embed?.model_config ?? {};
    for (const [key, value] of Object.entries(declared.embed.model_config)) {
      if (key === "api_key") continue;
      pairs.push([`embed.model_config.${key}`, value, liveConfig[key]]);
    }
  } else if (live.embed) {
    // An ordinary float[] declared over a live embedding field (or vice versa) is a real
    // change: one is written by the caller, the other by Typesense.
    pairs.push(["embed", undefined, live.embed]);
  }

  return pairs
    .filter(([, a, b]) => !sameValue(a, b))
    .map(([property, a, b]) => ({ property, declared: a, live: b }));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}
