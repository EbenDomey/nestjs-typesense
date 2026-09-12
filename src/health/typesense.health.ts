import { Injectable } from "@nestjs/common";
import { TypesenseClient } from "../client/typesense.client.js";

export interface TypesenseHealthDetail {
  status: "up" | "down";
  [key: string]: unknown;
}

/**
 * The result shape `@nestjs/terminus` expects from a health indicator, declared here rather
 * than imported.
 *
 * Importing terminus — even `import type` — would put it in this package's emitted `.d.ts`
 * and break typechecking for every consumer that does not have it installed, which is the
 * opposite of optional. The shape is small and stable, so restating it costs less than the
 * dependency would.
 */
export type TypesenseHealthResult = Record<string, TypesenseHealthDetail>;

/**
 * Reports whether the Typesense cluster is reachable.
 *
 * Usable with `@nestjs/terminus` without this package depending on it: terminus' current
 * `HealthIndicatorService` API has a failing check *return* `{ status: "down" }` rather than
 * throw, so the contract is a plain object. Drop it into a `HealthCheckService.check([...])`
 * array directly. It is an ordinary provider, so it works just as well on its own.
 */
@Injectable()
export class TypesenseHealthIndicator {
  constructor(private readonly client: TypesenseClient) {}

  /** `key` names the entry in terminus' `info`/`details` map. */
  async isHealthy(key = "typesense"): Promise<TypesenseHealthResult> {
    const startedAt = Date.now();

    try {
      const { ok } = await this.client.raw.health.retrieve();
      const responseTime = Date.now() - startedAt;

      // A reachable cluster that reports `ok: false` is degraded, not absent — still down,
      // but the distinction is worth keeping in the message.
      return ok
        ? { [key]: { status: "up", responseTime } }
        : { [key]: { status: "down", responseTime, message: "Typesense reported not ok" } };
    } catch (error) {
      // Deliberately not routed through `onError`: a health check is expected to fail
      // sometimes, and reporting every probe to Sentry would be noise.
      return {
        [key]: {
          status: "down",
          responseTime: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
