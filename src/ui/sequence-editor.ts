import { SCALE_INTERVALS, NOTE_TO_PC } from "../ml/melody-engine.js";
import type { SequenceState } from "../ml/sequence.js";
import { WIZARD_CSS } from "./wizard-theme.js";

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES: [string, string][] = [
  ["major", "Major"],
  ["natural-minor", "Minor"],
  ["dorian", "Dorian"],
  ["mixolydian", "Mixolydian"],
];
const GENRES: [string, string][] = [
  ["trap", "Hip Hop & Rap"],
  ["pop", "Pop"],
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

function segButtons(
  id: string,
  items: [string, string][],
  active: string,
): string {
  return `<div class="seg" id="${id}">${items
    .map(
      ([v, l]) =>
        `<button type="button" data-value="${v}" class="${v === active ? "active" : ""}">${l}</button>`,
    )
    .join("")}</div>`;
}

function chordLane(labels: string[], bars: number): string {
  const chips = Array.from({ length: bars }, (_, i) => {
    const label = labels[i] ?? "—";
    return `<div class="chord-chip">${label}</div>`;
  }).join("");
  return `<div class="chord-lane" style="--bars:${bars}">${chips}</div>`;
}

export function buildSequenceEditorHtml(state: SequenceState): string {
  const initJson = JSON.stringify(state).replace(/</g, "\\u003c");
  const scaleJson = JSON.stringify(SCALE_INTERVALS).replace(/</g, "\\u003c");
  const notePcJson = JSON.stringify(NOTE_TO_PC).replace(/</g, "\\u003c");
  const beatsPerBar = state.timeSignature.numerator || 4;
  const labels = state.chordLabels?.length
    ? state.chordLabels
    : Array.from({ length: state.bars }, () => "—");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Neural Midi</title>
<style>${WIZARD_CSS}</style>
<script>
const SCALE_INTERVALS = ${scaleJson};
const NOTE_TO_PC = ${notePcJson};
const BEATS_PER_BAR = ${beatsPerBar};
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
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

function segValue(id) {
  return document.querySelector("#" + id + " button.active")?.dataset.value ?? "";
}

function setupSeg(id, onChange) {
  const group = document.getElementById(id);
  group.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      group.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (onChange) onChange(btn.dataset.value);
    };
  });
}

function pitchName(p) {
  const oct = Math.floor(p / 12) - 1;
  return NOTE_NAMES[p % 12] + oct;
}

function collectBase() {
  return {
    notes: state.notes,
    key: document.getElementById("key").value,
    scale: document.getElementById("scale").value,
    genre: document.getElementById("genre").value,
    bars: Number(segValue("lengthSeg") || state.bars),
    temperature: Number(document.getElementById("temperature").value),
    seed: Number(document.getElementById("seed").value),
    chordMode: document.getElementById("chordMode").value,
    generationMode: segValue("modeSeg"),
    articulation: segValue("typeSeg"),
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionEnd,
    useRegionSettings: false,
    regionKey: document.getElementById("key").value,
    regionScale: document.getElementById("scale").value,
    regionGenre: document.getElementById("genre").value,
    regionTemperature: Number(document.getElementById("temperature").value),
    regionSeed: Number(document.getElementById("seed").value),
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  };
}

function totalBeats() { return state.bars * BEATS_PER_BAR; }

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
    ctx.fillStyle = b % 2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.2)";
    ctx.fillRect(b * barW, 0, barW, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.moveTo(b * barW, 0); ctx.lineTo(b * barW, h); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = (10 * devicePixelRatio) + "px sans-serif";
    ctx.fillText(String(b + 1), b * barW + 4 * devicePixelRatio, 14 * devicePixelRatio);
  }
  const sx = (state.selectionStart / totalBeats()) * w;
  const ex = (state.selectionEnd / totalBeats()) * w;
  ctx.fillStyle = "rgba(255, 159, 67, 0.25)";
  ctx.fillRect(sx, 0, ex - sx, h);
  ctx.strokeStyle = "rgba(255, 159, 67, 0.9)";
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
    ctx.strokeStyle = p % 12 === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)";
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const tb = totalBeats();
  const fontSize = 8 * devicePixelRatio;
  ctx.font = fontSize + "px sans-serif";
  for (const n of state.notes) {
    const x = (n.startTime / tb) * w;
    const nw = Math.max(14 * devicePixelRatio, (n.duration / tb) * w);
    const nh = 14 * devicePixelRatio;
    const y = h - ((n.pitch - minP) / range) * h - nh - 2;
    const inSel = n.startTime >= state.selectionStart && n.startTime < state.selectionEnd;
    const r = 4 * devicePixelRatio;
    ctx.fillStyle = inSel ? "rgba(255, 159, 67, 0.92)" : "rgba(240, 244, 248, 0.9)";
    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, r);
    ctx.fill();
    ctx.fillStyle = "#1a1a1e";
    const label = pitchName(n.pitch);
    if (nw > fontSize * 2) ctx.fillText(label, x + 3 * devicePixelRatio, y + nh - 3 * devicePixelRatio);
  }
}

