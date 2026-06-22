export interface DialogDefaults {
  key: string;
  scale: string;
  genre: string;
  bars: number;
  temperature: number;
  seed: number;
  tempo: number;
  chordMode: string;
}

export function buildGenerateDialogHtml(defaults: DialogDefaults): string {
  const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const scales: [string, string][] = [
    ["major", "Major"],
    ["natural-minor", "Natural Minor"],
    ["dorian", "Dorian"],
    ["mixolydian", "Mixolydian"],
    ["lydian", "Lydian"],
    ["phrygian", "Phrygian"],
  ];
  const genres: [string, string][] = [
    ["pop", "Pop"],
    ["trap", "Trap"],
    ["house", "House"],
    ["lofi", "Lo-Fi"],
    ["edm", "EDM"],
    ["rnb", "R&B"],
    ["drill", "Drill"],
    ["ambient", "Ambient"],
  ];

  const option = (value: string, label: string, selected: string) =>
    `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Neural Midi</title>
  <script>
    const isWebKit = window.webkit?.messageHandlers?.live;
    const isWebView2 = window.chrome?.webview;

    function sendClose(result) {
      const payload = JSON.stringify(result);
      if (isWebKit) {
        window.webkit.messageHandlers.live.postMessage({ method: "close_and_send", params: [payload] });
      } else if (isWebView2) {
        window.chrome.webview.postMessage({ method: "close_and_send", params: [payload] });
      }
    }

    function collectParams() {
      return {
        action: "generate",
        key: document.getElementById("key").value,
        scale: document.getElementById("scale").value,
        genre: document.getElementById("genre").value,
        bars: Number(document.getElementById("bars").value),
        temperature: Number(document.getElementById("temperature").value),
        seed: Number(document.getElementById("seed").value),
        chordMode: document.getElementById("chordMode").value,
      };
    }

    document.addEventListener("DOMContentLoaded", () => {
      const temp = document.getElementById("temperature");
      const tempVal = document.getElementById("tempVal");
      temp.addEventListener("input", () => { tempVal.textContent = Number(temp.value).toFixed(2); });

      document.getElementById("cancel").onclick = () => sendClose({ action: "cancel" });
      document.getElementById("generate").onclick = () => sendClose(collectParams());

      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendClose(collectParams());
        if (e.key === "Escape") sendClose({ action: "cancel" });
      });
    });
  </script>
  <style>
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
      --c-control-outline: var(--c-text-secondary);
      --c-control-on-foreground: oklch(from var(--p-live-control-text--enabled) l c h);
      --c-input-bg-500: oklch(from var(--p-live-input-bg) l c h);
      --c-highlight--primary: oklch(from var(--p-live-accent-primary) l c h);
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

    body { height: 100%; padding: 1.25em; }

    h1 { font-size: 1.1rem; margin-bottom: 0.15em; }
    .sub { color: var(--c-text-secondary); margin-bottom: 1em; }
    .badge {
      font-size: 0.75em;
      color: var(--c-highlight--primary);
      border: 1px solid var(--c-control-border);
      padding: 0 0.4em;
      border-radius: 0.25em;
    }

    label {
      display: block;
      color: var(--c-text-secondary);
      margin-bottom: 0.25em;
      font-size: 0.9em;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75em;
      margin-bottom: 0.75em;
    }

    select, input[type="number"] {
      width: 100%;
      background-color: var(--c-input-bg-500);
      color: var(--c-text-primary);
      border: 1px solid var(--c-control-border);
      height: 20px;
      padding: 0 0.33em;
    }

    input[type="range"] { width: 100%; accent-color: var(--c-highlight--primary); }
    .range-val { float: right; color: var(--c-highlight--primary); }

    .actions {
      display: flex;
      gap: 0.5em;
      justify-content: flex-end;
      margin-top: 1em;
    }

    .alx-button {
      font-size: 1rem;
      line-height: 1;
      background-color: var(--c-control-bg--500);
      color: var(--c-text-primary);
      border: 1px solid var(--c-control-border);
      height: 20px;
      padding: 0 1em;
      border-radius: 1em;
      cursor: pointer;
    }
    .alx-button:hover { background-color: var(--c-control-bg--400); }
    .alx-button:active {
      color: var(--c-control-on-foreground);
      background-color: var(--c-highlight--primary);
    }
    .alx-button.primary:active { background-color: var(--c-highlight--primary); }
  </style>
</head>
<body>
  <h1>Neural Midi <span class="badge">on-device</span></h1>
  <p class="sub">Generate melody MIDI locally — no cloud required</p>

  <div class="row">
    <div>
      <label>Key</label>
      <select id="key">${keys.map((k) => option(k, k, defaults.key)).join("")}</select>
    </div>
    <div>
      <label>Scale</label>
      <select id="scale">${scales.map(([v, l]) => option(v, l, defaults.scale)).join("")}</select>
    </div>
  </div>

  <div class="row">
    <div>
      <label>Genre</label>
      <select id="genre">${genres.map(([v, l]) => option(v, l, defaults.genre)).join("")}</select>
    </div>
    <div>
      <label>Bars</label>
      <input type="number" id="bars" min="1" max="8" value="${defaults.bars}" />
    </div>
  </div>

  <div style="margin-bottom:0.75em">
    <label>Temperature <span class="range-val" id="tempVal">${defaults.temperature.toFixed(2)}</span></label>
    <input type="range" id="temperature" min="0" max="1" step="0.05" value="${defaults.temperature}" />
  </div>

  <div class="row">
    <div>
      <label>Chord source</label>
      <select id="chordMode">
        <option value="none"${defaults.chordMode === "none" ? " selected" : ""}>No chords</option>
        <option value="same-track"${defaults.chordMode === "same-track" ? " selected" : ""}>Same track (auto)</option>
        <option value="clip-below"${defaults.chordMode === "clip-below" ? " selected" : ""}>Clip below</option>
      </select>
    </div>
    <div>
      <label>Seed</label>
      <input type="number" id="seed" value="${defaults.seed}" />
    </div>
  </div>

  <div class="row">
    <div>
      <label>Tempo (BPM)</label>
      <input type="number" id="tempo" value="${defaults.tempo}" disabled title="From Live session" />
    </div>
    <div></div>
  </div>

  <div class="actions">
    <button class="alx-button" id="cancel" type="button">Cancel</button>
    <button class="alx-button primary" id="generate" type="button">Generate Melody</button>
  </div>
</body>
</html>`;
}

export function modalDialogUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}
