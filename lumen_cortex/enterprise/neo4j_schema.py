"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX ENTERPRISE - NEO4J SCHEMA & SETUP
═══════════════════════════════════════════════════════════════════════════════

Enterprise-grade Neo4j graph database schema for regulatory intelligence:

1. Entity Types: Documents, Sections, Concepts, Regulations, Studies, etc.
2. Relationship Types: CONTAINS, REFERENCES, COMPLIES_WITH, SUPPORTS, etc.
3. Vector Indexes: For semantic similarity search
4. Full-text Indexes: For keyword search
5. Constraints: Data integrity enforcement

COMPLIANCE:
- ICH E3 Structure Mapping
- 21 CFR Part 11 Document Lineage
- FDA Guidance Cross-References

@module lumen_cortex.enterprise.neo4j_schema
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("LumenCortex.Neo4j.Schema")


# ═══════════════════════════════════════════════════════════════════════════
#                          GRAPH SCHEMA DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

class NodeLabel(str, Enum):
    """Node labels for knowledge graph"""

    # Document hierarchy
    DOCUMENT = "Document"
    SECTION = "Section"
    PARAGRAPH = "Paragraph"
    TABLE = "Table"
    FIGURE = "Figure"

    # Regulatory entities
    REGULATION = "Regulation"
    GUIDANCE = "Guidance"
    REQUIREMENT = "Requirement"
    STANDARD = "Standard"

    # Clinical entities
    STUDY = "Study"
    TRIAL = "Trial"
    ENDPOINT = "Endpoint"
    INDICATION = "Indication"
    DRUG = "Drug"
    DEVICE = "Device"

    # Concepts
    CONCEPT = "Concept"
    TERM = "Term"
    DEFINITION = "Definition"

    # Organizational
    ORGANIZATION = "Organization"
    AGENCY = "Agency"
    SPONSOR = "Sponsor"

    # Graph communities
    COMMUNITY = "Community"
    CLUSTER = "Cluster"


class RelationshipType(str, Enum):
    """Relationship types for knowledge graph"""

    # Structural
    CONTAINS = "CONTAINS"
    PART_OF = "PART_OF"
    FOLLOWS = "FOLLOWS"
    PRECEDES = "PRECEDES"

    # References
    REFERENCES = "REFERENCES"
    CITES = "CITES"
    CROSS_REFERENCES = "CROSS_REFERENCES"
    DERIVED_FROM = "DERIVED_FROM"

    # Regulatory
    COMPLIES_WITH = "COMPLIES_WITH"
    GOVERNED_BY = "GOVERNED_BY"
    SUPERSEDES = "SUPERSEDES"
    AMENDS = "AMENDS"

    # Clinical
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    EVALUATES = "EVALUATES"
    TREATS = "TREATS"

    # Semantic
    SIMILAR_TO = "SIMILAR_TO"
    RELATED_TO = "RELATED_TO"
    SYNONYM_OF = "SYNONYM_OF"
    BROADER_THAN = "BROADER_THAN"
    NARROWER_THAN = "NARROWER_THAN"

    # Community
    MEMBER_OF = "MEMBER_OF"
    BRIDGES = "BRIDGES"


@dataclass
class NodeProperty:
    """Definition of a node property"""
    name: str
    data_type: str  # STRING, INTEGER, FLOAT, BOOLEAN, DATETIME, LIST, POINT
    required: bool = False
    indexed: bool = False
    unique: bool = False
    default: Any = None
    description: str = ""


