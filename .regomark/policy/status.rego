# The shape of the Status section.
package adr

import rego.v1

import data.adrlib

allowed_status := {"Accepted", "Rejected", "Deprecated"}

deny contains {"rule": "status-paragraph", "path": doc.path, "line": h.line, "message": msg} if {
	msg := "the first block under Status must be a paragraph with the status"
	some doc in input.documents
	some h in adrlib.headings(doc, 2)
	h.text == "Status"
	not adrlib.status_paragraph(doc)
}

deny contains {"rule": "status-value", "path": doc.path, "line": adrlib.status_paragraph(doc).line, "message": msg} if {
	some doc in input.documents
	s := adrlib.status(doc)
	not s in allowed_status
	not regex.match(`^Superseded by ADR-\d{3}\.?$`, s)
	msg := $"Status \"{s}\" must be Accepted, Rejected, Deprecated or \"Superseded by ADR-NNN\""
}

deny contains {"rule": "status-lines", "path": doc.path, "line": line, "message": msg} if {
	some doc in input.documents
	some i, l in adrlib.status_lines(doc)
	i > 0
	not regex.match(`^Partly replaced by ADR-\d{3}\.?$`, l)
	line := adrlib.status_paragraph(doc).line + i
	msg := $"only \"Partly replaced by ADR-NNN\" lines may follow the status in its paragraph, found \"{l}\""
}

# A code block reports the line of its opening fence.
deny contains {"rule": "reference-placement", "path": doc.path, "line": b.line + i, "message": msg} if {
	msg := "a reference to another ADR belongs in the first paragraph under Status, where it is read"
	some doc in input.documents
	blocks := adrlib.section(doc, "Status")
	some k, b in blocks
	not first_status_paragraph(blocks, k)
	some i, l in split(b.text, "\n")
	regex.match(`(Superseded by|Partly replaced by) ADR-\d{3}`, l)
}

first_status_paragraph(blocks, k) if {
	k == 0
	blocks[0].kind == "paragraph"
}
