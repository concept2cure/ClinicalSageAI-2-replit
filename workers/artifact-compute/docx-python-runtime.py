"""
docx-python isolated runtime contract.
Input: JSON file path argument with title/content/output_path.
Output: writes JSON payload to output_path.
"""

import base64
import json
import os
import sys
from datetime import datetime


def render_docx(payload: dict) -> dict:
    title = payload.get("title", "Untitled")
    content = payload.get("content", "")
    output_type = "invalid" if payload.get("force_invalid_output") else "docx"
    blob = f"{title}\n\n{content}".encode("utf-8")

    return {
        "output_type": output_type,
        "file_name": f"{title.lower().replace(' ', '_')}.docx.txt",
        "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content_base64": base64.b64encode(blob).decode("ascii"),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "network": "disabled" if os.getenv("ARTIFACT_COMPUTE_NO_NETWORK") == "1" else "unknown",
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("missing input path", file=sys.stderr)
        return 2

    input_path = sys.argv[1]
    with open(input_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    result = render_docx(payload)
    output_path = payload.get("output_path")
    if not output_path:
        print("missing output path", file=sys.stderr)
        return 2

    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(result, out)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
