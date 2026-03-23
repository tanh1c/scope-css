# ScopeCSS — csstree Integration Design

**Date:** 2026-03-23
**Status:** Approved
**Type:** Refactoring

---

## 1. Problem

The current `content.js` uses two hardcoded Sets to filter CSS properties:

```javascript
const SKIP_PROPS = new Set([
  "font", "background", "border", "outline", "transition",
  "animation",
  // ... ~20 more properties
]);

const DEFAULT_VALS = new Set([
  "normal", "none", "auto", "0px", "0s", "0", "start",
  // ... ~20 more values
]);
```

**Issues:**
- Incomplete — misses hundreds of CSS properties (gap, place-*, scroll-margin, etc.)
- Wrong logic — `DEFAULT_VALS` filters by raw string value, not by comparing to each property's actual initial value
- Maintenance burden — must manually update when new CSS properties are added
- Incorrect filtering — `"1"` is a default value for some properties but meaningful for others (e.g., `animation-iteration-count: 1`)

---

## 2. Solution: csstree

Use **[csstree](https://github.com/csstree/csstree)** — a CSS parser with a comprehensive built-in property database. It includes `data/properties.js` containing:

- Full list of CSS properties with correct definitions
- Shorthand → longhand relationships (e.g., `margin` → `margin-top/right/bottom/left`)
- Initial values for every property

**Why csstree:**
- Authoritative — maintained by CSS spec-aware community
- Comprehensive — covers all CSS properties including newer ones (gap, container, view-transition, etc.)
- No hardcoding — property logic driven by data, not manually maintained lists
- Pure data — extraction logic stays in `content.js`, csstree only used for lookups

---

## 3. File Structure

```
scope-css/
├── src/
│   └── extraction.js          ← extraction engine (uses csstree)
├── content.js                 ← pick mode UI + imports extraction
├── node_modules/
│   └── csstree/              ← npm package (installed locally)
├── package.json
├── package-lock.json
├── manifest.json
├── background.js
├── sidepanel.html/css/js
└── icons/
```

**Changes to existing files:**
- `content.js` — refactor extraction engine into `src/extraction.js`, keep pick mode UI in `content.js`

---

## 4. csstree Data API

csstree's `data/properties.js` exports a `properties` object:

```javascript
const { properties } = require('csstree/data/properties');

// Example entries:
properties['margin']           // { name: 'margin', shorthand: true, longhands: [...] }
properties['margin-top']       // { name: 'margin-top', shorthand: 'margin' }
properties['color']            // { name: 'color', initial: 'rgb(...)' or 'currentcolor' }
properties['animation-name']  // { name: 'animation-name', initial: 'none' }
properties['--primary']         // undefined (custom properties handled separately)
```

### Shorthand Detection

```javascript
function isShorthand(prop) {
  const def = properties[prop];
  if (!def) return false; // unknown/custom property — keep it
  return def.shorthand === true;
}
```

### Initial Value Filtering

```javascript
function getInitial(prop) {
  const def = properties[prop];
  return def ? def.initial : null;
}

// In extractStyles():
const initial = getInitial(prop);
if (initial && computedVal.trim() === initial) {
  continue; // skip — value equals the initial value
}
```

**This fixes the `DEFAULT_VALS` bug** — `animation-iteration-count: 1` is now correctly kept (initial is `1`), while `animation-duration: 0s` is correctly kept (initial is `0s`).

---

## 5. Installation & Setup

```bash
cd scope-css
npm init -y
npm install csstree
```

No build step required for local use — `content.js` uses Node.js `require()` and the extension is loaded via `Load unpacked`.

**Note:** For production distribution, consider bundling with esbuild to reduce extension size. For now, keep it simple.

---

## 6. Changes to content.js

### Before (hardcoded)

```javascript
const SKIP_PROPS = new Set([...]);

function extractStyles(computed, cssVars) {
  for (const prop of computed) {
    if (SKIP_PROPS.has(prop)) continue;
    const val = computed.getPropertyValue(prop).trim();
    if (!val || DEFAULT_VALS.has(val)) continue;
    // ...
  }
}
```

### After (csstree-driven)

```javascript
const { properties: CSS_PROPERTIES } = require('csstree/data/properties');

function isShorthand(prop) {
  const def = CSS_PROPERTIES[prop];
  return def ? def.shorthand === true : false;
}

function getInitial(prop) {
  const def = CSS_PROPERTIES[prop];
  return def ? def.initial : null;
}

function extractStyles(computed, cssVars) {
  for (const prop of computed) {
    if (isShorthand(prop)) continue; // skip shorthand, keep longhands

    const val = computed.getPropertyValue(prop).trim();
    if (!val) continue;

    const initial = getInitial(prop);
    if (initial && val === initial) continue; // skip default values

    // resolve CSS variables, etc.
  }
}
```

### What stays the same
- Pick mode UI (event listeners, highlight style, enter/exit pick mode)
- `extractElement()` orchestration
- `collectCSSVariables()`, `extractKeyframes()`, `buildCascadeChain()`, `formatCSS()`
- Message passing to side panel

---

## 7. Edge Cases

| Scenario | Handling |
|---|---|
| Unknown property (e.g., new CSS) | `isShorthand()` returns `false` → kept |
| CSS custom properties (`--*`) | Not in `properties` → handled separately |
| Vendor-prefixed (`-webkit-*`) | Not in `properties` → kept |
| Shadow DOM | Unchanged — same behavior |
| Cross-origin stylesheets | Unchanged — same behavior |

---

## 8. Testing Plan

1. Test on a **Tailwind CSS** site — should extract Tailwind utility classes correctly
2. Test on a **Bootstrap** site — shorthand properties should be skipped (border, margin, etc.)
3. Test on a site with **CSS variables** — vars should be resolved, not kept as `var(--x)`
4. Test on a site with **animations** — keyframes should be extracted
5. Test on a site with **pseudo-elements** — `::before`/`::after` should be extracted
6. Test with `animation-iteration-count: 1` — should NOT be filtered out (it's a meaningful value)
7. Test with `animation-duration: 0s` — should NOT be filtered out (initial is `0s`)

---

## 9. Limitations

- csstree runs via `require()` — works when loaded as Node.js module but needs bundling for browser use. For Chrome Extension (unpacked), `require()` works in content script if Node.js modules are in `node_modules/`. Chrome handles this natively.
- csstree `data/properties` is not an official npm export — use: `const { properties } = require('csstree/data/properties')` or check actual export path from csstree package structure.
- If csstree export path doesn't work as expected, fallback to importing the JSON data directly: `require('csstree/data/properties.json')` (if available) or extract to a local JSON file.
