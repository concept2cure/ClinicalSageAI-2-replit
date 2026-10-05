/**
 * The client's reading of an AnA answer's check: the strip under an answer,
 * live and stored. The reader is shared with the server, which reads stored
 * checks for working memory (AnA reasoning round 8); it lives in
 * shared/ana/answer-check-reader.ts, and this module is its client name.
 *
 * @module client/src/concept2cure/components/ana/anaAnswerCheck
 */
export * from '@shared/ana/answer-check-reader';
