---
name: scoping-features
description: Provides a scope-only critique against stated requirements, flags speculative additions, and helps prune unnecessary complexity. Use when the user asks for scope review; it is not a feature-workflow router or automatic Leji workflow stage.
license: MIT
---

# Scoping Features

This skill gives a scope-only critique when requested. It does not author or execute a feature plan and does not replace [Feature-Workflow](../../../docs/practice/Feature-Workflow.md); for `docs/work/` tasks, keep that workflow's roles, artifacts, and gates in force.

## Instructions

1. **Identify the current requirement**: What specific problem is being solved right now? Write it down in one sentence.

2. **Flag speculative additions**: Scan the plan or code for:
   - "Just in case" logic (caching layers, fallback strategies, config knobs for unrequested features)
   - Generalized abstractions that serve only one current use case
   - Placeholder systems for hypothetical future scale

3. **Prune aggressively**: Remove or comment out anything not required by the current requirement. Prefer inline code over abstracted infrastructure.

4. **Leave the door open**: Keep code modular — use simple functions, not complex frameworks. Write so that adding the future feature later is easy, but don't build it now.

5. **Verify**: After pruning, confirm all current-requirement behavior still works. No tests should break.