@dataclass
class NodeSchema:
    """Schema definition for a node type"""
    label: NodeLabel
    properties: List[NodeProperty]
    description: str = ""

    def get_constraint_cypher(self) -> List[str]:
        """Generate Cypher for constraints"""
        statements = []

        for prop in self.properties:
            if prop.unique:
                statements.append(
                    f"CREATE CONSTRAINT {self.label.value.lower()}_{prop.name}_unique "
                    f"IF NOT EXISTS FOR (n:{self.label.value}) "
                    f"REQUIRE n.{prop.name} IS UNIQUE"
                )
            elif prop.required:
                statements.append(
                    f"CREATE CONSTRAINT {self.label.value.lower()}_{prop.name}_exists "
                    f"IF NOT EXISTS FOR (n:{self.label.value}) "
                    f"REQUIRE n.{prop.name} IS NOT NULL"
                )

        return statements

    def get_index_cypher(self) -> List[str]:
        """Generate Cypher for indexes"""
        statements = []

        for prop in self.properties:
            if prop.indexed and not prop.unique:  # Unique constraints auto-create indexes
                statements.append(
                    f"CREATE INDEX {self.label.value.lower()}_{prop.name}_idx "
                    f"IF NOT EXISTS FOR (n:{self.label.value}) "
                    f"ON (n.{prop.name})"
                )

        return statements


@dataclass
class RelationshipSchema:
    """Schema definition for a relationship type"""
    rel_type: RelationshipType
    from_labels: List[NodeLabel]
    to_labels: List[NodeLabel]
    properties: List[NodeProperty] = field(default_factory=list)
    description: str = ""


# ═══════════════════════════════════════════════════════════════════════════
#                          SCHEMA DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

# Common properties
COMMON_PROPERTIES = [
    NodeProperty("id", "STRING", required=True, unique=True, description="Unique identifier"),
    NodeProperty("created_at", "DATETIME", required=True, description="Creation timestamp"),
    NodeProperty("updated_at", "DATETIME", description="Last update timestamp"),
    NodeProperty("created_by", "STRING", description="User who created"),
    NodeProperty("version", "INTEGER", default=1, description="Version number"),
]

# Document node schema
DOCUMENT_SCHEMA = NodeSchema(
    label=NodeLabel.DOCUMENT,
    properties=COMMON_PROPERTIES + [
        NodeProperty("title", "STRING", required=True, indexed=True),
        NodeProperty("doc_type", "STRING", required=True, indexed=True),  # CSR, Protocol, IB, etc.
        NodeProperty("status", "STRING", indexed=True),  # draft, final, approved
        NodeProperty("source_path", "STRING"),
        NodeProperty("hash", "STRING", indexed=True),
        NodeProperty("page_count", "INTEGER"),
        NodeProperty("word_count", "INTEGER"),
        NodeProperty("language", "STRING"),
        NodeProperty("embedding", "LIST"),  # Vector embedding
    ],
    description="Regulatory document"
)

# Section node schema
SECTION_SCHEMA = NodeSchema(
    label=NodeLabel.SECTION,
    properties=COMMON_PROPERTIES + [
        NodeProperty("title", "STRING", required=True, indexed=True),
        NodeProperty("section_number", "STRING", indexed=True),  # e.g., "2.7.4"
        NodeProperty("level", "INTEGER"),  # Heading level
        NodeProperty("content", "STRING"),
        NodeProperty("content_hash", "STRING"),
        NodeProperty("start_page", "INTEGER"),
        NodeProperty("end_page", "INTEGER"),
        NodeProperty("word_count", "INTEGER"),
        NodeProperty("embedding", "LIST"),
    ],
    description="Document section"
)

# Regulation node schema
REGULATION_SCHEMA = NodeSchema(
    label=NodeLabel.REGULATION,
    properties=COMMON_PROPERTIES + [
        NodeProperty("title", "STRING", required=True, indexed=True),
        NodeProperty("code", "STRING", required=True, unique=True),  # e.g., "21CFR312"
        NodeProperty("agency", "STRING", indexed=True),  # FDA, EMA, PMDA
        NodeProperty("jurisdiction", "STRING", indexed=True),
        NodeProperty("effective_date", "DATETIME"),
        NodeProperty("last_amended", "DATETIME"),
        NodeProperty("status", "STRING", indexed=True),  # current, superseded
        NodeProperty("url", "STRING"),
        NodeProperty("embedding", "LIST"),
    ],
    description="Regulatory requirement"
)

