export function buildGenerateDialogHtml(defaults: {
  key: string;
  scale: string;
  genre: string;
  bars: number;
  temperature: number;
  seed: number;
  tempo: number;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Neural Midi</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #1a1a1a;
      color: #e8e8e8;
      padding: 20px;
      font-size: 13px;
    }
    h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .sub { color: #888; margin-bottom: 16px; font-size: 11px; }
    label { display: block; margin-bottom: 4px; color: #aaa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    select, input[type="number"] {
      width: 100%;
      padding: 8px 10px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #fff;
      font-size: 13px;
    }
    input[type="range"] { width: 100%; accent-color: #ff764d; }
    .range-val { float: right; color: #ff764d; }
    .actions { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }
    button {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      font-size: 13px;
      cursor: pointer;
    }
    .primary { background: #ff764d; color: #111; font-weight: 600; }
    .secondary { background: #333; color: #ccc; }
    .badge {
      display: inline-block;
      background: #333;
      color: #ff764d;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 6px;
    }
  </style>
</head>
<body>
  <h1>Neural Midi <span class="badge">on-device</span></h1>
  <p class="sub">Generate melody MIDI locally — no cloud required</p>

  <div class="row">
    <div>
      <label>Key</label>
      <select id="key">
        ${["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"].map(k =>
          `<option value="${k}"${k === defaults.key ? " selected" : ""}>${k}</option>`
        ).join("")}
      </select>
    </div>
    <div>
      <label>Scale</label>
      <select id="scale">
        ${[
          ["major","Major"],["natural-minor","Natural Minor"],["dorian","Dorian"],
          ["mixolydian","Mixolydian"],["lydian","Lydian"],["phrygian","Phrygian"],
        ].map(([v,l]) => `<option value="${v}"${v === defaults.scale ? " selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
  </div>

  <div class="row">
    <div>
      <label>Genre</label>
      <select id="genre">
        ${[
          ["pop","Pop"],["trap","Trap"],["house","House"],["lofi","Lo-Fi"],
          ["edm","EDM"],["rnb","R&B"],["drill","Drill"],["ambient","Ambient"],
        ].map(([v,l]) => `<option value="${v}"${v === defaults.genre ? " selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
    <div>
      <label>Bars</label>
      <input type="number" id="bars" min="1" max="8" value="${defaults.bars}" />
    </div>
  </div>

  <div style="margin-bottom:12px">
    <label>Temperature <span class="range-val" id="tempVal">${defaults.temperature.toFixed(2)}</span></label>
    <input type="range" id="temperature" min="0" max="1" step="0.05" value="${defaults.temperature}" />
  </div>

  <div class="row">
    <div>
      <label>Seed</label>
      <input type="number" id="seed" value="${defaults.seed}" />
    </div>
    <div>
      <label>Tempo (BPM)</label>
      <input type="number" id="tempo" value="${defaults.tempo}" disabled title="Read from Live session" />
    </div>
  </div>

  <div class="actions">
    <button class="secondary" id="cancel">Cancel</button>
    <button class="primary" id="generate">Generate Melody</button>
  </div>

  <script>
    const temp = document.getElementById("temperature");
    const tempVal = document.getElementById("tempVal");
    temp.addEventListener("input", () => { tempVal.textContent = Number(temp.value).toFixed(2); });

    document.getElementById("cancel").onclick = () => window.closeDialog(null);
    document.getElementById("generate").onclick = () => {
      window.closeDialog(JSON.stringify({
        action: "generate",
        key: document.getElementById("key").value,
        scale: document.getElementById("scale").value,
        genre: document.getElementById("genre").value,
        bars: Number(document.getElementById("bars").value),
        temperature: Number(document.getElementById("temperature").value),
        seed: Number(document.getElementById("seed").value),
      }));
    };
  </script>
</body>
</html>`;
}
