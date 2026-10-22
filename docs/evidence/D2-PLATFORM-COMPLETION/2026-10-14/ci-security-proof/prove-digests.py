"""Recompute the seven reviewed manifest matches without emitting their values."""
from pathlib import Path
import hashlib
import json
import re
import subprocess


def git_bytes(revision: str, source_path: str) -> bytes:
    return subprocess.check_output(["git", "show", revision + ":" + source_path])


proof_path = Path(__file__).with_name("digest-proof.json")
reviewed = json.loads(proof_path.read_text())
assert len(reviewed) == 7, "This proof is limited to the seven reviewed findings"
results = []
for item in reviewed:
    commit, manifest_path, line_number = item["Commit"], item["File"], item["StartLine"]
    subprocess.run(["git", "merge-base", "--is-ancestor", commit, "origin/concept2cure-v2"], check=True)
    manifest_text = git_bytes(commit, manifest_path).decode()
    line = manifest_text.splitlines()[line_number - 1]
    match = re.fullmatch(r'\s*"([^"]+)": "([0-9a-f]{64})",?\s*', line)
    assert match is not None, "The reviewed line is not an exact source-path SHA mapping"
    source_path, candidate = match.groups()
    assert source_path == item["sourcePath"], "The reviewed source path changed"
    source_bytes = git_bytes(commit, source_path)
    assert hashlib.sha256(source_bytes).hexdigest() == candidate, "The finding is not the exact historical source SHA"
    blob = subprocess.check_output(["git", "rev-parse", commit + ":" + source_path]).decode().strip()
    assert blob == item["historicalSourceBlob"], "The reviewed historical source blob changed"
    assert len(source_bytes) == item["sourceByteCount"], "The reviewed source length changed"
    manifest = json.loads(manifest_text)
    capture_head = manifest.get("head") or manifest.get("baseCommit")
    capture_matches = None
    if capture_head:
        capture_matches = hashlib.sha256(git_bytes(capture_head, source_path)).hexdigest() == candidate
        assert capture_matches, "The explicit capture-head source SHA does not match"
    results.append({
        "fingerprint": item["Fingerprint"],
        "sourcePath": source_path,
        "sourceByteCount": len(source_bytes),
        "historicalSourceBlob": blob,
        "matchesExactFileBytesAtManifestCommit": True,
        "manifestCaptureHead": capture_head,
        "matchesSourceAtCaptureHead": capture_matches,
    })

print(json.dumps({"reviewedCount": len(results), "allProved": True, "results": results}, indent=2))
