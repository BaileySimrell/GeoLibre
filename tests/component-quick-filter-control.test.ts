import { fireEvent, render, screen } from "./helpers/dom";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import type { LayerQuickFilter } from "@geolibre/core";
import type { QuickFilterFieldProfile } from "../apps/geolibre-desktop/src/lib/quick-filter-profile";

const { QuickFilterControl } =
  await import("../apps/geolibre-desktop/src/components/panels/QuickFilterControl");

/** A field where a few outliers stretch the extent far past the typical values. */
const OUTLIER_PROFILE: QuickFilterFieldProfile = {
  field: "area_sq_m",
  kind: "range",
  availableKinds: ["range", "categorical"],
  values: [],
  valuesTruncated: true,
  min: -42.5,
  max: 1e12,
  typical: { min: 0.3, max: 4680, below: 13, above: 13 },
  sampled: 1284,
  present: 1284,
};

/** The same field without outliers: the slider spans its exact extent. */
const PLAIN_PROFILE: QuickFilterFieldProfile = {
  ...OUTLIER_PROFILE,
  field: "rating",
  min: 0,
  max: 5,
  typical: undefined,
};

function renderRange(filter: Partial<LayerQuickFilter>, profile: QuickFilterFieldProfile) {
  const changes: LayerQuickFilter[] = [];
  const full: LayerQuickFilter = {
    id: "qf",
    field: profile.field,
    kind: "range",
    min: null,
    max: null,
    ...filter,
  };
  render(
    createElement(QuickFilterControl, {
      filter: full,
      profile,
      idPrefix: "test",
      onChange: (next: LayerQuickFilter) => changes.push(next),
    }),
  );
  return changes;
}

/** Press a key on a slider thumb, focusing it first as Radix expects. */
function pressOnThumb(name: "Minimum" | "Maximum", key: string): void {
  const thumb = screen.getByRole("slider", { name });
  fireEvent.focus(thumb);
  fireEvent.keyDown(thumb, { key });
}

const thumbValue = (name: "Minimum" | "Maximum"): string | null =>
  screen.getByRole("slider", { name }).getAttribute("aria-valuenow");

describe("QuickFilterControl range with outliers (#3455)", () => {
  it("scales the slider to the typical range and says what lies beyond it", () => {
    renderRange({}, OUTLIER_PROFILE);
    assert.equal(thumbValue("Minimum"), "0.3");
    assert.equal(thumbValue("Maximum"), "4680");
    const hint = screen.getByTestId("quick-filter-outliers").textContent ?? "";
    assert.match(hint, /13 values below 0\.3/);
    assert.match(hint, /13 values above 4,680/);
  });

  it("moving one handle inward sets that bound and leaves the other side open", () => {
    const changes = renderRange({}, OUTLIER_PROFILE);
    pressOnThumb("Maximum", "ArrowLeft");
    assert.equal(changes.length, 1);
    assert.equal(changes[0].min, null);
    assert.ok(typeof changes[0].max === "number" && changes[0].max < 4680);
  });

  it("a handle moved back to its end saves no bound, so outliers stay included", () => {
    const changes = renderRange({ min: 1000, max: 2000 }, OUTLIER_PROFILE);
    pressOnThumb("Maximum", "End");
    assert.deepEqual(
      changes.map(({ min, max }) => ({ min, max })),
      [{ min: 1000, max: null }],
    );
    pressOnThumb("Minimum", "Home");
    assert.equal(changes.at(-1)?.min, null);
  });

  it("keeps a saved bound beyond the slider while pinning its handle to the end", () => {
    const changes = renderRange({ min: -100, max: 9e9 }, OUTLIER_PROFILE);
    assert.equal(thumbValue("Minimum"), "0.3");
    assert.equal(thumbValue("Maximum"), "4680");
    // The typed boxes show the saved values, not the clamped handles.
    assert.equal(
      (screen.getByRole("spinbutton", { name: "Minimum" }) as HTMLInputElement).value,
      "-100",
    );
    pressOnThumb("Maximum", "ArrowLeft");
    assert.equal(changes[0].min, -100);
  });

  it("accepts a typed bound beyond the slider's domain", () => {
    const changes = renderRange({}, OUTLIER_PROFILE);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum" }), {
      target: { value: "500000000000" },
    });
    assert.equal(changes.at(-1)?.max, 5e11);
  });
});

describe("QuickFilterControl range without outliers", () => {
  it("spans the exact extent with no outlier hint", () => {
    renderRange({}, PLAIN_PROFILE);
    assert.equal(thumbValue("Minimum"), "0");
    assert.equal(thumbValue("Maximum"), "5");
    assert.equal(screen.queryByTestId("quick-filter-outliers"), null);
  });

  it("clears a bound when its handle returns to the end", () => {
    const changes = renderRange({ min: 1, max: 4 }, PLAIN_PROFILE);
    pressOnThumb("Minimum", "Home");
    assert.deepEqual(
      changes.map(({ min, max }) => ({ min, max })),
      [{ min: null, max: 4 }],
    );
  });
});
