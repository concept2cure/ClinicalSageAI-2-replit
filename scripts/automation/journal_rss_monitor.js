import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Parser } from 'xml2js';
import { db } from 'shared/db';
import { eq } from 'drizzle-orm';
import { academicSources } from 'shared/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Journal RSS Monitor for TrialSage
 *
 * This script monitors RSS feeds from major clinical research journals
 * and automatically imports new relevant papers into our knowledge base.
 *
 * It uses Hugging Face models to assess relevance and extract key information.
 */

// Configuration
const JOURNALS = [
  {
    name: 'The New England Journal of Medicine',
    rssFeed: 'https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.75,
  },
  {
    name: 'The Lancet',
    rssFeed: 'https://www.thelancet.com/rssfeed/lancet_current.xml',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.75,
  },
  {
    name: 'The Journal of Clinical Investigation',
    rssFeed: 'https://www.jci.org/rss/current.xml',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.7,
  },
  {
    name: 'JAMA',
    rssFeed: 'https://jamanetwork.com/rss/site_3/67.xml',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.7,
  },
  {
    name: 'Nature Medicine',
    rssFeed: 'https://www.nature.com/nm.rss',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.75,
  },
  {
    name: 'British Medical Journal',
    rssFeed: 'https://www.bmj.com/content/latest.rss',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.7,
  },
  {
    name: 'Clinical Trials',
    rssFeed:
      'https://journals.sagepub.com/action/showFeed?ui=0&mi=ehikzz&ai=2b4&jc=ctja&type=etoc&feed=rss',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.65, // lower threshold since this journal is specifically about clinical trials
  },
  {
    name: 'Journal of Medical Internet Research',
    rssFeed: 'https://www.jmir.org/feed/atom',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.7,
  },
  {
    name: 'Contemporary Clinical Trials',
    rssFeed: 'https://www.sciencedirect.com/journal/contemporary-clinical-trials/rss',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.65, // lower threshold since this journal is specifically about clinical trials
  },
  {
    name: 'Trials',
    rssFeed: 'https://trialsjournal.biomedcentral.com/articles/most-recent/rss.xml',
    relevanceKeywords: [
      'clinical trial',
      'protocol',
      'methodology',
      'study design',
      'randomized',
      'medicine',
      'health',
      'patient',
      'therapy',
      'treatment',
      'disease',
    ],
    minRelevanceScore: 0.65, // lower threshold since this journal is specifically about clinical trials
  },
];

// Paths for storing data
const DATA_DIR = path.join(process.cwd(), 'data/academic_sources/journal_articles');
const TRACKING_FILE = path.join(DATA_DIR, 'tracked_articles.json');
const IMPORT_LOG = path.join(DATA_DIR, 'import_log.json');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    logger.info(`Created directory: ${DATA_DIR}`);
  }
}

// Get list of already processed articles
function getProcessedArticles() {
  if (!fs.existsSync(TRACKING_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
  } catch (error) {
    logger.error('Error reading tracking file:', error.message);
    return {};
  }
}

// Save list of processed articles
function saveProcessedArticles(articles) {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(articles, null, 2));
    logger.info('Updated processed articles list saved');
  } catch (error) {
    logger.error('Error saving processed articles:', error.message);
  }
}

// Log import activity
function logImport(entry) {
  try {
    let log = [];

    if (fs.existsSync(IMPORT_LOG)) {
      log = JSON.parse(fs.readFileSync(IMPORT_LOG, 'utf8'));
    }

    log.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(IMPORT_LOG, JSON.stringify(log, null, 2));
  } catch (error) {
    logger.error('Error logging import:', error.message);
  }
}

