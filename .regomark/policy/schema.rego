# METADATA
# title: ADR policies
# description: regomark collects deny from this package (entrypoint adr).
# entrypoint: true
package adr

import rego.v1

schema_version := 2

rule_ids := {
	"file-name",
	"title",
	"required-sections",
	"section-order",
	"status-paragraph",
	"status-value",
	"status-lines",
	"reference-placement",
	"reference-target",
	"reference-direction",
	"duplicate-number",
	"number-sequence",
	"replacement-cycle",
	"broken-link",
	"spec-detail",
	"procedure",
}
