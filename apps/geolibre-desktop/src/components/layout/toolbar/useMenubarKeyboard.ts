import { useCallback } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// The top-level toolbar entries: every menu trigger plus the Settings dialog
// button. The project-name field and theme toggle open nothing and stay out.
const TRIGGER_SELECTOR = ':scope [aria-haspopup="menu"], :scope [aria-haspopup="dialog"]';

function toolbarTriggers(toolbar: HTMLElement): HTMLElement[] {
  return Array.from(toolbar.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR)).filter(
    // Skip triggers nested in menu content and any that are hidden or disabled.
    (el) =>
      !el.closest('[role="menu"]') && el.offsetParent !== null && !el.hasAttribute("disabled"),
  );
}

function openMenuFrom(trigger: HTMLElement) {
  trigger.focus();
  if (trigger.getAttribute("aria-haspopup") !== "menu") return;
  // Radix opens a dropdown from its trigger on ArrowDown and focuses the first item.
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
}

/**
 * Desktop menu-bar arrow keys for the top toolbar (#3232). Each menu is its own
 * Radix DropdownMenu, so this sits on the toolbar and works from the DOM:
 * Left/Right (mirrored in RTL) move between the top-level entries, Home/End
 * jump to the ends, and with a menu open Left/Right close it and open the
 * neighbouring menu. Keys a submenu already handled arrive with
 * `defaultPrevented` set and are left alone. Menu content is portalled, but
 * React still bubbles its key events up to this handler.
 */
export function useMenubarKeyboard() {
  return useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const toolbar = event.currentTarget;
    const rtl = getComputedStyle(toolbar).direction === "rtl";
    const nextKey = rtl ? "ArrowLeft" : "ArrowRight";
    const prevKey = rtl ? "ArrowRight" : "ArrowLeft";
    const key = event.key;
    if (key !== nextKey && key !== prevKey && key !== "Home" && key !== "End") return;

    const target = event.target as HTMLElement;
    // Arrow keys move the caret in a text field (e.g. the Processing menu search).
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const triggers = toolbarTriggers(toolbar);
    if (triggers.length === 0) return;

    const menu = target.closest<HTMLElement>('[role="menu"]');
    if (menu) {
      // Inside an open menu: only the top-level menus switch, and only on Left/Right.
      if (key !== nextKey && key !== prevKey) return;
      const owner = document.getElementById(menu.getAttribute("aria-labelledby") ?? "");
      const index = owner ? triggers.indexOf(owner) : -1;
      if (index === -1) return;
      event.preventDefault();
      const step = key === nextKey ? 1 : -1;
      const next = triggers[(index + step + triggers.length) % triggers.length];
      // Escape closes the current menu; open the next one once its focus
      // restore has run so it doesn't pull focus back to the old trigger.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      window.setTimeout(() => openMenuFrom(next), 0);
      return;
    }

    const index = triggers.indexOf(target);
    if (index === -1) return;
    event.preventDefault();
    let nextIndex: number;
    if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = triggers.length - 1;
    else nextIndex = (index + (key === nextKey ? 1 : -1) + triggers.length) % triggers.length;
    triggers[nextIndex].focus();
  }, []);
}
