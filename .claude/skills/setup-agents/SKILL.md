---
name: setup-agents
description: Creates a minimal AGENTS.md for a project — package manager, languages, commands, verification rules, skills location. Use when a project has no AGENTS.md or its AGENTS.md is bloated and needs trimming to essentials.
id: bd1ca8a4580cf219
author: Daniel Montilla
version: 1.0.0
license: MIT
dependencies:
  - executing-skills
  - caveman-compression
groups:
  - scaffolding
---

# When To Use

Use when setting up a new project's AGENTS.md or replacing an oversized one. AGENTS.md answers only what every agent session needs — never an index, never prose.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Detect Facts

Answer the template sections by inspecting the repo — ask the user only what can't be detected:

- [ ] **Languages** — extensions, config files (`tsconfig.json`, `Cargo.toml`, …)
- [ ] **Package manager** — lockfile or `packageManager` field
- [ ] **Commands** — build/test/lint/typecheck scripts
- [ ] **Verification** — script runner + scoping mechanism (filters, `--cwd`, file args)
- [ ] **Skills location** — default `.agents/skills/`

## 2. Compress

Apply [caveman-compression](../caveman-compression/SKILL.md) to every fact. One line per fact. No sentences where fragments work. No headers beyond the template's.

## 3. Write AGENTS.md

Fill [templates/AGENTS.md](templates/AGENTS.md). Drop sections with no answer. Keep `## Skills` and `## Verification` always.

If an existing AGENTS.md has entries not matching any template section — **delete**. Entry points, indexes, pointers to depth, conventions essays: agents discover these by scanning.

## 4. Verify

- [ ] Every line answers a question an agent would otherwise ask
- [ ] No index of skills, docs, or entry points
- [ ] Every section ≤ 3 lines
- [ ] Reads complete in under 10 seconds

# Reference

- **Template**: [templates/AGENTS.md](templates/AGENTS.md) (MUST READ)
- **Compression rules**: [caveman-compression](../caveman-compression/SKILL.md) §2–3 (MUST READ)
