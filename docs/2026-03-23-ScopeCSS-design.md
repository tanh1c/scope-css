# ScopeCSS — Design Document

**Date:** 2026-03-23
**Status:** Approved
**Author:** Brainstorming Session

---

## 1. Overview

**ScopeCSS** is a Chrome Extension (Manifest V3) that lets users pick any element on a webpage, extract its full CSS cascade with ~95-98% fidelity, and copy the output in two formats: plain CSS or inline HTML+style.

### Core Goal
Replace manual DevTools inspection — instead of copying classes and styles one by one, users activate the extension, click an element, and get a complete, copy-ready result instantly.

---

## 2. Architecture

```
Extension (Manifest V3)
├── background.js         — keyboard shortcuts, lifecycle management
├── content.js            — hover highlight, element picking, CSS extraction
├── sidepanel.html/css/js — result display & format switching
└── manifest.json         — side_panel, commands, permissions
```

**Communication:**
- Content script ↔ Side Panel via `chrome.runtime.sendMessage`
- Background script registers `commands` for keyboard shortcuts

---

## 3. How It Works

1. User activates pick mode via **icon click** or **hotkey** (`Ctrl+Shift+S`)
2. Content script enters pick mode — hover highlights element, cursor becomes crosshair
3. User clicks target element → full CSS cascade extracted
4. Output auto-copied to clipboard + displayed in **Side Panel** for preview
5. User presses **Escape** or clicks outside to exit pick mode

---

## 4. Extraction Logic (~95-98% Fidelity)

### What is extracted:
- ✅ Computed styles from root to target element (cascade)
- ✅ CSS Custom Properties (variables) from `:root` and all ancestors — **inlined** in output
- ✅ Pseudo-elements `::before` / `::after` styles as separate declarations
- ✅ CSS `@keyframes` animation definitions detected and included
- ✅ All inherited styles (typography, font-size, color from ancestors)

### What is referenced (URL only, not bundled):
- ⚠️ Web fonts — kept as Google Fonts / CDN URLs
- ⚠️ Background images — kept as URLs

### Dynamic states:
- Captures current state at time of click
- If user triggers pick mode while hovering, hover state is captured

### Limitations:
- Shadow DOM: limited extraction on shadow host only, user notified
- Cross-origin iframes: not accessible, user notified

---

## 5. Output Formats

### Format A: Plain CSS
- Flattened CSS rules from root to target element
- CSS variables inlined (no `var(--x)` references)
- `::before` / `::after` as separate pseudo-element rules
- `@keyframes` included if animation detected

### Format B: Inline HTML + Style Attribute
```html
<div style="color: #ff0000; font-size: 14px; ...">Content</div>
```
- Self-contained element
- All styles as inline `style` attribute
- CSS variables resolved to their resolved values

---

## 6. Components

### Content Script (`content.js`)
- Toggle pick mode on/off
- Hover effect: `outline` highlight on target element
- On click: traverse from root to target, collect `getComputedStyle()` for each
- Collect `:root` CSS variables
- Detect and extract `::before`, `::after` styles
- Detect animation via `animationName` → extract `@keyframes`
- Send extracted data to Side Panel

### Background Script (`background.js`)
- Register `Ctrl+Shift+S` command in `manifest.json`
- Service worker lifecycle management (Manifest V3)

### Side Panel (`sidepanel.html/css/js`)
- Receive extracted data via `chrome.runtime.onMessage`
- Render **CSS** tab and **HTML** tab
- Auto-copy output to clipboard on new data
- Toast notification "Copied!" on successful copy
- Format switcher: CSS / HTML toggle

### Manifest (`manifest.json`)
- `side_panel` permission
- `commands` for keyboard shortcuts
- `content_scripts` for target pages
- `host_permissions`: `<all_urls>`

---

## 7. Error Handling & Fallbacks

| Scenario | Handling |
|---|---|
| Shadow DOM element | Extract host element only; show warning in panel |
| Cross-origin iframe | Show "Cannot extract cross-origin iframe" message |
| Clipboard API fails | Fallback to `document.execCommand('copy')` |
| Side Panel unavailable | Graceful fallback to popup |

---

## 8. Browser Target

**Chrome only** (Manifest V3, Side Panel API requires Chrome 114+).
Extensible to Firefox/Edge/Safari in future iterations.

---

## 9. Design Principles

- **YAGNI** — Core only: pick → extract → copy. No edit, history, or export features.
- **Fast** — Auto-copy on extract, no extra steps.
- **Self-contained output** — CSS variables inlined, output works standalone.
- **Accessible** — Both keyboard shortcut and icon click to activate.
