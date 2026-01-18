const apiKey = Deno.env.get('PINECONE_API_KEY');
const indexName = Deno.env.get('PINECONE_INDEX_NAME') || 'regulatory-precedents';
const env = Deno.env.get('PINECONE_ENVIRONMENT') || 'us-east-1-aws';

if (!apiKey) {
  console.error('Missing PINECONE_API_KEY');
  Deno.exit(1);
}

const parseEnv = (value: string) => {
  const parts = value.split('-');
  const cloud = parts[parts.length - 1];
  const region = parts.slice(0, parts.length - 1).join('-');
  return { cloud, region };
};

const { cloud, region } = parseEnv(env);

const headers = {
  'Api-Key': apiKey,
  'Content-Type': 'application/json',
};

const listIndexes = async () => {
  const response = await fetch('https://api.pinecone.io/indexes', { headers });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
};

const createIndex = async () => {
  const response = await fetch('https://api.pinecone.io/indexes', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: indexName,
      dimension: 3072,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud,
          region,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
};

try {
  const indexes = await listIndexes();
  const exists = (indexes?.indexes || []).some((idx: any) => idx?.name === indexName);

  if (exists) {
    console.log(`Pinecone index already exists: ${indexName}`);
  } else {
    await createIndex();
    console.log(`Pinecone index created: ${indexName}`);
  }
} catch (error) {
  console.error('Pinecone init failed', error?.message || error);
  Deno.exit(1);
}
