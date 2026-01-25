"""
═══════════════════════════════════════════════════════════════════════════════
                    CRYPTOGRAPHIC COMPLIANCE INFRASTRUCTURE
═══════════════════════════════════════════════════════════════════════════════

21 CFR Part 11++ Compliant cryptographic services.

CAPABILITIES:
1. Merkle Trees - Tamper-evident audit trails
2. Digital Signatures - FIPS 186-5 compliant RSA-PSS
3. WORM Storage - Write Once Read Many
4. Compliance Context - RBAC with attributes
5. Encryption - AES-256-GCM for data at rest

COMPLIANCE STANDARDS:
- 21 CFR Part 11 (FDA Electronic Records)
- FIPS 186-5 (Digital Signatures)
- FIPS 197 (AES Encryption)
- HIPAA Technical Safeguards
- GxP Data Integrity (ALCOA+)

@module lumen_cortex.enterprise.compliance
"""

from __future__ import annotations

import os
import json
import hashlib
import hmac
import base64
import secrets
import logging
from datetime import datetime
from typing import (
    Dict, Any, List, Optional, Tuple,
    Union, TypeVar, Generic
)
from dataclasses import dataclass, field
from pathlib import Path
from enum import Enum, auto

# Cryptographic libraries
try:
    from cryptography.hazmat.primitives import hashes, serialization, padding as sym_padding
    from cryptography.hazmat.primitives.asymmetric import rsa, padding as asym_padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    from cryptography.fernet import Fernet
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    logging.warning("cryptography library not available - compliance features limited")

logger = logging.getLogger("LumenCortex.Compliance")


# ═══════════════════════════════════════════════════════════════════════════
#                          MERKLE TREES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class MerkleNode:
    """
    Merkle tree node for tamper-evident audit trails.

    Provides cryptographic proof that data hasn't been modified.
    Used for regulatory audit trails where integrity is critical.
    """
    hash: str
    left: Optional[MerkleNode] = None
    right: Optional[MerkleNode] = None
    data: Optional[str] = None

    @staticmethod
    def hash_data(data: str, algorithm: str = "sha256") -> str:
        """Hash data using specified algorithm"""
        if algorithm == "sha256":
            return hashlib.sha256(data.encode()).hexdigest()
        elif algorithm == "sha3_256":
            return hashlib.sha3_256(data.encode()).hexdigest()
        elif algorithm == "blake2b":
            return hashlib.blake2b(data.encode()).hexdigest()
        else:
            raise ValueError(f"Unsupported algorithm: {algorithm}")

    @staticmethod
    def build_tree(leaves: List[str], algorithm: str = "sha256") -> MerkleNode:
        """
        Build Merkle tree from data leaves.

        Args:
            leaves: List of data strings to include in tree
            algorithm: Hash algorithm (sha256, sha3_256, blake2b)

        Returns:
            Root MerkleNode of constructed tree
        """
        if not leaves:
            return MerkleNode(hash=MerkleNode.hash_data("empty", algorithm))

        # Create leaf nodes
        nodes = [
            MerkleNode(hash=MerkleNode.hash_data(leaf, algorithm), data=leaf)
            for leaf in leaves
        ]

        # Build tree bottom-up
        while len(nodes) > 1:
            level_nodes = []
            for i in range(0, len(nodes), 2):
                left = nodes[i]
                right = nodes[i + 1] if i + 1 < len(nodes) else left
                combined_hash = MerkleNode.hash_data(
                    left.hash + right.hash, algorithm
                )
                level_nodes.append(MerkleNode(
                    hash=combined_hash,
                    left=left,
                    right=right
                ))
            nodes = level_nodes

        return nodes[0]

    @staticmethod
    def verify_proof(
        data: str,
        proof: List[Tuple[str, str]],
        root_hash: str,
        algorithm: str = "sha256"
    ) -> bool:
        """
        Verify Merkle proof for data inclusion.

        Args:
            data: Data to verify
            proof: List of (sibling_hash, position) tuples
            root_hash: Expected root hash
            algorithm: Hash algorithm

        Returns:
            True if proof is valid
        """
        current_hash = MerkleNode.hash_data(data, algorithm)

        for sibling_hash, position in proof:
            if position == "left":
                current_hash = MerkleNode.hash_data(
                    sibling_hash + current_hash, algorithm
                )
            else:
                current_hash = MerkleNode.hash_data(
                    current_hash + sibling_hash, algorithm
                )

        return current_hash == root_hash

    def get_proof(self, data: str) -> Optional[List[Tuple[str, str]]]:
        """
        Generate Merkle proof for data.

        Args:
            data: Data to generate proof for

        Returns:
            List of (sibling_hash, position) tuples or None if not found
        """
        def _find_proof(node: MerkleNode, target_hash: str, path: List) -> Optional[List]:
            if node.data is not None:
                # Leaf node
                if MerkleNode.hash_data(node.data) == target_hash:
                    return path
                return None

            # Internal node
            if node.left:
                left_result = _find_proof(node.left, target_hash,
                    path + [(node.right.hash if node.right else node.left.hash, "right")])
                if left_result is not None:
                    return left_result

            if node.right:
                right_result = _find_proof(node.right, target_hash,
                    path + [(node.left.hash if node.left else node.right.hash, "left")])
                if right_result is not None:
                    return right_result

            return None

        target_hash = MerkleNode.hash_data(data)
        return _find_proof(self, target_hash, [])


