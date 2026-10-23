/** Existing template-derived manifest vocabulary, shared by writer and receipt reader. */
export const ATTACHMENT_MANIFEST_SEED = '***Start***';
export const PRESTAR_ATTACHMENT_MANIFEST_SEED = '***Begin***';

/** Includes FDA's lettered chapters and nested paths, e.g. CH6A.03/CH6A.03.01/. */
export const ESTAR_CHAPTER_PATH = /^\/CHAPTER \d+[A-Z]?\/(CH[0-9A-Z.]+\/)+$/;
