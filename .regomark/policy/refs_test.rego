package adr_test

import rego.v1

# ADR009

test_adr009_target_exists if {
	not "ADR009" in rules_of([valid(1, "Superseded by ADR-002."), valid(2, "Accepted")])
}

test_adr009_target_missing if {
	docs := [valid(1, "Superseded by ADR-003"), valid(2, "Accepted\nPartly replaced by ADR-004.")]
	hits(docs) == {["ADR009", path_of(1), 5], ["ADR009", path_of(2), 6]}
	messages_of(docs, "ADR009") == {
		"Superseded by ADR-003, which does not exist",
		"Partly replaced by ADR-004, which does not exist",
	}
}

# ADR010

test_adr010_later_target if {
	not "ADR010" in rules_of([valid(1, "Accepted\nPartly replaced by ADR-002"), valid(2, "Accepted")])
}

test_adr010_earlier_target if {
	docs := [valid(1, "Accepted"), valid(2, "Accepted\nPartly replaced by ADR-001.")]
	hits(docs) == {["ADR010", path_of(2), 6]}
	messages_of(docs, "ADR010") == {"Partly replaced by ADR-001 must point to a later ADR"}
}

test_adr010_self if {
	"ADR010" in rules_of([valid(1, "Superseded by ADR-001")])
}

# ADR011

test_adr011_duplicate_numbers if {
	docs := [
		valid(1, "Superseded by ADR-002"),
		valid(2, "Accepted"),
		document("002-other.md", adr_blocks(2, "Accepted"), []),
	]
	hits(docs) == {["ADR011", path_of(2), 1], ["ADR011", "docs/adr/002-other.md", 1]}
	messages_of(docs, "ADR011") == {"ADR number 002 is used by more than one file"}
}

# ADR012

test_adr012_no_gaps if {
	not "ADR012" in rules_of([valid(1, "Accepted"), valid(2, "Accepted")])
}

test_adr012_gap_reported_on_the_next_file if {
	docs := [valid(1, "Accepted"), valid(4, "Accepted"), valid(5, "Accepted")]
	hits(docs) == {["ADR012", path_of(4), 1]}
	messages_of(docs, "ADR012") == {
		"ADR number 002 is missing; numbers run from 001 without gaps",
		"ADR number 003 is missing; numbers run from 001 without gaps",
	}
}

test_adr012_not_from_001 if {
	hits([valid(2, "Accepted")]) == {["ADR012", path_of(2), 1]}
}

# ADR013

test_adr013_chain if {
	docs := [valid(1, "Superseded by ADR-002"), valid(2, "Superseded by ADR-003"), valid(3, "Accepted")]
	count(deny_of(docs)) == 0
}

test_adr013_cycle if {
	docs := [valid(1, "Superseded by ADR-002"), valid(2, "Superseded by ADR-001")]
	h := hits(docs)
	["ADR013", path_of(1), 5] in h
	["ADR013", path_of(2), 5] in h
}

test_adr013_self if {
	["ADR013", path_of(1), 5] in hits([valid(1, "Superseded by ADR-001")])
}

# Two files numbered 002, one of which points at 002: the graph is keyed by
# path, so evaluating it does not conflict, and only the file that
# reaches itself is in a cycle.
test_adr013_duplicate_numbers if {
	other := "docs/adr/002-other.md"
	docs := [
		valid(1, "Superseded by ADR-002"),
		valid(2, "Superseded by ADR-002"),
		document("002-other.md", adr_blocks(2, "Accepted"), []),
	]
	h := hits(docs)
	["ADR013", path_of(2), 5] in h
	not ["ADR013", path_of(1), 5] in h
	not ["ADR013", other, 5] in h
	["ADR011", other, 1] in h
}

test_adr012_zero if {
	docs := [document("000-zero.md", adr_blocks(0, "Accepted"), []), valid(1, "Accepted")]
	hits(docs) == {["ADR012", "docs/adr/000-zero.md", 1]}
	messages_of(docs, "ADR012") == {"ADR number 000 is not used; numbers run from 001"}
}

test_adr012_zero_alone if {
	hits([document("000-zero.md", adr_blocks(0, "Accepted"), [])]) == {["ADR012", "docs/adr/000-zero.md", 1]}
}

# A cycle closed by a Partly replaced line is reported on that line, not on
# the status.
test_adr013_reported_on_the_reference if {
	docs := [valid(1, "Accepted\nPartly replaced by ADR-002"), valid(2, "Accepted\nPartly replaced by ADR-001.")]
	h := {x | some x in hits(docs); x[0] == "ADR013"}
	h == {["ADR013", path_of(1), 6], ["ADR013", path_of(2), 6]}
}
