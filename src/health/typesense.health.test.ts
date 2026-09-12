import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { TypesenseClient } from "../client/typesense.client.js";
import { TypesenseHealthIndicator } from "./typesense.health.js";

/** Port 1 is reserved and never listening, so this reliably exercises the failure path. */
function unreachableIndicator(): TypesenseHealthIndicator {
  return new TypesenseHealthIndicator(
    new TypesenseClient({
      nodes: [{ host: "127.0.0.1", port: 1, protocol: "http" }],
      apiKey: "unused",
      connectionTimeoutSeconds: 1,
      numRetries: 0,
    }),
  );
}

describe("TypesenseHealthIndicator", () => {
  it("reports down with a message when the cluster is unreachable", async () => {
    const result = await unreachableIndicator().isHealthy();

    expect(result.typesense?.status).toBe("down");
    expect(result.typesense?.message).toEqual(expect.any(String));
    expect(result.typesense?.responseTime).toEqual(expect.any(Number));
  });

  it("does not throw — terminus reads the status off the returned object", async () => {
    await expect(unreachableIndicator().isHealthy()).resolves.toBeDefined();
  });

  it("names the entry after the key it was given", async () => {
    const result = await unreachableIndicator().isHealthy("search");

    expect(Object.keys(result)).toEqual(["search"]);
    expect(result.search?.status).toBe("down");
  });
});
