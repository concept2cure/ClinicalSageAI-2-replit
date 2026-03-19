import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import { getOpenAIClient } from '../services/openai-client';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1) Configure OpenAI
const openai = getOpenAIClient();

// 2) Paths
const METADATA_FILE = path.join(__dirname, '../vault/metadata.json');
const OUTPUT_FILE = path.join(__dirname, 'embeddings.json');

// 3) Helpers
async function chunkText(text, maxLen = 1000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    // try to cut at paragraph break
    const slice = text.slice(start, end);
    const lastBreak = slice.lastIndexOf('\n\n');
    if (lastBreak > 200) end = start + lastBreak;
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

// 4) Main indexing
async function buildIndex() {
  console.log('⏳ Loading metadata...');

  // Create metadata.json if it doesn't exist with some sample data
  if (!fs.existsSync(METADATA_FILE)) {
    console.log('⚠️ metadata.json not found, creating sample file...');

    // Create the vault directory if it doesn't exist
    const vaultDir = path.join(__dirname, '../vault');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const sampleMetadata = {
      documents: [
        {
          id: 'sample-doc-1',
          path: 'sample.pdf',
          title: 'Sample Regulatory Document',
          author: 'Concept2Cure',
          date: '2025-04-29',
          type: 'guidance',
        },
      ],
    };

    fs.writeFileSync(METADATA_FILE, JSON.stringify(sampleMetadata, null, 2));

    // Copy a sample PDF if one exists in attached_assets
    const samplePdfPath = path.join(
      process.cwd(),
      'attached_assets',
      'ICH_Q2(R2)_Guideline_2023_1130.pdf'
    );
    if (fs.existsSync(samplePdfPath)) {
      fs.copyFileSync(samplePdfPath, path.join(vaultDir, 'sample.pdf'));
      console.log('✅ Copied sample PDF to vault directory');
    } else {
      console.log('⚠️ No sample PDF found in attached_assets, please add one manually');
      return;
    }
  }

  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
  const embeddings = [];

  if (!metadata.documents || metadata.documents.length === 0) {
    console.log('⚠️ No documents found in metadata.json');
    return;
  }

  for (const doc of metadata.documents) {
    const filePath = path.join(__dirname, '../vault', doc.path);
    console.log(`📄 Parsing PDF: ${doc.id} → ${doc.path}`);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ File not found: ${filePath}, skipping...`);
      continue;
    }

    const dataBuffer = fs.readFileSync(filePath);
    try {
      const { text } = await pdfParse(dataBuffer);

      // For demo purposes, only process the first 5 chunks
      const chunks = await chunkText(text);
      const maxChunks = 5;
      const chunksToProcess = chunks.slice(0, maxChunks);
      console.log(
        `Processing first ${chunksToProcess.length} of ${chunks.length} chunks (demo mode)`
      );

      for (let i = 0; i < chunksToProcess.length; i++) {
        const chunk = chunks[i];
        process.stdout.write(`  • embedding chunk ${i + 1}/${chunksToProcess.length}…\r`);

        try {
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: chunk,
          });

          embeddings.push({
            docId: doc.id,
            chunkId: i,
            text: chunk,
            embedding: embeddingResponse.data[0].embedding,
          });
        } catch (embeddingError) {
          console.error(
            `\n❌ Error creating embedding for chunk ${i + 1}: ${embeddingError.message}`
          );
          // Continue with next chunk
        }
      }
      console.log(
        `\n✅ Indexed ${chunksToProcess.length} chunks for ${doc.id} (out of ${chunks.length} total chunks)`
      );
    } catch (pdfError) {
      console.error(`\n❌ Error parsing PDF for ${doc.id}: ${pdfError.message}`);
      // Continue with next document
    }
  }

  if (embeddings.length > 0) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(embeddings, null, 2));
    console.log(`🎉 Done! Wrote ${embeddings.length} embeddings to ${OUTPUT_FILE}`);
  } else {
    console.log('⚠️ No embeddings generated, skipping output file creation');
  }
}

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

buildIndex().catch(err => {
  console.error('❌ Indexing failed:', err);
  process.exit(1);
});
