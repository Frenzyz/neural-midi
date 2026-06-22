# Agent Context Framework

This repository uses AGENTS.md files to give AI coding agents structured context at each directory level.

## How It Works

AGENTS.md files form a hierarchy:

- **Root AGENTS.md** — Project overview, tech stack, top-level structure, conventions
- **L1 (top directories)** — Purpose of the directory and relationships between children
- **L2 (subsystems)** — Framework details, key abstractions, patterns, gotchas

Each level adds context for its scope only. Child files do not repeat parent content.

## For Agents

When working in a directory, read the nearest AGENTS.md for local context. For broader context, read parent AGENTS.md files up to the root.

## Maintaining AGENTS.md Files

Update AGENTS.md when:

- Directory structure changes (new directories, moved files)
- New key abstractions are introduced
- Conventions or patterns change
- Dependencies or tech stack change

Keep each file under 80 lines. Focus on what agents need to work correctly, not comprehensive documentation.

## File Locations

- `AGENTS.md` — Root project context
- `src/AGENTS.md` — Extension source layout
- `src/ml/AGENTS.md` — ML inference subsystem
- `src/ui/AGENTS.md` — Modal UI subsystem
- `training/AGENTS.md` — Python training pipeline
- `scripts/AGENTS.md` — Build and dev scripts
