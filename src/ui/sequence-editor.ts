import { SCALE_INTERVALS, NOTE_TO_PC } from "../ml/melody-engine.js";
import type { SequenceState } from "../ml/sequence.js";
import { NM_LOGO_SVG } from "./nm-logo.js";
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
    return `<div class="chord-chip" data-bar="${i}">${label}</div>`;
  }).join("");
  return `<div class="chord-lane" id="chordLane" style="--bars:${bars}">${chips}</div>`;
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
const GRID = 0.25;
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MIN_P = 48, MAX_P = 84;
const COLORS = {
  shadow: "#30292f",
  vintage: "#413f54",
  dusty: "#5f5aa2",
  dusk: "#355691",
  gunmetal: "#3f4045",
  text: "#e8e6f0",
  textDim: "#a9a5bc",
  noteFill: "#f0edf8",
  noteBorder: "#413f54",
  selTint: "rgba(95, 90, 162, 0.35)",
  selBorder: "rgba(95, 90, 162, 0.85)",
  playhead: "#5f5aa2",
};

let state = ${initJson};
let selectedBars = beatRangeToBars(state.selectionStart, state.selectionEnd, BEATS_PER_BAR, state.bars);
let playheadBeat = 0;
let playing = false;
let playheadRaf = null;
let playStartWall = 0;
let playStartBeat = 0;
let audioCtx = null;
let playTimers = [];
let selectedNoteIndex = null;
let noteDrag = null;
let scrubbingPlayhead = false;

const isWebKit = window.webkit?.messageHandlers?.live;
const isWebView2 = window.chrome?.webview;

function sendClose(result) {
  const payload = JSON.stringify(result);
  if (isWebKit) window.webkit.messageHandlers.live.postMessage({ method: "close_and_send", params: [payload] });
  else if (isWebView2) window.chrome.webview.postMessage({ method: "close_and_send", params: [payload] });
}

function quantizeBeat(b) { return Math.round(b / GRID) * GRID; }

function beatRangeToBars(start, end, bpb, totalBars) {
  const first = Math.max(0, Math.floor(start / bpb));
  const last = Math.min(totalBars - 1, Math.ceil(end / bpb) - 1);
  const bars = [];
  for (let b = first; b <= last; b++) bars.push(b);
  return bars.length ? bars : [0];
}

function barsToBeatRange(bars, bpb) {
  if (!bars.length) return { start: 0, end: bpb };
  const min = Math.min(...bars), max = Math.max(...bars);
  return { start: min * bpb, end: (max + 1) * bpb };
}

function barFromX(x, width) {
  const barW = width / state.bars;
  return Math.max(0, Math.min(state.bars - 1, Math.floor(x / barW)));
}

function isNearDivider(x, width) {
  const barW = width / state.bars;
  const bar = Math.floor(x / barW);
  const local = x - bar * barW;
  return local < 10 || local > barW - 10;
}

function updateHistoryControls() {
  const total = (state.generationHistory && state.generationHistory.length) || 1;
  const idx = state.historyIndex ?? 0;
  const pos = document.getElementById("histPos");
  const back = document.getElementById("histBack");
  const fwd = document.getElementById("histFwd");
  if (pos) pos.textContent = (idx + 1) + " / " + total;
  if (back) back.disabled = idx <= 0;
  if (fwd) fwd.disabled = idx >= total - 1;
}

function syncSelectionFromBars() {
  const range = barsToBeatRange(selectedBars, BEATS_PER_BAR);
  state.selectionStart = range.start;
  state.selectionEnd = range.end;
  document.querySelectorAll(".chord-chip").forEach((el) => {
    const b = Number(el.dataset.bar);
    el.classList.toggle("selected", selectedBars.includes(b));
  });
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
  return NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 1);
}

