---
name: simplifying-code
description: Audits code for over-engineering, unnecessary abstraction, and complexity. Suggests simpler alternatives. Use when a solution feels bloated or during code review.
id: 0c5e2d8cbfef3a65
author: Daniel Montilla
version: 1.1.0
license: MIT
groups:
  - conventions
  - typescript
  - javascript
  - refactoring
dependencies:
  - executing-skills
---

# When To Use

Code feels too complex, over-engineered, or hard to follow. User mentions bloat, unnecessary abstraction, over-engineering, or "this feels too complicated." Use during code review or before merging PRs.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Scan for Complexity Signals

Check for these patterns:

- **Deep nesting**: Conditionals 3+ levels deep (`if` inside `if` inside `if`)
- **Long functions**: Functions over 30 lines doing multiple things
- **Too many responsibilities**: Classes or modules handling 5+ distinct concerns
- **Clever code**: One-liners sacrificing readability for conciseness
- **Over-abstraction**: Factories for a single use case, custom caching layers wrapping standard libraries, unnecessary interfaces

## 2. Simplify Each Signal

### Deep Nesting

Replace with early returns, guard clauses, or extract conditional logic into helper functions.

### Long Functions

Split by extracting logical groups into well-named helpers. Each function should do one thing.

### Too Many Responsibilities

Split into smaller classes or modules. Apply Single Responsibility Principle.

### Clever Code

Prefer explicit readability over cleverness. Break complex expressions into named intermediate variables.

### Over-abstraction

Remove abstractions wrapping a single concrete call. Replace with direct calls. Prefer flat functions over class hierarchies.

## 3. Readability Check

Would a junior developer understand this without explanation? If not, simplify further. Use descriptive names, not comments, to explain intent.

## 4. Verify Behavior

Run the test suite to confirm behavior is preserved after changes.

# Reference

- **Authoring standard**: [authoring-skills](../../authoring-skills/SKILL.md)