# Study node schema
STUDY_SCHEMA = NodeSchema(
    label=NodeLabel.STUDY,
    properties=COMMON_PROPERTIES + [
        NodeProperty("title", "STRING", required=True, indexed=True),
        NodeProperty("study_id", "STRING", required=True, unique=True),
        NodeProperty("nct_id", "STRING", indexed=True),  # ClinicalTrials.gov
        NodeProperty("phase", "STRING", indexed=True),
        NodeProperty("status", "STRING", indexed=True),
        NodeProperty("indication", "STRING", indexed=True),
        NodeProperty("sponsor", "STRING", indexed=True),
        NodeProperty("start_date", "DATETIME"),
        NodeProperty("completion_date", "DATETIME"),
        NodeProperty("enrollment", "INTEGER"),
        NodeProperty("embedding", "LIST"),
    ],
    description="Clinical study"
)

# Concept node schema
CONCEPT_SCHEMA = NodeSchema(
    label=NodeLabel.CONCEPT,
    properties=COMMON_PROPERTIES + [
        NodeProperty("name", "STRING", required=True, indexed=True),
        NodeProperty("concept_type", "STRING", indexed=True),  # medical, regulatory, statistical
        NodeProperty("definition", "STRING"),
        NodeProperty("source", "STRING"),  # MedDRA, SNOMED, custom
        NodeProperty("code", "STRING", indexed=True),  # External code
        NodeProperty("synonyms", "LIST"),
        NodeProperty("embedding", "LIST"),
    ],
    description="Regulatory/medical concept"
)

# Community node schema (for GraphRAG)
COMMUNITY_SCHEMA = NodeSchema(
    label=NodeLabel.COMMUNITY,
    properties=COMMON_PROPERTIES + [
        NodeProperty("name", "STRING", required=True),
        NodeProperty("level", "INTEGER", required=True, indexed=True),  # Hierarchy level
        NodeProperty("size", "INTEGER"),  # Number of members
        NodeProperty("summary", "STRING"),  # AI-generated summary
        NodeProperty("keywords", "LIST"),
        NodeProperty("centroid", "LIST"),  # Embedding centroid
        NodeProperty("modularity_score", "FLOAT"),
    ],
    description="Graph community from Leiden clustering"
)

# All schemas
NODE_SCHEMAS = [
    DOCUMENT_SCHEMA,
    SECTION_SCHEMA,
    REGULATION_SCHEMA,
    STUDY_SCHEMA,
    CONCEPT_SCHEMA,
    COMMUNITY_SCHEMA,
]

# Relationship schemas
RELATIONSHIP_SCHEMAS = [
    RelationshipSchema(
        rel_type=RelationshipType.CONTAINS,
        from_labels=[NodeLabel.DOCUMENT],
        to_labels=[NodeLabel.SECTION, NodeLabel.TABLE, NodeLabel.FIGURE],
        properties=[
            NodeProperty("order", "INTEGER", description="Order in parent"),
        ],
        description="Document contains section"
    ),
    RelationshipSchema(
        rel_type=RelationshipType.REFERENCES,
        from_labels=[NodeLabel.SECTION, NodeLabel.DOCUMENT],
        to_labels=[NodeLabel.REGULATION, NodeLabel.STUDY, NodeLabel.DOCUMENT],
        properties=[
            NodeProperty("context", "STRING"),
            NodeProperty("confidence", "FLOAT"),
        ],
        description="Section references entity"
    ),
    RelationshipSchema(
        rel_type=RelationshipType.COMPLIES_WITH,
        from_labels=[NodeLabel.DOCUMENT, NodeLabel.SECTION],
        to_labels=[NodeLabel.REGULATION, NodeLabel.REQUIREMENT],
        properties=[
            NodeProperty("compliance_status", "STRING"),  # compliant, partial, non-compliant
            NodeProperty("evidence", "STRING"),
            NodeProperty("verified_at", "DATETIME"),
            NodeProperty("verified_by", "STRING"),
        ],
        description="Document complies with regulation"
    ),
    RelationshipSchema(
        rel_type=RelationshipType.SIMILAR_TO,
        from_labels=[NodeLabel.SECTION, NodeLabel.CONCEPT, NodeLabel.DOCUMENT],
        to_labels=[NodeLabel.SECTION, NodeLabel.CONCEPT, NodeLabel.DOCUMENT],
        properties=[
            NodeProperty("similarity_score", "FLOAT", required=True),
            NodeProperty("similarity_type", "STRING"),  # semantic, structural, lexical
        ],
        description="Semantic similarity relationship"
    ),
    RelationshipSchema(
        rel_type=RelationshipType.MEMBER_OF,
        from_labels=[NodeLabel.SECTION, NodeLabel.DOCUMENT, NodeLabel.CONCEPT],
        to_labels=[NodeLabel.COMMUNITY],
        properties=[
            NodeProperty("membership_score", "FLOAT"),
        ],
        description="Entity belongs to community"
    ),
]


