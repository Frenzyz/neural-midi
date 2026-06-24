# Classical Melody Craft — Training Notes

Research notes on how Bach and the classical masters shaped melodies, tied to the
Neural Midi training pipeline (`train_melody.py`, `reward.py`, 16th-grid tokenizer).

## Genre mapping choice

Bach (`jsb`, `bach`, `bach_wtc`) and classical masters (`classical`) map to the
**ambient** genre bucket in `genre_map.py` — same conditioning as MAESTRO and
GiantMIDI. Rationale:

- No new genre one-hot slot (preserves ONNX I/O and `tokenizer.ts` sync).
- Classical melodic writing is harmonically dense and stepwise — closer to ambient
  piano conditioning than pop/trap.
- Enriches the ambient slice with voice-leading and cadential patterns without
  swamping pop/EDM balance (genre-balanced cap in `MelodyDataset`).

## Pipeline alignment

| Composer craft | Observable pattern | Tokenizer / model hook |
|---|---|---|
| 16th-note motion | Most surface rhythm lands on 0.25-beat grid | `GRID = 0.25`, `POSITIONS = 16` |
| Pitch classes only | Register is relative; sequences transpose | `VOCAB = 13` (12 PCs + REST) |
| Top voice = melody | Soprano / RH highest note | `extract_lead_pairs()` for classical sources |
| Bar-harmony context | Chord root + quality per step | 12-dim root + 6-dim quality one-hots |
| Phrase breathing | Rests between clauses | `REST = 12`, rest oversampling + `REST_CLASS_WEIGHT` |

---

## J.S. Bach

### Voice leading

Bach's chorales and keyboard works move the **highest sounding voice** in mostly
**stepwise** motion (seconds), with occasional thirds and rare leaps resolved by
contrary step. Inner voices fill harmony; the soprano carries the singable line.

**Training implication:** `extract_lead_pairs()` takes `voices_at_time()` highest
pitch per 16th step. JSB chorales + WTC preludes give dense (prev→next) transitions
with mean interval ≈ 1.5–2.5 semitones. Reward `W_INTERVAL` (target 2.75) and
`ANTI_REPEAT_WEIGHT` push the model toward stepwise continuation without stagnation.

### Sequence and motif

Bach develops tiny cells by **diatonic sequence** — repeat a motif at +2 or +4
steps, sometimes inverted. On our PC grid, a sequence looks like identical interval
patterns modulo 12 (e.g. 2,2,−1,2 → transposed +2: same pattern shifted).

**Training implication:** Register augmentation (`REGISTER_AUG_SHIFTS`) transposes
streams ±1..2 PCs so the GRU sees the same contour in multiple keys. Oversampling
classical ambient files increases exposure to sequential repetition.

### Cadential formulas

Chorales end phrases with **cadence formulas**: approach to scale degree 2–1 or
7–1, often with a resting tone on beat 1 or 3. In PC space: motion toward tonic (0)
or dominant (7) with a rest or longer note value after.

**Training implication:** Position embedding (`positions[i]` within 4/4 bar) lets the
model learn "beat 0 / beat 8" cadence targets. Reward pass should weight
`W_DIVERSITY` + `W_ENTROPY` for ambient so cadential arrivals don't collapse to
single-pitch loops.

### WTC vs chorales

- **Chorales (`jsb`):** Four-part, soprano ≈ hymn tune; ~400 files, already in v9.
- **WTC (`bach_wtc`):** 96 preludes+fugues; preludes have clearer RH melodies;
  fugues are denser — top-voice extraction still yields subject entries.
- **Mutopia Bach (`bach`):** Inventions, suites, partitas — monophonic or two-part
  textures ideal for lead extraction.

---

## Mozart

### Phrase structure

Mozart phrases are typically **8 bars** (antecedent) + **8 bars** (consequent),
often with **question–answer** contour: rise to dominant area, cadence, then
confirm tonic. Melodic rhythm alternates **step groups** and **small skips** (thirds).