function drawVelocity() {
  const c = document.getElementById("velocityRow");
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = (9 * devicePixelRatio) + "px sans-serif";
  ctx.fillText("VEL", 4 * devicePixelRatio, 10 * devicePixelRatio);
  const tb = totalBeats();
  for (const n of state.notes) {
    const x = (n.startTime / tb) * w + ((n.duration / tb) * w) * 0.5;
    const norm = n.velocity / 127;
    const stalkH = norm * (h * 0.55);
    const baseY = h - 4 * devicePixelRatio;
    ctx.strokeStyle = "rgba(80, 200, 180, 0.7)";
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - stalkH);
    ctx.stroke();
    ctx.fillStyle = "rgba(80, 220, 200, 0.95)";
    ctx.beginPath();
    ctx.arc(x, baseY - stalkH, 3 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }
}

function redraw() { drawTimeline(); drawPianoRoll(); drawVelocity(); }

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

document.addEventListener("DOMContentLoaded", () => {
  const temp = document.getElementById("temperature");
  const tempVal = document.getElementById("tempVal");
  temp.addEventListener("input", () => { tempVal.textContent = Number(temp.value).toFixed(2); });

  setupSeg("modeSeg");
  setupSeg("typeSeg");
  setupSeg("lengthSeg", (v) => {
    state.bars = Number(v);
    state.selectionEnd = Math.min(totalBeats(), state.selectionStart + BEATS_PER_BAR);
    redraw();
  });

  setupTimelineDrag();
  redraw();
  window.addEventListener("resize", redraw);

  document.getElementById("play").onclick = () => playPreview();
  document.getElementById("cancel").onclick = () => { stopPreview(); sendClose({ action: "cancel" }); };
  document.getElementById("generate").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "generate_all" }); };
  document.getElementById("generateSel").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "generate_selection" }); };
  document.getElementById("apply").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "apply" }); };
});
</script>
</head>
<body>
  <div class="wiz-top">
    <div class="wiz-params">
      <div class="wiz-row"><span class="wiz-label">GENRE</span>
        <select class="wiz-select" id="genre">${options(GENRES, state.genre)}</select></div>
      <div class="wiz-row"><span class="wiz-label">KEY</span>
        <select class="wiz-select" id="key" style="width:42%">${keyOptions(state.key)}</select>
        <select class="wiz-select" id="scale" style="width:42%">${options(SCALES, state.scale)}</select></div>
      <div class="wiz-row"><span class="wiz-label">MODE</span>
        ${segButtons("modeSeg", [["chords", "CHORDS"], ["hybrid", "HYBRID"], ["melody", "MELODY"]], state.generationMode ?? "melody")}</div>
      <div class="wiz-row"><span class="wiz-label">TYPE</span>
        ${segButtons("typeSeg", [["lead", "LEAD"], ["pluck", "PLUCK"]], state.articulation ?? "lead")}</div>
      <div class="wiz-row"><span class="wiz-label">LENGTH</span>
        ${segButtons("lengthSeg", [["4", "4 BARS"], ["8", "8 BARS"]], String(state.bars === 8 ? 8 : 4))}</div>
    </div>
    <button class="gen-circle" id="generate" type="button" title="Generate melody">NM</button>
    <div class="wiz-meta">
      <div>Temp <span id="tempVal">${state.temperature.toFixed(2)}</span></div>
      <input type="range" id="temperature" min="0" max="1" step="0.05" value="${state.temperature}" style="width:120px" />
      <div style="margin-top:6px">Seed <input type="number" id="seed" value="${state.seed}" style="width:80px" /></div>
      <div style="margin-top:4px">Chords
        <select id="chordMode" class="wiz-select" style="width:100px">
          <option value="none"${state.chordMode === "none" ? " selected" : ""}>Off</option>
          <option value="same-track"${state.chordMode === "same-track" ? " selected" : ""}>Track</option>
          <option value="clip-below"${state.chordMode === "clip-below" ? " selected" : ""}>Below</option>
        </select>
      </div>
    </div>
  </div>

  <div class="roll-wrap">
    ${chordLane(labels, state.bars)}
    <div class="canvas-stack">
      <div class="canvas-wrap"><canvas id="timeline"></canvas></div>
      <div class="canvas-wrap" style="flex:1;display:flex;min-height:0"><canvas id="pianoRoll"></canvas></div>
      <div class="canvas-wrap"><canvas id="velocityRow"></canvas></div>
    </div>
  </div>

  <div class="wiz-footer">
    <button class="play-btn" id="play" type="button" title="Preview">&#9654;</button>
    <div class="footer-actions">
      <button class="wiz-btn" id="cancel" type="button">Cancel</button>
      <button class="wiz-btn" id="generateSel" type="button">Generate Selection</button>
      <button class="wiz-btn primary" id="apply" type="button">Apply to Clip</button>
    </div>
  </div>
</body>
</html>`;
}

export { modalDialogUrl } from "./wizard-theme.js";
