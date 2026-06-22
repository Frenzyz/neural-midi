import { SCALE_INTERVALS, NOTE_TO_PC } from "../ml/melody-engine.js";
import type { SequenceState } from "../ml/sequence.js";
import { LIVE_THEME_CSS } from "./theme.js";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES: [string, string][] = [
  ["major", "Major"],
  ["natural-minor", "Natural Minor"],
  ["dorian", "Dorian"],
  ["mixolydian", "Mixolydian"],
  ["lydian", "Lydian"],
  ["phrygian", "Phrygian"],
];
const GENRES: [string, string][] = [
  ["pop", "Pop"],
  ["trap", "Trap"],
  ["house", "House"],
  ["lofi", "Lo-Fi"],
  ["edm", "EDM"],
  ["rnb", "R&B"],
  ["drill", "Drill"],
  ["ambient", "Ambient"],
];

function options(values: [string, string][], selected: string): string {
  return values
    .map(([v, l]) => `<option value="${v}"${v === selected ? " selected" : ""}>${l}</option>`)
    .join("");
}

function keyOptions(selected: string): string {
  return KEYS.map((k) => `<option value="${k}"${k === selected ? " selected" : ""}>${k}</option>`).join("");
}

export function buildSequenceEditorHtml(state: SequenceState): string {
  const initJson = JSON.stringify(state).replace(/</g, "\\u003c");
  const scaleJson = JSON.stringify(SCALE_INTERVALS).replace(/</g, "\\u003c");
  const notePcJson = JSON.stringify(NOTE_TO_PC).replace(/</g, "\\u003c");
  const beatsPerBar = state.timeSignature.numerator || 4;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Neural Midi — Sequence Editor</title>
<style>${LIVE_THEME_CSS}
  .header { display: flex; justify-content: space-between; align-items: baseline; }
  .badge { font-size: 0.75em; color: var(--c-highlight--primary); border: 1px solid var(--c-control-border); padding: 0 0.35em; border-radius: 0.25em; }
  .main { display: grid; grid-template-columns: 1fr 220px; gap: 0.75em; flex: 1; min-height: 0; }
  .editor-col { display: flex; flex-direction: column; gap: 0.5em; min-width: 0; }
  .canvas-wrap { background: var(--c-input-bg-500); border: 1px solid var(--c-control-border); border-radius: 2px; position: relative; }
  #timeline { width: 100%; height: 36px; display: block; cursor: crosshair; }
  #pianoRoll { width: 100%; height: 140px; display: block; }
  .panel { display: flex; flex-direction: column; gap: 0.45em; overflow-y: auto; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45em; }
  .region-box { border: 1px solid var(--c-control-border); padding: 0.45em; border-radius: 2px; }
  .region-box.off { opacity: 0.45; pointer-events: none; }
  .region-box h3 { font-size: 0.85em; color: var(--c-highlight--primary); margin-bottom: 0.35em; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.4em; justify-content: flex-end; margin-top: auto; padding-top: 0.35em; }
  .transport { display: flex; gap: 0.4em; align-items: center; }
  .hint { color: var(--c-text-secondary); font-size: 0.8em; }
  .range-val { float: right; color: var(--c-highlight--primary); }
</style>
<script>
const SCALE_INTERVALS = ${scaleJson};
const NOTE_TO_PC = ${notePcJson};
const BEATS_PER_BAR = ${beatsPerBar};
let state = ${initJson};
let audioCtx = null;
let playing = false;
let playTimers = [];

const isWebKit = window.webkit?.messageHandlers?.live;
const isWebView2 = window.chrome?.webview;

function sendClose(result) {
  const payload = JSON.stringify(result);
  if (isWebKit) window.webkit.messageHandlers.live.postMessage({ method: "close_and_send", params: [payload] });
  else if (isWebView2) window.chrome.webview.postMessage({ method: "close_and_send", params: [payload] });
}

function collectBase() {
  return {
    notes: state.notes,
    key: document.getElementById("key").value,
    scale: document.getElementById("scale").value,
    genre: document.getElementById("genre").value,
    bars: Number(document.getElementById("bars").value),
    temperature: Number(document.getElementById("temperature").value),
    seed: Number(document.getElementById("seed").value),
    chordMode: document.getElementById("chordMode").value,
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionEnd,
    useRegionSettings: document.getElementById("useRegion").checked,
    regionKey: document.getElementById("regionKey").value,
    regionScale: document.getElementById("regionScale").value,
    regionGenre: document.getElementById("regionGenre").value,
    regionTemperature: Number(document.getElementById("regionTemp").value),
    regionSeed: Number(document.getElementById("regionSeed").value),
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  };
}

function totalBeats() { return state.bars * BEATS_PER_BAR; }

function remapPitchClient(pitch, fromKey, fromScale, toKey, toScale) {
  const fromRoot = NOTE_TO_PC[fromKey] ?? 0;
  const toRoot = NOTE_TO_PC[toKey] ?? 0;
  const shift = ((toRoot - fromRoot) % 12 + 12) % 12;
  const shifted = pitch + shift;
  const toIv = SCALE_INTERVALS[toScale];
  const pitches = [];
  for (let midi = 36; midi <= 96; midi++) {
    const rel = (midi % 12 - toRoot + 12) % 12;
    if (toIv.includes(rel)) pitches.push(midi);
  }
  let best = pitches[0] ?? shifted, bestD = Math.abs(best - shifted);
  for (const p of pitches) {
    const d = Math.abs(p - shifted);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function stopPreview() {
  playing = false;
  playTimers.forEach(clearTimeout);
  playTimers = [];
  try { audioCtx?.close(); } catch (_) {}
  audioCtx = null;
}

function playPreview() {
  stopPreview();
  if (!state.notes.length) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  playing = true;
  const secPerBeat = 60 / Math.max(1, state.tempo);
  const t0 = audioCtx.currentTime + 0.05;
  for (const n of state.notes) {
    const start = t0 + n.startTime * secPerBeat;
    const dur = Math.max(0.05, n.duration * secPerBeat);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * Math.pow(2, (n.pitch - 69) / 12);
    gain.gain.value = (n.velocity / 127) * 0.12;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + dur);
  }
  const endMs = (Math.max(...state.notes.map(n => n.startTime + n.duration)) * secPerBeat + 0.2) * 1000;
  playTimers.push(setTimeout(() => { playing = false; }, endMs));
}

function beatFromX(x, width) {
  return Math.max(0, Math.min(totalBeats(), (x / width) * totalBeats()));
}

function drawTimeline() {
  const c = document.getElementById("timeline");
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  const barW = w / state.bars;
  for (let b = 0; b < state.bars; b++) {
    ctx.fillStyle = b % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.15)";
    ctx.fillRect(b * barW, 0, barW, h);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.moveTo(b * barW, 0); ctx.lineTo(b * barW, h); ctx.stroke();
  }
  const sx = (state.selectionStart / totalBeats()) * w;
  const ex = (state.selectionEnd / totalBeats()) * w;
  ctx.fillStyle = "rgba(255, 165, 80, 0.22)";
  ctx.fillRect(sx, 0, ex - sx, h);
  ctx.strokeStyle = "rgba(255, 165, 80, 0.8)";
  ctx.strokeRect(sx + 0.5, 0.5, ex - sx - 1, h - 1);
}

function drawPianoRoll() {
  const c = document.getElementById("pianoRoll");
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  const minP = 48, maxP = 84, range = maxP - minP;
  for (let p = minP; p <= maxP; p++) {
    const y = h - ((p - minP) / range) * h;
    ctx.strokeStyle = p % 12 === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const tb = totalBeats();
  for (const n of state.notes) {
    const x = (n.startTime / tb) * w;
    const nw = Math.max(2, (n.duration / tb) * w);
    const y = h - ((n.pitch - minP) / range) * h - 4;
    const inSel = n.startTime >= state.selectionStart && n.startTime < state.selectionEnd;
    ctx.fillStyle = inSel ? "rgba(255, 165, 80, 0.85)" : "rgba(180, 200, 220, 0.75)";
    ctx.fillRect(x, y, nw, 6);
  }
}

function redraw() { drawTimeline(); drawPianoRoll(); }

function setupTimelineDrag() {
  const c = document.getElementById("timeline");
  let dragging = false, anchor = 0;
  c.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = c.getBoundingClientRect();
    anchor = beatFromX(e.clientX - rect.left, rect.width);
    state.selectionStart = anchor;
    state.selectionEnd = Math.min(totalBeats(), anchor + BEATS_PER_BAR);
    redraw();
  });
  c.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = c.getBoundingClientRect();
    const beat = beatFromX(e.clientX - rect.left, rect.width);
    state.selectionStart = Math.min(anchor, beat);
    state.selectionEnd = Math.max(anchor, beat);
    if (state.selectionEnd - state.selectionStart < 0.25) state.selectionEnd = state.selectionStart + 0.25;
    redraw();
  });
  window.addEventListener("mouseup", () => { dragging = false; });
}

