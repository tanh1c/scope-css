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
