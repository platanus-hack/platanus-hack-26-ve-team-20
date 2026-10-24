# Logic mode

Make a logic, state, data-shape, API, or CLI behavior question tangible as one **shareable demo**: a single self-contained HTML file that anyone can open by double-click and drive by pressing buttons. Use it when a model looks reasonable on paper and only feels wrong once real cases push through it. The audience includes non-developers, so the demo speaks the domain's language, not the code's.

## Process

1. **State the question.** Write the model under test, the one question the demo must answer, a time, cost, or scope bound, and the discovery location where the file will live, clearly named as a prototype. Put the question at the top of the demo as visible text, so anyone returning to it later can check the answer against it.
2. **Ground the model.** Inspect the current code, data shape, domain vocabulary, and real examples that apply. Use real or representative cases, including the awkward ones.
3. **Isolate the logic in one module.** Write the part that answers the question as one `<script>` block with no DOM access: a reducer `(state, action) => state` for discrete events, a state machine when which actions are legal is part of the question, pure functions over a plain data type when there is no current state, or a small module with a clear method surface when the logic owns ongoing state. Pick the shape the question needs. The page calls into the module; the module never reaches into the page.
4. **Build the page as a thin shell.** Plain inline HTML, CSS, and JavaScript with in-memory state, so the file survives being emailed and runs with nothing installed. Label everything in domain language. Lay it out top to bottom:
   1. a title and the question;
   2. the **current state** as readable labeled fields, re-rendered after every action, with what just changed called out;
   3. **free-play buttons**, one per action, always available;
   4. **guided walkthroughs**, one tab per scenario: a plain-language description of the situation and what to watch for, then the ordered steps as real buttons. Starting a walkthrough resets to a known initial state. Cover the happy path, a tricky edge case, and an attempt at something that should be illegal.

   Keep the styling restrained: clean typography, generous spacing, one accent color.
5. **Run it yourself.** Open the file in a browser, play every walkthrough, and fix anything broken or unclear before handing it over.
6. **Hand it over.** Give the file to the people who have the problem, or to the human as their proxy. The valuable moments are "wait, that shouldn't be possible" and "I assumed X would be different": those are bugs in the idea. Add actions or scenarios they ask for; the demo evolves until the question is answered or the bound runs out.
7. **Close.** Record the question, the answer, who drove the demo, and what surprised them. Keep the file as the reference for the validated model in the declared discovery location, and stop without implementing the production solution.

## Boundaries

- One direction by default. Build alternative models only when the shape of the model itself is the open question, such as competing CLI grammars or state layouts.
- Persistence stays in memory unless persistence is the question; then use a scratch store named as a prototype.
- The validated model is a reference for implementation, not production code. The [production boundary](../SKILL.md#production-boundary) applies to the module as much as the page.

## Completion criteria

- The demo states one question and answers it through walkthroughs covering the happy path, an edge case, and an illegal attempt.
- It opens by double-click, runs without errors, and uses domain language throughout.
- Someone who has the problem, or the human as proxy, drove it; the answer and surprises are recorded.
- The file is retained as the model reference in a declared discovery location, and no production implementation began.
