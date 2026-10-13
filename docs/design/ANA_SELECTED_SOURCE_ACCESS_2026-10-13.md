# AnA selected source and attachment access

This increment extends the canonical project admission boundary to selected
source IDs and upload IDs. Admitting the open project alone cannot authorize a
source recorded under a different private project. The source-to-upload resolver
must not discard that source's recorded scope before permission is evaluated.

`source-context-admission.ts` reads only source/upload identities and their
recorded parent scopes, then calls the same current project-sharing admission
used by the conversation routes. It checks active organization membership. Exact
selected identities are validated before metadata, extracted text, file bytes,
tools or model context can be supplied. A missing scope, ambiguous anchor or
unavailable access check refuses the selection; it cannot become an organization
conversation. Global public references retain their public visibility contract.

Direct upload IDs also require current access to every recorded source/artifact
project attached to that upload. Checking only one link would allow a second
private link to be discarded. An upload with no recorded project is a private
conversation attachment belonging to its authenticated uploader, rather than a
file shared with everyone in the organization. Historical source links continue
to carry access constraints; deleting a source does not make its original upload
public. Existing organization/path/disposition/hash checks remain effective.

The streaming and JSON entrances check explicit selections before context
construction. The shared upload reader accepts a separate interactive actor
argument, which AnA's document tools pass on every file read. Internal services
that already verify exact source/project permissions retain their tenant-scoped
reader contract. This is not a new source store or a parallel byte reader.

The existing editor image upload must also retain its verified document/program
association. A new image is authorized against the actual authoring document,
then its upload, canonical captured-source identity and audit commit together.
The browser supplies the document ID; it cannot supply an authoritative project
grant. Reviewers and coauthors read through the same current project and document
permissions. Renderer and HTTP image reads carry the authenticated actor.

For a legacy image, mutable HTML alone cannot grant its bytes to another user.
A retained insertion by the original uploader, its verifiable authoring trail,
and current document/project permission can establish a real shared association.
Missing proof remains a reviewable refusal or named export placeholder, rather
than a guessed association. Already recorded private source/artifact projects
continue to govern access. The image-association lead owns these changes and
the shared reader/helper while the control tower freezes their other callers.

Root owns the seven narrow AnA tool call sites. The AnA admission implementation
owns the two route integrations and the bounded image-association service.
Meaningful tests use stored private-project/source/upload fixtures, revoked and
suspended membership, selected sources outside the open project, direct upload
IDs, and a reader failure. Refusal must occur before bytes or model calls. No
model credentials or production dependencies are added.
