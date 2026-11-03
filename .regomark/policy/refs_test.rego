package adr_test

import rego.v1

# reference-target

test_adr009_target_exists if {
	not "reference-target" in rules_of([valid(1, "Superseded by ADR-002."), valid(2, "Accepted")])
}

test_adr009_target_missing if {
	docs := [valid(1, "Superseded by ADR-003"), valid(2, "Accepted\nPartly replaced by ADR-004.")]
	hits(docs) == {["reference-target", path_of(1), 5], ["reference-target", path_of(2), 6]}
	messages_of(docs, "reference-target") == {
		"Superseded by ADR-003, which does not exist",
		"Partly replaced by ADR-004, which does not exist",
	}
}

# reference-direction

test_adr010_later_target if {
	not "reference-direction" in rules_of([valid(1, "Accepted\nPartly replaced by ADR-002"), valid(2, "Accepted")])
}

test_adr010_earlier_target if {
	docs := [valid(1, "Accepted"), valid(2, "Accepted\nPartly replaced by ADR-001.")]
	hits(docs) == {["reference-direction", path_of(2), 6]}
	messages_of(docs, "reference-direction") == {"Partly replaced by ADR-001 must point to a later ADR"}
}

test_adr010_self if {
	"reference-direction" in rules_of([valid(1, "Superseded by ADR-001")])
}

# duplicate-number

test_adr011_duplicate_numbers if {
	docs := [
		valid(1, "Superseded by ADR-002"),
		valid(2, "Accepted"),
		document("002-other.md", adr_blocks(2, "Accepted"), []),
	]
	hits(docs) == {["duplicate-number", path_of(2), 1], ["duplicate-number", "docs/adr/002-other.md", 1]}
	messages_of(docs, "duplicate-number") == {"ADR number 002 is used by more than one file"}
}

# number-sequence

test_adr012_no_gaps if {
	not "number-sequence" in rules_of([valid(1, "Accepted"), valid(2, "Accepted")])
}

test_adr012_gap_reported_on_the_next_file if {
	docs := [valid(1, "Accepted"), valid(4, "Accepted"), valid(5, "Accepted")]
	hits(docs) == {["number-sequence", path_of(4), 1]}
	messages_of(docs, "number-sequence") == {
		"ADR number 002 is missing; numbers run from 001 without gaps",
		"ADR number 003 is missing; numbers run from 001 without gaps",
	}
}

test_adr012_not_from_001 if {
	hits([valid(2, "Accepted")]) == {["number-sequence", path_of(2), 1]}
}

# replacement-cycle

test_adr013_chain if {
	docs := [valid(1, "Superseded by ADR-002"), valid(2, "Superseded by ADR-003"), valid(3, "Accepted")]
	count(deny_of(docs)) == 0
}

test_adr013_cycle if {
	docs := [valid(1, "Superseded by ADR-002"), valid(2, "Superseded by ADR-001")]
	h := hits(docs)
	["replacement-cycle", path_of(1), 5] in h
	["replacement-cycle", path_of(2), 5] in h
}

test_adr013_self if {
	["replacement-cycle", path_of(1), 5] in hits([valid(1, "Superseded by ADR-001")])
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
	["replacement-cycle", path_of(2), 5] in h
	not ["replacement-cycle", path_of(1), 5] in h
	not ["replacement-cycle", other, 5] in h
	["duplicate-number", other, 1] in h
}

test_adr012_zero if {
	docs := [document("000-zero.md", adr_blocks(0, "Accepted"), []), valid(1, "Accepted")]
	hits(docs) == {["number-sequence", "docs/adr/000-zero.md", 1]}
	messages_of(docs, "number-sequence") == {"ADR number 000 is not used; numbers run from 001"}
}

test_adr012_zero_alone if {
	hits([document("000-zero.md", adr_blocks(0, "Accepted"), [])]) == {["number-sequence", "docs/adr/000-zero.md", 1]}
}

# A cycle closed by a Partly replaced line is reported on that line, not on
# the status.
test_adr013_reported_on_the_reference if {
	docs := [valid(1, "Accepted\nPartly replaced by ADR-002"), valid(2, "Accepted\nPartly replaced by ADR-001.")]
	h := {x | some x in hits(docs); x[0] == "replacement-cycle"}
	h == {["replacement-cycle", path_of(1), 6], ["replacement-cycle", path_of(2), 6]}
}
