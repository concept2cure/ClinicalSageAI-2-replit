import type { HelpArticle } from '../types';
import { GETTING_STARTED_ARTICLES } from './getting-started';
import { PROJECTS_ARTICLES } from './projects';
import { EVIDENCE_ARTICLES } from './evidence';
import { WRITING_ARTICLES } from './writing';
import { REVIEW_ARTICLES } from './review';
import { SUBMISSION_ARTICLES } from './submission';
import { RESPOND_ARTICLES } from './respond';
import { VAULT_ARTICLES } from './vault';
import { QUALITY_ARTICLES } from './quality';
import { WORK_AREAS_ARTICLES } from './work-areas';
import { ADMINISTRATION_ARTICLES } from './administration';
import { TECHNICAL_ARTICLES } from './technical';
import { TROUBLESHOOTING_ARTICLES } from './troubleshooting';

/** Every article, collection by collection. A new collection file is added here and nowhere else. */
export const ALL_HELP_ARTICLES: readonly HelpArticle[] = [
  ...GETTING_STARTED_ARTICLES,
  ...PROJECTS_ARTICLES,
  ...EVIDENCE_ARTICLES,
  ...WRITING_ARTICLES,
  ...REVIEW_ARTICLES,
  ...SUBMISSION_ARTICLES,
  ...RESPOND_ARTICLES,
  ...VAULT_ARTICLES,
  ...QUALITY_ARTICLES,
  ...WORK_AREAS_ARTICLES,
  ...ADMINISTRATION_ARTICLES,
  ...TECHNICAL_ARTICLES,
  ...TROUBLESHOOTING_ARTICLES,
];