# ═══════════════════════════════════════════════════════════════════════════
#                          SCHEMA MANAGER
# ═══════════════════════════════════════════════════════════════════════════

class Neo4jSchemaManager:
    """
    Manages Neo4j schema creation and updates.

    Features:
    - Schema versioning
    - Safe schema updates
    - Vector index management
    - Full-text index management
    - Constraint validation
    """

    SCHEMA_VERSION_NODE = "_SchemaVersion"
    CURRENT_VERSION = "2.0.0"

    def __init__(self, connector=None):
        """
        Initialize schema manager.

        Args:
            connector: Neo4jAsyncConnector instance
        """
        self.connector = connector
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize schema in database"""
        logger.info("Initializing Neo4j schema...")

        try:
            # Check current version
            current = await self._get_schema_version()

            if current == self.CURRENT_VERSION:
                logger.info(f"Schema already at version {self.CURRENT_VERSION}")
                return True

            # Create constraints
            await self._create_constraints()

            # Create indexes
            await self._create_indexes()

            # Create vector indexes
            await self._create_vector_indexes()

            # Create full-text indexes
            await self._create_fulltext_indexes()

            # Update version
            await self._set_schema_version(self.CURRENT_VERSION)

            self._initialized = True
            logger.info(f"Schema initialized to version {self.CURRENT_VERSION}")
            return True

        except Exception as e:
            logger.error(f"Schema initialization failed: {e}")
            return False

    async def _get_schema_version(self) -> Optional[str]:
        """Get current schema version"""
        if not self.connector:
            return None

        try:
            result = await self.connector.execute_read(
                f"MATCH (v:{self.SCHEMA_VERSION_NODE}) RETURN v.version AS version"
            )
            if result.records:
                return result.records[0]["version"]
        except:
            pass
        return None

    async def _set_schema_version(self, version: str) -> None:
        """Set schema version"""
        if not self.connector:
            return

        await self.connector.execute_write(f"""
            MERGE (v:{self.SCHEMA_VERSION_NODE})
            SET v.version = $version,
                v.updated_at = datetime()
        """, {"version": version})

    async def _create_constraints(self) -> None:
        """Create all node constraints"""
        logger.info("Creating constraints...")

        for schema in NODE_SCHEMAS:
            for cypher in schema.get_constraint_cypher():
                await self._execute_schema_change(cypher)

    async def _create_indexes(self) -> None:
        """Create all regular indexes"""
        logger.info("Creating indexes...")

        for schema in NODE_SCHEMAS:
            for cypher in schema.get_index_cypher():
                await self._execute_schema_change(cypher)

    async def _create_vector_indexes(self) -> None:
        """Create vector indexes for similarity search"""
        logger.info("Creating vector indexes...")

        # Vector index configurations
        vector_configs = [
            (NodeLabel.DOCUMENT, "embedding", 1536),  # OpenAI dimensions
            (NodeLabel.SECTION, "embedding", 1536),
            (NodeLabel.CONCEPT, "embedding", 1536),
            (NodeLabel.REGULATION, "embedding", 1536),
            (NodeLabel.STUDY, "embedding", 1536),
            (NodeLabel.COMMUNITY, "centroid", 1536),
        ]

        for label, prop, dims in vector_configs:
            cypher = f"""
                CREATE VECTOR INDEX {label.value.lower()}_{prop}_vector IF NOT EXISTS
                FOR (n:{label.value})
                ON (n.{prop})
                OPTIONS {{
                    indexConfig: {{
                        `vector.dimensions`: {dims},
                        `vector.similarity_function`: 'cosine'
                    }}
                }}
            """
            await self._execute_schema_change(cypher)

    async def _create_fulltext_indexes(self) -> None:
        """Create full-text indexes for keyword search"""
        logger.info("Creating full-text indexes...")

        # Full-text index configurations
        fulltext_configs = [
            ("document_content", [NodeLabel.DOCUMENT], ["title"]),
            ("section_content", [NodeLabel.SECTION], ["title", "content"]),
            ("concept_search", [NodeLabel.CONCEPT], ["name", "definition"]),
            ("regulation_search", [NodeLabel.REGULATION], ["title", "code"]),
        ]

        for name, labels, props in fulltext_configs:
            label_str = "|".join(l.value for l in labels)
            prop_str = ", ".join(f"n.{p}" for p in props)

            cypher = f"""
                CREATE FULLTEXT INDEX {name} IF NOT EXISTS
                FOR (n:{label_str})
                ON EACH [{prop_str}]
            """
            await self._execute_schema_change(cypher)

    async def _execute_schema_change(self, cypher: str) -> None:
        """Execute a schema change query"""
        if self.connector:
            try:
                await self.connector.execute_write(cypher)
                logger.debug(f"Executed: {cypher[:80]}...")
            except Exception as e:
                # Many schema operations are idempotent
                if "already exists" in str(e).lower():
                    logger.debug(f"Schema element already exists: {cypher[:50]}...")
                else:
                    logger.warning(f"Schema change warning: {e}")
        else:
            logger.info(f"[DRY RUN] Would execute: {cypher[:80]}...")

    def get_all_cypher(self) -> str:
        """Get all schema creation Cypher as a single script"""
        statements = []

        statements.append("// ═══════════════════════════════════════════════════")
        statements.append("// LUMEN CORTEX - NEO4J SCHEMA v2.0.0")
        statements.append("// ═══════════════════════════════════════════════════")
        statements.append("")

        # Constraints
        statements.append("// --- Constraints ---")
        for schema in NODE_SCHEMAS:
            for cypher in schema.get_constraint_cypher():
                statements.append(cypher + ";")
        statements.append("")

        # Indexes
        statements.append("// --- Indexes ---")
        for schema in NODE_SCHEMAS:
            for cypher in schema.get_index_cypher():
                statements.append(cypher + ";")
        statements.append("")

        # Vector indexes
        statements.append("// --- Vector Indexes ---")
        vector_configs = [
            (NodeLabel.DOCUMENT, "embedding", 1536),
            (NodeLabel.SECTION, "embedding", 1536),
            (NodeLabel.CONCEPT, "embedding", 1536),
            (NodeLabel.REGULATION, "embedding", 1536),
            (NodeLabel.STUDY, "embedding", 1536),
            (NodeLabel.COMMUNITY, "centroid", 1536),
        ]
        for label, prop, dims in vector_configs:
            cypher = f"""CREATE VECTOR INDEX {label.value.lower()}_{prop}_vector IF NOT EXISTS
