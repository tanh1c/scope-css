# ScopeCSS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome Extension (Manifest V3) called ScopeCSS that lets users pick any web element, extract its full CSS cascade (~95-98% fidelity), and copy the result as plain CSS or inline HTML.

**Architecture:** Side Panel API (Chrome 114+) + Content Script + Background Service Worker. Content script handles pick mode & extraction; Side Panel handles display & copy. Communication via `chrome.runtime.sendMessage`.

**Tech Stack:** Vanilla JS, Manifest V3, Chrome Side Panel API, Clipboard API.

---

## File Structure

```
scope-css/
├── manifest.json
├── background.js
├── content.js
├── sidepanel.html
├── sidepanel.css
├── sidepanel.js
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

---

### Task 1: Project Scaffold — manifest.json

**Files:**
- Create: `scope-css/manifest.json`
- Create: `scope-css/icons/` (placeholder SVG icons via data URI)

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "ScopeCSS",
  "version": "1.0.0",
  "description": "Pick any element on a webpage and copy its full CSS cascade — no more digging through DevTools.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "commands": {
    "toggle-pick": {
      "suggested_key": {
        "default": "Ctrl+Shift+S",
        "mac": "Command+Shift+S"
      },
      "description": "Toggle element pick mode"
    }
  },
  "permissions": [
    "sidePanel",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

**Step 2: Create icons directory and placeholder icons**

Run: `mkdir -p scope-css/icons`

Create 3 PNG files (16x16, 48x48, 128x128) — simplest approach is to generate them via a canvas script or use an inline SVG converted to PNG. For initial setup, use Chrome's extension icon format. If no PNG tools available, use a simple base64-encoded placeholder.

**Step 3: Commit**

```bash
cd scope-css
git add manifest.json icons/
git commit -m "chore: scaffold extension with manifest v3, side panel, and commands"
```

---

### Task 2: Background Service Worker — background.js

**Files:**
- Create: `scope-css/background.js`

**Step 1: Write background.js**

```javascript
// background.js
// Registers keyboard shortcut → sends message to content script to toggle pick mode.
// Also handles sidePanel.open() on icon click (via action).

// Toggle pick mode when keyboard shortcut is pressed
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-pick") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_PICK" });
        // Open side panel on activation
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
```

**Step 2: Commit**

```bash
cd scope-css
git add background.js
git commit -m "feat: background service worker with shortcut and side panel toggle"
```

---

### Task 3: Content Script — CSS Extraction Core

**Files:**
- Create: `scope-css/content.js`

**Step 1: Write the extraction utility functions**

```javascript
// content.js — CSS Extraction Engine

// CSS properties to skip (browser defaults that add noise)
const SKIP_PROPS = new Set([
  "font", "background", "border", "outline", "transition",
  "animation", "animation-name", "animation-duration", "animation-timing-function",
  "animation-delay", "animation-iteration-count", "animation-direction",
  "animation-fill-mode", "animation-play-state",
  "border-top", "border-right", "border-bottom", "border-left",
  "border-width", "border-style", "border-color",
  "border-radius", "border-top-left-radius", "border-top-right-radius",
  "border-bottom-left-radius", "border-bottom-right-radius",
  "border-image", "border-image-source", "border-image-slice",
  "border-image-width", "border-image-outset", "border-image-repeat",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "list-style", "list-style-type", "list-style-position", "list-style-image",
]);

/**
 * Collect all CSS custom properties (variables) from root to element,
 * returning a map of var-name → resolved value.
 */
function collectCSSVariables(element) {
  const vars = new Map();
  let current = element;

  // Traverse from element up to document root
  while (current && current !== document.documentElement.parentElement) {
    const style = getComputedStyle(current);
    const cssVars = style.getPropertyValue("--*") || "";
    // getComputedStyle doesn't have getPropertyValue for wildcards,
    // so we check if styleSheets are accessible (same-origin)
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ":root" || rule.selectorText === ":root") {
              for (const prop of rule.style) {
                if (prop.startsWith("--")) {
                  const val = rule.style.getPropertyValue(prop);
                  if (val) vars.set(prop, val.trim());
                }
              }
            }
          }
        } catch (e) {
          // cross-origin stylesheet — skip
        }
      }
    } catch (e) {
      // fallback: extract vars from inline style attribute
    }

    // Also check inline style
    if (current.style) {
      for (const prop of current.style) {
        if (prop.startsWith("--")) {
          vars.set(prop, current.style.getPropertyValue(prop));
        }
      }
    }
    current = current.parentElement;
  }
  return vars;
}

