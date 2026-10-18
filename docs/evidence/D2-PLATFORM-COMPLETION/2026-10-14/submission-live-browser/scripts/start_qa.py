"""Do not execute until the root post-compiler grant; original report-pack files stay untouched."""
import argparse
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import time
import urllib.request
from owned_environment import ROOT, NODE22, DATABASE, runtime_environment

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root-approved', action='store_true')
    args = parser.parse_args()
    if not args.root_approved:
        raise SystemExit('Prepared only. Root must grant this post-compiler QA execution first.')
    os.umask(0o077)
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 5001)) == 0:
            raise SystemExit('Port 5001 is already occupied; do not replace another owned process.')
    folder = pathlib.Path(__file__).resolve().parent
    output = folder / ('runtime-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid()))
    output.mkdir(mode=0o700)
    environment, original_runtime = runtime_environment()
    environment['C2C_SUBMISSION_QA_OUTPUT'] = str(output)
    entry = folder / 'qa-server.mts'
    log = output / 'server.log'
    with log.open('wb') as stream:
        process = subprocess.Popen([NODE22 + '/node', 'node_modules/tsx/dist/cli.mjs', str(entry)], cwd=ROOT, env=environment, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
    metadata = {'pid': process.pid, 'mainRuntimePidPreserved': original_runtime, 'port': 5001, 'database': DATABASE, 'runtimeRole': 'app_service', 'allowedOrigin': 'http://127.0.0.1:5001', 'composition': str(entry), 'compositionSha256': hashlib.sha256(entry.read_bytes()).hexdigest(), 'output': str(output), 'qualification': 'Isolated actual-route/auth/Vite development-auth browser composition, not full boot/MFA/agency readiness.', 'auth': 'Existing QA owner through canonical dev-login; no password change or stored session token.', 'allModelKeysAndLocalEndpointsBlank': True, 'rlsEnforced': True, 'requestPosture': 'No browser request instrumentation or diagnostic route. Boot role posture and separately retained native actual request-q proof only.'}
    (output / 'process-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    (folder / 'current-runtime-path.txt').write_text(str(output) + '\n')
    deadline = time.monotonic() + 50
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise SystemExit('QA process exited; inspect the private log without printing credentials.')
        try:
            with urllib.request.urlopen('http://127.0.0.1:5001/healthz', timeout=2) as health:
                if health.status == 200:
                    print(json.dumps({'pid': process.pid, 'port': 5001, 'health': 200, 'output': str(output)}))
                    return
        except Exception:
            time.sleep(0.5)
    raise SystemExit('QA health did not settle within the bounded 50-second launch window.')

if __name__ == '__main__':
    main()
