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
# Rule A1: Filename format
# ---------------------------------------------------------------------------

test_adr_filename_valid if {
	count(deny) == 0 with input as valid_adr("001-settings-dual-storage.md")
}

test_adr_filename_no_number if {
	"ADR filename must match {NNN}-{kebab-case}.md, got: 'settings-dual-storage.md'" in deny with input as adr_doc("settings-dual-storage.md", [
		h(1, "ADR-001: Settings Dual Storage"),
	])
}

test_adr_filename_snake_case if {
	"ADR filename must match {NNN}-{kebab-case}.md, got: '001_settings_dual_storage.md'" in deny with input as adr_doc("001_settings_dual_storage.md", [
		h(1, "ADR-001: Settings Dual Storage"),
	])
}

# ---------------------------------------------------------------------------
# Rule A4: H1 number matches filename
# ---------------------------------------------------------------------------

test_adr_number_match if {
	count(deny) == 0 with input as valid_adr("001-settings-dual-storage.md")
}

test_adr_number_mismatch if {
	"ADR filename prefix '002' does not match H1 prefix 'ADR-001'" in deny with input as adr_doc("002-settings-dual-storage.md", [
		h(1, "ADR-001: Settings Dual Storage"),
		h(2, "Status"),
		para("Accepted"),
		h(2, "Context"),
		h(2, "Decision"),
		h(2, "Consequences"),
	])
}
