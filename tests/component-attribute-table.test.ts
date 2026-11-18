import { fireEvent, render, screen, stubLayout, useAppStore, within } from "./helpers/dom";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import type { FeatureCollection } from "geojson";
import { geojsonLayer } from "./helpers/layer-fixtures";

// Loaded after the harness so its CSS imports and Vite globals are handled.
const { AttributeTable } =
  await import("../apps/geolibre-desktop/src/components/panels/AttributeTable");

const cities: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: 1,
      properties: { name: "Oslo", population: 709000 },
      geometry: { type: "Point", coordinates: [10.75, 59.91] },
    },
    {
      type: "Feature",
      id: 2,
      properties: { name: "Bergen", population: 286000 },
      geometry: { type: "Point", coordinates: [5.32, 60.39] },
    },
    {
      type: "Feature",
      id: 3,
      properties: { name: "Trondheim", population: 212000 },
      geometry: { type: "Point", coordinates: [10.4, 63.43] },
    },
  ],
};

/** Open the table on a GeoJSON layer and render it with no map behind it. */
function renderTable(
  collection: FeatureCollection = cities,
  layerPatch: Parameters<typeof geojsonLayer>[0] = {},
) {
  // The rows are virtualized, and happy-dom does no layout: without a box
  // size the virtualizer thinks the viewport is 0px tall and renders nothing.
  stubLayout(1024, 600);
  useAppStore.setState({
    layers: [geojsonLayer({ id: "cities", name: "Cities", geojson: collection, ...layerPatch })],
    selectedLayerId: "cities",
  });
  useAppStore.getState().setAttributeTableOpen(true);
  return render(createElement(AttributeTable, { mapControllerRef: { current: null } }));
}

/** Open the table on a URL-backed GeoJSON layer, which the layer menu can refresh. */
function renderRefreshableTable(props: Record<string, unknown>) {
  stubLayout(1024, 600);
  useAppStore.setState({
    layers: [
      geojsonLayer({
        id: "cities",
        name: "Cities",
        geojson: cities,
        source: { type: "geojson", url: "https://example.com/cities.geojson" },
      }),
    ],
    selectedLayerId: "cities",
  });
  useAppStore.getState().setAttributeTableOpen(true);
  return render(createElement(AttributeTable, { mapControllerRef: { current: null }, ...props }));
}

function table(): HTMLElement {
  return screen.getByTestId("attribute-table");
}

/** Column header labels, left to right, including the row-number column. */
function headers(): string[] {
  return within(table())
    .getAllByRole("columnheader")
    .map((cell) => cell.querySelector("button span")?.textContent ?? "");
}

/** The body rows as arrays of cell text. */
function rows(): string[][] {
  return [...table().querySelectorAll("tbody tr")]
    .filter((row) => row.querySelectorAll("td").length > 1)
    .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? ""));
}

function status(): string {
  return screen.getByTestId("attribute-table-status").textContent ?? "";
}

