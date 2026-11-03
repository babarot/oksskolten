package adr_test

import rego.v1

with_links(n, status, links) := document(name_of(n), adr_blocks(n, status), links)

# broken-link

test_adr014_resolved_links if {
	doc := with_links(1, "Accepted", [
		link(23, "../../main.go", "main.go", "file"),
		link(23, "../../internal/", "internal", "dir"),
		link(23, "https://example.com", "", "external"),
		link(23, "#context", "", "external"),
	])
	count(deny_of([doc])) == 0
}

test_adr014_missing_link if {
	doc := with_links(1, "Accepted", [link(27, "../../gone.go", "gone.go", "missing")])
	hits([doc]) == {["broken-link", path_of(1), 27]}
	messages_of([doc], "broken-link") == {"link to \"../../gone.go\", which is not in the repository"}
}

test_adr014_outside_link if {
	doc := with_links(1, "Accepted", [link(31, "../../../x.md", "", "outside")])
	messages_of([doc], "broken-link") == {"link to \"../../../x.md\", which is outside the repository"}
}

test_adr014_partly_replaced_is_accepted if {
	doc := with_links(1, "Accepted\nPartly replaced by ADR-002", [link(27, "gone.md", "docs/adr/gone.md", "missing")])
	hits([doc, valid(2, "Accepted")]) == {["broken-link", path_of(1), 27]}
}

test_adr014_not_accepted if {
	broken := [link(27, "gone.md", "docs/adr/gone.md", "missing"), link(27, "../../../x.md", "", "outside")]
	docs := [
		with_links(1, "Superseded by ADR-002", broken),
		with_links(2, "Rejected", broken),
		with_links(3, "Deprecated", broken),
	]
	count(deny_of(docs)) == 0
}
