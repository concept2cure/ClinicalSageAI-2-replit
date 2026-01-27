# ADR-0003: 21 CFR Part 11 Compliance Strategy

## Status

**Accepted**

- Date: 2025-08-20
- Deciders: Compliance Team, Security Team, Platform Architecture
- Technical Story: FDA regulatory compliance requirements

## Context

The Concept2Cure platform manages electronic records for pharmaceutical regulatory submissions. These records fall under FDA 21 CFR Part 11, which establishes criteria for:

- Electronic records to be equivalent to paper records
- Electronic signatures to be equivalent to handwritten signatures
- Trustworthiness, reliability, and equivalence of electronic records

Key Part 11 requirements:

1. **§11.10** - Controls for closed systems (validation, audit trails, access controls)
2. **§11.30** - Controls for open systems (encryption, digital signatures)
3. **§11.50** - Signature manifestations
4. **§11.70** - Signature/record linking
5. **§11.100** - General requirements for electronic signatures
6. **§11.200** - Electronic signature components

Non-compliance risks:

- FDA Form 483 observations
- Warning letters
- Product approval delays
- Criminal penalties for willful violations

## Decision

**We will implement a comprehensive Part 11 compliance framework using cryptographic audit trails, digital signatures, and WORM (Write Once Read Many) storage patterns.**

### Core Components:

1. **Merkle Tree Audit Trails** - Tamper-evident logging with cryptographic chaining
2. **RSA-PSS Digital Signatures** - FIPS 186-5 compliant electronic signatures
3. **WORM Storage** - Immutable record storage for regulatory submissions
4. **Role-Based Access Control** - Granular permissions per 21 CFR Part 11
5. **Automatic Timestamping** - RFC 3161 compliant trusted timestamps

### Implementation Location:

```
lumen_cortex/enterprise/
├── compliance.py      # Merkle trees, signatures, WORM
├── audit_service.py   # Audit trail management
├── auth.py           # RBAC, session management
```

## Consequences

### Positive

- **FDA Inspection Ready**: Complete audit trails for any inspection
- **Legal Defensibility**: Cryptographic proof of record integrity
- **Customer Confidence**: Enterprise customers require Part 11 compliance
- **Competitive Advantage**: Differentiator in regulated markets
- **Data Integrity**: Mathematical proof against tampering

### Negative

- **Performance Overhead**: Cryptographic operations add latency
- **Storage Costs**: Audit trails grow indefinitely
- **Complexity**: Developers must understand compliance requirements
- **Key Management**: HSM/KMS requirements for production

### Neutral

- All record modifications create audit entries
- Users must re-authenticate for signature operations
- Training required for compliance-aware development

## Alternatives Considered

### Option A: Third-Party Compliance Platform

**Description:** Use DocuSign, Adobe Sign, or dedicated compliance SaaS

**Pros:**

- Pre-validated solutions
- Reduced development effort
- Expert support

**Cons:**

- Data leaves our control
- Integration complexity
- Recurring licensing costs
- Feature limitations

**Why not chosen:** Regulatory data cannot leave platform; tight integration required.

### Option B: Simple Audit Logging

**Description:** Traditional database-backed audit logs

**Pros:**

- Simple implementation
- Low overhead
- Standard pattern

**Cons:**

- Tamperable by DBAs
- No cryptographic proof
- May fail FDA scrutiny

**Why not chosen:** Insufficient for Part 11 compliance; lacks integrity proof.

### Option C: Blockchain-Based Audit

**Description:** Use Ethereum or Hyperledger for immutable audit

**Pros:**

- Maximum tamper-evidence
- Decentralized trust

**Cons:**

- Extreme complexity
- Performance issues
- Regulatory uncertainty
- Cost prohibitive

**Why not chosen:** Overkill; Merkle trees provide sufficient integrity.

## Implementation Notes

### Merkle Tree Audit Trail

```python
# lumen_cortex/enterprise/compliance.py
class MerkleAuditTrail:
    """FIPS 180-4 compliant Merkle tree for audit trails"""

    def add_entry(self, entry: AuditEntry) -> MerkleNode:
        """Add entry and return proof"""
        leaf = self._hash_entry(entry)
        self.leaves.append(leaf)
        self._rebuild_tree()
        return self._generate_proof(leaf)

    def verify_integrity(self) -> bool:
        """Verify entire audit trail has not been tampered"""
        return self._verify_root() and self._verify_chain()
```

### Digital Signature (RSA-PSS)

```python
# FIPS 186-5 compliant signature
class DigitalSignature:
    def sign(self, data: bytes, private_key: RSAPrivateKey) -> bytes:
        return private_key.sign(
            data,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
```

### WORM Storage Pattern

```python
class WORMStorage:
    """Write Once Read Many - immutable regulatory records"""

    def store(self, record: RegulatoryRecord) -> str:
        """Store immutably, return content-addressed hash"""
        content_hash = hashlib.sha256(record.serialize()).hexdigest()
        # Write to immutable storage (S3 Object Lock, Azure Immutable Blob)
        return content_hash

    def retrieve(self, content_hash: str) -> RegulatoryRecord:
        """Retrieve and verify integrity"""
        record = self._fetch(content_hash)
        if self._verify_hash(record, content_hash):
            return record
        raise IntegrityError("Record tampered")
```

## Related Decisions

- ADR-0001 - Drizzle ORM (schema includes audit columns)
- ADR-0002 - Multi-tenant architecture (per-tenant audit trails)
- ADR-0004 - LUMEN CORTEX (citation validation for regulatory AI)

## References

- [21 CFR Part 11](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11)
- [FDA Part 11 Guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application)
- [FIPS 186-5 Digital Signature Standard](https://csrc.nist.gov/publications/detail/fips/186/5/final)
- [FIPS 180-4 Secure Hash Standard](https://csrc.nist.gov/publications/detail/fips/180/4/final)

---

## Revision History

| Date       | Author          | Description                           |
| ---------- | --------------- | ------------------------------------- |
| 2025-08-20 | Compliance Team | Initial decision                      |
| 2025-11-01 | Security Team   | Added implementation details          |
| 2026-01-25 | Platform Team   | Linked to LUMEN CORTEX implementation |
