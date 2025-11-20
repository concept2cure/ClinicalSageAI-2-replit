import { Pool } from 'pg';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('Starting embedding backfill process...');

  try {
    // Get all devices without embeddings
    const devices = (
      await db.query(`SELECT id, description FROM predicate_devices WHERE embedding IS NULL`)
    ).rows;
    console.log(`Found ${devices.length} devices without embeddings`);

    let processedCount = 0;

    // Process each device
    for (let { id, description } of devices) {
      if (!description) {
        console.log(`Skipping device ${id} - no description available`);
        continue;
      }

      try {
        // Generate embedding using OpenAI
        const embed = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: description,
        });

        // Get the embedding array
        const embeddingArray = embed.data[0].embedding;

        // Format the embedding as a PostgreSQL vector literal string
        // This ensures the vector starts with "[" as required by PostgreSQL
        const formattedVector = `[${embeddingArray.join(',')}]`;

        // Update the database with the properly formatted embedding
        await db.query(
          `UPDATE predicate_devices SET embedding=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [id, formattedVector]
        );

        console.log(`Successfully processed device ${id}`);
        processedCount++;

        if (processedCount % 10 === 0) {
          console.log(`Processed ${processedCount}/${devices.length} devices`);
        }
      } catch (err) {
        console.error(`Error processing device ${id}:`, err);
      }
    }

    console.log(
      `Completed embedding backfill. Processed ${processedCount}/${devices.length} devices.`
    );
  } catch (error) {
    console.error('Error during embedding backfill:', error);
  } finally {
    // Close the database connection
    await db.end();
  }
}

// Run the main function
main().catch(err => {
  console.error('Fatal error during backfill:', err);
  process.exit(1);
});
