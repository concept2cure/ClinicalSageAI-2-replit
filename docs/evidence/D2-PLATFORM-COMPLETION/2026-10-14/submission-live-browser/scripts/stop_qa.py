"""Stop only this newly owned QA process group after root grant; never the original server."""
import argparse
import json
import os
import pathlib
import signal
import time

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root-approved', action='store_true')
    args = parser.parse_args()
    if not args.root_approved:
        raise SystemExit('Root must authorize the owned QA cleanup step first.')
    folder = pathlib.Path(__file__).resolve().parent
    runtime = pathlib.Path((folder / 'current-runtime-path.txt').read_text().strip())
    metadata = json.loads((runtime / 'process-metadata.json').read_text())
    pid = metadata['pid']
    if pid == metadata['mainRuntimePidPreserved']:
        raise SystemExit('Refusing to stop the preserved main runtime.')
    command = pathlib.Path(f'/proc/{pid}/cmdline')
    if command.exists() and str(folder / 'qa-server.mts').encode() not in command.read_bytes():
        raise SystemExit('PID no longer names this QA composition; refusing cleanup.')
    if command.exists():
        os.killpg(pid, signal.SIGTERM)
    deadline = time.monotonic() + 20
    while command.exists() and time.monotonic() < deadline:
        time.sleep(0.25)
    result = {'qaPid': pid, 'processStopped': not command.exists(), 'preservedMainRuntimePid': metadata['mainRuntimePidPreserved'], 'originalReportPackProofUntouched': True}
    (runtime / 'stop.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