function snapPitch(pitch) {
  const key = document.getElementById("key").value;
  const scale = document.getElementById("scale").value;
  const root = NOTE_TO_PC[key] ?? 0;
  const iv = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  let best = pitch, bestD = Infinity;
  for (let midi = MIN_P; midi <= MAX_P; midi++) {
    const rel = (midi % 12 - root + 12) % 12;
    if (!iv.includes(rel)) continue;
    const d = Math.abs(midi - pitch);
    if (d < bestD) { bestD = d; best = midi; }
  }
  return best;
}

function collectBase() {
  const range = barsToBeatRange(selectedBars, BEATS_PER_BAR);
  return {
    notes: state.notes,
    key: document.getElementById("key").value,
    scale: document.getElementById("scale").value,
    genre: document.getElementById("genre").value,
    bars: Number(segValue("lengthSeg") || state.bars),
    temperature: Number(document.getElementById("temperature").value),
    expression: Number(document.getElementById("expression").value),
    stylePreset: segValue("styleSeg") || "expressive",
    tightenPhrasing: document.getElementById("tightenPhrasing").checked,
    seed: Number(document.getElementById("seed").value),
    chordMode: document.getElementById("chordMode").value,
    generationMode: segValue("modeSeg"),
    articulation: segValue("typeSeg"),
    selectionStart: range.start,
    selectionEnd: range.end,
    useRegionSettings: false,
    regionKey: document.getElementById("key").value,
    regionScale: document.getElementById("scale").value,
    regionGenre: document.getElementById("genre").value,
    regionTemperature: Number(document.getElementById("temperature").value),
    regionExpression: Number(document.getElementById("expression").value),
    regionStylePreset: segValue("styleSeg") || "expressive",
    regionTightenPhrasing: document.getElementById("tightenPhrasing").checked,
    regionSeed: Number(document.getElementById("seed").value),
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  };
}

function totalBeats() { return state.bars * BEATS_PER_BAR; }

function noteInSelectedBars(n) {
  const bar = Math.floor(n.startTime / BEATS_PER_BAR);
  return selectedBars.includes(bar);
}

function cancelPlayheadAnim() {
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  playheadRaf = null;
}

function tickPlayhead() {
  if (!playing) return;
  const secPerBeat = 60 / Math.max(1, state.tempo);
  const elapsed = (performance.now() - playStartWall) / 1000;
  playheadBeat = playStartBeat + elapsed / secPerBeat;
  const endBeat = Math.max(...state.notes.map(n => n.startTime + n.duration), 0);
  if (playheadBeat >= endBeat + 0.1) {
    stopPreview();
    return;
  }
  redraw();
  playheadRaf = requestAnimationFrame(tickPlayhead);
}

function stopPreview() {
  playing = false;
  cancelPlayheadAnim();
  playTimers.forEach(clearTimeout);
  playTimers = [];
  try { audioCtx?.close(); } catch (_) {}
  audioCtx = null;
  playheadBeat = 0;
  redraw();
}

function playPreview() {
  stopPreview();
  if (!state.notes.length) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  playing = true;
  playheadBeat = 0;
  playStartBeat = 0;
  playStartWall = performance.now();
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
  tickPlayhead();
}

function drawPlayhead(ctx, w, h) {
  const x = (playheadBeat / totalBeats()) * w;
  ctx.save();
  ctx.strokeStyle = COLORS.playhead;
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.shadowColor = COLORS.playhead;
  ctx.shadowBlur = 6 * devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COLORS.playhead;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x - 5 * devicePixelRatio, 8 * devicePixelRatio);
  ctx.lineTo(x + 5 * devicePixelRatio, 8 * devicePixelRatio);
  ctx.closePath();
  ctx.fill();
}

function drawBarHighlights(ctx, w, h) {
  const barW = w / state.bars;
  for (const b of selectedBars) {
    ctx.fillStyle = COLORS.selTint;
    ctx.fillRect(b * barW, 0, barW, h);
  }
}

