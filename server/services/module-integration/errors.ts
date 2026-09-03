/**
 * Module-integration errors.
 *
 * One home for the three exceptions this family throws, so the modules that
 * throw them and the modules that catch them can both import from here without
 * either importing the other. Before this file, DocumentNotFoundException lived
 * in ModuleIntegrationService and was thrown by the attachment code — which is
 * fine while they share a file and a cycle the moment they do not.
 *
 * All three are deliberately shaped so a caller cannot tell "does not exist"
 * from "belongs to someone else": the routes map every one of them to the same
 * 404. An error that distinguishes the two cases is an enumeration oracle.
 */

/** A document that does not exist, or that this tenant cannot see. */
export class DocumentNotFoundException extends Error {
  constructor(documentId: number | string) {
    super(`Document with ID ${documentId} not found`);
    this.name = 'DocumentNotFoundException';
  }
}

/** An attachment that does not exist on the named document, in this tenant. */
export class AttachmentNotFoundException extends Error {
  constructor(attachmentId: number | string) {
    super(`Attachment with ID ${attachmentId} not found`);
    this.name = 'AttachmentNotFoundException';
  }
}

/** An attachment record the input boundary refuses to write. */
export class AttachmentRejectedException extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AttachmentRejectedException';
  }
}
