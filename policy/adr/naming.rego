package main

import rego.v1

_adr_naming_filename := object.get(input, ["metadata", "filename"], "")

# Helper: extract text from heading node children
_adr_naming_heading_text(h) := concat("", [c.value | some c in h.children; c.type == "text"])

# Rule A1: Filename must match {NNN}-{kebab-case}.md
deny contains msg if {
	_adr_naming_filename != ""
	not regex.match(`^\d{3}-[a-z][a-z0-9-]*\.md$`, _adr_naming_filename)
	msg := sprintf("ADR filename must match {NNN}-{kebab-case}.md, got: '%s'", [_adr_naming_filename])
}

# Rule A4: H1 number must match filename number
deny contains msg if {
	_adr_naming_filename != ""
	file_prefix := substring(_adr_naming_filename, 0, 3)
	some h in input.children
	h.type == "heading"
	h.depth == 1
	text := _adr_naming_heading_text(h)
	regex.match(`^ADR-\d{3}: .+$`, text)
	h1_prefix := substring(text, 4, 3)
	file_prefix != h1_prefix
	msg := sprintf("ADR filename prefix '%s' does not match H1 prefix 'ADR-%s'", [file_prefix, h1_prefix])
}