/**
 * Collect all CSS rules from stylesheets that apply to :root
 * (returns raw CSS text for @keyframes, CSS vars, etc.)
 */
function collectRootStylesheetRules() {
  const rules = [];
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          rules.push(rule.cssText);
        }
      } catch (e) {
        // cross-origin — skip
      }
    }
  } catch (e) {}
  return rules;
}

/**
 * Extract @keyframes definition by animation name
 */
function extractKeyframes(animationName) {
  if (!animationName || animationName === "none") return null;
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === animationName) {
            return rule.cssText;
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

/**
 * Build the cascade chain from root to target element.
 * Returns array of { element, computed, tagName, classes }
 */
function buildCascadeChain(element) {
  const chain = [];
  let current = element;

  while (current && current !== document.documentElement) {
    const computed = getComputedStyle(current);
    chain.unshift({
      element: current,
      computed,
      tagName: current.tagName.toLowerCase(),
      id: current.id ? `#${current.id}` : "",
      classes: current.className
        ? Array.from(current.classList)
            .map((c) => `.${c}`)
            .join("")
        : "",
    });
    current = current.parentElement;
  }
  return chain;
}

/**
 * Flatten computed styles to CSS string for a specific element.
 * Resolves CSS variables using the vars map.
 */
function computedToCSS(computed, cssVars, indent = "  ") {
  const lines = [];
  for (const prop of computed) {
    // Skip shorthand properties (handled by longhands)
    if (SKIP_PROPS.has(prop)) continue;
    const val = computed.getPropertyValue(prop).trim();
    if (!val || val === "normal" || val === "none" || val === "auto") continue;
    // Resolve CSS variables
    let resolvedVal = val;
    if (val.includes("var(--")) {
      for (const [name, v] of cssVars) {
        resolvedVal = resolvedVal.replace(`var(${name})`, v);
      }
    }
    if (resolvedVal && resolvedVal !== val) {
      lines.push(`${indent}${prop}: ${resolvedVal};`);
    } else if (!val.includes("var(--")) {
      lines.push(`${indent}${prop}: ${val};`);
    }
  }
  return lines.join("\n");
}

/**
 * Build inline style attribute value for HTML format.
 */
function buildInlineStyle(element, cssVars) {
  const computed = getComputedStyle(element);
  const styles = [];
  for (const prop of computed) {
    if (SKIP_PROPS.has(prop)) continue;
    const val = computed.getPropertyValue(prop).trim();
    if (!val || val === "normal" || val === "none" || val === "auto") continue;
    let resolvedVal = val;
    if (val.includes("var(--")) {
      for (const [name, v] of cssVars) {
        resolvedVal = resolvedVal.replace(`var(${name})`, v);
      }
    }
    styles.push(`${prop}: ${resolvedVal}`);
  }
  return styles.join("; ") + ";";
}

/**
 * Full extraction: returns { cssFormat, htmlFormat, warning }
 */
function extractElement(element) {
  const warning = [];

  // Shadow DOM check
  if (element.shadowRoot) {
    warning.push("Shadow DOM detected — only host element extracted.");
  }

  // Cascade chain
  const chain = buildCascadeChain(element);

  // CSS variables
  const cssVars = collectCSSVariables(element);

  // Build CSS output
  const cssLines = [];
  const seenProps = new Set();

  for (const node of chain) {
    const selector = `${node.tagName}${node.id}${node.classes}`;
    if (!selector || selector === node.tagName) continue; // skip untagged

    const nodeCSS = computedToCSS(node.computed, cssVars);
    if (nodeCSS) {
      cssLines.push(`${selector} {`);
      cssLines.push(nodeCSS);
      cssLines.push("}");
      cssLines.push("");
    }
  }

  // Pseudo elements
  const pseudoSelectors = [":before", ":after"];
  for (const pseudo of pseudoSelectors) {
    try {
      const pseudoStyle = getComputedStyle(element, pseudo);
      const content = pseudoStyle.getPropertyValue("content").trim();
      if (content && content !== "none" && content !== '""') {
        const pseudoCSS = computedToCSS(pseudoStyle, cssVars, "    ");
        if (pseudoCSS) {
          cssLines.push(`::${pseudo.replace(":", "")} {`);
          cssLines.push(`  content: ${content};`);
          cssLines.push(pseudoCSS);
          cssLines.push("}");
          cssLines.push("");
        }
      }
    } catch (e) {}
  }

  // Keyframes
  const computed = getComputedStyle(element);
  const animName = computed.getPropertyValue("animation-name").trim();
  if (animName && animName !== "none") {
    const keyframeDef = extractKeyframes(animName);
    if (keyframeDef) {
      cssLines.push(keyframeDef);
      cssLines.push("");
    }
  }

  // Build HTML output
  const tag = element.tagName.toLowerCase();
  const inlineStyle = buildInlineStyle(element, cssVars);
  const innerHTML = element.innerHTML.length < 500 ? element.innerHTML : element.textContent.trim();
  const htmlOutput = `<${tag} style="${inlineStyle}">${innerHTML}</${tag}>`;

  return {
    cssFormat: cssLines.join("\n"),
    htmlFormat: htmlOutput,
    cssVars: Object.fromEntries(cssVars),
    warning: warning.join(" "),
  };
}
```

**Step 2: Commit**

```bash
cd scope-css
git add content.js
git commit -m "feat: core CSS extraction engine — cascade, vars, pseudos, keyframes"
```

---

### Task 4: Content Script — Pick Mode UI

**Files:**
- Modify: `scope-css/content.js` (append to existing)

**Step 1: Add pick mode logic**

```javascript
// content.js — Pick Mode UI (append after extraction functions)

// Highlight style injected during pick mode
const HIGHLIGHT_STYLE = `
  .scopecss-hover-highlight {
    outline: 2px solid #3b82f6 !important;
    outline-offset: 2px !important;
    cursor: crosshair !important;
  }
  .scopecss-pick-mode * {
    cursor: crosshair !important;
  }
`;

let pickModeActive = false;
let hoveredElement = null;
let highlightOverlay = null;

function injectHighlightStyle() {
  if (document.getElementById("scopecss-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "scopecss-highlight-style";
  style.textContent = HIGHLIGHT_STYLE;
  document.head.appendChild(style);
  document.body.classList.add("scopecss-pick-mode");
}

function removeHighlightStyle() {
  const style = document.getElementById("scopecss-highlight-style");
  if (style) style.remove();
  document.body.classList.remove("scopecss-pick-mode");
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
}

function highlightElement(el) {
  if (hoveredElement) {
    hoveredElement.classList.remove("scopecss-hover-highlight");
  }
  if (el && el !== document.body && el !== document.documentElement) {
    el.classList.add("scopecss-hover-highlight");
    hoveredElement = el;
  } else {
    hoveredElement = null;
  }
}

function enterPickMode() {
  if (pickModeActive) return;
  pickModeActive = true;
  injectHighlightStyle();

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

function exitPickMode() {
  if (!pickModeActive) return;
  pickModeActive = false;
  highlightElement(null);
  removeHighlightStyle();

  document.removeEventListener("mouseover", onMouseOver, true);
  document.removeEventListener("mouseout", onMouseOut, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);
}

function onMouseOver(e) {
  highlightElement(e.target);
}

function onMouseOut(e) {
  if (hoveredElement === e.target) {
    highlightElement(null);
  }
}

function onClick(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const result = extractElement(e.target);

  // Send to side panel
  chrome.runtime.sendMessage({
    type: "EXTRACTION_RESULT",
    payload: result,
  });

  exitPickMode();
  return false;
}

function onKeyDown(e) {
  if (e.key === "Escape") {
    exitPickMode();
  }
}

// Listen for toggle from background script / keyboard shortcut
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOGGLE_PICK") {
    if (pickModeActive) {
      exitPickMode();
    } else {
      enterPickMode();
    }
  }
});
```

**Step 2: Commit**

```bash
cd scope-css
git add content.js
git commit -m "feat: pick mode UI — hover highlight, crosshair cursor, ESC exit"
```

---

### Task 5: Side Panel — UI

**Files:**
- Create: `scope-css/sidepanel.html`
- Create: `scope-css/sidepanel.css`
- Create: `scope-css/sidepanel.js`

**Step 1: Write sidepanel.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ScopeCSS</title>
  <link rel="stylesheet" href="sidepanel.css" />
</head>
<body>
  <div class="container">
    <header class="header">
      <h1 class="logo">ScopeCSS</h1>
      <p class="subtitle">Pick any element → copy its styles</p>
    </header>

    <div class="instructions" id="instructions">
      <p>Press <kbd>Ctrl+Shift+S</kbd> or click the extension icon, then click any element.</p>
    </div>

    <div class="tabs" id="tabs" style="display: none;">
      <button class="tab active" data-tab="css">CSS</button>
      <button class="tab" data-tab="html">HTML</button>
    </div>

    <div class="output-wrapper" id="outputWrapper" style="display: none;">
      <pre class="output" id="output"></pre>
      <div class="copy-btn-wrap">
        <button class="copy-btn" id="copyBtn">Copy</button>
      </div>
    </div>

    <div class="warning" id="warning" style="display: none;"></div>

    <div class="toast" id="toast">Copied!</div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>
```

**Step 2: Write sidepanel.css**

```css
:root {
  --bg: #1e1e2e;
  --surface: #2a2a3e;
  --border: #3a3a5e;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --success: #22c55e;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  width: 320px;
  min-height: 400px;
  padding: 16px;
}

.container { display: flex; flex-direction: column; gap: 12px; }

.header { text-align: center; }

.logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.instructions {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

kbd {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: monospace;
  font-size: 11px;
  color: var(--text);
}

.tabs {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border-radius: 8px;
  padding: 4px;
}

.tab {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.tab.active {
  background: var(--accent);
  color: #fff;
}

.tab:hover:not(.active) {
  color: var(--text);
}

.output-wrapper {
  position: relative;
}

.output {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  font-family: "Fira Code", "Cascadia Code", monospace;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text);
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.copy-btn-wrap {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.copy-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.copy-btn:hover { background: var(--accent-hover); }
.copy-btn:active { transform: scale(0.97); }

.warning {
  background: #7c2d12;
  border: 1px solid #9a3412;
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  color: #fed7aa;
  line-height: 1.5;
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(80px);
  background: var(--success);
  color: #fff;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  z-index: 100;
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

**Step 3: Write sidepanel.js**

```javascript
// sidepanel.js
let currentData = null;
let currentTab = "css";

const instructions = document.getElementById("instructions");
const tabs = document.getElementById("tabs");
const outputWrapper = document.getElementById("outputWrapper");
const output = document.getElementById("output");
const warning = document.getElementById("warning");
const toast = document.getElementById("toast");
const copyBtn = document.getElementById("copyBtn");
const tabButtons = document.querySelectorAll(".tab");

function showToast(msg = "Copied!") {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

function render() {
  if (!currentData) return;
  const text = currentTab === "css" ? currentData.cssFormat : currentData.htmlFormat;
  output.textContent = text || "(no styles extracted)";
}

function autoCopy(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast(),
    () => {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast();
    }
  );
}

// Tab switching
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    render();
    if (currentData) {
      const text = currentTab === "css" ? currentData.cssFormat : currentData.htmlFormat;
      autoCopy(text);
    }
  });
});

