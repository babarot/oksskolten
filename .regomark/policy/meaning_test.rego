package adr_test

import rego.v1

# spec-detail and procedure: the questions

test_questions_for_accepted if {
	qs := questions_of([valid(1, "Accepted")])
	{[q.id, q.path, q.line] | some q in qs} == {
		["spec-detail", path_of(1), 25],
		["procedure", path_of(1), 25],
	}
}

test_questions_send_their_sections if {
	qs := questions_of([valid(1, "Accepted")])
	{[q.id, [b.line | some b in q.blocks]] | some q in qs} == {
		["spec-detail", [27]],
		["procedure", [27, 31]],
	}
}

test_questions_for_partly_replaced if {
	count(questions_of([valid(1, "Accepted\nPartly replaced by ADR-002"), valid(2, "Accepted")])) == 4
}

test_no_questions_unless_accepted if {
	docs := [valid(1, "Superseded by ADR-004"), valid(2, "Rejected"), valid(3, "Deprecated")]
	count(questions_of(docs)) == 0
}

test_no_question_without_the_section if {
	blocks := [b | some b in adr_blocks(1, "Accepted"); b.line < 25]
	count(questions_of([document(name_of(1), blocks, [])])) == 0
}

# spec-detail and procedure: the answers

test_yes_warns_at_the_evidence if {
	j := judgment("spec-detail", "ok", "yes", 27)
	warn_hits([valid(1, "Accepted")], [j]) == {["spec-detail", path_of(1), 27]}
	warn_messages([valid(1, "Accepted")], [j]) == {"It names the function."}
}

test_procedure_yes_warns if {
	j := judgment("procedure", "ok", "yes", 31)
	warn_hits([valid(1, "Accepted")], [j]) == {["procedure", path_of(1), 31]}
}

test_no_says_nothing if {
	count(warn_of([valid(1, "Accepted")], [judgment("spec-detail", "ok", "no", 0)])) == 0
}

test_not_run_says_nothing if {
	count(warn_of([valid(1, "Accepted")], [judgment("spec-detail", "not_run", "", 0)])) == 0
}

test_failure_warns_at_the_question if {
	j := object.union(judgment("procedure", "provider_failed", "", 0), {"error": "timed out"})
	warn_hits([valid(1, "Accepted")], [j]) == {["procedure", path_of(1), 25]}
	warn_messages([valid(1, "Accepted")], [j]) == {"the judge could not answer \"procedure\" (provider_failed): timed out"}
}

test_unknown_question_says_nothing if {
	count(warn_of([valid(1, "Accepted")], [judgment("other", "ok", "yes", 27)])) == 0
}

test_deny_ignores_judgments if {
	count(deny_with([valid(1, "Accepted")], [judgment("spec-detail", "ok", "yes", 27)])) == 0
}
