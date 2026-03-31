package concept2cure

default allow := false

allow if {
  input.organizationId != null
  input.userId != null
  input.role != "unknown"
  not blocked_action
}

blocked_action if {
  input.action == "compute.execute"
  input.role == "viewer"
}

blocked_action if {
  input.action == "external.firecrawl.scrape"
  input.role == "viewer"
}
