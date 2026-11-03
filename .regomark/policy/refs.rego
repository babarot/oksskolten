# References between ADRs, and their numbers.
package adr

import rego.v1

import data.adrlib

numbered := [{"path": doc.path, "number": adrlib.number(doc)} | some doc in input.documents]

numbers_present contains d.number if some d in numbered

# The replacement graph, keyed by path so that duplicate numbers do not
# make the object conflict.
replacement_graph[doc.path] := {d.path | some r in adrlib.refs(doc); some d in numbered; d.number == r.target} if {
	some doc in input.documents
}

deny contains {"rule": "ADR009", "path": doc.path, "line": r.line, "message": msg} if {
	some doc in input.documents
	some r in adrlib.refs(doc)
	not r.target in numbers_present
	msg := sprintf("%s ADR-%03d, which does not exist", [r.kind, r.target])
}

deny contains {"rule": "ADR010", "path": doc.path, "line": r.line, "message": msg} if {
	some doc in input.documents
	some r in adrlib.refs(doc)
	r.target <= adrlib.number(doc)
	msg := sprintf("%s ADR-%03d must point to a later ADR", [r.kind, r.target])
}

deny contains {"rule": "ADR011", "path": d.path, "line": 1, "message": msg} if {
	some d in numbered
	count([x | some x in numbered; x.number == d.number]) > 1
	msg := sprintf("ADR number %03d is used by more than one file", [d.number])
}

deny contains {"rule": "ADR012", "path": d.path, "line": 1, "message": msg} if {
	count(numbers_present) > 0
	some n in numbers.range(1, max(numbers_present))
	not n in numbers_present
	next := min({x | some x in numbers_present; x > n})
	some d in numbered
	d.number == next
	msg := sprintf("ADR number %03d is missing; numbers run from 001 without gaps", [n])
}

deny contains {"rule": "ADR012", "path": d.path, "line": 1, "message": msg} if {
	msg := "ADR number 000 is not used; numbers run from 001"
	some d in numbered
	d.number == 0
}

# Reported on each reference whose target leads back to this ADR.
deny contains {"rule": "ADR013", "path": doc.path, "line": r.line, "message": msg} if {
	msg := "this ADR is in a cycle of replacements"
	some doc in input.documents
	some r in adrlib.refs(doc)
	some d in numbered
	d.number == r.target
	doc.path in graph.reachable(replacement_graph, {d.path})
}
