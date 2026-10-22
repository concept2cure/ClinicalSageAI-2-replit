"""Private runtime credential relay. Never print or persist environment values."""
import os
import pathlib
import urllib.parse

ROOT = pathlib.Path('/workspace/ClinicalSageAI-2-replit')
NODE22 = '/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin'
DATABASE = 'platform_ci_sharing_blank_20261014_d25f4a7b'

def runtime_environment():
    launcher = int(pathlib.Path('/tmp/platform-workflow-server-pid.txt').read_text().strip())
    children = pathlib.Path(f'/proc/{launcher}/task/{launcher}/children')
    candidates = [launcher] + ([int(item) for item in children.read_text().split()] if children.exists() else [])
    runtime = next((pid for pid in reversed(candidates) if pathlib.Path(f'/proc/{pid}/cmdline').exists()
                    and b'server/index.ts' in pathlib.Path(f'/proc/{pid}/cmdline').read_bytes()), None)
    if runtime is None:
        raise RuntimeError('Recorded owned main runtime is not alive; refusing credential fallback.')
    environment = dict(part.decode().split('=', 1) for part in pathlib.Path(f'/proc/{runtime}/environ').read_bytes().split(b'\0') if b'=' in part)
    app_url = environment.get('APP_DATABASE_URL')
    if not app_url:
        raise RuntimeError('Owned app-role database configuration is absent.')
    parsed = urllib.parse.urlsplit(app_url)
    if urllib.parse.unquote(parsed.username or '') != 'app_service':
        raise RuntimeError('Refusing a database owner or alternate runtime role.')
    qa_url = urllib.parse.urlunsplit(parsed._replace(path='/' + DATABASE))
    environment['DATABASE_URL'] = qa_url
    environment['APP_DATABASE_URL'] = qa_url
    environment['TEST_DATABASE_URL'] = qa_url
    # Clear configured cloud/local model lanes; empty values also prevent dotenv fallback.
    provider_names = ['OPENAI', 'ANTHROPIC', 'KIMI', 'MOONSHOT', 'GROQ', 'MISTRAL', 'COHERE', 'HUGGING', 'TOGETHER', 'PERPLEXITY', 'NVIDIA', 'DEEPSEEK', 'GEMINI', 'VERTEX', 'BEDROCK', 'OLLAMA', 'EMBEDDING', 'LOCAL_AI']
    for name in list(environment):
        if any(provider in name.upper() for provider in provider_names):
            environment[name] = ''
    for name in ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'EMBEDDING_PROVIDER', 'EMBEDDING_LOCAL_BASE_URL', 'EMBEDDING_LOCAL_MODEL', 'LOCAL_AI_BASE_URL', 'OLLAMA_BASE_URL', 'AI_LOCAL_BASE_URL', 'AI_BASE_URL', 'AI_ENDPOINT', 'AI_API_ENDPOINT', 'LLM_BASE_URL', 'MODEL_BASE_URL', 'VLLM_BASE_URL', 'LMSTUDIO_BASE_URL', 'AI_PROVIDER_PLACEMENT_APPROVALS', 'AI_GATEWAY_DETERMINISTIC', 'DETERMINISTIC_MODE']:
        environment[name] = ''
    environment.update(
        AI_BEDROCK_ENABLED='false', AI_VERTEX_ENABLED='false', AI_LOCAL_ENABLED='false',
        ALLOWED_ORIGINS='http://127.0.0.1:5001', PORT='5001', NODE_ENV='development', ALLOW_DEV_AUTH='1',
        RLS_ENFORCE='on', SKIP_DB_STARTUP_TEST='true', NODE_OPTIONS='--max-old-space-size=4096',
        SECURITY_HEALTH_DISABLE_SCHEDULER='true', ANA_DIGEST_HEARTBEAT_DISABLED='true', SCHEDULE_OF_EVENTS_SWEEP_DISABLED='true', TASK_DUE_SWEEP_DISABLED='true',
        ENABLE_DRIFT_SENTINEL='false', ENABLE_AUDIT_CHAIN_CHECK='false', ENABLE_RETENTION_SWEEP='false', ENABLE_CORPUS_INGESTION='false', ENABLE_REGULATORY_HORIZON_SCAN='false', ENABLE_EXTERNAL_INTELLIGENCE='false',
        AUDIT_TRAIL_ENABLED='false', OTEL_ENABLED='false', ENABLE_COLLAB_CRDT='false', ENABLE_EXPERIMENTAL_ROUTES='false', ENABLE_DEMO_ROUTES='false', REDIS_URL='', REDIS_TLS_URL='',
    )
    environment['PATH'] = NODE22 + ':' + environment.get('PATH', '')
    return environment, runtime
