# Questions about what an Accepted ADR says, for a judge such as an LLM, and
# the warnings their answers give. Only warn reads input.judgments: an answer
# from a judge is not the same on every run, so it never fails a check. The
# questions are asked only when the user turns judging on (regomark check
# --judge, or REGOMARK_JUDGE=on); otherwise every judgment is not_run and
# nothing here reports.
package adr

import rego.v1

import data.adrlib

# What each question asks and about which sections. Its id is also the rule
# its answers report under. The asks follow "What an ADR leaves out" in
# .claude/rules/adr.md.
meaning := {
	"spec-detail": {
		"sections": ["Decision"],
		"ask": concat(" ", [
			"Does this part of an architecture decision record describe how the code works today",
			"instead of stating a decision, by giving details that change with the code:",
			"how a screen behaves (which key or click does what, layouts, the text shown),",
			"the values of constants, a walkthrough of the mechanism (function names along a call path,",
			"struct fields, code, SQL or config snippets), or a copy of a list that another place keeps?",
			"Answer no when such a detail is itself the decision: a guarantee others rely on,",
			"a safety measure, a name users see, or an alternative that was rejected.",
		]),
	},
	"procedure": {
		"sections": ["Decision", "Consequences"],
		"ask": concat(" ", [
			"Does this part of an architecture decision record hold a procedure instead of a decision",
			"and its consequences: migration or rollout steps, the order in which to do the work,",
			"or a to-do list?",
		]),
	},
}

questions contains {"id": id, "path": doc.path, "line": line, "blocks": blocks, "ask": q.ask} if {
	some doc in input.documents
	adrlib.accepted(doc)
	some id, q in meaning
	line := section_line(doc, q.sections[0])
	blocks := [b | some name in q.sections; some b in adrlib.section(doc, name)]
	count(blocks) > 0
}

# The line of the H2 named name.
section_line(doc, name) := min({h.line | some h in adrlib.headings(doc, 2); h.text == name})

warn contains {"rule": j.id, "path": j.path, "line": j.evidence_line, "message": j.reason} if {
	some j in input.judgments
	meaning[j.id]
	j.status == "ok"
	j.verdict == "yes"
}

# A question that was asked but not answered says so, rather than passing as
# if the ADR were fine. A question not asked at all (not_run) says nothing.
warn contains {"rule": j.id, "path": j.path, "line": j.line, "message": msg} if {
	some j in input.judgments
	meaning[j.id]
	j.status in {"provider_failed", "invalid_answer"}
	msg := sprintf("the judge could not answer %q (%s): %s", [j.id, j.status, j.error])
}