function drawTimeline() {
  const c = document.getElementById("timeline");
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(0,0,w,h);
  const barW = w / state.bars;
  drawBarHighlights(ctx, w, h);
  for (let b = 0; b < state.bars; b++) {
    ctx.strokeStyle = COLORS.gunmetal;
    ctx.lineWidth = 1 * devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(b * barW, 0); ctx.lineTo(b * barW, h); ctx.stroke();
    ctx.fillStyle = COLORS.textDim;
    ctx.font = (10 * devicePixelRatio) + "px sans-serif";
    ctx.fillText(String(b + 1), b * barW + 6 * devicePixelRatio, 18 * devicePixelRatio);
  }
  ctx.strokeStyle = COLORS.dusty;
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath(); ctx.moveTo(w - 1, 0); ctx.lineTo(w - 1, h); ctx.stroke();
  drawPlayhead(ctx, w, h);
}

function noteRect(n, w, h) {
  const range = MAX_P - MIN_P;
  const nh = 14 * devicePixelRatio;
  const tb = totalBeats();
  const nw = Math.max(14 * devicePixelRatio, (n.duration / tb) * w);
  const x = (n.startTime / tb) * w;
  const y = h - ((n.pitch - MIN_P) / range) * h - nh - 2;
  return { x, y, w: nw, h: nh };
}

function hitTestNote(px, py, rect) {
  const edge = 8 * devicePixelRatio;
  if (px < rect.x || px > rect.x + rect.w || py < rect.y || py > rect.y + rect.h) return null;
  if (px - rect.x <= edge) return "resize-left";
  if (rect.x + rect.w - px <= edge) return "resize-right";
  return "body";
}