**Training implication:** 16-beat (`max_beats = 16`) windows capture one antecedent
phrase. `mean_phrase_len` in `eval_generation.py` should rise for ambient if Mozart
data helps. Filter `MIN_ACTIVE_STEPS = 12` keeps only phrases with enough motion.

### Contrast and symmetry

Periods repeat with **one changed note** (sequence) or **dynamic echo**. Ornamentation
(trills, turns) appears as rapid neighbor-tone pairs on the grid — two 16ths on
adjacent PCs.

**Training implication:** Anti-boring filter `MAX_SAME_PITCH_STREAK = 8` rejects
ornament-degenerate streams. Model should learn neighbor alternation without
infinite same-pitch tremolo.

---

## Beethoven

### Motivic development

Beethoven compresses motifs into **rhythmic cells** (short–short–long) and
**develops** them through fragmentation and register leaps. Larger leaps (6th, octave)
appear at phrase boundaries.

**Training implication:** `large_leap_pct` in eval tracks intervals > 4 semitones.
Classical training raises ambient dataset leap rate; reward `W_INTERVAL` penalizes
mean interval < 1.0 (stasis) but not moderate leaps. Balance with `W_SCALE` for
diatonic adherence.

### Phrase extension

Late Beethoven extends phrases by **avoiding immediate cadence** — deceptive moves,
dominant prolongation. Surface: more steps before REST or tonic PC.

**Training implication:** Rest transitions are oversampled 3× — classical data with
lower rest ratio (ambient target 0.05 in `reward.py`) teaches denser lines when
genre=ambient.

---

## Chopin

### Ornamentation and rubato (discretized)

Chopin's melodies use **chromatic neighbors**, **appoggiaturas**, and **melismatic
passages**. On a fixed grid, these become rapid PC alternation and occasional
non-diatonic PCs.

**Training implication:** `scale_adherence_pct` in eval may dip vs Bach (more
chromaticism). Don't over-weight `W_SCALE` in reward pass for v10 — diversity and
interval rewards matter more for classical chromatic neighbors.

### Bel canto line

Right-hand cantabile over left-hand accompaniment — **top-voice extraction** is
correct. Accompaniment patterns should not pollute melody stream.

---

## Haydn, Schubert, Schumann (Mutopia `classical`)

- **Haydn:** Periodic phrases, witty cadential surprises — good for position-conditional
  cadence diversity.
- **Schubert:** Lyrical stepwise lines with long phrase breath — increases
  `mean_phrase_len` target.
- **Schumann:** Syncopated melody against steady bass — top-voice `syncopation_pct`
  may rise; reward `W_SYNCOPATION` (target 35%) applies.

---

## Actionable training checklist (v10)

1. **Sources:** `jsb` (400) + `bach_wtc` (~96) + `bach` Mutopia + `classical`
   Mutopia/classtab — all PD/CC-friendly.
2. **Extraction:** `LEAD_ONLY_SOURCES` → monophonic top voice only.
3. **Balance:** `balance_genres=True` caps per-genre pairs so classical enriches
   ambient without erasing pop/EDM.
4. **Supervised fine-tune:** 10–12 epochs from `melody-v9.pt`, lr `3e-4`.
5. **Reward pass:** Boost `diversity-weight` and `entropy-weight` for ambient
   melodic variety; interval reward favors stepwise + periodic leaps.
6. **Eval:** Compare v9 vs v10 on `ambient|generated` — target higher
   `unique_pitches`, `pitch_entropy`, `mean_interval` closer to dataset (~3.15),
   `scale_adherence_pct` in 75–95% band.

## Data sources (license)

| Key | Source | License |
|---|---|---|
| `jsb` | jsbchorales.net archive | Public domain (compositions) |
| `bach_wtc` | ksnortum/bach-well-tempered-1,2 releases | PD compositions (LilyPond) |
| `bach` | Mutopia `BachJS/` FTP | PD / CC (per-piece) |
| `classical` | Mutopia composer trees + classtab.org | PD / CC / personal use |

Do not redistribute downloaded MIDI; use for local training only.
