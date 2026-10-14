import os
import pathlib
import subprocess
import urllib.parse

root = pathlib.Path('/workspace/ClinicalSageAI-2-replit')
launcher = int(pathlib.Path('/tmp/platform-workflow-server-pid.txt').read_text().strip())
children = pathlib.Path(f'/proc/{launcher}/task/{launcher}/children')
pids = [launcher] + ([int(p) for p in children.read_text().split()] if children.exists() else [])
runtime = next((p for p in reversed(pids) if pathlib.Path(f'/proc/{p}/cmdline').exists()
                and b'server/index.ts' in pathlib.Path(f'/proc/{p}/cmdline').read_bytes()), None)
if runtime is None:
    raise SystemExit('No owned runtime; refusing credential fallback.')
# Relay the authorized owned process configuration privately, never print it.
env = dict(x.decode().split('=', 1) for x in pathlib.Path(f'/proc/{runtime}/environ').read_bytes().split(b'\0') if b'=' in x)
if not env.get('DATABASE_URL') or not env.get('APP_DATABASE_URL'):
    raise SystemExit('Missing private native owner/runtime configuration.')
qa_database = 'platform_ci_sharing_blank_20261014_d25f4a7b'
owner_parts = urllib.parse.urlsplit(env['DATABASE_URL'])
runtime_parts = urllib.parse.urlsplit(env['APP_DATABASE_URL'])
if runtime_parts.username != 'app_service' or owner_parts.hostname != runtime_parts.hostname or (owner_parts.port or 5432) != (runtime_parts.port or 5432):
    raise SystemExit('Owned owner/runtime target posture does not match.')
owner_url = urllib.parse.urlunsplit(owner_parts._replace(path='/' + qa_database))
runtime_url = urllib.parse.urlunsplit(runtime_parts._replace(path='/' + qa_database))
for key in ['DATABASE_URL', 'DATABASE_OWNER_URL', 'DATABASE_URL_ADMIN', 'NEON_DATABASE_URL', 'NEON_DATABASE_URL_ADMIN', 'DATABASE_NEON_NEW_SECRET', 'TEST_DATABASE_URL']:
    env[key] = owner_url
env.update(APP_DATABASE_URL=runtime_url, RUNTIME_DB_ROLE='app_service', RLS_ENFORCE='on', NODE_ENV='test',
           SKIP_DB_STARTUP_TEST='true', NODE_OPTIONS='--max-old-space-size=4096')
remote_provider_variables = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_BASE',
    'MOONSHOT_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_BASE_URL', 'KIMI_BASE_URL',
    'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_VERSION',
    'LOCAL_AI_API_KEY', 'LOCAL_AI_BASE_URL', 'LITELLM_API_KEY', 'LITELLM_BASE_URL',
    'EMBEDDING_LOCAL_API_KEY', 'EMBEDDING_LOCAL_BASE_URL', 'EMBEDDING_PROVIDER',
    'EMBEDDING_MODEL', 'EMBEDDING_LOCAL_MODEL', 'EMBEDDING_LOCAL_NATIVE_DIMENSIONS',
    'AI_VERTEX_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
    'COHERE_API_KEY', 'VOYAGE_API_KEY', 'MISTRAL_API_KEY', 'GROQ_API_KEY',
    'DEEPSEEK_API_KEY', 'TOGETHER_API_KEY', 'PERPLEXITY_API_KEY', 'XAI_API_KEY',
]
for key in remote_provider_variables:
    env[key] = ''
for key in ['AI_LOCAL_ENABLED', 'AI_BEDROCK_ENABLED', 'AI_VERTEX_ENABLED', 'LOCAL_AI_SUPPORTS_TOOLS']:
    env[key] = 'false'
env['APP_SERVICE_DB_PASSWORD'] = ''
env['PATH'] = '/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin:' + env.get('PATH', '')
targets = [
    'tests/db/document-catalog.dbtest.ts', 'tests/db/document-catalog-recall.dbtest.ts',
    'tests/db/document-catalog-role.dbtest.ts', 'tests/db/document-catalog-governed.dbtest.ts',
    'server/mcp/__tests__/mcp-connector.dbtest.ts',
]
log = pathlib.Path('/tmp/catalog-native-fixtures-first.txt')
fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'wb') as output:
    result = subprocess.run(['node_modules/.bin/vitest', 'run', '--config', 'vitest.db.config.ts', *targets],
                            cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=600)
print('Actual five-file restricted native fixture result:', result.returncode, '; protected log:', log)
raise SystemExit(result.returncode)
