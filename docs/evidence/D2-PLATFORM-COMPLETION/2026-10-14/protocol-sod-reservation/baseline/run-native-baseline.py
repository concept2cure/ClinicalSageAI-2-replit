"""Use the existing owned server's private environment, never print credentials."""
import os, pathlib, subprocess
root = pathlib.Path('/workspace/ClinicalSageAI-2-replit')
launcher = int(pathlib.Path('/tmp/platform-workflow-server-pid.txt').read_text().strip())
children_file = pathlib.Path(f'/proc/{launcher}/task/{launcher}/children')
children = [int(item) for item in children_file.read_text().split()] if children_file.exists() else []
runtime = next((pid for pid in reversed([launcher, *children])
                if pathlib.Path(f'/proc/{pid}/cmdline').exists()
                and b'server/index.ts' in pathlib.Path(f'/proc/{pid}/cmdline').read_bytes()), None)
if runtime is None:
    raise SystemExit('No recorded owned development runtime; refusing credential fallback.')
raw = pathlib.Path(f'/proc/{runtime}/environ').read_bytes()
task_env = dict(item.decode().split('=', 1) for item in raw.split(b'\0') if b'=' in item)
if not task_env.get('DATABASE_URL') or not task_env.get('APP_DATABASE_URL'):
    raise SystemExit('Owned native owner/runtime database settings are required.')
task_env['TEST_DATABASE_URL'] = task_env['DATABASE_URL']
task_env['NODE_ENV'] = 'test'
task_env['RLS_ENFORCE'] = 'on'
task_env['SKIP_DB_STARTUP_TEST'] = 'true'
task_env['NODE_OPTIONS'] = '--max-old-space-size=4096'
task_env['PATH'] = '/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin:' + task_env.get('PATH', '')
log = pathlib.Path('/tmp/protocol-sod-baseline-red.txt')
fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'wb') as output:
    result = subprocess.run(['/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin/node',
        'node_modules/vitest/vitest.mjs', 'run', '--config', '/tmp/protocol-sod-baseline.config.mjs'],
        cwd=root, env=task_env, stdout=output, stderr=subprocess.STDOUT, timeout=150)
print('Native baseline runner exit:', result.returncode, '; protected evidence log:', log)
raise SystemExit(result.returncode)
