---
name: leaving-it-cleaner
description: Prompts incremental code hygiene improvements whenever touching a file. Use during any edit, bugfix, or feature work — leave the campground cleaner than before.
id: 091c24672a97b057
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - conventions
  - typescript
  - javascript
  - refactoring
  - javascript
---

# When To Use

During any edit, bugfix, or feature work. User mentions code cleanup, hygiene, leaving code better, or boy scout rule.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Scan Surrounding Area

When modifying a file, scan same function, class, or 20 surrounding lines for cleanup opportunities.

## 2. Apply Low-Friction Fixes

### 2.1 Naming

Rename unclear variables, functions, or types. Name should reveal intent without a comment.

### 2.2 Dead Code

Remove commented-out blocks, unused imports, unreachable branches, orphaned exports.

### 2.3 Formatting

Fix inconsistent indentation, stray whitespace, missing line breaks. Do not run full formatter on unrelated files.

### 2.4 Extraction

Extract 3-5 line blocks doing one thing into a well-named helper.

### 2.5 Type Safety

Add missing types where they catch bugs. Replace `any` with proper type.

## 3. Respect Time Budget

Spend no more than 30 seconds per cleanup. If more involved, leave `TODO` comment and move on. Goal is marginal improvement, not full rewrites.

# Reference

