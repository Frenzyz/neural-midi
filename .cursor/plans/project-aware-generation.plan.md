# Project-Aware MIDI Generation (v1)

## Overview

On-demand session analysis auto-fills key, scale, genre, rhythm, and harmony when the Sequence Editor opens so generated MIDI matches the Live project.

## Scope (v1)

- Snapshot session-view MIDI clips + Live `song.rootNote`/`scaleName` when scale mode enabled
- NOT real-time audio monitoring
- NOT audio render analysis (phase 2)

## Implementation

1. `session-analysis.ts` — K–S key detection, rhythm fingerprint, multi-track chords, Live scale merge, genre inference
2. Unit tests for K–S, rhythm, merge logic
3. `extension.ts` — analyze on editor open; re-analyze action; merge into generation params
4. `sequence-editor.ts` — Match Project toggle, confidence badge, Re-analyze button
5. `GenerationParams.swingAmount` — project swing override in post-process

## Acceptance

- [x] Editor opens with inferred key/scale/genre when session has MIDI
- [x] Match Project toggle (default on) with manual override preserved
- [x] Re-analyze refreshes inference without closing editor flow
- [x] Confidence/source badge shows analysis provenance
- [x] Generation uses project chords/swing when Match Project enabled
- [x] Tests, typecheck, build pass
