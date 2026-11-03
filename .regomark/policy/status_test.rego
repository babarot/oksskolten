package adr_test

import rego.v1

# ADR005

test_adr005_status_paragraph if {
	not "ADR005" in rules_of([valid(1, "Accepted")])
}

test_adr005_empty_status if {
	blocks := [b | some i, b in adr_blocks(1, "Accepted"); i != 2]
	hits([document(name_of(1), blocks, [])]) == {["ADR005", path_of(1), 3]}
}

test_adr005_status_in_a_list if {
	blocks := [heading(1, 1, "ADR-001: Title"), heading(3, 2, "Status"), block("list", 5, "Accepted")]
	doc := document(name_of(1), array.concat(blocks, array.slice(adr_blocks(1, "Accepted"), 3, 9)), [])
	hits([doc]) == {["ADR005", path_of(1), 3]}
}

# ADR006

test_adr006_allowed if {
	docs := [
		valid(1, "Superseded by ADR-002"),
		valid(2, "Superseded by ADR-003."),
		valid(3, "Accepted"),
		valid(4, "Rejected"),
		valid(5, "Deprecated"),
	]
	not "ADR006" in rules_of(docs)
}

test_adr006_proposed if {
	hits([valid(1, "Proposed")]) == {["ADR006", path_of(1), 5]}
	messages_of([valid(1, "Proposed")], "ADR006") == {
		"Status \"Proposed\" must be Accepted, Rejected, Deprecated or \"Superseded by ADR-NNN\"",
	}
}

test_adr006_other_values if {
	other := [
		"Accepted.",
		"accepted",
		"Superseded by ADR-2",
		"Superseded by ADR-002 and ADR-003",
		"Replaced by ADR-002",
	]
	every status in other {
		["ADR006", path_of(1), 5] in hits([valid(1, status), valid(2, "Accepted"), valid(3, "Accepted")])
	}
}

# ADR007

test_adr007_partly_replaced if {
	docs := [
		valid(1, "Accepted\nPartly replaced by ADR-002.\nPartly replaced by ADR-003"),
		valid(2, "Accepted"),
		valid(3, "Accepted"),
	]
	count(deny_of(docs)) == 0
}

test_adr007_other_line if {
	docs := [valid(1, "Accepted\nPartly replaced by ADR-002.\nIt was narrowed."), valid(2, "Accepted")]
	hits(docs) == {["ADR007", path_of(1), 7]}
	messages_of(docs, "ADR007") == {
		"only \"Partly replaced by ADR-NNN\" lines may follow the status in its paragraph, found \"It was narrowed.\"",
	}
}

# ADR008

# The status explained in later paragraphs, as drop 003 does.
test_adr008_explanation_after_the_first_paragraph if {
	doc := with_status_blocks(1, "Deprecated", [
		block("paragraph", 7, "The feature was removed."),
		block("paragraph", 9, "Nothing replaces it."),
	])
	count(deny_of([doc])) == 0
}

test_adr008_reference_in_a_later_paragraph if {
	doc := with_status_blocks(1, "Accepted", [
		block("paragraph", 7, "It was narrowed.\nPartly replaced by ADR-002."),
	])
	hits([doc, valid(2, "Accepted")]) == {["ADR008", path_of(1), 8]}
}

test_adr008_reference_in_a_list if {
	doc := with_status_blocks(1, "Accepted", [
		block("list", 7, "first\nSuperseded by ADR-002"),
	])
	hits([doc, valid(2, "Accepted")]) == {["ADR008", path_of(1), 8]}
}

test_adr008_reference_in_code if {
	doc := with_status_blocks(1, "Accepted", [
		block("code", 7, "Superseded by ADR-002\n"),
	])
	hits([doc, valid(2, "Accepted")]) == {["ADR008", path_of(1), 7]}
}

# A reference in a later paragraph is not read: it is reported, and
# not checked as a reference.
test_adr008_reference_not_read if {
	doc := with_status_blocks(1, "Accepted", [block("paragraph", 7, "Superseded by ADR-009")])
	hits([doc]) == {["ADR008", path_of(1), 7]}
}

test_adr008_reference_under_another_section if {
	doc := valid(1, "Accepted")
	blocks := array.concat(doc.blocks, [
		heading(40, 2, "History"),
		block("paragraph", 42, "Superseded by ADR-002 was considered."),
	])
	not "ADR008" in rules_of([document(name_of(1), blocks, []), valid(2, "Accepted")])
}