FOR (n:{label.value})
ON (n.{prop})
OPTIONS {{
    indexConfig: {{
        `vector.dimensions`: {dims},
        `vector.similarity_function`: 'cosine'
    }}
}};"""
            statements.append(cypher)
        statements.append("")

        # Full-text indexes
        statements.append("// --- Full-Text Indexes ---")
        fulltext_configs = [
            ("document_content", [NodeLabel.DOCUMENT], ["title"]),
            ("section_content", [NodeLabel.SECTION], ["title", "content"]),
            ("concept_search", [NodeLabel.CONCEPT], ["name", "definition"]),
            ("regulation_search", [NodeLabel.REGULATION], ["title", "code"]),
        ]
        for name, labels, props in fulltext_configs:
            label_str = "|".join(l.value for l in labels)
            prop_str = ", ".join(f"n.{p}" for p in props)
            cypher = f"""CREATE FULLTEXT INDEX {name} IF NOT EXISTS
FOR (n:{label_str})
ON EACH [{prop_str}];"""
            statements.append(cypher)

        return "\n".join(statements)

    async def validate(self) -> Tuple[bool, List[str]]:
        """Validate schema integrity"""
        issues = []

        if not self.connector:
            return True, ["No connector - validation skipped"]

        try:
            # Check constraints
            result = await self.connector.execute_read(
                "SHOW CONSTRAINTS"
            )
            constraint_names = {r.get("name", "") for r in result.records}

            for schema in NODE_SCHEMAS:
                for prop in schema.properties:
                    if prop.unique:
                        expected = f"{schema.label.value.lower()}_{prop.name}_unique"
                        if expected not in constraint_names:
                            issues.append(f"Missing constraint: {expected}")

            # Check indexes
            result = await self.connector.execute_read(
                "SHOW INDEXES"
            )
            index_names = {r.get("name", "") for r in result.records}

            # Check vector indexes
            for label in [NodeLabel.DOCUMENT, NodeLabel.SECTION, NodeLabel.CONCEPT]:
                expected = f"{label.value.lower()}_embedding_vector"
                if expected not in index_names:
                    issues.append(f"Missing vector index: {expected}")

        except Exception as e:
            issues.append(f"Validation error: {e}")

        return len(issues) == 0, issues

    def get_schema_documentation(self) -> str:
        """Generate schema documentation"""
        lines = [
            "# Lumen Cortex Neo4j Schema Documentation",
            "",
            "## Node Types",
            "",
        ]

        for schema in NODE_SCHEMAS:
            lines.append(f"### {schema.label.value}")
            lines.append(f"*{schema.description}*")
            lines.append("")
            lines.append("| Property | Type | Required | Indexed | Description |")
            lines.append("|----------|------|----------|---------|-------------|")

            for prop in schema.properties:
                req = "✓" if prop.required else ""
                idx = "✓" if prop.indexed or prop.unique else ""
                lines.append(f"| {prop.name} | {prop.data_type} | {req} | {idx} | {prop.description} |")
            lines.append("")

        lines.append("## Relationship Types")
        lines.append("")

        for rel_schema in RELATIONSHIP_SCHEMAS:
            from_str = ", ".join(l.value for l in rel_schema.from_labels)
            to_str = ", ".join(l.value for l in rel_schema.to_labels)
            lines.append(f"### {rel_schema.rel_type.value}")
            lines.append(f"*{rel_schema.description}*")
            lines.append(f"- From: {from_str}")
            lines.append(f"- To: {to_str}")
            lines.append("")

        return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
#                          SEED DATA
# ═══════════════════════════════════════════════════════════════════════════

SEED_REGULATIONS = [
    {
        "id": "reg_21cfr11",
        "code": "21CFR11",
        "title": "21 CFR Part 11 - Electronic Records; Electronic Signatures",
        "agency": "FDA",
        "jurisdiction": "USA",
        "status": "current",
        "url": "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11"
    },
    {
        "id": "reg_21cfr312",
        "code": "21CFR312",
        "title": "21 CFR Part 312 - Investigational New Drug Application",
        "agency": "FDA",
        "jurisdiction": "USA",
        "status": "current",
        "url": "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312"
    },
    {
        "id": "reg_ich_e3",
        "code": "ICH-E3",
        "title": "ICH E3 - Structure and Content of Clinical Study Reports",
        "agency": "ICH",
        "jurisdiction": "International",
        "status": "current",
        "url": "https://database.ich.org/sites/default/files/E3_Guideline.pdf"
    },
    {
        "id": "reg_ich_e6r2",
        "code": "ICH-E6(R2)",
        "title": "ICH E6(R2) - Good Clinical Practice",
        "agency": "ICH",
        "jurisdiction": "International",
        "status": "current",
        "url": "https://database.ich.org/sites/default/files/E6_R2_Addendum.pdf"
    },
    {
        "id": "reg_ich_e9",
        "code": "ICH-E9",
        "title": "ICH E9 - Statistical Principles for Clinical Trials",
        "agency": "ICH",
        "jurisdiction": "International",
        "status": "current",
        "url": "https://database.ich.org/sites/default/files/E9_Guideline.pdf"
    },
]

SEED_CONCEPTS = [
    {
        "id": "concept_ae",
        "name": "Adverse Event",
        "concept_type": "clinical",
        "definition": "Any untoward medical occurrence in a patient administered a pharmaceutical product",
        "source": "ICH-E2A",
        "synonyms": ["AE", "adverse experience"]
    },
    {
        "id": "concept_sae",
        "name": "Serious Adverse Event",
        "concept_type": "clinical",
        "definition": "Any adverse event that results in death, is life-threatening, requires hospitalization",
        "source": "ICH-E2A",
        "synonyms": ["SAE", "serious adverse experience"]
    },
    {
        "id": "concept_efficacy",
        "name": "Efficacy",
        "concept_type": "clinical",
        "definition": "The ability of a drug to produce the desired therapeutic effect",
        "source": "FDA",
        "synonyms": ["effectiveness", "therapeutic effect"]
    },
    {
        "id": "concept_itt",
        "name": "Intent-to-Treat",
        "concept_type": "statistical",
        "definition": "Analysis including all randomized patients regardless of compliance",
        "source": "ICH-E9",
        "synonyms": ["ITT", "intention-to-treat"]
    },
    {
        "id": "concept_pp",
        "name": "Per-Protocol",
        "concept_type": "statistical",
        "definition": "Analysis of subjects who completed treatment as specified in the protocol",
        "source": "ICH-E9",
        "synonyms": ["PP", "per protocol population"]
    },
]


async def seed_database(connector) -> Dict[str, int]:
    """Seed database with initial data"""
    counts = {"regulations": 0, "concepts": 0}

    logger.info("Seeding database with initial data...")

    # Seed regulations
    for reg in SEED_REGULATIONS:
        try:
            await connector.execute_write("""
                MERGE (r:Regulation {id: $id})
                SET r.code = $code,
                    r.title = $title,
                    r.agency = $agency,
                    r.jurisdiction = $jurisdiction,
                    r.status = $status,
                    r.url = $url,
                    r.created_at = datetime(),
                    r.version = 1
            """, reg)
            counts["regulations"] += 1
        except Exception as e:
            logger.warning(f"Failed to seed regulation {reg['code']}: {e}")

    # Seed concepts
    for concept in SEED_CONCEPTS:
        try:
            await connector.execute_write("""
                MERGE (c:Concept {id: $id})
                SET c.name = $name,
                    c.concept_type = $concept_type,
                    c.definition = $definition,
                    c.source = $source,
                    c.synonyms = $synonyms,
                    c.created_at = datetime(),
                    c.version = 1
            """, concept)
            counts["concepts"] += 1
        except Exception as e:
            logger.warning(f"Failed to seed concept {concept['name']}: {e}")

    logger.info(f"Seeded {counts['regulations']} regulations, {counts['concepts']} concepts")
    return counts


# ═══════════════════════════════════════════════════════════════════════════
#                          CLI
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Lumen Cortex Neo4j Schema Manager")
    parser.add_argument(
        "command",
        choices=["init", "validate", "export", "seed", "docs"],
        help="Command to execute"
    )
    parser.add_argument(
        "--output",
        default="-",
        help="Output file (- for stdout)"
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )

    manager = Neo4jSchemaManager()

    if args.command == "export":
        cypher = manager.get_all_cypher()
        if args.output == "-":
            print(cypher)
        else:
            with open(args.output, "w") as f:
                f.write(cypher)
            logger.info(f"Schema exported to {args.output}")

    elif args.command == "docs":
        docs = manager.get_schema_documentation()
        if args.output == "-":
            print(docs)
        else:
            with open(args.output, "w") as f:
                f.write(docs)
            logger.info(f"Documentation exported to {args.output}")

    elif args.command == "init":
        # Would require actual Neo4j connection
        logger.info("Schema initialization requires Neo4j connection")
        logger.info("Export schema with 'export' command and run manually")

    elif args.command == "validate":
        logger.info("Schema validation requires Neo4j connection")

    elif args.command == "seed":
        logger.info("Database seeding requires Neo4j connection")


if __name__ == "__main__":
    asyncio.run(main())
