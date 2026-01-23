from __future__ import annotations

import math
import uuid
from typing import Iterable


def ensure_request_id(x_request_id: str | None) -> str:
    if x_request_id and x_request_id.strip():
        return x_request_id.strip()
    return str(uuid.uuid4())


def vector_literal(vec: Iterable[float]) -> str:
    # pgvector expects: [0.1,0.2,...]
    # Keep formatting stable and compact.
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"


def l2_norm(vec: list[float]) -> float:
    return math.sqrt(sum(x * x for x in vec))


def normalize(vec: list[float]) -> list[float]:
    n = l2_norm(vec)
    if n == 0:
        return vec
    return [x / n for x in vec]
