import type { TypesenseCollectionSource } from "../schema/decorators.js";
import type { GeoRadius, TypesenseFilter } from "./filter.js";

type Scalar = string | number | boolean;

/**
 * Renders one value.
 *
 * Strings are always backtick-wrapped, not only when they look risky: a comma, space or
 * operator character in an unwrapped value would otherwise be read as filter syntax, which
 * turns any user-supplied value into a way to rewrite the expression.
 */
function literal(value: Scalar): string {
  if (typeof value !== "string") return String(value);

  // Typesense documents no way to escape a backtick inside a backtick-wrapped value, so
  // there is no correct rendering for one. Refuse rather than emit a filter that silently
  // means something else — see the integration test that pins this behaviour.
  if (value.includes("`")) {
    throw new Error(
      `Filter value ${JSON.stringify(value)} contains a backtick, which Typesense cannot ` +
        "escape inside a filter expression. Strip it before filtering, or use client.raw.",
    );
  }
  return `\`${value}\``;
}

function list(values: readonly Scalar[]): string {
  if (values.length === 0) throw new Error("Filter list cannot be empty");
  return `[${values.map(literal).join(",")}]`;
}

function geo(field: string, { lat, lng, radius, unit = "km" }: GeoRadius): string {
  return `${field}:(${lat}, ${lng}, ${radius} ${unit})`;
}

function operatorClause(field: string, operator: string, value: unknown): string {
  switch (operator) {
    case "eq":
    case "has":
      return Array.isArray(value)
        ? `${field}:=${list(value as Scalar[])}`
        : `${field}:=${literal(value as Scalar)}`;
    case "hasAny":
      return `${field}:=${list(value as Scalar[])}`;
    case "hasAll": {
      // Typesense has no "contains all" operator; it is one clause per value, ANDed.
      const values = value as Scalar[];
      if (values.length === 0) throw new Error("Filter list cannot be empty");
      return `(${values.map((v) => `${field}:=${literal(v)}`).join(" && ")})`;
    }
    case "ne":
      return Array.isArray(value)
        ? `${field}:!=${list(value as Scalar[])}`
        : `${field}:!=${literal(value as Scalar)}`;
    case "match":
      return `${field}:${literal(value as Scalar)}`;
    case "gt":
      return `${field}:>${literal(value as Scalar)}`;
    case "gte":
      return `${field}:>=${literal(value as Scalar)}`;
    case "lt":
      return `${field}:<${literal(value as Scalar)}`;
    case "lte":
      return `${field}:<=${literal(value as Scalar)}`;
    case "between": {
      const [low, high] = value as [number, number];
      return `${field}:[${low}..${high}]`;
    }
    case "near":
      return geo(field, value as GeoRadius);
    case "within": {
      const points = value as [number, number][];
      if (points.length < 3) throw new Error(`"within" needs at least 3 points for a polygon`);
      return `${field}:(${points.flat().join(", ")})`;
    }
    default:
      throw new Error(`Unknown filter operator "${operator}" on field "${field}"`);
  }
}

function fieldClauses(field: string, spec: unknown): string[] {
  // A bare value is shorthand for equality. Nothing filterable is represented as a plain
  // object, so any non-array object here is an operator map.
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    return [
      Array.isArray(spec)
        ? `${field}:=${list(spec as Scalar[])}`
        : `${field}:=${literal(spec as Scalar)}`,
    ];
  }

  return Object.entries(spec as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([operator, value]) => operatorClause(field, operator, value));
}

/**
 * Compiles a filter expression to the `filter_by` string Typesense expects.
 *
 * Deliberately takes no collection: the operator keys alone determine the output. `eq` on a
 * string and `has` on a string[] both render `field:=value`, and `eq` with several values and
 * `hasAny` both render `field:=[a,b]`, so nothing here needs to know a field's declared type.
 *
 * Returns "" for an empty expression, which the caller drops rather than sending.
 */
export function compileFilter<TSource extends TypesenseCollectionSource>(
  filter: TypesenseFilter<TSource>,
): string {
  const clauses: string[] = [];

  for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
    if (value === undefined) continue;

    if (key === "$and" || key === "$or") {
      const compiled = (value as TypesenseFilter<TSource>[])
        .map((nested) => compileFilter(nested))
        .filter((nested) => nested.length > 0);

      if (compiled.length === 0) continue;
      // Always parenthesise: an un-grouped `||` would otherwise bind against the sibling
      // clauses this group is ANDed with.
      clauses.push(`(${compiled.join(key === "$or" ? " || " : " && ")})`);
      continue;
    }

    clauses.push(...fieldClauses(key, value));
  }

  return clauses.join(" && ");
}
