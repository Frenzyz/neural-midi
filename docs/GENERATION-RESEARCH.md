# Generation Research — Unison MIDI Wizard & Similar Tools

Brief research summary (June 2025) informing Neural Midi’s rule-based and post-processing pipeline.

## How MIDI Wizard 2.0 works (public sources)

Unison’s [MIDI Wizard 2.0](https://unison.audio/midi-wizard-2-midi-generator/) combines:

1. **Genre-labeled fragment library** — 102,000+ short MIDI fragments tagged by genre (32 genres), stitched into progressions and melodies rather than pure random note walks.
2. **Three generation modes** — Chord (block/rhythm voicings), Melody (top-line hooks), Hybrid (harmonically locked melody + chords).
3. **Chord progression detection** — Imported or in-session chords drive melody generation; rhythm of chords influences melodic rhythm.
4. **Humanization** — Velocity variation, swing, and timing randomization for “produced” feel.
5. **Key / scale / length** — User constraints before one-click generate.

Neural Midi cannot ship proprietary fragments; we approximate this with **open genre templates**, **motif repetition + variation**, and **post-generation humanization**.

## What we implemented

| MIDI Wizard concept | Neural Midi implementation |
|---------------------|----------------------------|
| Genre fragments | `src/ml/genre-library.ts` — per-genre motif fragments + progression degree templates |
| Motif + variation | `src/ml/pattern-engine.ts` — `motifFromFragment`, `phraseFromMotifs`, call-and-response |
| Genre progressions | `defaultDiatonicProgression()` uses genre templates in `chords.ts` |
| Hybrid locking | Hybrid mode + chord-tone snap in `post-process.ts` + chord stabs |
| Humanization | `src/ml/humanize.ts` — swing, velocity accents, ghost notes |
| History / iterate | In-modal generation stack (`sequence-history.ts`) with back/forward |

## ONNX vs rule-based

The ONNX model remains monophonic; harmony layers and chord voicings are added in `onnx-generate.ts` and `inference.ts`. Training data (MAESTRO, POP909, JSB) improves single-voice quality; fragment logic improves musical structure when stub or post-process runs.

## References

- [MIDI Wizard 2.0 overview](https://unison.audio/midi-wizard-2-midi-generator/)
- [AI melodies guide](https://unison.audio/ai-melodies/)
- [Chord progression generator](https://unison.audio/chord-progression-generator/)
