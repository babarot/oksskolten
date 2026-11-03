# Helpers for the ADR policies: headings, sections, the Status paragraph and
# the references in it.
package adrlib

import rego.v1

# The headings of a level, with their index in blocks.
headings(doc, level) := [{"i": i, "text": b.text, "line": b.line} |
	some i, b in doc.blocks
	b.kind == "heading"
	b.level == level
]

h2_names(doc) := {h.text | some h in headings(doc, 2)}

# The blocks of the H2 section named name, up to the next H1 or H2.
section(doc, name) := [b |
	some h in headings(doc, 2)
	h.text == name
	end := min({j | some j, x in doc.blocks; j > h.i; x.kind == "heading"; x.level <= 2} | {count(doc.blocks)})
	some j, b in doc.blocks
	j > h.i
	j < end
]

# The number in the file name (1 for 001-foo.md).
number(doc) := to_number(m[0][1]) if {
	m := regex.find_all_string_submatch_n(`^(\d{3})-`, doc.name, 1)
	count(m) == 1
}

# The first block under Status, when it is a paragraph.
status_paragraph(doc) := blocks[0] if {
	blocks := section(doc, "Status")
	count(blocks) > 0
	blocks[0].kind == "paragraph"
}

# The lines of the first paragraph under Status.
status_lines(doc) := [trim_space(l) | some l in split(status_paragraph(doc).text, "\n")]

status(doc) := status_lines(doc)[0]

accepted(doc) if status(doc) == "Accepted"

ref_pattern := `^(Superseded by|Partly replaced by) ADR-(\d{3})\.?$`

# The references in the first paragraph under Status, each on its own line.
refs(doc) := {{"kind": m[1], "target": to_number(m[2]), "line": status_paragraph(doc).line + i} |
	some i, l in status_lines(doc)
	some m in regex.find_all_string_submatch_n(ref_pattern, l, 1)
}