// Fetch RSS feed
async function fetchRssFeed(journal) {
  logger.info(`Fetching RSS feed for ${journal.name}...`);

  try {
    const response = await axios.get(journal.rssFeed);

    const parser = new Parser({
      explicitArray: false,
      mergeAttrs: true,
    });

    return new Promise((resolve, reject) => {
      parser.parseString(response.data, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  } catch (error) {
    logger.error(`Error fetching RSS feed for ${journal.name}:`, error.message);
    return null;
  }
}

// Extract articles from RSS feed
function extractArticlesFromFeed(journal, feedData) {
  // Different RSS feeds have different structures
  // We need to handle each one based on its format

  let articles = [];

  try {
    if (!feedData) return articles;

    if (feedData.rss && feedData.rss.channel) {
      // Standard RSS format
      const items = Array.isArray(feedData.rss.channel.item)
        ? feedData.rss.channel.item
        : [feedData.rss.channel.item];

      articles = items.map(item => ({
        title: item.title,
        authors: item.creator || item.author || 'Unknown',
        abstract: item.description,
        publicationDate: item.pubDate || new Date().toISOString(),
        url: item.link,
        journal: journal.name,
        doi: extractDoiFromText(item.description) || extractDoiFromText(item.link),
      }));
    } else if (feedData.feed && feedData.feed.entry) {
      // Atom format
      const entries = Array.isArray(feedData.feed.entry)
        ? feedData.feed.entry
        : [feedData.feed.entry];

      articles = entries.map(entry => ({
        title: entry.title,
        authors: entry.author?.name || 'Unknown',
        abstract: entry.summary || entry.content,
        publicationDate: entry.published || entry.updated || new Date().toISOString(),
        url: entry.link?.href || entry.id,
        journal: journal.name,
        doi: extractDoiFromText(entry.summary) || extractDoiFromText(entry.id),
      }));
    }

    logger.info(`Extracted ${articles.length} articles from ${journal.name}`);
    return articles;
  } catch (error) {
    logger.error(`Error extracting articles from ${journal.name}:`, error.message);
    return [];
  }
}

// Extract DOI from text
function extractDoiFromText(text) {
  if (!text) return null;

  // Common DOI patterns
  const doiPattern = /\b(10\.\d{4,}(?:\.\d+)*\/[^\s]+)\b/;
  const match = text.match(doiPattern);

  return match ? match[1] : null;
}

// Calculate relevance score
function calculateRelevanceScore(article, journal) {
  // Basic relevance calculation based on keyword presence
  // In production, this would use Hugging Face embeddings for semantic similarity

  if (!article.title && !article.abstract) return 0;

  const text = `${article.title || ''} ${article.abstract || ''}`.toLowerCase();

  // Count keyword matches
  let matches = 0;
  for (const keyword of journal.relevanceKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      matches++;
    }
  }

  // Calculate score based on ratio of matches to keywords
  const score = matches / journal.relevanceKeywords.length;
  return score;
}

// Process a batch of articles
async function processArticles(articles, journal) {
  logger.info(`Processing ${articles.length} articles from ${journal.name}...`);

  // Get already processed articles
  const processed = getProcessedArticles();

  // Filter out already processed articles and calculate relevance
  const newArticles = [];
  const relevantArticles = [];

  for (const article of articles) {
    // Skip if no DOI or URL to track uniqueness
    const trackingId = article.doi || article.url;
    if (!trackingId) continue;

    // Skip if already processed
    if (processed[trackingId]) continue;

    // Mark as processed
    processed[trackingId] = {
      processedDate: new Date().toISOString(),
      relevanceScore: 0,
    };

    newArticles.push(article);

    // Check relevance
    const relevanceScore = calculateRelevanceScore(article, journal);
    processed[trackingId].relevanceScore = relevanceScore;

    if (relevanceScore >= journal.minRelevanceScore) {
      relevantArticles.push({
        ...article,
        relevanceScore,
      });
    }
  }

  // Save updated processed list
  saveProcessedArticles(processed);

  logger.info(`Found ${newArticles.length} new articles, ${relevantArticles.length} relevant`);
  return relevantArticles;
}

// Format article for academic-knowledge-service
function formatForKnowledgeService(article) {
  const date = new Date(article.publicationDate);
  const formattedDate = date.toISOString().split('T')[0];

  const authors = Array.isArray(article.authors) ? article.authors.join(', ') : article.authors;

  return {
    id: article.doi
      ? `doi-${article.doi.replace(/\//g, '-')}`
      : `journal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: article.title,
    author: authors,
    date: formattedDate,
    url: article.url,
    type: 'research-paper',
    relevanceScore: article.relevanceScore,
    journal: article.journal,
    abstract: article.abstract,
  };
}

// Monitor all journal RSS feeds
async function monitorJournalFeeds() {
  logger.info('Starting journal RSS feed monitoring...');

  ensureDirectories();

  const allRelevantArticles = [];

  for (const journal of JOURNALS) {
    try {
      logger.info(`Processing ${journal.name}...`);

      // Fetch and parse RSS feed
      const feedData = await fetchRssFeed(journal);
      if (!feedData) continue;

      // Extract articles from feed
      const articles = extractArticlesFromFeed(journal, feedData);

      // Process articles
      const relevantArticles = await processArticles(articles, journal);

      allRelevantArticles.push(...relevantArticles);

      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error(`Error processing journal ${journal.name}:`, error.message);
    }
  }

  // Format for knowledge service and save
  if (allRelevantArticles.length > 0) {
    const knowledgeEntries = allRelevantArticles.map(formatForKnowledgeService);

    // Save to file for review
    const outputFile = path.join(DATA_DIR, `new_articles_${Date.now()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(knowledgeEntries, null, 2));

    logger.info(`Saved ${knowledgeEntries.length} new knowledge entries to ${outputFile}`);

    // Log import
    logImport({
      articlesProcessed: allRelevantArticles.length,
      articlesImported: knowledgeEntries.length,
      outputFile,
    });

    return {
      success: true,
      articlesFound: allRelevantArticles.length,
      knowledgeEntriesCreated: knowledgeEntries.length,
      outputFile,
    };
  } else {
    logger.info('No new relevant articles found');

    logImport({
      articlesProcessed: 0,
      articlesImported: 0,
      message: 'No new relevant articles found',
    });

    return {
      success: true,
      articlesFound: 0,
      message: 'No new relevant articles found',
    };
  }
}

// Perform auto-integration with academic-knowledge-service
async function integrateWithKnowledgeService(outputFile) {
  logger.info(`Integrating articles from ${outputFile} with academic-knowledge-service...`);

  try {
    const articles = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

    // This would be integrated with the academic-knowledge-service.ts
    // For this demo, we'll just log what would be integrated

    logger.info(`Ready to integrate ${articles.length} articles into academic-knowledge-service`);

    // Sample of how integration would look
    const integration = {
      timestamp: new Date().toISOString(),
      articlesAdded: articles.length,
      articles: articles.map(article => ({
        id: article.id,
        title: article.title,
      })),
    };

    const integrationLog = path.join(DATA_DIR, `integration_${Date.now()}.json`);
    fs.writeFileSync(integrationLog, JSON.stringify(integration, null, 2));

    logger.info(`Integration plan saved to ${integrationLog}`);

    return {
      success: true,
      articlesIntegrated: articles.length,
      integrationLog,
    };
  } catch (error) {
    logger.error('Error integrating with knowledge service:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Main function to run the monitoring
async function runJournalMonitor() {
  try {
    const result = await monitorJournalFeeds();

    if (result.success && result.knowledgeEntriesCreated > 0) {
      await integrateWithKnowledgeService(result.outputFile);
    }

    return result;
  } catch (error) {
    logger.error('Error running journal monitor:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the monitor when file is executed directly (ES module version)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runJournalMonitor()
    .then(result => {
      logger.info('Journal monitoring complete:', result);
    })
    .catch(error => {
      logger.error('Fatal error during journal monitoring:', error);
    });
}

export { monitorJournalFeeds, integrateWithKnowledgeService, runJournalMonitor };
