"""
Regulatory Object Model (ROM): Content-Addressed Merkle Tree System
Git-like integrity for FDA 21 CFR Part 11 compliance.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Set, Callable, Any, Tuple
from datetime import datetime, timezone
from enum import Enum, auto
import hashlib
import json
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import secrets


class ObjectState(Enum):
    DRAFT = auto()        # Mutable, collaborative editing
    REVIEW = auto()       # Locked for QC
    BASELINE = auto()     # Immutable snapshot, cryptographically sealed
    SUBMITTED = auto()    # Transmitted to FDA, legally binding
    SUPERSEDED = auto()   # Amended by later version


@dataclass(frozen=True)
class RegulatoryObject:
    """
    Atomic unit of regulatory content. 
    Like a git blob with embedded audit metadata.
    """
    content_hash: str       # SHA-256 of canonical content
    content_type: str       # "paragraph", "table", "molecule", "calculation"
    encrypted_content: bytes # AES-256 encrypted at rest
    
    # Provenance (Merkle DAG structure)
    parent_hashes: Tuple[str, ...]  # Previous versions for history
    created_by: str         # DID (decentralized identity)
    created_at: datetime
    ai_context: Optional[Dict] = None  # RAG sources, confidence scores
    
    # Regulatory binding
    sdt_tag: Optional[str] = None      # Structured Document Tag
    section_path: str = ""             # "2.6.2/Pharmacokinetics/Paragraph-3"
    
    # Cryptographic proof
    signature: Optional[str] = None    # Ed25519 signature of hash
    
    def __post_init__(self):
        """Verify integrity on instantiation."""
        if not self.verify_integrity():
            raise ValueError(f"Integrity check failed for object {self.content_hash}")
    
    def verify_integrity(self) -> bool:
        """Self-verifying content object."""
        return hashlib.sha256(self.encrypted_content).hexdigest() == self.content_hash
    
    def decrypt(self, cipher: Fernet) -> str:
        """Decrypt content for authorized viewing."""
        return cipher.decrypt(self.encrypted_content).decode('utf-8')
    
    def to_dict(self) -> Dict:
        """Serialize for storage/transmission."""
        return {
            'content_hash': self.content_hash,
            'content_type': self.content_type,
            'encrypted_content': base64.b64encode(self.encrypted_content).decode(),
            'parent_hashes': list(self.parent_hashes),
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
            'ai_context': self.ai_context,
            'sdt_tag': self.sdt_tag,
            'section_path': self.section_path,
            'signature': self.signature
        }
    
    @classmethod
    def create(
        cls,
        content: str,
        content_type: str,
        created_by: str,
        cipher: Fernet,
        parent_hashes: Optional[List[str]] = None,
        ai_context: Optional[Dict] = None,
        sdt_tag: Optional[str] = None,
        section_path: str = ""
    ) -> RegulatoryObject:
        """Factory method to create new object with encryption."""
        encrypted = cipher.encrypt(content.encode())
        content_hash = hashlib.sha256(encrypted).hexdigest()
        
        return cls(
            content_hash=content_hash,
            content_type=content_type,
            encrypted_content=encrypted,
            parent_hashes=tuple(parent_hashes or []),
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            ai_context=ai_context,
            sdt_tag=sdt_tag,
            section_path=section_path
        )


class MerkleTree:
    """
    Merkle tree for document-level integrity proofs.
    Any tampering breaks the root hash.
    """
    
    def __init__(self):
        self.objects: Dict[str, RegulatoryObject] = {}
        self.leaves: List[str] = []
        self.root_hash: Optional[str] = None
        self.tree: Dict[int, List[str]] = {}  # Level -> hashes
    
    def add_object(self, obj: RegulatoryObject) -> str:
        """Add object and recalculate tree."""
        self.objects[obj.content_hash] = obj
        self.leaves.append(obj.content_hash)
        self.leaves.sort()  # Canonical ordering
        self._build_tree()
        return self.root_hash
    
    def _build_tree(self):
        """Build Merkle tree bottom-up."""
        if not self.leaves:
            self.root_hash = None
            return
        
        current_level = self.leaves.copy()
        self.tree[0] = current_level
        
        level = 0
        while len(current_level) > 1:
            next_level = []
            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else left
                combined = hashlib.sha256((left + right).encode()).hexdigest()
                next_level.append(combined)
            
            level += 1
            self.tree[level] = next_level
            current_level = next_level
        
        self.root_hash = current_level[0]
    
    def get_proof(self, content_hash: str) -> Optional[List[Tuple[str, str]]]:
        """
        Generate Merkle proof for content_hash.
        Returns list of (sibling_hash, direction) tuples.
        """
        if content_hash not in self.leaves:
            return None
        
        proof = []
        current_idx = self.leaves.index(content_hash)
        
        for level in range(len(self.tree) - 1):
            level_nodes = self.tree[level]
            is_right = current_idx % 2 == 1
            sibling_idx = current_idx - 1 if is_right else current_idx + 1
            
            if sibling_idx < len(level_nodes):
                sibling = level_nodes[sibling_idx]
                proof.append((sibling, 'right' if is_right else 'left'))
            
            current_idx //= 2
        
        return proof
    
    def verify_proof(self, content_hash: str, proof: List[Tuple[str, str]], root: str) -> bool:
        """Verify content exists in tree with given proof."""
        current = content_hash
        for sibling, direction in proof:
            if direction == 'right':
                current = hashlib.sha256((current + sibling).encode()).hexdigest()
            else:
                current = hashlib.sha256((sibling + current).encode()).hexdigest()
        return current == root


@dataclass
class DocumentLifecycle:
    """
    Git-like branching with regulatory state machine.
    """
    document_id: str
    document_type: str  # "2.6.2", "3.2.S.1.1", etc.
    current_branch: str = "main"
    
    # Branch -> List of root hashes (snapshots)
    branches: Dict[str, List[str]] = field(default_factory=lambda: {"main": []})
    
    # State machine
    state: ObjectState = ObjectState.DRAFT
    state_history: List[Dict] = field(default_factory=list)
    
    # Multi-signature quorum (21 CFR Part 11)
    required_approvers: Set[str] = field(default_factory=set)
    signatures: Dict[str, str] = field(default_factory=dict)  # role -> sig_hash
    
    # Current Merkle tree state
    current_tree: Optional[MerkleTree] = None
    
    def transition(
        self, 
        new_state: ObjectState, 
        actor: str, 
        credentials: str,
        tree_root: str
    ) -> bool:
        """
        Cryptographically signed state transition.
        Returns True if transition successful.
        """
        # Validation rules
        if not self._can_transition(new_state):
            raise ValueError(f"Cannot transition from {self.state} to {new_state}")
        
        if new_state == ObjectState.BASELINE:
            if not self._check_quorum():
                raise ValueError("Quorum not reached for baseline")
        
        # Record transition
        transition_record = {
            'from_state': self.state.name,
            'to_state': new_state.name,
            'actor': actor,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'merkle_root': tree_root,
            'signature': self._sign_transition(actor, credentials, new_state)
        }
        
        self.state = new_state
        self.state_history.append(transition_record)
        
        # If baselining, add to branch history
        if new_state == ObjectState.BASELINE:
            self.branches[self.current_branch].append(tree_root)
        
        return True
    
    def _can_transition(self, new_state: ObjectState) -> bool:
        """State machine logic."""
        transitions = {
            ObjectState.DRAFT: [ObjectState.REVIEW, ObjectState.BASELINE],
            ObjectState.REVIEW: [ObjectState.DRAFT, ObjectState.BASELINE],
            ObjectState.BASELINE: [ObjectState.SUBMITTED, ObjectState.DRAFT],
            ObjectState.SUBMITTED: [ObjectState.SUPERSEDED],
            ObjectState.SUPERSEDED: []
        }
        return new_state in transitions.get(self.state, [])
    
    def _check_quorum(self) -> bool:
        """Check if all required approvers have signed."""
        return self.required_approvers.issubset(set(self.signatures.keys()))
    
    def _sign_transition(self, actor: str, credentials: str, new_state: ObjectState) -> str:
        """Create cryptographic signature of transition."""
        message = f"{self.document_id}:{actor}:{new_state.name}:{datetime.now(timezone.utc).isoformat()}"
        return hashlib.sha256(message.encode()).hexdigest()
    
    def add_signature(self, role: str, signature_hash: str):
        """Collect approval signatures."""
        self.signatures[role] = signature_hash
