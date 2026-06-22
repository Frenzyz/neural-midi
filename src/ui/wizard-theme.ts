/** Neural Midi sequence editor theme — vintage grape palette. */
export const WIZARD_CSS = `
  :root {
    --shadow-grey: #30292f;
    --vintage-grape: #413f54;
    --dusty-grape: #5f5aa2;
    --dusk-blue: #355691;
    --gunmetal: #3f4045;
    --text-primary: #e8e6f0;
    --text-dim: #a9a5bc;
    --note-fill: #f0edf8;
    --note-border: var(--vintage-grape);
    --selection-tint: rgba(95, 90, 162, 0.35);
    --selection-border: rgba(95, 90, 162, 0.85);
    --playhead: #5f5aa2;
    --playhead-glow: rgba(95, 90, 162, 0.45);
  }
  html, body {
    height: 100%; margin: 0;
    font-family: "AbletonSansSmall", "Helvetica Neue", sans-serif;
    font-size: 11px;
  }
  body {
    display: flex; flex-direction: column;
    background: var(--shadow-grey);
    color: var(--text-primary);
    overflow: hidden;
  }
  .wiz-top {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    padding: 10px 14px 8px;
    align-items: center;
    min-height: 120px;
    background: var(--vintage-grape);
    border-bottom: 1px solid var(--gunmetal);
  }
  .wiz-params { display: flex; flex-direction: column; gap: 6px; }
  .wiz-row { display: flex; align-items: center; gap: 8px; }
  .wiz-label {
    width: 52px; font-weight: 600; font-size: 10px;
    letter-spacing: 0.05em; color: var(--text-dim);
  }
  select.wiz-select {
    flex: 1; height: 22px;
    border: 1px solid var(--gunmetal);
    border-radius: 6px;
    background: var(--shadow-grey);
    color: var(--text-primary);
    padding: 0 6px;
  }
  .seg {
    display: inline-flex; border-radius: 8px; overflow: hidden;
    border: 1px solid var(--gunmetal);
  }
  .seg button {
    border: none; background: var(--shadow-grey);
    padding: 4px 8px; font-size: 9px; font-weight: 600;
    cursor: pointer; color: var(--text-dim);
  }
  .seg button.active {
    background: var(--dusty-grape); color: var(--text-primary);
  }
  .gen-nav {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
  }
  .gen-row { display: flex; align-items: center; gap: 8px; }
  .hist-btn {
    width: 28px; height: 28px; border-radius: 6px;
    border: 1px solid var(--gunmetal);
    background: var(--shadow-grey);
    color: var(--text-primary);
    font-size: 14px; font-weight: 600; cursor: pointer;
    line-height: 1;
  }
  .hist-btn:disabled { opacity: 0.35; cursor: default; }
  .hist-btn:not(:disabled):hover { border-color: var(--dusty-grape); color: var(--dusty-grape); }
  .hist-pos { font-size: 10px; color: var(--text-dim); min-width: 36px; text-align: center; }
  .gen-logo {
    width: 88px; height: 88px; border-radius: 50%;
    border: none; padding: 0; cursor: pointer;
    background: transparent;
    box-shadow: 0 4px 18px rgba(48, 41, 47, 0.55);
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .gen-logo:hover {
    transform: scale(1.04);
    box-shadow: 0 6px 22px rgba(48, 41, 47, 0.65);
  }
  .gen-logo svg { width: 88px; height: 88px; display: block; }
  .wiz-meta { text-align: right; font-size: 10px; color: var(--text-dim); }
  .wiz-meta input[type="range"] { accent-color: var(--dusty-grape); }
  .wiz-meta input[type="number"] {
    background: var(--shadow-grey); border: 1px solid var(--gunmetal);
    color: var(--text-primary); border-radius: 4px;
  }
  .roll-wrap {
    flex: 1; display: flex; flex-direction: column;
    margin: 0 10px 6px; min-height: 0;
  }
  .chord-lane {
    display: grid; grid-template-columns: repeat(var(--bars), 1fr);
    gap: 3px; padding: 4px 8px 6px;
    background: var(--shadow-grey);
    border-radius: 8px 8px 0 0;
    border: 1px solid var(--gunmetal); border-bottom: none;
  }
  .chord-chip {
    text-align: center; font-size: 10px; font-weight: 600;
    color: var(--text-dim);
    background: var(--vintage-grape);
    border: 1px solid transparent;
    border-radius: 4px; padding: 3px 0;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .chord-chip.selected {
    background: var(--selection-tint);
    border-color: var(--selection-border);
    color: var(--text-primary);
  }
  .canvas-stack { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .canvas-wrap {
    background: var(--shadow-grey);
    border: 1px solid var(--gunmetal);
    position: relative;
  }
  #timeline { width: 100%; height: 30px; display: block; cursor: pointer; }
  #pianoRoll { width: 100%; flex: 1; min-height: 120px; display: block; cursor: default; }
  #velocityRow { width: 100%; height: 36px; display: block; border-top: 1px solid var(--gunmetal); }
  .wiz-footer {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px;
    background: var(--vintage-grape);
    border-top: 1px solid var(--gunmetal);
  }
  .play-btn {
    width: 44px; height: 44px; border-radius: 10px;
    border: 1px solid var(--gunmetal);
    background: var(--shadow-grey);
    color: var(--dusty-grape);
    font-size: 18px; cursor: pointer;
  }
  .play-btn:hover { border-color: var(--dusty-grape); }
  .footer-actions { margin-left: auto; display: flex; gap: 8px; }
  .wiz-btn {
    height: 32px; padding: 0 14px; border-radius: 8px;
    border: 1px solid var(--gunmetal);
    background: var(--shadow-grey);
    color: var(--text-primary);
    font-weight: 600; font-size: 10px; cursor: pointer;
  }
  .wiz-btn:hover { border-color: var(--dusty-grape); }
  .wiz-btn.primary {
    background: var(--dusk-blue);
    border-color: #4a6fad;
    color: var(--text-primary);
  }
`;

export function modalDialogUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}
