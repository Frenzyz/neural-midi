# ui/

Modal dialog UI for the Generate Melody command. Built as inline HTML/CSS/JS strings — no separate `.html` files.

## File Structure

- `generate-dialog.ts` — `buildGenerateDialogHtml()`, `modalDialogUrl()`

## Key Abstractions

- `buildGenerateDialogHtml()` — returns full HTML document string with embedded styles and script
- `modalDialogUrl()` — wraps HTML as `data:text/html,${encodeURIComponent(html)}`
- Dialog bridges to Live via WebKit (`webkit.messageHandlers.live`) or WebView2 (`chrome.webview`) → `close_and_send` with JSON payload

## Patterns

- Collect: key, scale, genre, bars, temperature, seed, chordMode
- Tempo is displayed disabled (read from Live session in `extension.ts`, not sent back)
- Parse dialog JSON in `extension.ts` → build `GenerationParams` → pass to `generateMelody()`
- Match existing inline style: dark theme, Ableton-like controls, no external assets

## Gotchas

- `neuralMidi.continue` bypasses this UI entirely — hardcoded params in `extension.ts`
- Adding new dialog fields requires updating both `generate-dialog.ts` and the JSON parser in `extension.ts`
- `html.d.ts` and esbuild `.html` loader exist but are unused — keep UI inline unless migrating deliberately
- Test dialog changes manually in Live (`npm start`); no automated UI tests
