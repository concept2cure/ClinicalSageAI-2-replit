const apiKey = Deno.env.get('PINECONE_API_KEY');
const indexName = Deno.env.get('PINECONE_INDEX_NAME') || 'regulatory-precedents';

if (!apiKey) {
  console.error('Missing PINECONE_API_KEY');
  Deno.exit(1);
}

const response = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
  headers: {
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  },
});

if (!response.ok) {
  console.error('Failed to fetch Pinecone metrics', await response.text());
  Deno.exit(1);
}

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
