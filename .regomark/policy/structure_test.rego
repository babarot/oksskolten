package adr_test

import rego.v1

import data.adr

test_schema if {
	adr.schema_version == 1
	adr.rule_ids == {sprintf("ADR%03d", [n]) | some n in numbers.range(1, 14)}
}

test_clean_set if {
	count(deny_of([
		valid(1, "Superseded by ADR-002"),
		valid(2, "Accepted\nPartly replaced by ADR-003."),
		valid(3, "Rejected"),
		valid(4, "Deprecated"),
	])) == 0
}

# ADR001

test_adr001_kebab_case if {
	not "ADR001" in rules_of([valid(1, "Accepted")])
	not "ADR001" in rules_of([document("001-a-b-2.md", adr_blocks(1, "Accepted"), [])])
}

test_adr001_bad_names if {
	bad := ["1-title.md", "001_title.md", "001-Title.md", "001-title-.md", "001-title.markdown", "0001-title.md"]
	every name in bad {
		["ADR001", $"docs/adr/{name}", 1] in hits([document(name, adr_blocks(1, "Accepted"), [])])
	}
}

# ADR002

test_adr002_one_matching_h1 if {
	not "ADR002" in rules_of([valid(1, "Accepted")])
}

test_adr002_no_h1 if {
	blocks := array.slice(adr_blocks(1, "Accepted"), 1, 9)
	h := hits([document(name_of(1), blocks, [])])
	["ADR002", path_of(1), 1] in h
	messages_of([document(name_of(1), blocks, [])], "ADR002") == {"an ADR has exactly one H1, found 0"}
}

test_adr002_two_h1 if {
	doc := document(name_of(1), array.concat(adr_blocks(1, "Accepted"), [heading(40, 1, "ADR-001: Again")]), [])
	messages_of([doc], "ADR002") == {"an ADR has exactly one H1, found 2"}
}

with_h1(n, text) := document(name_of(n), blocks, []) if {
	blocks := array.concat([heading(1, 1, text)], array.slice(adr_blocks(n, "Accepted"), 1, 9))
}

test_adr002_number_mismatch if {
	doc := with_h1(1, "ADR-002: Title")
	hits([doc]) == {["ADR002", path_of(1), 1]}
	messages_of([doc], "ADR002") == {"the H1 must be \"ADR-001: Title\""}
}

test_adr002_no_title if {
	doc := with_h1(1, "ADR-001:")
	"ADR002" in rules_of([doc])
}

# ADR003

test_adr003_all_sections if {
	not "ADR003" in rules_of([valid(1, "Accepted")])
}

test_adr003_missing_section if {
	blocks := [b | some b in adr_blocks(1, "Accepted"); b.text != "Context"]
	hits([document(name_of(1), blocks, [])]) == {["ADR003", path_of(1), 1]}
	messages_of([document(name_of(1), blocks, [])], "ADR003") == {"missing \"## Context\""}
}

test_adr003_rejected_with_the_four_sections if {
	count(deny_of([with_status_blocks(1, "Rejected", [block("paragraph", 7, "It cost too much.")])])) == 0
}

# A Rejected ADR with its own headings in place of Decision and
# Consequences, as gh-infra 003 and 004 were.
test_adr003_rejected_with_other_headings if {
	doc := document(
		name_of(1), [
			heading(1, 1, "ADR-001: Title"),
			heading(3, 2, "Status"),
			block("paragraph", 5, "Rejected"),
			heading(7, 2, "Context"),
			block("paragraph", 9, "The problem."),
			heading(11, 2, "Proposal"),
			block("paragraph", 13, "The idea."),
			heading(15, 2, "Why rejected"),
			block("paragraph", 17, "The reason."),
		],
		[],
	)
	hits([doc]) == {["ADR003", path_of(1), 1]}
	messages_of([doc], "ADR003") == {"missing \"## Decision\"", "missing \"## Consequences\""}
}

# ADR004

test_adr004_in_order_with_others_between if {
	blocks := adr_blocks(1, "Accepted")
	extra := array.flatten([
		array.slice(blocks, 0, 7),
		[heading(26, 2, "Not decided here")],
		array.slice(blocks, 7, 9),
		[heading(40, 2, "Alternatives"), heading(42, 2, "History")],
	])
	count(deny_of([document(name_of(1), extra, [])])) == 0
}

test_adr004_out_of_order if {
	doc := document(
		name_of(1), [
			heading(1, 1, "ADR-001: Title"),
			heading(3, 2, "Status"),
			block("paragraph", 5, "Accepted"),
			heading(7, 2, "Decision"),
			heading(9, 2, "Context"),
			heading(11, 2, "Consequences"),
		],
		[],
	)
	hits([doc]) == {["ADR004", path_of(1), 9]}
	messages_of([doc], "ADR004") == {"\"## Context\" must come before \"## Decision\""}
}
