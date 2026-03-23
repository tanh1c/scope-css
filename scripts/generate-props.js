// scripts/generate-props.js
// Reads mdn-data/css/properties.json (included with css-tree) to extract
// shorthand property names and initial values. Output: src/properties.json

const fs = require('fs');
const path = require('path');

// mdn-data is installed as css-tree dependency
const mdnProps = require('../node_modules/mdn-data/css/properties.json');

// CSS-wide keywords — valid for ALL properties
const CSS_WIDE_KEYWORDS = new Set([
  'initial', 'inherit', 'unset', 'revert', 'revert-layer'
]);

// Map mdn-data non-standard initial values to their CSS-standard equivalents.
// getComputedStyle returns the resolved value, not the keyword.
const INITIAL_VALUE_MAP = {
  'canvastext': 'rgb(0, 0, 0)',
  'canvas': 'rgb(255, 255, 255)',
};

// Properties where the initial value is an array of longhands → these are shorthands
const shorthandNames = Object.entries(mdnProps)
  .filter(([name, def]) => def && typeof def === 'object' && Array.isArray(def.initial))
  .map(([name]) => name);

// Build initial values map
// Key: property name, Value: initial value string (usable for comparison)
const initialValues = {};

for (const [name, def] of Object.entries(mdnProps)) {
  if (!def || typeof def !== 'object') continue;
  if (Array.isArray(def.initial)) continue; // shorthand — skip
  if (!def.initial) continue;
  if (def.status !== 'standard') continue;

  let val = def.initial;

  // Normalize: '0' -> '0px' for length/percentage properties
  if (val === '0') {
    const syntax = (def.syntax || '').toLowerCase();
    if (
      syntax.includes('<length>') ||
      syntax.includes('<percentage>') ||
      syntax.includes('<length-percentage>')
    ) {
      val = '0px';
    }
  }

  // Normalize non-standard color keywords to their resolved values
  if (INITIAL_VALUE_MAP[val]) {
    val = INITIAL_VALUE_MAP[val];
  }

  initialValues[name] = String(val);
}

// Output structure
const output = {
  shorthands: shorthandNames,
  initialValues,
  cssWideKeywords: Array.from(CSS_WIDE_KEYWORDS),
  generatedAt: new Date().toISOString(),
  source: 'mdn-data/css/properties.json',
  stats: {
    totalProperties: Object.keys(mdnProps).length,
    shorthands: shorthandNames.length,
    initialValues: Object.keys(initialValues).length,
  }
};

const outPath = path.join(__dirname, '..', 'src', 'properties.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`Generated ${outPath}`);
console.log(`  - Total properties: ${output.stats.totalProperties}`);
console.log(`  - Shorthands: ${output.stats.shorthands}`);
console.log(`  - Initial values: ${output.stats.initialValues}`);
console.log(`  - CSS-wide keywords: ${output.cssWideKeywords.length}`);
