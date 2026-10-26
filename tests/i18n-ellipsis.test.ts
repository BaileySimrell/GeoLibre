import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const enPath = fileURLToPath(
  new URL("../apps/geolibre-desktop/src/i18n/locales/en.json", import.meta.url),
);

function flatStrings(obj: unknown, prefix = ""): [string, string][] {
  if (typeof obj === "string") return [[prefix, obj]];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatStrings(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("en.json ellipses", () => {
  it("ends strings with the single … character, not three dots", () => {
    const en = JSON.parse(readFileSync(enPath, "utf8"));
    // Three dots inside a value (URL placeholders like https://.../MapServer)
    // are left alone; only a trailing "..." is prose that should read "…".
    const offenders = flatStrings(en)
      .filter(([, value]) => /(?<!\.)\.\.\.$/.test(value))
      .map(([key]) => key);
    assert.deepEqual(offenders, [], `Use "…" instead of "...": ${offenders.join(", ")}`);
  });
});
