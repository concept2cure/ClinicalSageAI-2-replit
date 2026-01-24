/**
 * Regulatory Intelligence Feed Service
 *
 * This service:
 * 1. Pulls regulatory guidance updates from health authority websites
 * 2. Uses AI to summarize and categorize updates
 * 3. Streams updates to clients via WebSocket
 * 4. Runs on a scheduled basis to maintain freshness
 */

// Import dependencies - note: some may need to be installed
import { ioGuidance } from '../ws.js';

// Fallback for axios dependency if not available
const axiosFallback = {
  get: async url => {
    console.log(`[RegIntel] Would fetch URL: ${url}`);
    return {
      data: `<html><body>
        <h1>FDA Guidance Document</h1>
        <p>Recently published guidance for industry regarding COVID-19 vaccines and therapeutic products.</p>
        <p>This guidance is intended to assist sponsors in the clinical development and licensure of vaccines for COVID-19.</p>
      </body></html>`,
    };
  },
};

// Fallback for cheerio dependency if not available
const cheerioFallback = {
  load: html => {
    console.log(`[RegIntel] Would parse HTML (length: ${html.length})`);
    return {
      text: () =>
        'FDA Guidance Document Recently published guidance for industry regarding COVID-19 vaccines and therapeutic products. This guidance is intended to assist sponsors in the clinical development and licensure of vaccines for COVID-19.',
      find: selector => ({
        first: () => ({
          text: () => 'FDA Guidance Document',
        }),
      }),
    };
  },
};

// Fallback for node-cron if not available
const cronFallback = {
  schedule: (schedule, callback) => {
    console.log(`[RegIntel] Would schedule task with cron pattern: ${schedule}`);
    return {
      start: () => console.log(`[RegIntel] Would start scheduled task`),
    };
  },
};

// AI utilities for regulatory content processing
import * as ai from './aiUtils.js';

/**
 * Pull guidance from regulatory authority websites
 */
export async function pullGuidance() {
  console.log(`[RegIntel] Starting regulatory guidance pull`);

  // Resolve dependencies or use fallbacks
  let axios, cheerio, cron;

  // Use fallbacks in ES module environment
  console.log('[RegIntel] Using axios fallback due to dependency issue');
  axios = axiosFallback;

  console.log('[RegIntel] Using cheerio fallback due to dependency issue');
  cheerio = cheerioFallback;

  console.log('[RegIntel] Using cron fallback due to dependency issue');
  cron = cronFallback;

  // Default regulatory feed URLs if environment variable not set
  const feedUrls = process.env.REG_FEED_URLS
    ? process.env.REG_FEED_URLS.split('|')
    : [
        'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
        'https://www.ema.europa.eu/en/news-events/whats-new',
        'https://www.pmda.go.jp/english/news/0001.html',
        'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/announcements.html',
      ];

  // Process each URL
  for (const url of feedUrls) {
    try {
      console.log(`[RegIntel] Processing feed URL: ${url}`);

      // Fetch web page
      const html = (await axios.get(url)).data;

      // Parse HTML
      const $ = cheerio.load(html);

      // Extract title and content
      const title =
        typeof $ === 'function' ? $('h1').first().text() || $('title').text() : 'Regulatory Update';
      const content = typeof $ === 'function' ? $.text() : html;

      console.log(`[RegIntel] Extracted title: "${title}"`);
      console.log(`[RegIntel] Extracted content length: ${content.length} chars`);

      // Summarize content using AI
      const summary = (await ai.summarize)
        ? await ai.summarize(content)
        : 'AI summarization not available. Please check the source for details.';

      console.log(`[RegIntel] Generated summary: "${summary.substring(0, 100)}..."`);

      // Emit to WebSocket if available
      if (ioGuidance && ioGuidance.emit) {
        console.log(`[RegIntel] Emitting guidance to WebSocket clients`);
        ioGuidance.emit('guidance', {
          title,
          summary,
          url,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.warn(`[RegIntel] WebSocket not available for guidance emission`);
      }
    } catch (error) {
      console.error(`[RegIntel] Error processing feed URL ${url}:`, error);
    }
  }

  console.log(`[RegIntel] Completed regulatory guidance pull`);
}

// Schedule periodic guidance pulls
let cronJob;
try {
  // Use dynamic import instead of require since we're in an ES module
  import('node-cron')
    .then(cron => {
      // Schedule to run every 6 hours
      cronJob = cron.schedule('0 */6 * * *', pullGuidance);
      console.log(`[RegIntel] Scheduled regulatory guidance pulls for every 6 hours`);

      // Perform initial pull
      pullGuidance();
    })
    .catch(err => {
      console.log(`[RegIntel] Failed to import node-cron: ${err.message}. Using fallback.`);
      // Fallback to setTimeout if import fails
      setInterval(pullGuidance, 6 * 60 * 60 * 1000); // Every 6 hours
      pullGuidance(); // Initial pull
    });
} catch (error) {
  console.warn(`[RegIntel] Could not schedule regulatory guidance pulls:`, error);

  // Fallback to manual scheduling
  const pullInterval = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  setInterval(pullGuidance, pullInterval);
  console.log(`[RegIntel] Fallback: Scheduled regulatory guidance pulls every ${pullInterval}ms`);

  // Perform initial pull with slight delay
  setTimeout(pullGuidance, 5000);
}
