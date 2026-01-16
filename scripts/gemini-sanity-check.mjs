#!/usr/bin/env node

/**
 * Gemini sanity check (NO secrets printed)
 * - Verifies whether Gemini is enabled on the local server
 * - Proves which provider handled a /api/ask-lumen call via providerUsed
 * - Optionally validates the key directly against Google Generative Language API
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/gemini-sanity-check.mjs
 *   # or put GEMINI_API_KEY in .env.local (gitignored) and run `npm run dev` first
 */

const LOCAL_BASE = process.env.LOCAL_BASE || 'http://localhost:5000';

function maskKey(key) {
  if (!key) return '(missing)';
  if (key.length <= 8) return '********';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const keyLabel = process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : 'none';

  console.log('[gemini-check] Starting');
  console.log(`[gemini-check] Key source: ${keyLabel}`);
  console.log(`[gemini-check] Key present: ${Boolean(geminiKey)} (${maskKey(geminiKey)})`);

  // 1) Check local server AI status (best signal the app will use Gemini)
  try {
    const statusResp = await fetch(`${LOCAL_BASE}/api/ai/status`, { method: 'GET' });
    const statusJson = await safeJson(statusResp);

    if (!statusResp.ok || !statusJson) {
      console.log(`[gemini-check] /api/ai/status: HTTP ${statusResp.status} (no JSON)`);
    } else {
      console.log('[gemini-check] /api/ai/status: ok');
      console.log(`  defaultProvider: ${statusJson.defaultProvider}`);
      console.log(`  providers.gemini.enabled: ${statusJson?.providers?.gemini?.enabled}`);
      console.log(`  providers.gemini.defaultModel: ${statusJson?.providers?.gemini?.defaultModel}`);
      console.log(`  providers.gemini.fallbackModel: ${statusJson?.providers?.gemini?.fallbackModel}`);
    }
  } catch (e) {
    console.log(`[gemini-check] /api/ai/status: not reachable (${String(e?.message || e)})`);
    console.log('  Tip: start the app with `npm run dev` and re-run this check.');
  }

  // 2) Prove which provider actually answered /api/ask-lumen
  try {
    const lumenResp = await fetch(`${LOCAL_BASE}/api/ask-lumen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Reply with only: OK',
        context: 'regulatory_affairs',
        model: 'gemini',
      }),
    });

    const lumenJson = await safeJson(lumenResp);

    if (!lumenResp.ok || !lumenJson) {
      console.log(`[gemini-check] /api/ask-lumen: HTTP ${lumenResp.status} (no JSON)`);
    } else {
      console.log('[gemini-check] /api/ask-lumen: ok');
      console.log(`  success: ${lumenJson.success}`);
      console.log(`  providerUsed: ${lumenJson.providerUsed || lumenJson.provider || '(missing)'}`);
      console.log(`  modelUsed: ${lumenJson.modelUsed || '(missing)'}`);
      const snippet = String(lumenJson.response || '').replace(/\s+/g, ' ').slice(0, 120);
      console.log(`  response: ${snippet}${snippet.length >= 120 ? '…' : ''}`);
    }
  } catch (e) {
    console.log(`[gemini-check] /api/ask-lumen: not reachable (${String(e?.message || e)})`);
  }

  // 3) Optional: validate the key directly against Generative Language API
  if (!geminiKey) {
    console.log('[gemini-check] Skipping direct API call (no key in environment).');
    return;
  }

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const directResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Explain how AI works in a few words.' }] }],
      }),
    });

    const directJson = await safeJson(directResp);

    if (!directResp.ok) {
      console.log(`[gemini-check] Direct Gemini API: HTTP ${directResp.status}`);
      // Print error payload WITHOUT secrets (key never included in payload)
      console.log(JSON.stringify(directJson || { error: 'No JSON body' }, null, 2));
      return;
    }

    const text = directJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[gemini-check] Direct Gemini API: ok');
    console.log(`  text: ${String(text || '').trim().slice(0, 200)}`);
  } catch (e) {
    console.log(`[gemini-check] Direct Gemini API failed: ${String(e?.message || e)}`);
  }
}

main().catch((e) => {
  console.error('[gemini-check] Fatal:', e);
  process.exitCode = 1;
});
