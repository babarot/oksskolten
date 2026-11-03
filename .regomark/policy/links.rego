# Links in Accepted ADRs must point at something in the repository.
package adr

import rego.v1

import data.adrlib

deny contains {"rule": "broken-link", "path": doc.path, "line": l.line, "message": msg} if {
	some doc in input.documents
	adrlib.accepted(doc)
	some l in doc.links
	l.kind in {"missing", "outside"}
	msg := sprintf("link to %q, which is %s", [l.dest, describe[l.kind]])
}

describe := {"missing": "not in the repository", "outside": "outside the repository"}
