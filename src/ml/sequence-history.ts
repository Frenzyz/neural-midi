import type { MidiNote } from "./types.js";

export interface GenerationHistoryState {
  snapshots: MidiNote[][];
  index: number;
}

export function cloneNotes(notes: MidiNote[]): MidiNote[] {
  return notes.map((n) => ({ ...n }));
}

export function createHistory(initialNotes: MidiNote[]): GenerationHistoryState {
  return {
    snapshots: [cloneNotes(initialNotes)],
    index: 0,
  };
}

/** Push a new snapshot; truncates any forward branch after current index. */
export function pushSnapshot(
  state: GenerationHistoryState,
  notes: MidiNote[],
): GenerationHistoryState {
  const truncated = state.snapshots.slice(0, state.index + 1);
  truncated.push(cloneNotes(notes));
  return { snapshots: truncated, index: truncated.length - 1 };
}

export function canGoBack(state: GenerationHistoryState): boolean {
  return state.index > 0;
}

export function canGoForward(state: GenerationHistoryState): boolean {
  return state.index < state.snapshots.length - 1;
}

export function historyBack(state: GenerationHistoryState): GenerationHistoryState | null {
  if (!canGoBack(state)) return null;
  const index = state.index - 1;
  return { ...state, index };
}

export function historyForward(state: GenerationHistoryState): GenerationHistoryState | null {
  if (!canGoForward(state)) return null;
  const index = state.index + 1;
  return { ...state, index };
}

export function currentSnapshot(state: GenerationHistoryState): MidiNote[] {
  return cloneNotes(state.snapshots[state.index] ?? []);
}

export function historyLabel(state: GenerationHistoryState): string {
  return `${state.index + 1} / ${state.snapshots.length}`;
}

export function nextGenerationSeed(current: number): number {
  return (current + 1) % 1_000_000;
}
