package main

import rego.v1

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

h(depth, text) := {"type": "heading", "depth": depth, "children": [{"type": "text", "value": text}]}

para(text) := {"type": "paragraph", "children": [{"type": "text", "value": text}]}

adr_doc(filename, children) := {"type": "root", "children": children, "metadata": {"filename": filename}}

valid_adr(filename) := adr_doc(filename, [
	h(1, "ADR-001: Settings Dual Storage"),
	h(2, "Status"),
	para("Accepted"),
	h(2, "Context"),
	h(2, "Decision"),
	h(2, "Consequences"),
])

# ---------------------------------------------------------------------------
# Rule A2: H1 format
# ---------------------------------------------------------------------------

test_adr_h1_valid if {
	count(deny) == 0 with input as valid_adr("001-settings-dual-storage.md")
}

test_adr_h1_no_prefix if {
	"ADR H1 must match 'ADR-NNN: {Title}', got: 'Settings Dual Storage'" in deny with input as adr_doc("001-settings-dual-storage.md", [
		h(1, "Settings Dual Storage"),
		h(2, "Status"),
		para("Accepted"),
		h(2, "Context"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}

# ---------------------------------------------------------------------------
# Rule A3: Exactly one H1
# ---------------------------------------------------------------------------

test_adr_multiple_h1 if {
	"ADR must have exactly one H1, found 2" in deny with input as adr_doc("001-test.md", [
		h(1, "ADR-001: A"),
		h(1, "ADR-001: B"),
	])
}

# ---------------------------------------------------------------------------
# Rule A5: Required H2 sections
# ---------------------------------------------------------------------------

test_adr_all_required_pass if {
	count(deny) == 0 with input as valid_adr("001-settings-dual-storage.md")
}

test_adr_missing_context if {
	"ADR must have '## Context' section" in deny with input as adr_doc("001-test.md", [
		h(1, "ADR-001: Test"),
		h(2, "Status"),
		para("Accepted"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}

test_adr_missing_status if {
	"ADR must have '## Status' section" in deny with input as adr_doc("001-test.md", [
		h(1, "ADR-001: Test"),
		h(2, "Context"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}

# ---------------------------------------------------------------------------
# Rule A6: Status value
# ---------------------------------------------------------------------------

test_adr_status_accepted if {
	count(deny) == 0 with input as valid_adr("001-settings-dual-storage.md")
}

test_adr_status_deprecated if {
	count(deny) == 0 with input as adr_doc("001-test.md", [
		h(1, "ADR-001: Test"),
		h(2, "Status"),
		para("Deprecated"),
		h(2, "Context"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}

test_adr_status_superseded if {
	count(deny) == 0 with input as adr_doc("001-test.md", [
		h(1, "ADR-001: Test"),
		h(2, "Status"),
		para("Superseded"),
		h(2, "Context"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}

test_adr_status_invalid if {
	"ADR Status must be one of {Accepted, Deprecated, Superseded}, got: 'Draft'" in deny with input as adr_doc("001-test.md", [
		h(1, "ADR-001: Test"),
		h(2, "Status"),
		para("Draft"),
		h(2, "Context"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}
