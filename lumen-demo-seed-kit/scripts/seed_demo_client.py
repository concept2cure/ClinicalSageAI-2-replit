#!/usr/bin/env python3
"""Seed a demo client (tenant), user, and pipeline into your platform.

This script is intentionally configurable because every platform has different API shapes.

How it works (default):
- Upsert Client by slug
- Upsert Users by email, then optionally assign a license
- Upsert Programs by code
- Upsert Studies by registry_id (NCT, etc.)
- Upsert Documents by source_url
- Optionally upsert onboarding (if endpoint exists)

Adjust `api_map.example.json` to match your platform's admin API.

Usage:
  python scripts/seed_demo_client.py --seed-file seed-data/lumen_bioscience.seed.json --api-map scripts/api_map.example.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests


ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)\}")


def _interpolate_env(value: str) -> str:
    """Replace ${VARS} in strings with environment variables."""

    def _replace(match: re.Match[str]) -> str:
        var = match.group(1)
        if var not in os.environ:
            raise KeyError(f"Missing required environment variable: {var}")
        return os.environ[var]

    return ENV_PATTERN.sub(_replace, value)


def interpolate(obj: Any) -> Any:
    if isinstance(obj, str):
        return _interpolate_env(obj)
    if isinstance(obj, list):
        return [interpolate(x) for x in obj]
    if isinstance(obj, dict):
        return {k: interpolate(v) for k, v in obj.items()}
    return obj


@dataclass
class Endpoint:
    method: str
    path: str
    query_param: Optional[str] = None


@dataclass
class ApiMap:
    auth_header: str
    auth_scheme: str
    endpoints: Dict[str, Dict[str, Endpoint]]
    id_field: str
    list_items_field: str


def load_api_map(path: str) -> ApiMap:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    auth_header = raw.get("auth", {}).get("header", "Authorization")
    auth_scheme = raw.get("auth", {}).get("scheme", "Bearer")
    resp = raw.get("response", {})
    id_field = resp.get("id_field", "id")
    list_items_field = resp.get("list_items_field", "items")

    endpoints: Dict[str, Dict[str, Endpoint]] = {}
    for entity, actions in raw.get("endpoints", {}).items():
        endpoints[entity] = {}
        for action, spec in actions.items():
            endpoints[entity][action] = Endpoint(
                method=str(spec.get("method", "GET")).upper(),
                path=str(spec.get("path")),
                query_param=spec.get("query_param"),
            )

    return ApiMap(
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        endpoints=endpoints,
        id_field=id_field,
        list_items_field=list_items_field,
    )


def load_seed(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        seed = json.load(f)
    return interpolate(seed)


class Seeder:
    def __init__(self, base_url: str, token: str, api_map: ApiMap, dry_run: bool = False, timeout_s: int = 60):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.api_map = api_map
        self.dry_run = dry_run
        self.timeout_s = timeout_s

        self.session = requests.Session()
        self.session.headers.update(
            {
                self.api_map.auth_header: f"{self.api_map.auth_scheme} {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return self.base_url + path

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Any:
        url = self._url(path)
        if self.dry_run:
            print("[DRY-RUN]", method, url)
            if params:
                print("  params:", json.dumps(params, indent=2, sort_keys=True))
            if body is not None:
                print("  json:", json.dumps(body, indent=2, sort_keys=True)[:8000])
            return None

        resp = self.session.request(method, url, params=params, json=body, timeout=self.timeout_s)
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code} {method} {url}: {resp.text[:1000]}")
        if resp.content:
            try:
                return resp.json()
            except Exception:
                return resp.text
        return None

    def _extract_list(self, payload: Any) -> List[Dict[str, Any]]:
        if payload is None:
            return []
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if isinstance(payload, dict):
            if self.api_map.list_items_field in payload and isinstance(payload[self.api_map.list_items_field], list):
                return [x for x in payload[self.api_map.list_items_field] if isinstance(x, dict)]
            for k in ("data", "results"):
                if k in payload and isinstance(payload[k], list):
                    return [x for x in payload[k] if isinstance(x, dict)]
        return []

    def _extract_id(self, payload: Any) -> Optional[str]:
        if payload is None:
            return None
        if isinstance(payload, dict):
            v = payload.get(self.api_map.id_field)
            if v is not None:
                return str(v)
            for k in ("_id", "client_id", "user_id"):
                if k in payload:
                    return str(payload[k])
        return None

    def upsert(
        self,
        entity: str,
        natural_key_field: str,
        natural_key_value: str,
        body: Dict[str, Any],
        *,
        extra_list_params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[str], str]:
        """Upsert entity by natural key.

        Returns: (id, action) where action is 'created' | 'updated' | 'skipped'
        """
        if entity not in self.api_map.endpoints:
            raise KeyError(f"No endpoints configured for entity: {entity}")

        e = self.api_map.endpoints[entity]
        list_ep = e.get("list")
        create_ep = e.get("create")
        update_ep = e.get("update")

        if not (list_ep and create_ep and update_ep):
            raise KeyError(f"Entity '{entity}' requires list/create/update endpoints in api map")

        params: Dict[str, Any] = {}
        query_param = list_ep.query_param or natural_key_field
        params[query_param] = natural_key_value
        if extra_list_params:
            params.update(extra_list_params)

        existing_payload = self.request(list_ep.method, list_ep.path, params=params)
        existing_items = self._extract_list(existing_payload)

        existing: Optional[Dict[str, Any]] = None
        for item in existing_items:
            if str(item.get(natural_key_field, "")) == natural_key_value:
                existing = item
                break

        if existing is None and len(existing_items) == 1:
            existing = existing_items[0]

        if existing is None:
            created_payload = self.request(create_ep.method, create_ep.path, body=body)
            created_id = self._extract_id(created_payload)
            return created_id, "created"

        existing_id = self._extract_id(existing)
        if existing_id is None:
            return None, "skipped"

        update_path = update_ep.path.replace("{id}", str(existing_id))
        updated_payload = self.request(update_ep.method, update_path, body=body)
        updated_id = self._extract_id(updated_payload) or str(existing_id)
        return updated_id, "updated"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-file", required=True, help="Path to seed JSON")
    parser.add_argument("--api-map", required=True, help="Path to api_map JSON")
    parser.add_argument("--base-url", default=os.environ.get("PLATFORM_BASE_URL"), help="API base URL (or PLATFORM_BASE_URL)")
    parser.add_argument("--token", default=os.environ.get("PLATFORM_ADMIN_TOKEN"), help="Admin/API token (or PLATFORM_ADMIN_TOKEN)")
    parser.add_argument("--dry-run", action="store_true", help="Print requests but do not send")
    args = parser.parse_args()

    if not args.base_url:
        print("ERROR: Missing --base-url or PLATFORM_BASE_URL", file=sys.stderr)
        return 2
    if not args.token:
        print("ERROR: Missing --token or PLATFORM_ADMIN_TOKEN", file=sys.stderr)
        return 2

    api_map = load_api_map(args.api_map)
    seed = load_seed(args.seed_file)

    seeder = Seeder(args.base_url, args.token, api_map, dry_run=args.dry_run)

    created: List[str] = []
    updated: List[str] = []

    client_body = seed.get("client")
    if not isinstance(client_body, dict):
        raise ValueError("seed.client must be an object")

    client_slug = str(client_body.get("slug"))
    if not client_slug:
        raise ValueError("seed.client.slug is required")

    client_id, action = seeder.upsert("clients", "slug", client_slug, client_body)
    (created if action == "created" else updated).append(f"client:{client_slug}")
    print(f"Client {client_slug}: {action} (id={client_id})")

    users = seed.get("users", [])
    if not isinstance(users, list):
        raise ValueError("seed.users must be a list")

    user_ids_by_email: Dict[str, str] = {}
    for u in users:
        if not isinstance(u, dict):
            continue
        email = str(u.get("email", "")).strip()
        if not email:
            raise ValueError("Each user must include email")

        body = dict(u)
        body["client_id"] = client_id

        user_id, u_action = seeder.upsert(
            "users",
            "email",
            email,
            body,
            extra_list_params={"client_id": client_id} if client_id else None,
        )
        (created if u_action == "created" else updated).append(f"user:{email}")
        print(f"User {email}: {u_action} (id={user_id})")

        if user_id:
            user_ids_by_email[email] = user_id

        lic = u.get("license")
        if isinstance(lic, dict) and "licenses" in seeder.api_map.endpoints:
            assign_ep = seeder.api_map.endpoints["licenses"].get("assign")
            if assign_ep and user_id and client_id:
                lic_body = {
                    "client_id": client_id,
                    "user_id": user_id,
                    "license": lic,
                }
                seeder.request(assign_ep.method, assign_ep.path, body=lic_body)
                print(f"  License assignment requested for {email}")

    onboarding = seed.get("onboarding")
    if isinstance(onboarding, dict) and "onboarding" in seeder.api_map.endpoints and client_id:
        ob_ep = seeder.api_map.endpoints["onboarding"].get("upsert")
        if ob_ep:
            path = ob_ep.path.replace("{client_id}", str(client_id))
            seeder.request(ob_ep.method, path, body=onboarding)
            print("Onboarding: upserted")

    programs = seed.get("programs", [])
    if not isinstance(programs, list):
        raise ValueError("seed.programs must be a list")

    program_ids_by_code: Dict[str, str] = {}

    for p in programs:
        if not isinstance(p, dict):
            continue
        code = str(p.get("code", "")).strip()
        if not code:
            raise ValueError("Each program must include code")

        p_body = dict(p)
        p_body["client_id"] = client_id

        studies = p_body.pop("studies", [])

        program_id, p_action = seeder.upsert(
            "programs",
            "code",
            code,
            p_body,
            extra_list_params={"client_id": client_id} if client_id else None,
        )
        (created if p_action == "created" else updated).append(f"program:{code}")
        print(f"Program {code}: {p_action} (id={program_id})")

        if program_id:
            program_ids_by_code[code] = program_id

        if not isinstance(studies, list):
            continue

        for s in studies:
            if not isinstance(s, dict):
                continue
            registry_id = str(s.get("registry_id", "")).strip()
            if not registry_id:
                raise ValueError(f"Study in program {code} missing registry_id")

            s_body = dict(s)
            s_body["client_id"] = client_id
            if program_id:
                s_body["program_id"] = program_id

            documents = s_body.pop("documents", [])

            study_id, s_action = seeder.upsert(
                "studies",
                "registry_id",
                registry_id,
                s_body,
                extra_list_params={"client_id": client_id} if client_id else None,
            )
            (created if s_action == "created" else updated).append(f"study:{registry_id}")
            print(f"  Study {registry_id}: {s_action} (id={study_id})")

            if not isinstance(documents, list) or "documents" not in seeder.api_map.endpoints:
                continue
            for d in documents:
                if not isinstance(d, dict):
                    continue
                source_url = str(d.get("source_url", "")).strip()
                if not source_url:
                    continue

                d_body = dict(d)
                d_body["client_id"] = client_id
                if study_id:
                    d_body["study_id"] = study_id
                if program_id:
                    d_body["program_id"] = program_id

                doc_id, d_action = seeder.upsert(
                    "documents",
                    "source_url",
                    source_url,
                    d_body,
                    extra_list_params={"client_id": client_id} if client_id else None,
                )
                (created if d_action == "created" else updated).append(f"doc:{source_url}")
                print(f"    Document {d.get('type', 'document')}: {d_action} (id={doc_id})")

    print("\nSeed summary")
    print("  created:", len([x for x in created if x]))
    print("  updated:", len([x for x in updated if x]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
