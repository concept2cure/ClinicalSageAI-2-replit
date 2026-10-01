/**
 * The author_role a review comment carries when AnA wrote its words for a
 * person (row D5, 2026-10-01). Set once, when the comment is posted; a review
 * comment's author and role are fixed after that
 * (migrations/20261001_review_comments_record.sql). The person's id and name
 * stay on the row, because AnA wrote for them; the thread shows the words as
 * AnA's, on their behalf, and the chained record carries origin 'ana'.
 */
export const ANA_REVIEW_COMMENT_ROLE = 'ana';