function drawPianoRoll() {
  const c = document.getElementById("pianoRoll");
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(0,0,w,h);
  const range = MAX_P - MIN_P;
  drawBarHighlights(ctx, w, h);
  for (let p = MIN_P; p <= MAX_P; p++) {
    const y = h - ((p - MIN_P) / range) * h;
    ctx.strokeStyle = p % 12 === 0 ? COLORS.gunmetal : "rgba(63,64,69,0.45)";
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const barW = w / state.bars;
  for (let b = 1; b < state.bars; b++) {
    ctx.strokeStyle = COLORS.gunmetal;
    ctx.beginPath(); ctx.moveTo(b * barW, 0); ctx.lineTo(b * barW, h); ctx.stroke();
  }
  const tb = totalBeats();
  const fontSize = 8 * devicePixelRatio;
  ctx.font = fontSize + "px sans-serif";
  state.notes.forEach((n, i) => {
    const rect = noteRect(n, w, h);
    const inSel = noteInSelectedBars(n);
    const isNoteSel = selectedNoteIndex === i;
    const r = 4 * devicePixelRatio;
    ctx.fillStyle = isNoteSel ? COLORS.dusty : (inSel ? "#d8d4ec" : COLORS.noteFill);
    ctx.strokeStyle = isNoteSel ? COLORS.dusk : COLORS.noteBorder;
    ctx.lineWidth = (isNoteSel ? 2 : 1) * devicePixelRatio;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.shadow;
    const label = pitchName(n.pitch);
    if (rect.w > fontSize * 2) ctx.fillText(label, rect.x + 3 * devicePixelRatio, rect.y + rect.h - 3 * devicePixelRatio);
  });
  drawPlayhead(ctx, w, h);
}

function drawVelocity() {
  const c = document.getElementById("velocityRow");
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h = c.height = c.clientHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(0,0,w,h);
  drawBarHighlights(ctx, w, h);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = (9 * devicePixelRatio) + "px sans-serif";
  ctx.fillText("VEL", 4 * devicePixelRatio, 12 * devicePixelRatio);
  const tb = totalBeats();
  for (const n of state.notes) {
    const x = (n.startTime / tb) * w + ((n.duration / tb) * w) * 0.5;
    const norm = n.velocity / 127;
    const stalkH = norm * (h * 0.55);
    const baseY = h - 4 * devicePixelRatio;
    ctx.strokeStyle = COLORS.dusty;
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - stalkH);
    ctx.stroke();
    ctx.fillStyle = COLORS.dusty;
    ctx.beginPath();
    ctx.arc(x, baseY - stalkH, 3 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
  }
  drawPlayhead(ctx, w, h);
}

function redraw() { drawTimeline(); drawPianoRoll(); drawVelocity(); }

function selectBar(bar, extend) {
  const b = Math.max(0, Math.min(state.bars - 1, bar));
  if (extend) {
    if (!selectedBars.includes(b)) selectedBars = [...selectedBars, b].sort((a, c) => a - c);
  } else {
    selectedBars = [b];
  }
  syncSelectionFromBars();
  redraw();
}

function beatFromClientX(canvas, clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * devicePixelRatio;
  const w = canvas.width;
  return Math.max(0, Math.min(totalBeats(), (x / w) * totalBeats()));
}

function setupTimelineInteraction() {
  const timeline = document.getElementById("timeline");
  timeline.addEventListener("mousedown", (e) => {
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const phX = (playheadBeat / totalBeats()) * rect.width;
    if (!playing && Math.abs(x - phX) < 12) {
      scrubbingPlayhead = true;
      return;
    }
    if (isNearDivider(x, rect.width) || e.shiftKey) {
      selectBar(barFromX(x, rect.width), e.shiftKey);
      return;
    }
    selectBar(barFromX(x, rect.width), false);
  });
  window.addEventListener("mousemove", (e) => {
    if (scrubbingPlayhead && !playing) {
      playheadBeat = beatFromClientX(timeline, e.clientX);
      redraw();
    }
    if (noteDrag) handleNoteDrag(e);
  });
  window.addEventListener("mouseup", () => {
    scrubbingPlayhead = false;
    noteDrag = null;
  });
}

function setupPianoRollInteraction() {
  const roll = document.getElementById("pianoRoll");
  roll.addEventListener("mousedown", (e) => {
    const rect = roll.getBoundingClientRect();
    const px = (e.clientX - rect.left) * devicePixelRatio;
    const py = (e.clientY - rect.top) * devicePixelRatio;
    const w = roll.width, h = roll.height;
    let hit = -1, zone = null, nrect = null;
    for (let i = state.notes.length - 1; i >= 0; i--) {
      const r = noteRect(state.notes[i], w, h);
      const z = hitTestNote(px, py, r);
      if (z) { hit = i; zone = z; nrect = r; break; }
    }
    if (hit >= 0) {
      selectedNoteIndex = hit;
      const n = state.notes[hit];
      noteDrag = {
        mode: zone,
        index: hit,
        startX: px,
        startY: py,
        origStart: n.startTime,
        origDur: n.duration,
        origPitch: n.pitch,
      };
      redraw();
      return;
    }
    selectedNoteIndex = null;
    if (!playing) {
      playheadBeat = beatFromClientX(roll, e.clientX);
      scrubbingPlayhead = true;
    }
    redraw();
  });
}

function handleNoteDrag(e) {
  if (!noteDrag) return;
  const roll = document.getElementById("pianoRoll");
  const rect = roll.getBoundingClientRect();
  const px = (e.clientX - rect.left) * devicePixelRatio;
  const py = (e.clientY - rect.top) * devicePixelRatio;
  const w = roll.width, h = roll.height;
  const tb = totalBeats();
  const dxBeat = ((px - noteDrag.startX) / w) * tb;
  const n = state.notes[noteDrag.index];
  if (noteDrag.mode === "body") {
    n.startTime = quantizeBeat(Math.max(0, Math.min(tb - GRID, noteDrag.origStart + dxBeat)));
    const range = MAX_P - MIN_P;
    const dyPitch = -((py - noteDrag.startY) / h) * range;
    n.pitch = snapPitch(Math.round(noteDrag.origPitch + dyPitch));
  } else if (noteDrag.mode === "resize-right") {
    n.duration = quantizeBeat(Math.max(GRID, noteDrag.origDur + dxBeat));
  } else if (noteDrag.mode === "resize-left") {
    const newStart = quantizeBeat(Math.max(0, noteDrag.origStart + dxBeat));
    const delta = newStart - noteDrag.origStart;
    n.startTime = newStart;
    n.duration = quantizeBeat(Math.max(GRID, noteDrag.origDur - delta));
  }
  redraw();
}

function setupChordLaneClicks() {
  document.getElementById("chordLane").addEventListener("click", (e) => {
    const chip = e.target.closest(".chord-chip");
    if (!chip) return;
    selectBar(Number(chip.dataset.bar), e.shiftKey);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const temp = document.getElementById("temperature");
  const tempVal = document.getElementById("tempVal");
  temp.addEventListener("input", () => { tempVal.textContent = Number(temp.value).toFixed(2); });

  const expr = document.getElementById("expression");
  const exprVal = document.getElementById("exprVal");
  expr.addEventListener("input", () => { exprVal.textContent = Number(expr.value).toFixed(2); });

  setupSeg("modeSeg");
  setupSeg("typeSeg");
  setupSeg("styleSeg");
  setupSeg("lengthSeg", (v) => {
    state.bars = Number(v);
    selectedBars = selectedBars.filter((b) => b < state.bars);
    if (!selectedBars.length) selectedBars = [0];
    syncSelectionFromBars();
    const lane = document.getElementById("chordLane");
    lane.style.setProperty("--bars", state.bars);
    redraw();
  });

  syncSelectionFromBars();
  setupTimelineInteraction();
  setupPianoRollInteraction();
  setupChordLaneClicks();
  redraw();
  window.addEventListener("resize", redraw);

  document.getElementById("play").onclick = () => playing ? stopPreview() : playPreview();
  document.getElementById("cancel").onclick = () => { stopPreview(); sendClose({ action: "cancel" }); };
  document.getElementById("histBack").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "history_back" }); };
  document.getElementById("histFwd").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "history_forward" }); };
  document.getElementById("generate").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "generate_all" }); };
  document.getElementById("generateSel").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "generate_selection" }); };
  document.getElementById("apply").onclick = () => { stopPreview(); sendClose({ ...collectBase(), action: "apply" }); };
  updateHistoryControls();
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
      <div class="wiz-row"><span class="wiz-label">STYLE</span>
        ${segButtons("styleSeg", [["clean", "CLEAN"], ["expressive", "EXPR"], ["dense", "DENSE"]], state.stylePreset ?? "expressive")}</div>
    </div>
    <div class="gen-nav">
      <div class="gen-row">
        <button class="hist-btn" id="histBack" type="button" title="Previous generation">&lt;</button>
        <span class="hist-pos" id="histPos">${(state.historyIndex ?? 0) + 1} / ${state.generationHistory?.length ?? 1}</span>
        <button class="hist-btn" id="histFwd" type="button" title="Next generation">&gt;</button>
      </div>
      <button class="gen-logo" id="generate" type="button" title="Generate new melody">${NM_LOGO_SVG}</button>
    </div>
    <div class="wiz-meta">
      <div>Expression <span id="exprVal">${(state.expression ?? 0.3).toFixed(2)}</span></div>
      <input type="range" id="expression" min="0" max="1" step="0.05" value="${state.expression ?? 0.3}" style="width:120px" />
      <div style="margin-top:4px">Temp <span id="tempVal">${state.temperature.toFixed(2)}</span></div>
      <input type="range" id="temperature" min="0" max="1" step="0.05" value="${state.temperature}" style="width:120px" />
      <label style="display:block;margin-top:6px;font-size:11px">
        <input type="checkbox" id="tightenPhrasing"${state.tightenPhrasing ? " checked" : ""} /> Tighten phrasing
      </label>
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
