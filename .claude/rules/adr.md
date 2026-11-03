---
paths:
  - "docs/adr/**"
---

# Architecture Decision Records

An ADR records a decision that sets the direction of the code and constrains later changes: what was decided, why, and what was rejected and why. It is written so that a later change knows what it must keep. It is not a specification: how the code behaves today is in the code, its tests and its user-facing docs.

## When to write one

- Write an ADR for a decision that later changes must keep, and whose reasons someone changing it should weigh again: a boundary between parts, a guarantee others rely on, a safety measure, a format that is stored or shared, a name users see, or a road deliberately not taken.
- Write it in the commit that implements the decision, or the one before. Do not leave an ADR waiting for code that may come out another way.
- A choice whose reasons nobody would need to weigh again when changing it (how a function is split, which helper a loop uses) does not need an ADR. That a change can pass code review is not a reason to skip an ADR, nor permission to reverse one.

## Structure

```
# ADR-NNN: {Title}

## Status

Accepted | Rejected | Deprecated | Superseded by ADR-NNN

## Context
## Decision
## Consequences
```

- File name: `docs/adr/{NNN}-{kebab-case}.md`, numbered in order without gaps or reuse. The title states the decision, not the topic (`012-the-mouse-points-keys-act.md`, not `012-mouse.md`).
- The H1 starts with `ADR-NNN:`, and the number matches the file name.
- Required H2s: Status, Context, Decision, Consequences, in that order. Others are allowed (`## Alternatives`, `## Not decided here`, `## History`).
- Status is one of:
  - `Accepted`: in force.
  - `Rejected`: a proposal decided against, kept so that it is not proposed again without its reasons. It has the same sections: Decision says what was proposed and why it was not adopted; Consequences says what not adopting it leaves on later work.
  - `Deprecated`: no longer in force, and nothing replaces it (the feature is gone).
  - `Superseded by ADR-NNN`: replaced whole by a later ADR.
- The first paragraph under Status holds only the status value and, when part of the decision was replaced, `Partly replaced by ADR-NNN` lines. References are read from this paragraph only; a trailing period is optional.
- Later paragraphs under Status may explain the status: why an ADR was rejected, deprecated or superseded. Do not write `Superseded by` or `Partly replaced by` anywhere else under Status.
- Write in English.

## What goes in each part

- Context: the problem and the forces at play, as they were when the decision was made. Facts measured or found belong here, briefly.
- Decision: the rules the code follows from now on, stated as rules. Say what was rejected and why, here or in `## Alternatives`; an ADR without its rejected options cannot stop a later change from taking one of them.
- Consequences: the costs and the constraints the decision leaves on later work ("a new setting must be registered in both places"). Not a list of what was implemented, and not a rollout plan.
- When you name code that enforces or defines a decision (the test that guards a guarantee, a package boundary, an API or a type that is itself the decision), write it as a relative link to the file or directory in the repository, so that the ADR and the code are tied where it matters. Do not name functions or types only to walk through how the code works. The link check proves only that the target exists, not that the test or the guarantee does.
- `## Not decided here` names questions the ADR leaves open on purpose, so that silence is not read as a decision.

## What an ADR leaves out

Ask of each sentence: is this a constraint later changes must keep, or a description of how the code happens to do it today? Keep the first, leave out the second. Details that change with the code drift from it, and an ADR that disagrees with the code misleads more than no ADR.

- Write a detail when it is the decision itself: a guarantee others rely on, a safety measure (the flags a subprocess runs with, an order of checks), a name users see in a config file, a command or an API, or an alternative that was rejected. This takes precedence over every item below: a value others rely on (a security bound, a retention limit users are promised, a version of a stored format) or a behavior that is the guarantee (no write without a confirm) stays, even though it is a constant or a screen behavior.
- Leave out how a screen behaves: which click or key does what, layouts, widths, the order of items, the text and format of what is shown. Write the rule the behavior follows ("the mouse does not write to GitHub"), not the behavior ("a double click opens a row").
- Leave out the values of constants: sizes, thresholds, intervals, timeouts, batch sizes, TTLs. Say that a value is a constant, and why it is not a setting, without giving it.
- Leave out walkthroughs of the mechanism: step-by-step flows, struct fields, function names along a call path, code snippets, SQL, config file examples. Name the package or the document that holds them instead.
- Do not copy a list that another place keeps (a package table enforced by a test, the settings, the default keys, environment variables, log attribute names). Name the place.
- Do not keep a catalog that grows with each feature, such as every setting, every supported value or every menu item.
- Leave out migration steps, benchmarks of the day and to-do lists. A measurement that decided the question may stay in Context, briefly.

## Changing a decision

- To change a decision, write a new ADR. Do not rewrite the decision of an accepted ADR, and do not record a later decision in its `## History`; History is only for how the decision was reached.
- When the new ADR replaces the old decision whole, set the old Status to `Superseded by ADR-NNN`.
- When it replaces only part, the new ADR names the sentences it replaces, and the old ADR stays `Accepted` with a `Partly replaced by ADR-NNN` line in the first paragraph of its Status. A reader of the old ADR must be able to tell which parts no longer hold.
- Removing a detail that "What an ADR leaves out" excludes is not a change of decision: edit the ADR in place, without a new one. A mismatch between an ADR and the code over such a detail is a sign that the detail should go. This holds only for details that are not themselves a guarantee, a constraint or a reason; removing or weakening one of those is a change of decision and needs a new ADR, even when it is written as a value or a screen behavior.
- A mismatch over the decision itself is not fixed by editing the old ADR to match the code: either the code is wrong, or the decision changed and needs a new ADR.