/** The toolbar's overflow menu, opened the way Radix listens for it (a primary-button press). */
function openMoreMenu(): HTMLElement {
  const trigger = screen.getByRole("button", { name: "More table actions" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.getByRole("menu");
}

/** The visible text of each entry in an open menu, top to bottom. */
function menuEntries(menu: HTMLElement): string[] {
  return [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map(
    (item) => item.textContent?.trim() ?? "",
  );
}

describe("AttributeTable", () => {
  it("renders a column per attribute and a row per feature", () => {
    renderTable();

    assert.deepEqual(headers(), ["#", "name", "population"]);
    const names = rows().map((cells) => cells[1]);
    assert.deepEqual(names, ["Oslo", "Bergen", "Trondheim"]);
    assert.match(status(), /3 features/);
  });

  it("clips long structured values to their column and exposes the full value", () => {
    const values = [0.7364, 0.7268, 0.7149, 0.702];
    renderTable({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 1902789,
          properties: { ndvi: values, metadata: { source: "sentinel" } },
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ],
    });

    const cells = table().querySelectorAll("tbody td");
    const ndviValue = cells[1]?.querySelector("span");
    const metadataValue = cells[2]?.querySelector("span");

    assert.ok(ndviValue?.classList.contains("truncate"));
    assert.equal(ndviValue?.getAttribute("title"), JSON.stringify(values));
    assert.ok(metadataValue?.classList.contains("truncate"));
    assert.equal(metadataValue?.getAttribute("title"), '{"source":"sentinel"}');
  });

  it("keeps a coded-value label and its stored code in the truncated tooltip", () => {
    renderTable(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: 1,
            properties: { status: 7 },
            geometry: { type: "Point", coordinates: [0, 0] },
          },
        ],
      },
      {
        metadata: {
          sourceKind: "arcgis-feature-query",
          arcgisEditInfo: {
            fields: [
              {
                name: "status",
                type: "esriFieldTypeInteger",
                domain: {
                  type: "codedValue",
                  codedValues: [{ name: "Available for field inspection", code: 7 }],
                },
              },
            ],
          },
        },
      },
    );

    const statusValue = table().querySelector("tbody td:nth-child(2) span");
    assert.equal(statusValue?.textContent, "Available for field inspection");
    assert.ok(statusValue?.classList.contains("truncate"));
    assert.equal(statusValue?.getAttribute("title"), "Available for field inspection (7)");
  });

  it("keeps a derived column's hint in the value tooltip", () => {
    renderTable(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: 1,
            properties: { density: 42.5 },
            geometry: { type: "Point", coordinates: [0, 0] },
          },
        ],
      },
      {
        virtualFields: [
          { id: "vf", name: "density", expression: '["get", "pop"]', addedField: "density" },
        ],
      },
    );

    const cell = table().querySelector("tbody td:nth-child(2)");
    const value = cell?.querySelector("span");
    const hint = cell?.getAttribute("title");
    assert.ok(hint, "the cell keeps its column hint");
    assert.equal(value?.getAttribute("title"), `42.5\n${hint}`);
  });

  it("titles the table with the selected layer", () => {
    renderTable();

    assert.match(
      screen.getByRole("region", { name: "Attribute table" }).textContent ?? "",
      /Cities/,
    );
  });

  it("filters rows with the search box", () => {
    renderTable();

    fireEvent.change(screen.getByRole("textbox", { name: "Search attributes" }), {
      target: { value: "berg" },
    });

    assert.deepEqual(
      rows().map((cells) => cells[1]),
      ["Bergen"],
    );
  });

  it("sorts by a column when its header is clicked", () => {
    renderTable();

    fireEvent.click(within(table()).getByRole("button", { name: "name" }));

    assert.deepEqual(
      rows().map((cells) => cells[1]),
      ["Bergen", "Oslo", "Trondheim"],
    );
  });

  it("selects a feature in the store when its row is clicked", () => {
    renderTable();

    const bergen = [...table().querySelectorAll("tbody tr")].find((row) =>
      row.textContent?.includes("Bergen"),
    );
    assert.ok(bergen, "no Bergen row");
    fireEvent.click(bergen);

    assert.equal(useAppStore.getState().selectedFeatureId, "2");
    assert.match(status(), /1 selected/);
  });

  it("refreshes a refreshable layer through the shared handler", () => {
    const refreshed: string[] = [];
    renderRefreshableTable({
      refresh: {
        handleRefreshLayer: (layer: { id: string }) => {
          refreshed.push(layer.id);
        },
        refreshStatuses: {},
      },
    });

    fireEvent.click(within(openMoreMenu()).getByRole("menuitem", { name: "Refresh features" }));

    assert.deepEqual(refreshed, ["cities"]);
  });

  it("offers no Refresh for a layer with nothing to re-read", () => {
    const view = renderTable();
    assert.equal(
      within(openMoreMenu()).queryByRole("menuitem", { name: "Refresh features" }),
      null,
    );
    view.unmount();

    // Nor without a handler, even when the layer has a source URL.
    renderRefreshableTable({});
    assert.equal(
      within(openMoreMenu()).queryByRole("menuitem", { name: "Refresh features" }),
      null,
    );
  });

  it("disables Refresh while one is running and shows the layer's refresh note", () => {
    const view = renderRefreshableTable({
      refresh: {
        handleRefreshLayer: () => {},
        refreshStatuses: { cities: { type: "refreshing", message: "Refreshing..." } },
      },
    });
    const item = within(openMoreMenu()).getByRole("menuitem", { name: "Refresh features" });
    assert.equal(item.getAttribute("aria-disabled"), "true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    view.rerender(
      createElement(AttributeTable, {
        mapControllerRef: { current: null },
        refresh: {
          handleRefreshLayer: () => {},
          refreshStatuses: { cities: { type: "error", message: "HTTP 503" } },
        },
      }),
    );
    const settled = within(openMoreMenu()).getByRole("menuitem", { name: "Refresh features" });
    assert.equal(settled.getAttribute("aria-disabled"), null);
    assert.ok(screen.getByText("HTTP 503"));
  });

  it("keeps the table's own controls in the toolbar and the rest in one overflow menu", () => {
    renderTable();
    const panel = screen.getByRole("region", { name: "Attribute table" });

    for (const name of [
      "Edit attribute values",
      "Save attribute edits",
      "Clear selection",
      "More table actions",
      "Collapse attribute table",
      "Close attribute table",
    ]) {
      assert.ok(within(panel).getByRole("button", { name }), `missing ${name}`);
    }
    assert.ok(within(panel).getByRole("combobox", { name: "Feature view" }));
    assert.ok(within(panel).getByRole("textbox", { name: "Search attributes" }));
    // The moved actions are no longer toolbar buttons.
    for (const name of [
      "Add field",
      "Calculate field values from an expression",
      "Manage fields",
      "Explore all fields at a glance",
      "Field statistics",
      "Charts",
      "Dashboard",
      "Export selected layer",
    ]) {
      assert.equal(within(panel).queryByRole("button", { name }), null, `${name} still a button`);
    }
    assert.equal(within(panel).queryByRole("checkbox", { name: "Zoom to selection" }), null);

    assert.deepEqual(menuEntries(openMoreMenu()), [
      "Add field",
      "Field calculator",
      "Manage fields",
      "Column explorer",
      "Field statistics",
      "Charts",
      "Dashboard",
      "Export",
      "Zoom to selection",
    ]);
  });

  it("toggles Zoom to selection from the overflow menu", () => {
    renderTable();
    useAppStore.getState().setZoomToSelectedFeature(false);

    const toggle = within(openMoreMenu()).getByRole("menuitemcheckbox", {
      name: "Zoom to selection",
    });
    assert.equal(toggle.getAttribute("aria-checked"), "false");
    fireEvent.click(toggle);
    assert.equal(useAppStore.getState().ui.zoomToSelectedFeature, true);

    const reopened = within(openMoreMenu()).getByRole("menuitemcheckbox", {
      name: "Zoom to selection",
    });
    assert.equal(reopened.getAttribute("aria-checked"), "true");
    fireEvent.click(reopened);
    assert.equal(useAppStore.getState().ui.zoomToSelectedFeature, false);
  });

  it("opens the field and analysis dialogs from the overflow menu", () => {
    renderTable();

    fireEvent.click(within(openMoreMenu()).getByRole("menuitem", { name: "Add field" }));
    assert.ok(screen.getByRole("dialog", { name: "Add field" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    fireEvent.click(within(openMoreMenu()).getByRole("menuitem", { name: "Field calculator" }));
    assert.ok(screen.getByRole("dialog", { name: "Field calculator" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    fireEvent.click(within(openMoreMenu()).getByRole("menuitem", { name: "Field statistics" }));
    assert.ok(screen.getByRole("dialog", { name: "Field statistics" }));
  });

  it("keeps only Export and Zoom to selection in the menu while editing", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Edit attribute values" }));

    assert.ok(screen.getByRole("button", { name: "Cancel attribute edits" }));
    assert.deepEqual(menuEntries(openMoreMenu()), ["Export", "Zoom to selection"]);
  });

  it("closes from its close button", () => {
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: "Close attribute table" }));

    assert.equal(useAppStore.getState().ui.attributeTableOpen, false);
  });
});
