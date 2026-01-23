import dotenv from 'dotenv';
import { Client } from 'pg';
import OpenAI from 'openai';

dotenv.config();

const results = [];
const failures = [];

const logResult = (label, ok, detail) => {
	results.push({ label, ok, detail });
	if (!ok) failures.push(label);
};

const getEnv = (key) => process.env[key];

const checkEnv = () => {
	logResult('ENV loaded', true, 'dotenv loaded');
	logResult('DATABASE_URL', Boolean(getEnv('DATABASE_URL')), getEnv('DATABASE_URL') ? 'set' : 'missing');
	logResult('OPENAI_API_KEY', Boolean(getEnv('OPENAI_API_KEY')), getEnv('OPENAI_API_KEY') ? 'set' : 'missing');
	logResult('KIMI_API_KEY', Boolean(getEnv('KIMI_API_KEY')), getEnv('KIMI_API_KEY') ? 'set' : 'missing');

	const dbUrl = getEnv('DATABASE_URL');
	if (dbUrl?.startsWith('file:')) {
		logResult('DATABASE_URL format', false, 'SQLite file URL detected; expected postgresql://');
	} else if (dbUrl?.startsWith('postgresql://') || dbUrl?.startsWith('postgres://')) {
		logResult('DATABASE_URL format', true, 'PostgreSQL URL');
	} else if (dbUrl) {
		logResult('DATABASE_URL format', false, 'Unrecognized URL scheme');
	}
};

const checkDatabase = async () => {
	const dbUrl = getEnv('DATABASE_URL');
	if (!dbUrl || dbUrl.startsWith('file:')) return;

	const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
	try {
		await client.connect();
		const now = await client.query('SELECT NOW()');
		logResult('Neon DB connect', true, now.rows[0]?.now ? 'connected' : 'connected');

		const vectorCheck = await client.query(
			"SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') as enabled"
		);
		const enabled = Boolean(vectorCheck.rows[0]?.enabled);
		logResult('pgvector enabled', enabled, enabled ? 'enabled' : 'missing');
	} catch (error) {
		logResult('Neon DB connect', false, error?.message || String(error));
	} finally {
		await client.end().catch(() => undefined);
	}
};

const checkOpenAI = async () => {
	const apiKey = getEnv('OPENAI_API_KEY');
	if (!apiKey) return;
	try {
		const client = new OpenAI({ apiKey });
		await client.models.list();
		logResult('OpenAI API', true, 'reachable');
	} catch (error) {
		logResult('OpenAI API', false, error?.message || String(error));
	}
};

const checkKimi = async () => {
	const apiKey = getEnv('KIMI_API_KEY');
	if (!apiKey) return;
	try {
		const client = new OpenAI({ apiKey, baseURL: 'https://api.moonshot.cn/v1' });
		await client.models.list();
		logResult('Kimi API', true, 'reachable');
	} catch (error) {
		logResult('Kimi API', false, error?.message || String(error));
	}
};

const printSummary = () => {
	results.forEach(item => {
		const status = item.ok ? '✓' : '✗';
		const detail = item.detail ? ` (${item.detail})` : '';
		console.log(`${status} ${item.label}${detail}`);
	});

	if (failures.length) {
		console.log('\nSuggestions:');
		if (failures.includes('DATABASE_URL')) {
			console.log('- Set DATABASE_URL to your Neon connection string.');
		}
		if (failures.includes('DATABASE_URL format')) {
			console.log('- Use a postgresql:// URL, not a file: SQLite path.');
		}
		if (failures.includes('Neon DB connect')) {
			console.log('- Verify Neon host/user/password and network access.');
		}
		if (failures.includes('pgvector enabled')) {
			console.log('- Run: CREATE EXTENSION IF NOT EXISTS vector;');
		}
		if (failures.includes('OPENAI_API_KEY') || failures.includes('OpenAI API')) {
			console.log('- Set a valid OPENAI_API_KEY and confirm it has access.');
		}
		if (failures.includes('KIMI_API_KEY') || failures.includes('Kimi API')) {
			console.log('- Set a valid KIMI_API_KEY and confirm it has access.');
		}
		process.exitCode = 1;
	}
};

const run = async () => {
	checkEnv();
	await checkDatabase();
	await checkOpenAI();
	await checkKimi();
	printSummary();
};

run();