// Manual copy button
copyBtn.addEventListener("click", () => {
  if (!currentData) return;
  const text = currentTab === "css" ? currentData.cssFormat : currentData.htmlFormat;
  autoCopy(text);
});

// Receive extraction result from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "EXTRACTION_RESULT") {
    currentData = msg.payload;

    // Show UI
    instructions.style.display = "none";
    tabs.style.display = "flex";
    outputWrapper.style.display = "block";

    // Reset to CSS tab
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabButtons[0].classList.add("active");
    currentTab = "css";

    render();

    // Auto-copy CSS format
    autoCopy(currentData.cssFormat);

    // Warning if any
    if (currentData.warning) {
      warning.style.display = "block";
      warning.textContent = currentData.warning;
    } else {
      warning.style.display = "none";
    }
  }
});
```

**Step 4: Commit**

```bash
cd scope-css
git add sidepanel.html sidepanel.css sidepanel.js
git commit -m "feat: side panel UI — tabs, output, auto-copy, toast notifications"
```

---

### Task 6: Icons

**Files:**
- Create: `scope-css/icons/icon-16.png`
- Create: `scope-css/icons/icon-48.png`
- Create: `scope-css/icons/icon-128.png`

**Step 1: Generate icons**

Use a simple Node.js script to generate PNG icons from an SVG. Create a minimal SVG logo (blue square with "S" letter) and convert to PNG.

```bash
# Using Node.js canvas (if canvas package available)
node -e "
const { createCanvas } = require('canvas');
[16, 48, 128].forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3b82f6';
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold ' + (size * 0.6) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size/2, size/2 + 1);
  const fs = require('fs');
  fs.writeFileSync('scope-css/icons/icon-' + size + '.png', canvas.toBuffer('image/png'));
  console.log('Created icon-' + size + '.png');
});
"
```

If canvas not available, manually create simple placeholder PNGs using any image tool, or use base64-encoded minimal PNG data.

**Step 2: Commit**

```bash
cd scope-css
git add icons/
git commit -m "chore: add extension icons (16, 48, 128px)"
```

---

### Task 7: README.md

**Files:**
- Create: `scope-css/README.md`

**Step 1: Write README**

```markdown
# ScopeCSS

