# Builders for the inputs of the policy tests. regomark does not load
# *_test.rego, so these stay out of the policy set.
package adr_test

import rego.v1

import data.adr

heading(line, level, text) := {"kind": "heading", "level": level, "line": line, "text": text, "lang": ""}

block(kind, line, text) := {"kind": kind, "level": 0, "line": line, "text": text, "lang": ""}

link(line, dest, target, kind) := {"dest": dest, "text": "link", "line": line, "target": target, "kind": kind}

document(name, blocks, links) := {
	"path": $"docs/adr/{name}",
	"name": name,
	"blocks": blocks,
	"links": links,
}

# The blocks of a well-formed ADR numbered n, with status as the first
# paragraph under Status (line 5). The sections are on lines 3, 21, 25 and
# 29, which leaves lines 7 to 19 for more blocks under Status.
adr_blocks(n, status) := [
	heading(1, 1, sprintf("ADR-%03d: Title", [n])),
	heading(3, 2, "Status"),
	block("paragraph", 5, status),
	heading(21, 2, "Context"),
	block("paragraph", 23, "The problem."),
	heading(25, 2, "Decision"),
	block("paragraph", 27, "The rule."),
	heading(29, 2, "Consequences"),
	block("paragraph", 31, "The cost."),
]

name_of(n) := sprintf("%03d-title.md", [n])

path_of(n) := $"docs/adr/{name_of(n)}"

# A well-formed ADR numbered n.
valid(n, status) := document(name_of(n), adr_blocks(n, status), [])

# A well-formed ADR numbered n with the blocks after the first Status
# paragraph replaced by extra (the other sections follow them).
with_status_blocks(n, status, extra) := document(
	name_of(n), array.flatten([
		array.slice(adr_blocks(n, status), 0, 3),
		extra,
		array.slice(adr_blocks(n, status), 3, 9),
	]),
	[],
)

# The one place that sets input, so that each test states only its documents
# (and, for the policies that read them, the judgments).
input_of(docs, judgments) := {"schema_version": 2, "root": ".", "documents": docs, "judgments": judgments}

deny_of(docs) := deny_with(docs, [])

deny_with(docs, judgments) := result if {
	result := adr.deny with input as input_of(docs, judgments)
}

questions_of(docs) := result if {
	result := adr.questions with input as input_of(docs, [])
}

warn_of(docs, judgments) := result if {
	result := adr.warn with input as input_of(docs, judgments)
}

# An answer to the question id about the ADR numbered 1, asked at its
# Decision heading (line 25).
judgment(id, status, verdict, evidence_line) := {
	"id": id, "path": path_of(1), "line": 25, "status": status,
	"verdict": verdict, "reason": "It names the function.", "evidence_line": evidence_line, "error": "",
}

warn_hits(docs, judgments) := {[v.rule, v.path, v.line] | some v in warn_of(docs, judgments)}

warn_messages(docs, judgments) := {v.message | some v in warn_of(docs, judgments)}

# The violations as [rule, path, line].
hits(docs) := {[v.rule, v.path, v.line] | some v in deny_of(docs)}

rules_of(docs) := {v.rule | some v in deny_of(docs)}

messages_of(docs, rule) := {v.message | some v in deny_of(docs); v.rule == rule}
