# The platform owners, named by the founder on 2026-10-01.
#
# Each is the address its owner signs in with by password, in lower case: the
# allowlists compare lower-cased addresses, and the stack refuses any other
# form. The stack passes the list to the API as PLATFORM_ADMIN_EMAILS and
# BUSINESS_CENTER_EMAILS (terraform/stack/main.tf). A federated (SAML) sign-in
# never matches it.
#
# Terraform loads every *.auto.tfvars in this directory on its own, and a value
# here overrides one in terraform.tfvars. So change the owners here, in a
# reviewed commit, not in a local tfvars that nobody else sees.
#
# The first owner's account is created by first-run setup, with the setup
# token (the stack's first_run_setup output). The second signs up through
# POST /api/auth/signup; in production that account stays pending until its
# address is verified from the e-mailed link, so only that mailbox can claim it.
# Decision P-5, docs/LAUNCH_DEFINITION_OF_DONE.md.
platform_owner_emails = [
  "jonmichaelpsmith@gmail.com",
  "jmichaelpsmith@gmail.com",
]