function applyScaleRemap() {
  const toKey = document.getElementById("remapKey").value;
  const toScale = document.getElementById("remapScale").value;
  const fromKey = document.getElementById("key").value;
  const fromScale = document.getElementById("scale").value;
  if (toKey === fromKey && toScale === fromScale) return;
  state.notes = state.notes.map(n => ({
    ...n,
    pitch: remapPitchClient(n.pitch, fromKey, fromScale, toKey, toScale),
  }));
  document.getElementById("key").value = toKey;
  document.getElementById("scale").value = toScale;
  redraw();
}

document.addEventListener("DOMContentLoaded", () => {
  const temp = document.getElementById("temperature");
  const tempVal = document.getElementById("tempVal");
  temp.addEventListener("input", () => { tempVal.textContent = Number(temp.value).toFixed(2); });
  const rtemp = document.getElementById("regionTemp");
  const rtempVal = document.getElementById("regionTempVal");
  rtemp.addEventListener("input", () => { rtempVal.textContent = Number(rtemp.value).toFixed(2); });

  document.getElementById("useRegion").addEventListener("change", (e) => {
    document.getElementById("regionPanel").classList.toggle("off", !e.target.checked);
  });

  setupTimelineDrag();
  redraw();
  window.addEventListener("resize", redraw);

  document.getElementById("play").onclick = () => playPreview();
  document.getElementById("stop").onclick = () => stopPreview();
  document.getElementById("remapBtn").onclick = () => applyScaleRemap();
  document.getElementById("cancel").onclick = () => { stopPreview(); sendClose({ action: "cancel" }); };
  document.getElementById("generateAll").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "generate_all" }); };
  document.getElementById("generateSel").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "generate_selection" }); };
  document.getElementById("apply").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "apply" }); };
});
</script>
</head>
<body>
  <div class="header">
    <div>
      <h1>Neural Midi <span class="badge">sequence editor</span></h1>
      <p class="sub">Generate, preview, and edit before writing to the clip</p>
    </div>
    <div class="transport">
      <button class="alx-button" id="play" type="button">Play</button>
      <button class="alx-button" id="stop" type="button">Stop</button>
    </div>
  </div>

  <div class="main">
    <div class="editor-col">
      <div class="canvas-wrap"><canvas id="timeline"></canvas></div>
      <p class="hint">Drag on the timeline to select a region for partial generation</p>
      <div class="canvas-wrap"><canvas id="pianoRoll"></canvas></div>
    </div>

    <div class="panel">
      <div class="row2">
        <div><label>Key</label><select id="key">${keyOptions(state.key)}</select></div>
        <div><label>Scale</label><select id="scale">${options(SCALES, state.scale)}</select></div>
      </div>
      <div class="row2">
        <div><label>Genre</label><select id="genre">${options(GENRES, state.genre)}</select></div>
        <div><label>Bars</label><input type="number" id="bars" min="1" max="8" value="${state.bars}" /></div>
      </div>
      <div>
        <label>Temperature <span class="range-val" id="tempVal">${state.temperature.toFixed(2)}</span></label>
        <input type="range" id="temperature" min="0" max="1" step="0.05" value="${state.temperature}" />
      </div>
      <div class="row2">
        <div><label>Chord source</label>
          <select id="chordMode">
            <option value="none"${state.chordMode === "none" ? " selected" : ""}>No chords</option>
            <option value="same-track"${state.chordMode === "same-track" ? " selected" : ""}>Same track</option>
            <option value="clip-below"${state.chordMode === "clip-below" ? " selected" : ""}>Clip below</option>
          </select>
        </div>
        <div><label>Seed</label><input type="number" id="seed" value="${state.seed}" /></div>
      </div>

      <div class="region-box${state.useRegionSettings ? "" : " off"}" id="regionPanel">
        <h3>Selection settings</h3>
        <label><input type="checkbox" id="useRegion"${state.useRegionSettings ? " checked" : ""} /> Override for selection</label>
        <div class="row2" style="margin-top:0.35em">
          <div><label>Region key</label><select id="regionKey">${keyOptions(state.regionKey)}</select></div>
          <div><label>Region scale</label><select id="regionScale">${options(SCALES, state.regionScale)}</select></div>
        </div>
        <div class="row2">
          <div><label>Region genre</label><select id="regionGenre">${options(GENRES, state.regionGenre)}</select></div>
          <div><label>Region seed</label><input type="number" id="regionSeed" value="${state.regionSeed}" /></div>
        </div>
        <label>Region temp <span class="range-val" id="regionTempVal">${state.regionTemperature.toFixed(2)}</span></label>
        <input type="range" id="regionTemp" min="0" max="1" step="0.05" value="${state.regionTemperature}" />
      </div>

      <div class="row2">
        <div><label>Remap to key</label><select id="remapKey">${keyOptions(state.key)}</select></div>
        <div><label>Remap to scale</label><select id="remapScale">${options(SCALES, state.scale)}</select></div>
      </div>
      <button class="alx-button" id="remapBtn" type="button" style="width:100%">Apply scale change</button>
    </div>
  </div>

  <div class="actions">
    <button class="alx-button" id="cancel" type="button">Cancel</button>
    <button class="alx-button" id="generateSel" type="button">Generate Selection</button>
    <button class="alx-button primary" id="generateAll" type="button">Generate All</button>
    <button class="alx-button primary" id="apply" type="button">Apply to Clip</button>
  </div>
</body>
</html>`;
}

export { modalDialogUrl } from "./theme.js";
