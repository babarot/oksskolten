package main

import rego.v1

# Helper: extract text from heading node children
_adr_heading_text(h) := concat("", [c.value | some c in h.children; c.type == "text"])

_adr_filename := object.get(input, ["metadata", "filename"], "")

# All headings
_adr_headings := [h | some h in input.children; h.type == "heading"]

# H2 names in order
_adr_h2_names := [_adr_heading_text(h) | some h in input.children; h.type == "heading"; h.depth == 2]

# Rule A2: H1 must start with "ADR-NNN:"
deny contains msg if {
	_adr_filename != ""
	some h in _adr_headings
	h.depth == 1
	text := _adr_heading_text(h)
	not regex.match(`^ADR-\d{3}: .+$`, text)
	msg := sprintf("ADR H1 must match 'ADR-NNN: {Title}', got: '%s'", [text])
}

# Rule A3: Exactly one H1
deny contains msg if {
	_adr_filename != ""
	h1s := [h | some h in _adr_headings; h.depth == 1]
	count(h1s) != 1
	msg := sprintf("ADR must have exactly one H1, found %d", [count(h1s)])
}

# Rule A5: Required H2 sections — Status, Context, Decision, Consequences
_adr_required_h2s := ["Status", "Context", "Decision", "Consequences"]

deny contains msg if {
	_adr_filename != ""
	some required in _adr_required_h2s
	not required in {name | some name in _adr_h2_names}
	msg := sprintf("ADR must have '## %s' section", [required])
}

# Rule A6: Status must be one of the allowed values
# Check the first paragraph after the ## Status heading
_adr_valid_statuses := {"Accepted", "Deprecated", "Superseded"}

deny contains msg if {
	_adr_filename != ""
	"Status" in {name | some name in _adr_h2_names}
	some i, node in input.children
	node.type == "heading"
	node.depth == 2
	_adr_heading_text(node) == "Status"
	# Find the next paragraph after Status heading
	next_node := input.children[i + 1]
	next_node.type == "paragraph"
	status_text := concat("", [c.value | some c in next_node.children; c.type == "text"])
	not status_text in _adr_valid_statuses
	msg := sprintf("ADR Status must be one of {Accepted, Deprecated, Superseded}, got: '%s'", [status_text])
}
