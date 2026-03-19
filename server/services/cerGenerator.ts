// @ts-nocheck - Uses optional puppeteer-cluster and bull; OpenAI SDK v4
// server/services/cerGenerator.ts

import { Cluster } from 'puppeteer-cluster';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import { pool as sharedPool } from '../db';

// Initialize OpenAI client
// Puppeteer-Cluster for performance
let clusterInstance: Cluster | null = null;
async function initCluster() {
  if (clusterInstance) return clusterInstance;
  clusterInstance = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 2,
    puppeteerOptions: { args: ['--no-sandbox'] },
  });
  return clusterInstance;
}

// Generate each section based on template
export async function generateCerSections(userId: string, templateId: string) {
  // Fetch template from DB
  const { rows } = await sharedPool.query('SELECT sections FROM templates WHERE id = $1', [
    templateId,
  ]);
  const sections = rows[0].sections as Array<{ name: string; prompt: string }>;
  return sections.map(sec => ({
    name: sec.name,
    async render() {
      const aiResult = await ai.chat({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: sec.prompt },
          { role: 'user', content: `Generate the "${sec.name}" section.` },
        ],
      });
      return `<h2>${sec.name}</h2>${aiResult.content}`;
    },
  }));
}

// Wrap HTML template
export function assembleHtml(bodyHtml: string) {
  return `
    <html>
      <head><style>body { font-family: sans-serif; }</style></head>
      <body>${bodyHtml}</body>
    </html>`;
}

// Render PDF with cluster, fallback to PDFKit
export async function renderPdf(html: string, jobId: string) {
  try {
    const cluster = await initCluster();
    const pdfPath = path.join('/tmp', `cer-${jobId}.pdf`);
    await cluster.task(async ({ page, data }) => {
      await page.setContent(data, { waitUntil: 'networkidle0' });
      await page.pdf({ path: pdfPath, format: 'A4' });
    });
    await cluster.queue(html);
    await cluster.idle();
    return pdfPath;
  } catch (err) {
    // Fallback to simple PDFKit
    const pdfPath = path.join('/tmp', `cer-${jobId}-fallback.pdf`);
    return new Promise<string>((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      doc.text(html.replace(/<[^>]+>/g, ''));
      doc.end();
      stream.on('finish', () => resolve(pdfPath));
      stream.on('error', reject);
    });
  }
}

// Kick off Bull worker with WS updates
import Queue from 'bull';
import { Server } from 'socket.io';

export function setupWorkers(pool: Pool, redisOpts: { host: string; port: number }, io: Server) {
  const cerQueue = new Queue('cer-generation', { redis: redisOpts });

  cerQueue.process(async job => {
    const { userId, templateId } = job.data;
    const sections = await generateCerSections(userId, templateId);

    let html = '';
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      job.progress(((i + 1) / sections.length) * 80, sec.name);
      io.to(job.id).emit('progress', { progress: job._progress, step: sec.name });
      html += await sec.render();
    }

    html = assembleHtml(html);
    const pdfPath = await renderPdf(html, job.id);

    // Save job record in Postgres
    await pool.query(`UPDATE cer_jobs SET status='completed', progress=100 WHERE job_id=$1`, [
      job.id,
    ]);
  });

  return cerQueue;
}
import { ai } from '../lib/unified-ai-client';
