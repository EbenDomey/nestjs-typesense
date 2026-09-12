import { writeFileSync } from "node:fs";

/**
 * Marks each build directory with its module format.
 *
 * Node decides whether a `.js` file is ESM or CJS from the nearest `package.json`. The root
 * one has no `"type"`, so everything would be treated as CommonJS — including `dist/esm`.
 * These markers scope the decision per directory, which is also what lets TypeScript read
 * `dist/esm/*.d.ts` as ESM declarations under `node16`/`nodenext` resolution.
 *
 * Emitting `.mjs`/`.cjs` instead would require renaming every source file to `.mts`/`.cts`,
 * since `tsc` derives the output extension from the input.
 */
const formats = {
  "dist/cjs/package.json": { type: "commonjs" },
  "dist/esm/package.json": { type: "module" },
};

for (const [path, contents] of Object.entries(formats)) {
  writeFileSync(path, `${JSON.stringify(contents, null, 2)}\n`);
}

console.log("finalize-dist: wrote module-format markers for dist/cjs and dist/esm");
