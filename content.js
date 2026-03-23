// content.js — ScopeCSS CSS Extraction Engine + Pick Mode

// ==========================================
// PART 1: CSS Extraction Engine
// ==========================================

// Shorthand CSS properties to skip (longhands are kept)
const SKIP_PROPS = new Set([
  "font", "background", "border", "outline", "transition",
  "animation",
  "border-top", "border-right", "border-bottom", "border-left",
  "border-width", "border-style", "border-color",
  "border-image",
  "margin", "padding",
  "list-style",
  "grid", "grid-template", "grid-area", "grid-column", "grid-row",
  "flex", "flex-flow",
  "place-content", "place-items", "place-self",
  "gap", "overflow", "text-decoration", "columns",
]);

// Default values to filter out (noise reduction)
const DEFAULT_VALS = new Set([
  "normal", "none", "auto", "0px", "0s", "0", "start",
  "stretch", "baseline", "visible", "static", "flat",
  "running", "ease", "1", "separate", "collapse",
  "content-box", "border-box", "currentcolor",
  "medium", "repeat", "scroll", "transparent",
]);

/**
 * Collect all CSS custom properties (variables) from :root and ancestor elements.
 * Returns Map<varName, resolvedValue>
 */
function collectCSSVariables(element) {
  const vars = new Map();

  // Scan stylesheets for :root variables
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.style && rule.selectorText && rule.selectorText.includes(":root")) {
            for (const prop of rule.style) {
              if (prop.startsWith("--")) {
                vars.set(prop, rule.style.getPropertyValue(prop).trim());
              }
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet — skip
      }
    }
  } catch (e) {}

  // Also check inline CSS variables on ancestor elements
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current.style) {
      for (const prop of current.style) {
        if (prop.startsWith("--")) {
          vars.set(prop, current.style.getPropertyValue(prop).trim());
        }
      }
    }
    current = current.parentElement;
  }

  return vars;
}

/**
 * Extract @keyframes definition by animation name from stylesheets.
 */
function extractKeyframes(animationName) {
  if (!animationName || animationName === "none") return null;
  // Handle comma-separated animation names
  const names = animationName.split(",").map((n) => n.trim());
  const results = [];

  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE && names.includes(rule.name)) {
            results.push(rule.cssText);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  return results.length > 0 ? results.join("\n\n") : null;
}

/**
 * Resolve CSS variable references in a value string.
 */
function resolveVars(val, cssVars) {
  if (!val || !val.includes("var(")) return val;
  return val.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (match, name, fallback) => {
    return cssVars.get(name) || fallback || match;
  });
}

/**
 * Build the cascade chain from root to target element.
 * Returns array of { tagName, id, classes, computed }
 */
function buildCascadeChain(element) {
  const chain = [];
  let current = element;

  while (current && current !== document.documentElement) {
    chain.unshift({
      tagName: current.tagName.toLowerCase(),
      id: current.id || "",
      classes: current.className && typeof current.className === "string"
        ? Array.from(current.classList)
        : [],
      computed: getComputedStyle(current),
    });
    current = current.parentElement;
  }
  return chain;
}

/**
 * Build a CSS selector string for a cascade node.
 */
function buildSelector(node) {
  let sel = node.tagName;
  if (node.id) sel += `#${node.id}`;
  if (node.classes.length > 0) sel += node.classes.map((c) => `.${c}`).join("");
  return sel;
}

/**
 * Extract meaningful computed styles from a CSSStyleDeclaration.
 * Returns array of { prop, value } pairs.
 */
function extractStyles(computed, cssVars) {
  const styles = [];
  for (const prop of computed) {
    if (SKIP_PROPS.has(prop)) continue;
    if (prop.startsWith("-webkit-") || prop.startsWith("-moz-")) continue;

    let val = computed.getPropertyValue(prop).trim();
    if (!val || DEFAULT_VALS.has(val)) continue;

    val = resolveVars(val, cssVars);
    styles.push({ prop, value: val });
  }
  return styles;
}

/**
 * Extract pseudo-element styles (::before, ::after).
 * Returns array of { pseudo, styles[] }
 */
function extractPseudoElements(element, cssVars) {
  const pseudos = [];
  for (const pseudo of ["::before", "::after"]) {
    try {
      const computed = getComputedStyle(element, pseudo);
      const content = computed.getPropertyValue("content").trim();
      if (!content || content === "none" || content === "normal") continue;

      const styles = extractStyles(computed, cssVars);
      if (styles.length > 0) {
        pseudos.push({ pseudo, content, styles });
      }
    } catch (e) {}
  }
  return pseudos;
}

/**
 * Format styles array to CSS string block.
 */
function formatCSS(selector, styles, indent = "  ") {
  if (styles.length === 0) return "";
  const lines = styles.map((s) => `${indent}${s.prop}: ${s.value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/**
 * Full extraction: returns { cssFormat, htmlFormat, warning }
 */
function extractElement(element) {
  const warnings = [];

  // Shadow DOM check
  if (element.shadowRoot) {
    warnings.push("Shadow DOM detected — only host element styles extracted.");
  }

  // Collect CSS variables
  const cssVars = collectCSSVariables(element);

  // Build cascade chain
  const chain = buildCascadeChain(element);

  // === CSS FORMAT ===
  const cssBlocks = [];

  // Add CSS variables block if any exist
  if (cssVars.size > 0) {
    const varLines = Array.from(cssVars.entries())
      .map(([name, val]) => `  ${name}: ${val};`);
    cssBlocks.push(`:root {\n${varLines.join("\n")}\n}`);
  }

  // Add styles for each element in cascade (only if they have an id or class)
  for (const node of chain) {
    const selector = buildSelector(node);
    const styles = extractStyles(node.computed, cssVars);
    const block = formatCSS(selector, styles);
    if (block) cssBlocks.push(block);
  }

  // Extract pseudo-elements for target element
  const pseudos = extractPseudoElements(element, cssVars);
  const targetSelector = buildSelector(chain[chain.length - 1]);
  for (const p of pseudos) {
    const pseudoStyles = [{ prop: "content", value: p.content }, ...p.styles];
    const block = formatCSS(`${targetSelector}${p.pseudo}`, pseudoStyles);
    if (block) cssBlocks.push(block);
  }

  // Extract @keyframes
  const computed = getComputedStyle(element);
  const animName = computed.getPropertyValue("animation-name").trim();
  if (animName && animName !== "none") {
    const keyframeDef = extractKeyframes(animName);
    if (keyframeDef) cssBlocks.push(keyframeDef);
  }

  // === HTML FORMAT ===
  const targetStyles = extractStyles(getComputedStyle(element), cssVars);
  const inlineStyle = targetStyles.map((s) => `${s.prop}: ${s.value}`).join("; ");
  const tag = element.tagName.toLowerCase();
  const innerHTML = element.innerHTML.length < 500
    ? element.innerHTML
    : element.textContent.trim().slice(0, 200) + "...";
  const htmlFormat = `<${tag} style="${inlineStyle}">${innerHTML}</${tag}>`;

  return {
    cssFormat: cssBlocks.join("\n\n"),
    htmlFormat,
    warning: warnings.join(" "),
  };
}

// ==========================================
// PART 2: Pick Mode UI
// ==========================================

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
