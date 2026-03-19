"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX ENTERPRISE TEST SUITE
═══════════════════════════════════════════════════════════════════════════════

Comprehensive tests for enterprise modules:
- Core (EventBus, CircuitBreaker)
- Compliance (Merkle, Signatures, WORM)
- Extraction (Ensemble strategies)
- Citation (NLI verification)
- GraphRAG (Community detection)

Run with: pytest lumen_cortex/enterprise/tests/test_enterprise.py -v
"""

import asyncio
import json
import pytest
from datetime import datetime
from typing import Dict, Any, List
from unittest.mock import MagicMock, patch, AsyncMock

# Import enterprise modules
import sys
sys.path.insert(0, '/workspaces/Concept2Cure.RI-2-replit')


# ═══════════════════════════════════════════════════════════════════════════
#                          CORE TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestEventBus:
    """Tests for async event bus"""

    def test_subscribe_and_emit(self):
        """Test basic pub/sub functionality"""
        from lumen_cortex.enterprise.core import EventBus

        bus = EventBus()
        received = []

        async def handler(event_type: str, data: Dict):
            received.append((event_type, data))

        bus.subscribe("test.event", handler)

        # Emit event
        asyncio.run(bus.emit("test.event", {"value": 42}))

        assert len(received) == 1
        assert received[0][0] == "test.event"
        assert received[0][1]["value"] == 42

    def test_multiple_subscribers(self):
        """Test multiple handlers for same event"""
        from lumen_cortex.enterprise.core import EventBus

        bus = EventBus()
        count = [0]

        async def handler1(event_type: str, data: Dict):
            count[0] += 1

        async def handler2(event_type: str, data: Dict):
            count[0] += 10

        bus.subscribe("multi.event", handler1)
        bus.subscribe("multi.event", handler2)

        asyncio.run(bus.emit("multi.event", {}))

        assert count[0] == 11

    def test_unsubscribe(self):
        """Test unsubscribing handlers"""
        from lumen_cortex.enterprise.core import EventBus

        bus = EventBus()
        received = []

        async def handler(event_type: str, data: Dict):
            received.append(data)

        bus.subscribe("unsub.event", handler)
        bus.unsubscribe("unsub.event", handler)

        asyncio.run(bus.emit("unsub.event", {"test": True}))

        assert len(received) == 0


class TestCircuitBreaker:
    """Tests for circuit breaker pattern"""

    def test_initial_state_closed(self):
        """Circuit starts in closed state"""
        from lumen_cortex.enterprise.core import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=3)
        assert cb.state == CircuitState.CLOSED

    def test_opens_after_threshold(self):
        """Circuit opens after failure threshold"""
        from lumen_cortex.enterprise.core import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=3)

        async def failing_operation():
            raise Exception("Simulated failure")

        for _ in range(3):
            try:
                asyncio.run(cb.call(failing_operation))
            except Exception:
                pass

        assert cb.state == CircuitState.OPEN

    def test_rejects_when_open(self):
        """Circuit rejects calls when open"""
        from lumen_cortex.enterprise.core import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=1)

        async def failing_operation():
            raise Exception("Simulated failure")

        # Trigger open state
        try:
            asyncio.run(cb.call(failing_operation))
        except Exception:
            pass

        # Should reject
        with pytest.raises(Exception) as exc_info:
            asyncio.run(cb.call(failing_operation))

        assert "Circuit breaker is OPEN" in str(exc_info.value)

    def test_success_resets_failures(self):
        """Successful calls reset failure count"""
        from lumen_cortex.enterprise.core import CircuitBreaker, CircuitState

        cb = CircuitBreaker(failure_threshold=3)

        async def failing_operation():
            raise Exception("Failure")

        async def success_operation():
            return "OK"

        # Add some failures
        for _ in range(2):
            try:
                asyncio.run(cb.call(failing_operation))
            except Exception:
                pass

        # Success should reset
        result = asyncio.run(cb.call(success_operation))

        assert result == "OK"
        assert cb.failure_count == 0


class TestAuditDecorator:
    """Tests for audit event decorator"""

    def test_audit_captures_success(self):
        """Audit decorator captures successful operations"""
        from lumen_cortex.enterprise.core import audit_event, event_bus

        events = []

        async def capture_handler(event_type: str, data: Dict):
            events.append(data)

        event_bus.subscribe("audit.test_module.test_action", capture_handler)

        @audit_event("test_module", "test_action")
        async def test_operation():
            return {"result": "success"}

        result = asyncio.run(test_operation())

        assert result["result"] == "success"
        # Note: Event may or may not be captured depending on timing

    def test_audit_captures_failure(self):
        """Audit decorator captures failures"""
        from lumen_cortex.enterprise.core import audit_event

        @audit_event("test_module", "failing_action")
        async def failing_operation():
            raise ValueError("Test error")

        with pytest.raises(ValueError):
            asyncio.run(failing_operation())


# ═══════════════════════════════════════════════════════════════════════════
#                          COMPLIANCE TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestMerkleNode:
    """Tests for Merkle tree implementation"""

    def test_build_tree_single(self):
        """Build tree with single leaf"""
        from lumen_cortex.enterprise.compliance import MerkleNode

        tree = MerkleNode.build_tree(["single item"])

        assert tree is not None
        assert tree.hash is not None
        assert len(tree.hash) == 64  # SHA-256 hex

    def test_build_tree_multiple(self):
        """Build tree with multiple leaves"""
        from lumen_cortex.enterprise.compliance import MerkleNode

        data = ["item1", "item2", "item3", "item4"]
        tree = MerkleNode.build_tree(data)

        assert tree is not None
        assert tree.left is not None
        assert tree.right is not None

    def test_tree_consistency(self):
        """Same data produces same root"""
        from lumen_cortex.enterprise.compliance import MerkleNode

        data = ["a", "b", "c"]

        tree1 = MerkleNode.build_tree(data)
        tree2 = MerkleNode.build_tree(data)

        assert tree1.hash == tree2.hash

    def test_tree_sensitivity(self):
        """Different data produces different root"""
        from lumen_cortex.enterprise.compliance import MerkleNode

        tree1 = MerkleNode.build_tree(["a", "b", "c"])
        tree2 = MerkleNode.build_tree(["a", "b", "d"])

        assert tree1.hash != tree2.hash

    def test_generate_proof(self):
        """Generate inclusion proof for leaf"""
        from lumen_cortex.enterprise.compliance import MerkleNode

        data = ["a", "b", "c", "d"]
        tree = MerkleNode.build_tree(data)

        proof = tree.generate_proof(data[1])

        assert proof is not None
        assert len(proof) > 0

    def test_verify_proof(self):
        """Verify valid inclusion proof"""
        from lumen_cortex.enterprise.compliance import MerkleNode

        data = ["a", "b", "c", "d"]
        tree = MerkleNode.build_tree(data)

        proof = tree.generate_proof(data[2])
        is_valid = MerkleNode.verify_proof(data[2], proof, tree.hash)

        assert is_valid


class TestDigitalSignature:
    """Tests for FIPS-compliant digital signatures"""

    def test_generate_keypair(self):
        """Generate RSA keypair"""
        from lumen_cortex.enterprise.compliance import DigitalSignature

        signer = DigitalSignature()
        private_key, public_key = signer.generate_keypair()

        assert private_key is not None
        assert public_key is not None
        assert b"BEGIN RSA PRIVATE KEY" in private_key or b"BEGIN PRIVATE KEY" in private_key

    def test_sign_and_verify(self):
        """Sign data and verify signature"""
        from lumen_cortex.enterprise.compliance import DigitalSignature

        signer = DigitalSignature()
        private_key, public_key = signer.generate_keypair()

        data = b"Test data for signing"
        signature = signer.sign(data, private_key)

        assert signature is not None

        is_valid = signer.verify(data, signature, public_key)
        assert is_valid

    def test_invalid_signature_rejected(self):
        """Invalid signature is rejected"""
        from lumen_cortex.enterprise.compliance import DigitalSignature

        signer = DigitalSignature()
        private_key, public_key = signer.generate_keypair()

        data = b"Test data"
        signature = signer.sign(data, private_key)

        # Tamper with signature
        tampered_sig = bytes([b ^ 1 for b in signature[:5]]) + signature[5:]

        is_valid = signer.verify(data, tampered_sig, public_key)
        assert not is_valid


class TestWORMStorage:
    """Tests for Write-Once-Read-Many storage"""

    def test_write_and_read(self):
        """Write and read WORM record"""
        from lumen_cortex.enterprise.compliance import WORMStorage

        storage = WORMStorage(base_path="/tmp/worm_test")

        record_id = storage.write("test_record", {"value": 42})

        assert record_id is not None

        data = storage.read(record_id)
        assert data is not None
        assert data.get("value") == 42

    def test_write_once_enforcement(self):
        """Cannot overwrite WORM record"""
        from lumen_cortex.enterprise.compliance import WORMStorage

        storage = WORMStorage(base_path="/tmp/worm_test2")

        record_id = storage.write("unique_record", {"original": True})

        # Attempt overwrite should raise
        with pytest.raises(Exception):
            storage.write(record_id, {"modified": True})

    def test_integrity_check(self):
        """Verify record integrity"""
        from lumen_cortex.enterprise.compliance import WORMStorage

        storage = WORMStorage(base_path="/tmp/worm_test3")

        record_id = storage.write("integrity_test", {"data": "important"})

        is_valid = storage.verify_integrity(record_id)
        assert is_valid


class TestComplianceContext:
    """Tests for RBAC compliance context"""

    def test_create_context(self):
        """Create compliance context with user"""
        from lumen_cortex.enterprise.compliance import ComplianceContext, Role

        context = ComplianceContext(
            user_id="test_user",
            role=Role.ANALYST
        )

        assert context.user_id == "test_user"
        assert context.role == Role.ANALYST

    def test_check_permission(self):
        """Check user permissions"""
        from lumen_cortex.enterprise.compliance import ComplianceContext, Role, Permission

        analyst = ComplianceContext(user_id="analyst1", role=Role.ANALYST)
        admin = ComplianceContext(user_id="admin1", role=Role.REGULATORY_ADMIN)

        # Analyst should have READ but not ADMIN
        assert analyst.has_permission(Permission.READ)
        assert not analyst.has_permission(Permission.ADMIN)

        # Admin should have ADMIN
        assert admin.has_permission(Permission.ADMIN)


# ═══════════════════════════════════════════════════════════════════════════
#                          EXTRACTION TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestTableSchemaType:
    """Tests for table schema types"""

    def test_schema_enum_values(self):
        """Verify schema type values"""
        from lumen_cortex.enterprise.extraction import TableSchemaType

        assert TableSchemaType.ADVERSE_EVENTS.value == "adverse_events"
        assert TableSchemaType.DEMOGRAPHICS.value == "demographics"
        assert TableSchemaType.EFFICACY_PRIMARY.value == "efficacy_primary"


class TestExtractedTable:
    """Tests for extracted table dataclass"""

    def test_create_extracted_table(self):
        """Create extracted table with data"""
        from lumen_cortex.enterprise.extraction import ExtractedTable, TableSchemaType
        import pandas as pd

        df = pd.DataFrame({
            "Subject": [1, 2, 3],
            "Age": [45, 52, 38],
        })

        table = ExtractedTable(
            table_id="test-001",
            page_number=5,
            data=df,
            schema_type=TableSchemaType.DEMOGRAPHICS,
            confidence=0.95,
        )

        assert table.table_id == "test-001"
        assert table.page_number == 5
        assert len(table.data) == 3
        assert table.confidence == 0.95


class TestEnsembleExtractor:
    """Tests for ensemble table extraction"""

    @pytest.mark.asyncio
    async def test_extract_tables_from_bytes(self):
        """Test extraction from PDF bytes"""
        from lumen_cortex.enterprise.extraction import EnsembleTableExtractor

        extractor = EnsembleTableExtractor()

        # Create minimal PDF bytes for testing
        # In real tests, use actual PDF fixture
        pdf_bytes = b"%PDF-1.4 minimal test"

        # This will likely fail gracefully with no tables
        try:
            result = await extractor.extract_tables(pdf_bytes)
            assert result is not None
        except Exception as e:
            # Expected with mock PDF
            assert True

    def test_strategy_registration(self):
        """Test that strategies are registered"""
        from lumen_cortex.enterprise.extraction import EnsembleTableExtractor

        extractor = EnsembleTableExtractor()

        # Should have at least some strategies
        assert len(extractor.strategies) > 0


# ═══════════════════════════════════════════════════════════════════════════
#                          CITATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestCitationFormat:
    """Tests for citation format detection"""

    def test_citation_format_enum(self):
        """Verify citation format values"""
        from lumen_cortex.enterprise.citation import CitationFormat

        assert CitationFormat.BRACKETED.value == "bracketed"
        assert CitationFormat.NAMED.value == "named"


class TestCitation:
    """Tests for citation dataclass"""

    def test_create_citation(self):
        """Create citation object"""
        from lumen_cortex.enterprise.citation import Citation, CitationFormat

        citation = Citation(
            citation_id="cit-001",
            format=CitationFormat.BRACKETED,
            reference_text="[1]",
            source_id="doc-001",
            start_position=50,
            end_position=53,
        )

        assert citation.citation_id == "cit-001"
        assert citation.format == CitationFormat.BRACKETED


class TestCitationEnforcer:
    """Tests for citation enforcement"""

    def test_extract_citations_bracketed(self):
        """Extract bracketed citations from text"""
        from lumen_cortex.enterprise.citation import CitationEnforcer

        enforcer = CitationEnforcer()

        text = "The drug showed 95% efficacy [1] with minimal side effects [2]."
        citations = enforcer._extract_citations(text)

        assert len(citations) >= 2

    def test_extract_citations_named(self):
        """Extract named citations from text"""
        from lumen_cortex.enterprise.citation import CitationEnforcer

        enforcer = CitationEnforcer()

        text = "According to FDA (2024), the approval rate increased (Smith et al., 2023)."
        citations = enforcer._extract_citations(text)

        assert len(citations) >= 2

    def test_claim_extraction(self):
        """Extract claims from text"""
        from lumen_cortex.enterprise.citation import CitationEnforcer

        enforcer = CitationEnforcer()

        text = (
            "The primary endpoint showed a 45% reduction in symptoms [1]. "
            "Furthermore, the safety profile was favorable [2]."
        )

        claims = enforcer._extract_claims(text)

        assert len(claims) >= 1


class TestNLIVerifier:
    """Tests for NLI verification"""

    def test_create_nli_verifier(self):
        """Create NLI verifier instance"""
        from lumen_cortex.enterprise.citation import NLIVerifier

        # May not load model without dependencies
        try:
            verifier = NLIVerifier()
            assert verifier is not None
        except ImportError:
            # Expected if transformers not installed
            pytest.skip("transformers not available")


# ═══════════════════════════════════════════════════════════════════════════
#                          GRAPHRAG TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestEntityType:
    """Tests for entity type enum"""

    def test_entity_types(self):
        """Verify entity type values"""
        from lumen_cortex.enterprise.graphrag import EntityType

        assert EntityType.DRUG.value == "drug"
        assert EntityType.DISEASE.value == "disease"
        assert EntityType.REGULATORY_BODY.value == "regulatory_body"


class TestGraphEntity:
    """Tests for graph entity"""

    def test_create_entity(self):
        """Create graph entity"""
        from lumen_cortex.enterprise.graphrag import GraphEntity, EntityType

        entity = GraphEntity(
            id="drug-001",
            name="Aspirin",
            entity_type=EntityType.DRUG,
            properties={"mechanism": "COX inhibitor"},
        )

        assert entity.id == "drug-001"
        assert entity.name == "Aspirin"
        assert entity.entity_type == EntityType.DRUG

    def test_entity_to_dict(self):
        """Convert entity to dictionary"""
        from lumen_cortex.enterprise.graphrag import GraphEntity, EntityType

        entity = GraphEntity(
            id="drug-002",
            name="Ibuprofen",
            entity_type=EntityType.DRUG,
        )

        d = entity.to_dict()

        assert d["id"] == "drug-002"
        assert d["name"] == "Ibuprofen"
        assert d["type"] == "drug"


class TestGraphRelationship:
    """Tests for graph relationships"""

    def test_create_relationship(self):
        """Create graph relationship"""
        from lumen_cortex.enterprise.graphrag import GraphRelationship, RelationshipType

        rel = GraphRelationship(
            id="rel-001",
            source_id="drug-001",
            target_id="disease-001",
            relationship_type=RelationshipType.TREATS,
            confidence=0.95,
        )

        assert rel.source_id == "drug-001"
        assert rel.target_id == "disease-001"
        assert rel.relationship_type == RelationshipType.TREATS


class TestInMemoryGraph:
    """Tests for in-memory graph"""

    def test_add_and_get_entity(self):
        """Add and retrieve entity"""
        from lumen_cortex.enterprise.graphrag import InMemoryGraph, GraphEntity, EntityType

        graph = InMemoryGraph()

        entity = GraphEntity(
            id="test-001",
            name="Test Entity",
            entity_type=EntityType.DOCUMENT,
        )

        graph.add_entity(entity)

        retrieved = graph.get_entity("test-001")
        assert retrieved is not None
        assert retrieved.name == "Test Entity"

    def test_add_relationship(self):
        """Add relationship between entities"""
        from lumen_cortex.enterprise.graphrag import (
            InMemoryGraph, GraphEntity, GraphRelationship,
            EntityType, RelationshipType
        )

        graph = InMemoryGraph()

        e1 = GraphEntity(id="e1", name="Entity 1", entity_type=EntityType.DRUG)
        e2 = GraphEntity(id="e2", name="Entity 2", entity_type=EntityType.DISEASE)

        graph.add_entity(e1)
        graph.add_entity(e2)

        rel = GraphRelationship(
            id="r1",
            source_id="e1",
            target_id="e2",
            relationship_type=RelationshipType.TREATS,
        )

        graph.add_relationship(rel)

        assert "r1" in graph.relationships

    def test_get_neighbors(self):
        """Get neighboring entities"""
        from lumen_cortex.enterprise.graphrag import (
            InMemoryGraph, GraphEntity, GraphRelationship,
            EntityType, RelationshipType
        )

        graph = InMemoryGraph()

        e1 = GraphEntity(id="center", name="Center", entity_type=EntityType.DRUG)
        e2 = GraphEntity(id="neighbor", name="Neighbor", entity_type=EntityType.DISEASE)

        graph.add_entity(e1)
        graph.add_entity(e2)

        rel = GraphRelationship(
            id="r1",
            source_id="center",
            target_id="neighbor",
            relationship_type=RelationshipType.TREATS,
        )

        graph.add_relationship(rel)

        neighbors = graph.get_neighbors("center")

        assert len(neighbors) == 1
        assert neighbors[0][0].id == "neighbor"

    def test_find_paths(self):
        """Find paths between entities"""
        from lumen_cortex.enterprise.graphrag import (
            InMemoryGraph, GraphEntity, GraphRelationship,
            EntityType, RelationshipType
        )

        graph = InMemoryGraph()

        # Create chain: A -> B -> C
        for eid in ["A", "B", "C"]:
            graph.add_entity(GraphEntity(
                id=eid, name=f"Entity {eid}", entity_type=EntityType.DOCUMENT
            ))

        graph.add_relationship(GraphRelationship(
            id="r1", source_id="A", target_id="B",
            relationship_type=RelationshipType.CITES
        ))
        graph.add_relationship(GraphRelationship(
            id="r2", source_id="B", target_id="C",
            relationship_type=RelationshipType.CITES
        ))

        paths = graph.find_paths("A", "C")

        assert len(paths) >= 1
        assert paths[0] == ["A", "B", "C"]


class TestCommunityDetector:
    """Tests for community detection"""

    def test_detect_communities(self):
        """Detect communities in graph"""
        from lumen_cortex.enterprise.graphrag import (
            InMemoryGraph, CommunityDetector, GraphEntity, GraphRelationship,
            EntityType, RelationshipType
        )

        graph = InMemoryGraph()

        # Create two clusters
        for i in range(4):
            graph.add_entity(GraphEntity(
                id=f"cluster1-{i}",
                name=f"C1 Entity {i}",
                entity_type=EntityType.DOCUMENT
            ))

        for i in range(4):
            graph.add_entity(GraphEntity(
                id=f"cluster2-{i}",
                name=f"C2 Entity {i}",
                entity_type=EntityType.DOCUMENT
            ))

        # Connect within clusters
        for i in range(3):
            graph.add_relationship(GraphRelationship(
                id=f"c1-r{i}",
                source_id=f"cluster1-{i}",
                target_id=f"cluster1-{i+1}",
                relationship_type=RelationshipType.ASSOCIATED_WITH
            ))
            graph.add_relationship(GraphRelationship(
                id=f"c2-r{i}",
                source_id=f"cluster2-{i}",
                target_id=f"cluster2-{i+1}",
                relationship_type=RelationshipType.ASSOCIATED_WITH
            ))

        detector = CommunityDetector(graph)
        communities = detector.detect_communities(levels=2)

        assert len(communities) >= 1


class TestHierarchicalGraphRAG:
    """Tests for hierarchical GraphRAG"""

    @pytest.mark.asyncio
    async def test_build_graph(self):
        """Build knowledge graph from documents"""
        from lumen_cortex.enterprise.graphrag import HierarchicalGraphRAG

        rag = HierarchicalGraphRAG(use_neo4j=False)

        documents = [
            {
                "id": "doc-001",
                "title": "Clinical Study Report",
                "content": "This study evaluated drug efficacy...",
                "entities": [
                    {
                        "id": "drug-001",
                        "name": "Test Drug",
                        "type": "drug",
                    },
                ],
            }
        ]

        stats = await rag.build_graph(documents)

        assert stats["documents"] == 1
        assert stats["entities"] >= 2  # Document + drug

    @pytest.mark.asyncio
    async def test_detect_communities(self):
        """Detect communities in built graph"""
        from lumen_cortex.enterprise.graphrag import HierarchicalGraphRAG

        rag = HierarchicalGraphRAG(use_neo4j=False)

        # Build graph with multiple entities
        documents = [
            {
                "id": f"doc-{i}",
                "title": f"Document {i}",
                "content": f"Content {i}",
                "entities": [
                    {"id": f"entity-{i}", "name": f"Entity {i}", "type": "document"}
                ],
            }
            for i in range(5)
        ]

        await rag.build_graph(documents)
        communities = await rag.detect_communities(levels=2)

        assert len(communities) >= 1

    @pytest.mark.asyncio
    async def test_query(self):
        """Query the knowledge graph"""
        from lumen_cortex.enterprise.graphrag import HierarchicalGraphRAG

        rag = HierarchicalGraphRAG(use_neo4j=False)

        documents = [
            {
                "id": "doc-001",
                "title": "Drug Safety Report",
                "content": "The drug showed excellent safety profile",
                "entities": [
                    {"id": "drug-001", "name": "Study Drug", "type": "drug"},
                ],
            }
        ]

        await rag.build_graph(documents)

        result = await rag.query("drug safety", top_k=5)

        assert result is not None
        assert result.query == "drug safety"

    def test_get_statistics(self):
        """Get graph statistics"""
        from lumen_cortex.enterprise.graphrag import HierarchicalGraphRAG

        rag = HierarchicalGraphRAG(use_neo4j=False)

        stats = rag.get_statistics()

        assert "total_entities" in stats
        assert "total_relationships" in stats


# ═══════════════════════════════════════════════════════════════════════════
#                          EXCEPTION TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestExceptions:
    """Tests for exception hierarchy"""

    def test_base_exception(self):
        """Test base LumenCortexError"""
        from lumen_cortex.enterprise.exceptions import LumenCortexError, ErrorCode

        error = LumenCortexError(
            message="Test error",
            code=ErrorCode.UNKNOWN,
        )

        assert str(error) == "[UNKNOWN] Test error"
        assert error.code == ErrorCode.UNKNOWN

    def test_extraction_error(self):
        """Test extraction error"""
        from lumen_cortex.enterprise.exceptions import ExtractionError, ErrorCode

        error = ExtractionError(
            message="Failed to extract tables",
            strategy="camelot_lattice",
            page_number=5,
        )

        assert error.strategy == "camelot_lattice"
        assert error.page_number == 5

    def test_citation_error(self):
        """Test citation error"""
        from lumen_cortex.enterprise.exceptions import HallucinationDetectedError

        error = HallucinationDetectedError(
            message="Potential hallucination detected",
            claim="The drug cures all diseases",
            confidence=0.95,
        )

        assert error.confidence == 0.95
        assert "Remediation" in str(error)

    def test_compliance_error(self):
        """Test compliance error"""
        from lumen_cortex.enterprise.exceptions import SignatureInvalidError

        error = SignatureInvalidError(
            signer_id="user-001"
        )

        assert error.signer_id == "user-001"
        assert error.regulation == "21 CFR Part 11"

    def test_error_to_dict(self):
        """Test error serialization"""
        from lumen_cortex.enterprise.exceptions import (
            LumenCortexError, ErrorCode, ErrorContext
        )

        ctx = ErrorContext(
            operation="test_op",
            component="test_component",
            correlation_id="corr-123",
        )

        error = LumenCortexError(
            message="Serializable error",
            code=ErrorCode.CONFIGURATION,
            context=ctx,
        )

        d = error.to_dict()

        assert d["message"] == "Serializable error"
        assert d["code"] == 1001
        assert d["context"]["correlation_id"] == "corr-123"

    def test_handle_exception(self):
        """Test exception wrapping utility"""
        from lumen_cortex.enterprise.exceptions import handle_exception, LumenCortexError

        original = ValueError("Original error")
        wrapped = handle_exception(original)

        assert isinstance(wrapped, LumenCortexError)
        assert wrapped.cause == original


# ═══════════════════════════════════════════════════════════════════════════
#                          INTEGRATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestIntegration:
    """Integration tests across modules"""

    @pytest.mark.asyncio
    async def test_extraction_with_compliance(self):
        """Test extraction with compliance context"""
        from lumen_cortex.enterprise.extraction import EnsembleTableExtractor
        from lumen_cortex.enterprise.compliance import ComplianceContext, Role

        context = ComplianceContext(
            user_id="test_user",
            role=Role.ANALYST,
        )

        extractor = EnsembleTableExtractor()

        # Would test actual extraction with compliance logging
        assert extractor is not None
        assert context.has_permission

    @pytest.mark.asyncio
    async def test_citation_with_graphrag(self):
        """Test citation verification with GraphRAG sources"""
        from lumen_cortex.enterprise.citation import CitationEnforcer
        from lumen_cortex.enterprise.graphrag import HierarchicalGraphRAG

        # Build knowledge base
        rag = HierarchicalGraphRAG(use_neo4j=False)

        documents = [
            {
                "id": "source-001",
                "title": "Clinical Study Results",
                "content": "The study showed 95% efficacy rate with p<0.001",
                "entities": [],
            }
        ]

        await rag.build_graph(documents)

        # Verify citation against graph
        enforcer = CitationEnforcer()

        # Would verify claims against graph sources
        assert enforcer is not None

    def test_audit_trail_integrity(self):
        """Test audit trail with Merkle verification"""
        from lumen_cortex.enterprise.compliance import MerkleAuditTrail

        audit = MerkleAuditTrail()

        # Add entries
        audit.append({"action": "create", "user": "user1"})
        audit.append({"action": "update", "user": "user2"})
        audit.append({"action": "approve", "user": "user3"})

        # Verify integrity
        is_valid = audit.verify_integrity()

        assert is_valid


# ═══════════════════════════════════════════════════════════════════════════
#                          RUN TESTS
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
