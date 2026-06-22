/** Unison MIDI Wizard–inspired theme (light panel + dark roll). */
export const WIZARD_CSS = `
  :root {
    --wiz-sky: #b8d4e8;
    --wiz-sky-dark: #9fc0db;
    --wiz-panel: #1a1a1e;
    --wiz-grid: #2a2a32;
    --wiz-grid-line: #3a3a48;
    --wiz-accent: #ff9f43;
    --wiz-accent-glow: rgba(255, 159, 67, 0.45);
    --wiz-note: #f0f4f8;
    --wiz-chord: #6b8cff;
    --wiz-text: #1e2a36;
    --wiz-text-dim: #4a5f73;
    --wiz-white: #ffffff;
  }
  html, body { height: 100%; margin: 0; font-family: "AbletonSansSmall", "Helvetica Neue", sans-serif; font-size: 11px; }
  body {
    display: flex; flex-direction: column;
    background: linear-gradient(180deg, var(--wiz-sky) 0%, #d4e8f5 38%, var(--wiz-panel) 38%);
    color: var(--wiz-text);
    overflow: hidden;
  }
  .wiz-top {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    padding: 10px 14px 8px;
    align-items: center;
    min-height: 130px;
  }
  .wiz-params { display: flex; flex-direction: column; gap: 6px; }
  .wiz-row { display: flex; align-items: center; gap: 8px; }
  .wiz-label { width: 52px; font-weight: 600; font-size: 10px; letter-spacing: 0.04em; color: var(--wiz-text-dim); }
  select.wiz-select {
    flex: 1; height: 22px; border: 1px solid var(--wiz-sky-dark);
    border-radius: 6px; background: var(--wiz-white); padding: 0 6px;
  }
  .seg { display: inline-flex; border-radius: 8px; overflow: hidden; border: 1px solid var(--wiz-sky-dark); }
  .seg button {
    border: none; background: rgba(255,255,255,0.5); padding: 4px 8px;
    font-size: 9px; font-weight: 600; cursor: pointer; color: var(--wiz-text-dim);
  }
  .seg button.active { background: var(--wiz-white); color: var(--wiz-text); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
  .gen-circle {
    width: 88px; height: 88px; border-radius: 50%;
    border: 3px solid var(--wiz-white);
    background: radial-gradient(circle at 35% 30%, #fff 0%, var(--wiz-sky) 55%, #7eb3d4 100%);
    box-shadow: 0 0 0 4px var(--wiz-accent-glow), 0 4px 16px rgba(0,0,0,0.15);
    font-size: 22px; font-weight: 700; color: var(--wiz-text);
    cursor: pointer;
  }
  .gen-circle:hover { transform: scale(1.03); }
  .wiz-meta { text-align: right; font-size: 10px; color: var(--wiz-text-dim); }
  .roll-wrap { flex: 1; display: flex; flex-direction: column; margin: 0 10px 6px; min-height: 0; }
  .chord-lane {
    display: grid; grid-template-columns: repeat(var(--bars), 1fr);
    gap: 4px; padding: 4px 8px 6px; background: var(--wiz-panel);
    border-radius: 8px 8px 0 0; border: 1px solid var(--wiz-grid-line); border-bottom: none;
  }
  .chord-chip {
    text-align: center; font-size: 10px; font-weight: 600;
    color: var(--wiz-chord); background: rgba(107,140,255,0.15);
    border-radius: 4px; padding: 3px 0;
  }
  .canvas-stack { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .canvas-wrap { background: var(--wiz-grid); border: 1px solid var(--wiz-grid-line); position: relative; }
  #timeline { width: 100%; height: 28px; display: block; cursor: crosshair; }
  #pianoRoll { width: 100%; flex: 1; min-height: 120px; display: block; }
  #velocityRow { width: 100%; height: 36px; display: block; border-top: 1px solid var(--wiz-grid-line); }
  .wiz-footer {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; background: linear-gradient(180deg, #c5dff0, var(--wiz-sky));
    border-top: 1px solid var(--wiz-sky-dark);
  }
  .play-btn {
    width: 44px; height: 44px; border-radius: 10px; border: none;
    background: var(--wiz-white); font-size: 18px; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .footer-actions { margin-left: auto; display: flex; gap: 8px; }
  .wiz-btn {
    height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--wiz-sky-dark);
    background: var(--wiz-white); font-weight: 600; font-size: 10px; cursor: pointer;
  }
  .wiz-btn.primary { background: var(--wiz-accent); border-color: #e88a2d; color: #1a1208; }
  .hidden-panel { display: none; }
`;

export function modalDialogUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}