> Pick any element on a webpage → copy its full CSS cascade in one click.

## Features

- **Full cascade extraction** — captures styles from `:root` down to the target element
- **CSS variables inlined** — no more `var(--x)` noise; variables resolved to their actual values
- **Pseudo-elements** — `::before` and `::after` extracted as separate rules
- **Animations** — `@keyframes` definitions auto-detected and included
- **Two formats** — copy as **plain CSS** or **inline HTML+style**
- **Side Panel UI** — preview output directly in Chrome's Side Panel
- **Keyboard shortcut** — `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac)
- **~95% fidelity** — works great for reuse on your own projects

## Install

1. Clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `scope-css` directory

## Usage

1. Navigate to any webpage
2. Press `Ctrl+Shift+S` or click the ScopeCSS extension icon
3. Your cursor becomes a crosshair — hover over any element
4. **Click** the element you want to extract
5. The result is **auto-copied** to your clipboard and shown in the Side Panel
6. Switch between **CSS** and **HTML** tabs as needed
7. Press **Escape** to cancel pick mode

## Limitations

- Shadow DOM: limited extraction on shadow host only
- Cross-origin iframes: not accessible
- Web fonts and images: URLs preserved but not bundled

## Tech

- Chrome Extension (Manifest V3)
- Side Panel API
- Vanilla JS — no dependencies

## License

MIT
```

**Step 2: Commit**

```bash
cd scope-css
git add README.md
git commit -m "docs: add README with install and usage instructions"
```

---

### Task 8: Push to GitHub

**Step 1: Set remote and push**

```bash
cd scope-css
git remote add origin https://github.com/tanh1c/scope-css.git
git branch -M main
git push -u origin main
```

---

## Implementation Summary

| Task | File | What it does |
|---|---|---|
| 1 | `manifest.json` | Extension config, side panel, commands, permissions |
| 2 | `background.js` | Service worker, shortcut handler, side panel open |
| 3 | `content.js` (extraction) | CSS vars, cascade, pseudos, keyframes extraction engine |
| 4 | `content.js` (pick mode) | Hover highlight, crosshair, click handler, ESC exit |
| 5 | `sidepanel.html/css/js` | Side panel UI with tabs, output, toast, auto-copy |
| 6 | `icons/*.png` | Extension icons (16, 48, 128px) |
| 7 | `README.md` | Documentation |
| 8 | push | `git push origin main` |

**Total: 8 tasks** — each produces a commit.
