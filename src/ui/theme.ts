export function modalDialogUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}

export const LIVE_THEME_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  *:not(dialog) { margin: 0; }
  input, button, select { font: inherit; }
  :root {
    --p-live-ui-bg: hsl(0, 0%, 21%);
    --p-live-control-bg: hsl(0, 0%, 16%);
    --p-live-input-bg: hsl(0, 0%, 12%);
    --p-live-text-primary: hsl(0, 0%, 71%);
    --p-live-control-border: hsl(0, 0%, 7%);
    --p-live-text-secondary: hsl(0, 0%, 41%);
    --p-live-accent-primary: hsl(31, 100%, 67%);
    --p-live-control-text--enabled: hsl(0, 0%, 7%);
    --c-bg--0500: oklch(from var(--p-live-ui-bg) l c h);
    --c-text-primary: oklch(from var(--p-live-text-primary) l c h);
    --c-text-secondary: oklch(from var(--p-live-text-secondary) l c h);
    --c-control-bg--400: oklch(from var(--p-live-control-bg) calc(l * 0.9) c h);
    --c-control-bg--500: oklch(from var(--p-live-control-bg) l c h);
    --c-control-border: oklch(from var(--p-live-control-border) l c h);
    --c-input-bg-500: oklch(from var(--p-live-input-bg) l c h);
    --c-highlight--primary: oklch(from var(--p-live-accent-primary) l c h);
    --c-selection: oklch(from var(--p-live-accent-primary) l c h / 0.25);
  }
  html {
    background-color: var(--c-bg--0500);
    color: var(--c-text-primary);
    font-family: "AbletonSansSmall", sans-serif;
    font-size: 11.5px;
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
    height: 100%;
  }
  body { height: 100%; padding: 0.85em 1em; display: flex; flex-direction: column; gap: 0.6em; }
  h1 { font-size: 1.05rem; }
  .sub { color: var(--c-text-secondary); font-size: 0.9em; }
  label { display: block; color: var(--c-text-secondary); margin-bottom: 0.2em; font-size: 0.85em; }
  select, input[type="number"] {
    width: 100%;
    background-color: var(--c-input-bg-500);
    color: var(--c-text-primary);
    border: 1px solid var(--c-control-border);
    height: 20px;
    padding: 0 0.33em;
  }
  input[type="range"] { width: 100%; accent-color: var(--c-highlight--primary); }
  .alx-button {
    font-size: 1rem; line-height: 1;
    background-color: var(--c-control-bg--500);
    color: var(--c-text-primary);
    border: 1px solid var(--c-control-border);
    height: 22px; padding: 0 0.85em; border-radius: 1em; cursor: pointer;
  }
  .alx-button:hover { background-color: var(--c-control-bg--400); }
  .alx-button:active { color: hsl(0,0%,7%); background-color: var(--c-highlight--primary); }
  .alx-button.primary { border-color: var(--c-highlight--primary); }
`;