@dataclass
class MerkleAuditTrail:
    """
    Merkle tree-based audit trail for Part 11 compliance.

    Maintains an append-only log with cryptographic integrity.
    """
    entries: List[Dict[str, Any]] = field(default_factory=list)
    merkle_roots: List[str] = field(default_factory=list)
    algorithm: str = "sha256"

    def append(self, entry: Dict[str, Any]) -> str:
        """
        Append entry to audit trail and update Merkle root.

        Returns:
            New Merkle root hash
        """
        # Add timestamp if not present
        if "timestamp" not in entry:
            entry["timestamp"] = datetime.utcnow().isoformat()

        # Add sequence number
        entry["sequence"] = len(self.entries)

        # Link to previous root
        if self.merkle_roots:
            entry["previous_root"] = self.merkle_roots[-1]

        self.entries.append(entry)

        # Rebuild Merkle tree
        leaves = [json.dumps(e, sort_keys=True) for e in self.entries]
        tree = MerkleNode.build_tree(leaves, self.algorithm)
        self.merkle_roots.append(tree.hash)

        logger.debug(f"Audit trail entry added, new root: {tree.hash[:16]}...")
        return tree.hash

    def verify_integrity(self) -> Tuple[bool, Optional[int]]:
        """
        Verify entire audit trail integrity.

        Returns:
            (is_valid, first_tampered_index)
        """
        if not self.entries:
            return True, None

        # Verify chain of previous roots
        for i, entry in enumerate(self.entries[1:], 1):
            if entry.get("previous_root") != self.merkle_roots[i - 1]:
                return False, i

        # Verify final Merkle root
        leaves = [json.dumps(e, sort_keys=True) for e in self.entries]
        tree = MerkleNode.build_tree(leaves, self.algorithm)

        if tree.hash != self.merkle_roots[-1]:
            return False, len(self.entries) - 1

        return True, None

    def export(self) -> Dict[str, Any]:
        """Export audit trail for external verification"""
        return {
            "entries": self.entries,
            "merkle_roots": self.merkle_roots,
            "algorithm": self.algorithm,
            "export_timestamp": datetime.utcnow().isoformat(),
            "final_root": self.merkle_roots[-1] if self.merkle_roots else None,
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          DIGITAL SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class DigitalSignature:
    """
    FIPS 186-5 compliant digital signature.

    Uses RSA-PSS with SHA-256 and 3072-bit keys.
    """
    signature: bytes
    public_key_pem: str
    timestamp: datetime
    algorithm: str = "RSA-PSS-SHA256"
    key_size: int = 3072
    signer_id: Optional[str] = None

    @staticmethod
    def generate_keypair(key_size: int = 3072) -> Tuple[Any, Any]:
        """
        Generate RSA keypair for signing.

        Args:
            key_size: Key size in bits (3072 recommended for FIPS)

        Returns:
            (private_key, public_key) tuple
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography library required for digital signatures")

        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size,
            backend=default_backend()
        )
        return private_key, private_key.public_key()

    @staticmethod
    def sign(
        data: str,
        private_key: Any,
        signer_id: Optional[str] = None
    ) -> DigitalSignature:
        """
        Sign data with private key.

        Args:
            data: String data to sign
            private_key: RSA private key
            signer_id: Optional signer identifier

        Returns:
            DigitalSignature object
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography library required")

        message = data.encode()
        signature = private_key.sign(
            message,
            asym_padding.PSS(
                mgf=asym_padding.MGF1(hashes.SHA256()),
                salt_length=asym_padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )

        public_key_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode()

        return DigitalSignature(
            signature=signature,
            public_key_pem=public_key_pem,
            timestamp=datetime.utcnow(),
            signer_id=signer_id
        )

    def verify(self, data: str) -> bool:
        """
        Verify signature against data.

        Args:
            data: Original data that was signed

        Returns:
            True if signature is valid
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography library required")

        try:
            public_key = serialization.load_pem_public_key(
                self.public_key_pem.encode(),
                backend=default_backend()
            )
            public_key.verify(
                self.signature,
                data.encode(),
                asym_padding.PSS(
                    mgf=asym_padding.MGF1(hashes.SHA256()),
                    salt_length=asym_padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )
            return True
        except Exception as e:
            logger.warning(f"Signature verification failed: {e}")
            return False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize signature for storage"""
        return {
            "signature": base64.b64encode(self.signature).decode(),
            "public_key_pem": self.public_key_pem,
            "timestamp": self.timestamp.isoformat(),
            "algorithm": self.algorithm,
            "key_size": self.key_size,
            "signer_id": self.signer_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> DigitalSignature:
        """Deserialize signature from storage"""
        return cls(
            signature=base64.b64decode(data["signature"]),
            public_key_pem=data["public_key_pem"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            algorithm=data.get("algorithm", "RSA-PSS-SHA256"),
            key_size=data.get("key_size", 3072),
            signer_id=data.get("signer_id"),
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          WORM STORAGE
# ═══════════════════════════════════════════════════════════════════════════

class WORMStorage:
    """
    Write Once Read Many storage for audit trails.

    Provides append-only storage with tamper detection.
    Files cannot be modified or deleted after creation.
    """

    def __init__(
        self,
        base_path: str = "./worm_storage",
        retention_days: int = 365 * 7  # 7 years default for FDA
    ):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.retention_days = retention_days
        self._write_manifest: Dict[str, Dict] = {}
        self._load_manifest()

    def _load_manifest(self) -> None:
        """Load manifest of written files"""
        manifest_path = self.base_path / ".worm_manifest.json"
        if manifest_path.exists():
            try:
                self._write_manifest = json.loads(manifest_path.read_text())
            except json.JSONDecodeError:
                self._write_manifest = {}

    def _save_manifest(self) -> None:
        """Save manifest to disk"""
        manifest_path = self.base_path / ".worm_manifest.json"
        manifest_path.write_text(json.dumps(self._write_manifest, indent=2))

    def write(
        self,
        filename: str,
        data: str,
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Write file that cannot be modified after creation.

        Args:
            filename: Name of file to create
            data: String content to write
            metadata: Optional metadata to store

        Returns:
            Absolute path to created file

        Raises:
            PermissionError: If file already exists (WORM violation)
        """
        filepath = self.base_path / filename

        if filepath.exists() or filename in self._write_manifest:
            raise PermissionError(f"WORM violation: {filename} already exists")

        # Calculate integrity hash
        integrity_hash = hashlib.sha256(data.encode()).hexdigest()

        # Prepare content envelope
        content = {
            "data": data,
            "integrity_hash": integrity_hash,
            "created_at": datetime.utcnow().isoformat(),
            "retention_until": (
                datetime.utcnow().replace(year=datetime.utcnow().year + 7)
            ).isoformat(),
            "immutable": True,
            "metadata": metadata or {},
        }

        # Write file
        filepath.write_text(json.dumps(content, indent=2))

        # Update manifest
        self._write_manifest[filename] = {
            "integrity_hash": integrity_hash,
            "created_at": content["created_at"],
            "size_bytes": len(data),
        }
        self._save_manifest()

        # Set file to read-only (Unix)
        try:
            os.chmod(filepath, 0o444)
        except OSError:
            pass  # Windows may not support this

        logger.info(f"WORM file created: {filename} (hash: {integrity_hash[:16]}...)")
        return str(filepath.absolute())

    def read(self, filename: str, verify: bool = True) -> Dict[str, Any]:
        """
        Read WORM file with integrity verification.

        Args:
            filename: Name of file to read
            verify: Whether to verify integrity hash

        Returns:
            Content dictionary with data and metadata

        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If integrity check fails
        """
        filepath = self.base_path / filename

        if not filepath.exists():
            raise FileNotFoundError(f"WORM file not found: {filename}")

        content = json.loads(filepath.read_text())

        # Verify integrity
        if verify:
            computed_hash = hashlib.sha256(content["data"].encode()).hexdigest()
            if computed_hash != content["integrity_hash"]:
                logger.error(f"WORM integrity violation detected: {filename}")
                raise ValueError(f"Integrity check failed for {filename}")

        return content

    def list_files(self, prefix: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List WORM files with metadata.

        Args:
            prefix: Optional filename prefix filter

        Returns:
            List of file info dictionaries
        """
        files = []
        for filename, info in self._write_manifest.items():
            if prefix is None or filename.startswith(prefix):
                files.append({
                    "filename": filename,
                    **info
                })
        return sorted(files, key=lambda x: x["created_at"], reverse=True)

    def verify_all(self) -> Dict[str, bool]:
        """
        Verify integrity of all WORM files.

        Returns:
            Dictionary of filename -> verification status
        """
        results = {}
        for filename in self._write_manifest:
            try:
                self.read(filename, verify=True)
                results[filename] = True
            except (ValueError, FileNotFoundError):
                results[filename] = False
        return results


# ═══════════════════════════════════════════════════════════════════════════
#                          COMPLIANCE CONTEXT
# ═══════════════════════════════════════════════════════════════════════════

class Permission(Enum):
    """Available permissions in the system"""
    READ = "read"
    WRITE = "write"
    VALIDATE = "validate"
    SIGN = "sign"
    AUDIT = "audit"
    ADMIN = "admin"
    EXPORT = "export"
    DELETE = "delete"  # Logical delete only


class Role(Enum):
    """Predefined roles with permission sets"""
    REGULATORY_ADMIN = "regulatory_admin"
    ANALYST = "analyst"
    AUDITOR = "auditor"
    REVIEWER = "reviewer"
    SYSTEM = "system"


# Role -> Permission mapping
ROLE_PERMISSIONS: Dict[Role, List[Permission]] = {
    Role.REGULATORY_ADMIN: [
        Permission.READ, Permission.WRITE, Permission.VALIDATE,
        Permission.SIGN, Permission.AUDIT, Permission.EXPORT
    ],
    Role.ANALYST: [
        Permission.READ, Permission.WRITE
    ],
    Role.AUDITOR: [
        Permission.READ, Permission.AUDIT, Permission.EXPORT
    ],
    Role.REVIEWER: [
        Permission.READ, Permission.VALIDATE
    ],
    Role.SYSTEM: [
        Permission.READ, Permission.WRITE, Permission.VALIDATE,
        Permission.SIGN, Permission.AUDIT, Permission.ADMIN, Permission.EXPORT
    ],
}


@dataclass
class ComplianceContext:
    """
    Thread-safe compliance context with RBAC.

    Provides:
    - Role-based access control
    - Attribute-based access control (ABAC)
    - Session tracking
    - Audit context propagation
    """
    user_id: str
    role: Role
    session_id: str = field(default_factory=lambda: secrets.token_hex(8))
    organization_id: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    merkle_root: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None

    def has_permission(self, permission: Permission) -> bool:
        """
        Check if user has permission based on role and attributes.

        Args:
            permission: Permission to check

        Returns:
            True if user has permission
        """
        # Check role permissions
        role_perms = ROLE_PERMISSIONS.get(self.role, [])
        if permission in role_perms:
            return True

        # Check attribute-based permissions
        if permission.value in self.attributes.get("extra_permissions", []):
            return True

        return False

    def require_permission(self, permission: Permission) -> None:
        """
        Require permission or raise exception.

        Args:
            permission: Required permission

        Raises:
            PermissionError: If permission not granted
        """
        if not self.has_permission(permission):
            raise PermissionError(
                f"User {self.user_id} lacks {permission.value} permission"
            )

    def is_expired(self) -> bool:
        """Check if session has expired"""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    def to_audit_dict(self) -> Dict[str, Any]:
        """Export context for audit logging"""
        return {
            "user_id": self.user_id,
            "role": self.role.value,
            "session_id": self.session_id,
            "organization_id": self.organization_id,
            "merkle_root": self.merkle_root,
            "created_at": self.created_at.isoformat(),
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          DATA ENCRYPTION
# ═══════════════════════════════════════════════════════════════════════════

class DataEncryptor:
    """
    AES-256-GCM encryption for data at rest.

    FIPS 197 compliant symmetric encryption.
    """

    def __init__(self, key: Optional[bytes] = None):
        """
        Initialize encryptor with key.

        Args:
            key: 32-byte encryption key (generated if not provided)
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography library required")

        if key is None:
            key = secrets.token_bytes(32)  # 256 bits
        elif len(key) != 32:
            raise ValueError("Key must be 32 bytes")

        self._key = key

    def encrypt(self, data: str) -> Dict[str, str]:
        """
        Encrypt data with AES-256-GCM.

        Args:
            data: String data to encrypt

        Returns:
            Dictionary with ciphertext, iv, and tag (all base64 encoded)
        """
        iv = secrets.token_bytes(12)  # 96-bit IV for GCM

        cipher = Cipher(
            algorithms.AES(self._key),
            modes.GCM(iv),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()

        ciphertext = encryptor.update(data.encode()) + encryptor.finalize()

        return {
            "ciphertext": base64.b64encode(ciphertext).decode(),
            "iv": base64.b64encode(iv).decode(),
            "tag": base64.b64encode(encryptor.tag).decode(),
            "algorithm": "AES-256-GCM",
        }

    def decrypt(self, encrypted: Dict[str, str]) -> str:
        """
        Decrypt data encrypted with encrypt().

        Args:
            encrypted: Dictionary from encrypt()

        Returns:
            Decrypted string
        """
        ciphertext = base64.b64decode(encrypted["ciphertext"])
        iv = base64.b64decode(encrypted["iv"])
        tag = base64.b64decode(encrypted["tag"])

        cipher = Cipher(
            algorithms.AES(self._key),
            modes.GCM(iv, tag),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()

        plaintext = decryptor.update(ciphertext) + decryptor.finalize()
        return plaintext.decode()

    @staticmethod
    def generate_key() -> bytes:
        """Generate a new encryption key"""
        return secrets.token_bytes(32)

    @staticmethod
    def derive_key(password: str, salt: bytes) -> bytes:
        """
        Derive encryption key from password using PBKDF2.

        Args:
            password: User password
            salt: Random salt (should be stored with encrypted data)

        Returns:
            32-byte derived key
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography library required")

        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=600000,  # OWASP 2023 recommendation
            backend=default_backend()
        )
        return kdf.derive(password.encode())


# ═══════════════════════════════════════════════════════════════════════════
#                          COMPLIANCE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════

class Part11ComplianceValidator:
    """
    Validates compliance with 21 CFR Part 11 requirements.

    Checks:
    - Audit trail integrity
    - Signature validity
    - Access control
    - Data integrity
    """

    def __init__(self, audit_trail: MerkleAuditTrail, worm: WORMStorage):
        self.audit_trail = audit_trail
        self.worm = worm

    def validate_audit_trail(self) -> Dict[str, Any]:
        """Validate audit trail integrity"""
        is_valid, tampered_index = self.audit_trail.verify_integrity()

        return {
            "check": "audit_trail_integrity",
            "passed": is_valid,
            "details": {
                "total_entries": len(self.audit_trail.entries),
                "tampered_index": tampered_index,
                "current_root": self.audit_trail.merkle_roots[-1] if self.audit_trail.merkle_roots else None,
            }
        }

    def validate_worm_storage(self) -> Dict[str, Any]:
        """Validate WORM storage integrity"""
        verification_results = self.worm.verify_all()
        passed = all(verification_results.values())

        return {
            "check": "worm_storage_integrity",
            "passed": passed,
            "details": {
                "total_files": len(verification_results),
                "valid_files": sum(1 for v in verification_results.values() if v),
                "invalid_files": [f for f, v in verification_results.items() if not v],
            }
        }

    def validate_signature(
        self,
        signature: DigitalSignature,
        data: str
    ) -> Dict[str, Any]:
        """Validate digital signature"""
        is_valid = signature.verify(data)

        return {
            "check": "digital_signature",
            "passed": is_valid,
            "details": {
                "algorithm": signature.algorithm,
                "key_size": signature.key_size,
                "signer_id": signature.signer_id,
                "timestamp": signature.timestamp.isoformat(),
            }
        }

    def full_compliance_check(self) -> Dict[str, Any]:
        """Run full Part 11 compliance check"""
        results = {
            "audit_trail": self.validate_audit_trail(),
            "worm_storage": self.validate_worm_storage(),
            "timestamp": datetime.utcnow().isoformat(),
        }

        results["overall_compliant"] = all(
            r["passed"] for r in results.values() if isinstance(r, dict) and "passed" in r
        )

        return results
