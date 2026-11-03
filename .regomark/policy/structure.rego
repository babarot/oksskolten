# File names, the H1 and the required sections.
package adr

import rego.v1

import data.adrlib

required := ["Status", "Context", "Decision", "Consequences"]

order[name] := i if some i, name in required

deny contains {"rule": "file-name", "path": doc.path, "line": 1, "message": msg} if {
	msg := "the file name must be NNN-kebab-case.md"
	some doc in input.documents
	not regex.match(`^\d{3}-[a-z0-9]+(-[a-z0-9]+)*\.md$`, doc.name)
}

deny contains {"rule": "title", "path": doc.path, "line": 1, "message": msg} if {
	some doc in input.documents
	n := count(adrlib.headings(doc, 1))
	n != 1
	msg := $"an ADR has exactly one H1, found {n}"
}

deny contains {"rule": "title", "path": doc.path, "line": h.line, "message": msg} if {
	some doc in input.documents
	some h in adrlib.headings(doc, 1)
	not regex.match(sprintf(`^ADR-%03d: \S`, [adrlib.number(doc)]), h.text)
	msg := sprintf("the H1 must be \"ADR-%03d: Title\"", [adrlib.number(doc)])
}

deny contains {"rule": "required-sections", "path": doc.path, "line": 1, "message": msg} if {
	some doc in input.documents
	some name in required
	not name in adrlib.h2_names(doc)
	msg := $"missing \"## {name}\""
}

deny contains {"rule": "section-order", "path": doc.path, "line": b.line, "message": msg} if {
	some doc in input.documents
	present := [h | some h in adrlib.headings(doc, 2); h.text in required]
	some k in numbers.range(1, count(present) - 1)
	a := present[k - 1]
	b := present[k]
	order[a.text] > order[b.text]
	msg := $"\"## {b.text}\" must come before \"## {a.text}\""
}
