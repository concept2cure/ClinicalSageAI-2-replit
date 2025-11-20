// Test script for retrieveContext function

import { retrieveContext, isReady } from './brain/vaultRetriever.js';

async function testRetrieve() {
  try {
    console.log('Testing vault retriever...');

    // Check if embeddings are loaded
    const ready = isReady();
    console.log(`Is retriever ready? ${ready}`);

    if (!ready) {
      console.error('Embeddings are not loaded. Please run the indexer first.');
      return;
    }

    // Test the retrieval function
    console.log("Running test retrieval for 'Clinical safety data'...");
    const results = await retrieveContext('Clinical safety data', 3);

    console.log(`Retrieved ${results.length} results:`);
    results.forEach((item, i) => {
      console.log(`\nResult ${i + 1} (score: ${item.score.toFixed(4)}):`);
      console.log(`DocID: ${item.docId}`);
      console.log(`ChunkID: ${item.chunkId}`);
      console.log(`Text: ${item.text.substring(0, 150)}...`);
    });
  } catch (error) {
    console.error('Error testing retrieval:', error);
  }
}

testRetrieve();
