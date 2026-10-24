---
name: bug-hunt
description: "Hunt the project, or the area the user names, for bugs nobody has reported, prove each with a red reproduction, fix the easy ones in one draft pull request, and file the rest as issues."
disable-model-invocation: true
---

# Bug hunt

Most bugs wait until a user trips on them. A hunt goes looking first: it reads the code as a skeptic, keeps only the bugs it can make go **red**, and leaves each one where a human can act on it at a glance: fixed in a draft pull request with green checks, or an issue an agent could pick up. Run to the end on your own; anything for the human goes in the report.

Write the report in the user's active language, and pull requests and issues in the project's.

## 1. Scope

Hunt the area the user names; otherwise, the whole project. Split a scope larger than one reader can hold into **lanes** along owner boundaries, each read by a fresh read-only agent, and point each lane first at its strongest signals: suspected bugs `garden` filed, churn hot spots in history, fixes that came back, code merged without tests, skipped or intermittent tests, `TODO` and `FIXME` notes, and errors the project's logs expose. Every issue and pull request a hunt opens carries the `bug-hunt` label, created when the project lacks it, so earlier hunts show where they looked. State the scope and its lanes, and pin the revision.

## 2. Hunt

Read the code in scope, its callers, its tests, and its history; use `why` when defensive code or a strange shape needs its reason. Ask what breaks it: which inputs, states, orderings, retries, and failures; which errors are swallowed; what the code assumes and never checks; where a test asserts less than its name claims. Where state interacts, enumerate the **state space** as `strategic-programming` defines it.

Record each **suspect** in a queue with the observed evidence, and change nothing yet.

Done when every file in scope has been read and every suspect has an evidence line.

## 3. Confirm

Turn each suspect into a reproduction at the narrowest faithful boundary: a test, or the real product driven through the project's verification method. It counts only when it goes red for the right reason, the bug and not the setup, and goes red again on a second run when time, concurrency, or external state is involved. Reproduce by driving inputs; state inspection may confirm a symptom but never inject it. When the mechanism stays uncertain, diagnose it under `diagnosing-bugs`.

A suspect without a red reproduction is dropped and reported with what was tried. When the code's own contract (its spec, tests, documentation, types, or an ADR) cannot say whether the behavior is wrong, it is a question for the human, not a bug.

Group the confirmed bugs by cause: one cause becomes one set of commits or one issue, however many symptoms it has.

Done when every suspect is red or dropped, and every red one belongs to a cause.

## 4. Sort

Check every cause against what already exists, searching open and closed issues and pull requests by symptom, area, and error signature:

- An open pull request or a person's claim already covers the cause: comment the reproduction where it lacks one, and leave the fix to them.
- An open issue nobody has claimed covers the cause: treat the cause as new; when it turns out easy, the pull request fixes and closes that issue.
- A closed issue or a merged fix for the same symptom is a regression lead: treat the cause as new and link it.

A remaining cause is **easy** when all of these hold:

- its cause lives in one owner;
- the correct behavior follows from the code's own contract, not from a product decision;
- the fix opens no one-way door as `architect` defines it;
- the reproduction can stay as a maintained regression test.

Fix every easy cause unless the user sets a limit; file the rest.

Done when every cause is covered, easy, or to be filed.

## 5. Fix

Fix every easy cause on one branch off the base, in one draft pull request, each cause in its own commits:

1. For each cause, commit the red reproduction as a regression test on its own, before the fix, the way `deliver` commits its acceptance tests. Then repair the cause at its owner under `strategic-programming`, including the instances of the same cause the hunt found.
2. Run the project's full gates on the branch once every cause is in.
3. Run `refine` in a fresh context with the diff and the reproductions.
4. Run `ship`, opening the pull request as a draft. For each cause, its description carries the reproduction, the root cause, the test's red-then-green output, and a closing keyword for any issue it fixes.

When a fix stops being easy partway through, because it reaches another owner, meets a one-way door, or breaks a test that encodes behavior someone relies on, drop that cause's commits and file it with what the attempt taught.

## 6. File

File each remaining cause as one issue with the project's bug label, written so an agent could pick it up without asking:

- **Title:** the area and the symptom; a guessed cause stays out of it.
- **Current and expected behavior**, and where the expected one comes from.
- **Reproduction:** the test or the steps, with their red output.
- **Cause:** the mechanism when diagnosed; otherwise hypotheses, labeled as hypotheses.
- **Code:** permalinks pinned to the hunted revision.
- **Acceptance criteria** a reviewer can check, and what is **out of scope**.
- **Why not fixed here:** the easy condition it failed, or the user's limit.

## Report

End with:

- the scope, its lanes, and the revision hunted;
- the draft pull request, its check state, and each cause it fixes;
- each issue filed or commented on;
- suspects dropped, and why;
- questions about intended behavior, each with the behavior in plain words and a recommendation;
- what was not read or run, and why.

A hunt that confirms nothing is a result: report where it looked.

## Boundaries

- The pull request stays a draft. Marking it ready and merging it, which closes the issues it fixes, belong to the human.
- Behavior-preserving cleanup the hunt notices belongs to `garden`; name it in the report.

## Done

Every suspect is confirmed red or dropped with a reason, every confirmed cause sits in exactly one place: the draft pull request with green checks, one issue, or one comment on an existing issue or pull request, and the report is delivered.
