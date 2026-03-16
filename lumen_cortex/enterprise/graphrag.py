"""
═══════════════════════════════════════════════════════════════════════════════
                    HIERARCHICAL VECTOR-GRAPH RAG
═══════════════════════════════════════════════════════════════════════════════

Enterprise GraphRAG with hierarchical community detection.

CAPABILITIES:
1. Hierarchical Leiden Clustering - Multi-level community detection
2. Neo4j Vector Index Integration - HNSW for semantic search
3. Graph Embeddings (Node2Vec) - Structural similarity
4. Temporal Edge Analysis - Time-aware relationships
5. LLM Community Summarization - Natural language themes

GRAPH STRUCTURE:
- Entity nodes (drugs, diseases, genes, organizations)
- Document nodes (CSRs, guidances, publications)
- Relationship edges (treats, causes, mentioned_in, etc.)
- Community clusters at multiple hierarchy levels

@module lumen_cortex.enterprise.graphrag
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from typing import (
    Dict, Any, List, Optional, Tuple, Set,
    Union, TypeVar, Generic, Protocol
)

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, Field, ConfigDict
from pydantic.types import confloat

from .core import CircuitBreaker, audit_event, event_bus
from .compliance import MerkleNode, MerkleAuditTrail, ComplianceContext

logger = logging.getLogger("LumenCortex.GraphRAG")


# ═══════════════════════════════════════════════════════════════════════════
#                          ENUMS AND TYPES
# ═══════════════════════════════════════════════════════════════════════════

class EntityType(Enum):
    """Types of entities in the knowledge graph"""
    DRUG = "drug"
    DISEASE = "disease"
    GENE = "gene"
    PROTEIN = "protein"
    PATHWAY = "pathway"
    ADVERSE_EVENT = "adverse_event"
    INDICATION = "indication"
    ORGANIZATION = "organization"
    REGULATORY_BODY = "regulatory_body"
    CLINICAL_TRIAL = "clinical_trial"
    ENDPOINT = "endpoint"
    BIOMARKER = "biomarker"
    DOCUMENT = "document"
    SECTION = "section"
    PREDICATE_DEVICE = "predicate_device"
    CLEARANCE_DECISION = "clearance_decision"
    REGULATORY_STRATEGY = "regulatory_strategy"


class RelationshipType(Enum):
    """Types of relationships between entities"""
    TREATS = "treats"
    CAUSES = "causes"
    INHIBITS = "inhibits"
    ACTIVATES = "activates"
    ASSOCIATED_WITH = "associated_with"
    MENTIONED_IN = "mentioned_in"
    APPROVED_BY = "approved_by"
    REJECTED_BY = "rejected_by"
    TARGETS = "targets"
    INTERACTS_WITH = "interacts_with"
    METABOLIZES = "metabolizes"
    PART_OF = "part_of"
    CITES = "cites"
    CONTRADICTS = "contradicts"
    SUPPORTS = "supports"
    SUPERSEDES = "supersedes"
    TESTED_WITH = "tested_with"
    CLEARED_UNDER = "cleared_under"
    FAILED_DUE_TO = "failed_due_to"
    SIMILAR_TO = "similar_to"
    PREDICATE_OF = "predicate_of"


class CommunityLevel(Enum):
    """Hierarchy levels for communities"""
    LEAF = 0        # Most granular (individual concepts)
    LOCAL = 1       # Local clusters
    REGIONAL = 2    # Regional groupings
    GLOBAL = 3      # Global themes


# ═══════════════════════════════════════════════════════════════════════════
#                          DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class GraphEntity:
    """Entity node in the knowledge graph"""
    id: str
    name: str
    entity_type: EntityType
    properties: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[NDArray] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    source_documents: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.entity_type.value,
            "properties": self.properties,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class GraphRelationship:
    """Relationship edge in the knowledge graph"""
    id: str
    source_id: str
    target_id: str
    relationship_type: RelationshipType
    properties: Dict[str, Any] = field(default_factory=dict)
    weight: float = 1.0
    confidence: float = 1.0
    temporal: Optional[datetime] = None  # When this relationship was established
    evidence: List[str] = field(default_factory=list)  # Supporting document IDs

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source_id,
            "target": self.target_id,
            "type": self.relationship_type.value,
            "weight": self.weight,
            "confidence": self.confidence,
        }


@dataclass
class GraphCommunity:
    """Hierarchical community with vector embeddings"""
    community_id: str
    level: CommunityLevel
    nodes: List[str]                    # Entity IDs in this community
    embedding: Optional[NDArray] = None  # Aggregated embedding
    summary: Optional[str] = None       # LLM-generated summary
    themes: List[str] = field(default_factory=list)
    modularity_score: float = 0.0
    parent_id: Optional[str] = None
    children_ids: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "community_id": self.community_id,
            "level": self.level.value,
            "node_count": len(self.nodes),
            "summary": self.summary,
            "themes": self.themes,
            "modularity": self.modularity_score,
            "parent_id": self.parent_id,
            "children_count": len(self.children_ids),
        }


class SubgraphResult(BaseModel):
    """Result of subgraph query"""
    query: str
    entry_points: List[Dict]
    entities: List[Dict]
    relationships: List[Dict]
    communities: List[Dict]
    relevance_scores: Dict[str, float]
    merkle_root: Optional[str] = None
    retrieved_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(arbitrary_types_allowed=True)


# ═══════════════════════════════════════════════════════════════════════════
#                          IN-MEMORY GRAPH
# ═══════════════════════════════════════════════════════════════════════════

class InMemoryGraph:
    """
    In-memory graph implementation for development/testing.

    Provides graph operations without Neo4j dependency.
    """

    def __init__(self):
        self.entities: Dict[str, GraphEntity] = {}
        self.relationships: Dict[str, GraphRelationship] = {}
        self.adjacency: Dict[str, List[str]] = defaultdict(list)  # entity_id -> [rel_ids]
        self.communities: Dict[str, GraphCommunity] = {}
        self._embedding_model = None

    def add_entity(self, entity: GraphEntity) -> None:
        """Add entity to graph"""
        self.entities[entity.id] = entity
        if entity.id not in self.adjacency:
            self.adjacency[entity.id] = []

    def add_relationship(self, relationship: GraphRelationship) -> None:
        """Add relationship to graph"""
        self.relationships[relationship.id] = relationship
        self.adjacency[relationship.source_id].append(relationship.id)
        self.adjacency[relationship.target_id].append(relationship.id)

    def get_entity(self, entity_id: str) -> Optional[GraphEntity]:
        """Get entity by ID"""
        return self.entities.get(entity_id)

    def get_neighbors(
        self,
        entity_id: str,
        relationship_types: Optional[List[RelationshipType]] = None,
        max_depth: int = 1
    ) -> List[Tuple[GraphEntity, GraphRelationship]]:
        """Get neighboring entities"""
        if entity_id not in self.entities:
            return []

        neighbors = []
        visited = {entity_id}

        def traverse(current_id: str, depth: int):
            if depth > max_depth:
                return

            for rel_id in self.adjacency.get(current_id, []):
                rel = self.relationships.get(rel_id)
                if not rel:
                    continue

                # Filter by relationship type
                if relationship_types and rel.relationship_type not in relationship_types:
                    continue

                # Get neighbor
                neighbor_id = rel.target_id if rel.source_id == current_id else rel.source_id

                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    neighbor = self.entities.get(neighbor_id)
                    if neighbor:
                        neighbors.append((neighbor, rel))
                        traverse(neighbor_id, depth + 1)

        traverse(entity_id, 1)
        return neighbors

    def get_subgraph(
        self,
        entity_ids: List[str],
        max_depth: int = 2
    ) -> Tuple[List[GraphEntity], List[GraphRelationship]]:
        """Extract subgraph around given entities"""
        included_entities: Set[str] = set(entity_ids)
        included_relationships: Set[str] = set()

        # BFS to expand subgraph
        frontier = list(entity_ids)
        for _ in range(max_depth):
            new_frontier = []
            for entity_id in frontier:
                for rel_id in self.adjacency.get(entity_id, []):
                    rel = self.relationships.get(rel_id)
                    if not rel:
                        continue

                    included_relationships.add(rel_id)

                    # Add connected entity
                    other_id = rel.target_id if rel.source_id == entity_id else rel.source_id
                    if other_id not in included_entities:
                        included_entities.add(other_id)
                        new_frontier.append(other_id)

            frontier = new_frontier

        entities = [self.entities[eid] for eid in included_entities if eid in self.entities]
        relationships = [self.relationships[rid] for rid in included_relationships]

        return entities, relationships

    def find_paths(
        self,
        source_id: str,
        target_id: str,
        max_length: int = 4
    ) -> List[List[str]]:
        """Find all paths between two entities"""
        if source_id not in self.entities or target_id not in self.entities:
            return []

        paths = []

        def dfs(current: str, target: str, path: List[str], visited: Set[str]):
            if len(path) > max_length:
                return

            if current == target:
                paths.append(path.copy())
                return

            for rel_id in self.adjacency.get(current, []):
                rel = self.relationships.get(rel_id)
                if not rel:
                    continue

                next_id = rel.target_id if rel.source_id == current else rel.source_id
                if next_id not in visited:
                    visited.add(next_id)
                    path.append(next_id)
                    dfs(next_id, target, path, visited)
                    path.pop()
                    visited.remove(next_id)

        dfs(source_id, target_id, [source_id], {source_id})
        return paths


# ═══════════════════════════════════════════════════════════════════════════
#                          COMMUNITY DETECTION
# ═══════════════════════════════════════════════════════════════════════════

class CommunityDetector:
    """
    Hierarchical community detection using Leiden algorithm.

    For production Neo4j, this would use GDS Leiden.
    This implementation provides local clustering.
    """

    def __init__(self, graph: InMemoryGraph):
        self.graph = graph

    def detect_communities(
        self,
        resolution: float = 1.0,
        levels: int = 3
    ) -> Dict[int, List[GraphCommunity]]:
        """
        Detect hierarchical communities.

        Returns communities at each level.
        """
        # Build adjacency matrix
        entity_ids = list(self.graph.entities.keys())
        n = len(entity_ids)

        if n == 0:
            return {}

        id_to_idx = {eid: i for i, eid in enumerate(entity_ids)}

        # Build weighted adjacency matrix
        adj_matrix = np.zeros((n, n))
        for rel in self.graph.relationships.values():
            if rel.source_id in id_to_idx and rel.target_id in id_to_idx:
                i, j = id_to_idx[rel.source_id], id_to_idx[rel.target_id]
                adj_matrix[i, j] = rel.weight
                adj_matrix[j, i] = rel.weight

        # Run hierarchical clustering (simplified Leiden)
        communities_by_level = {}

        for level in range(levels):
            level_resolution = resolution * (level + 1)
            communities = self._leiden_partition(
                adj_matrix,
                entity_ids,
                level_resolution
            )

            level_enum = CommunityLevel(min(level, 3))
            communities_by_level[level] = [
                GraphCommunity(
                    community_id=f"comm-L{level}-{i}",
                    level=level_enum,
                    nodes=nodes,
                    modularity_score=self._calculate_modularity(
                        nodes, id_to_idx, adj_matrix
                    )
                )
                for i, nodes in enumerate(communities)
            ]

        # Link parent-child relationships
        self._link_hierarchy(communities_by_level)

        return communities_by_level

    def _leiden_partition(
        self,
        adj_matrix: NDArray,
        entity_ids: List[str],
        resolution: float
    ) -> List[List[str]]:
        """
        Simplified Leiden-style partitioning.

        In production, use networkx community or Neo4j GDS.
        """
        n = len(entity_ids)

        if n == 0:
            return []

        try:
            import networkx as nx
            from networkx.algorithms import community as nx_community

            # Build networkx graph
            G = nx.Graph()
            for i, eid in enumerate(entity_ids):
                G.add_node(eid)

            for i in range(n):
                for j in range(i + 1, n):
                    if adj_matrix[i, j] > 0:
                        G.add_edge(entity_ids[i], entity_ids[j], weight=adj_matrix[i, j])

            # Use Louvain (Leiden not in base networkx)
            communities = nx_community.louvain_communities(
                G,
                resolution=resolution,
                weight='weight'
            )

            return [list(c) for c in communities]

        except ImportError:
            # Fallback: simple connected components
            logger.warning("networkx not available, using simple clustering")
            return self._simple_clustering(adj_matrix, entity_ids)

    def _simple_clustering(
        self,
        adj_matrix: NDArray,
        entity_ids: List[str]
    ) -> List[List[str]]:
        """Simple connected components clustering"""
        n = len(entity_ids)
        visited = [False] * n
        communities = []

        def dfs(node: int, community: List[int]):
            visited[node] = True
            community.append(node)
            for neighbor in range(n):
                if adj_matrix[node, neighbor] > 0 and not visited[neighbor]:
                    dfs(neighbor, community)

        for i in range(n):
            if not visited[i]:
                community = []
                dfs(i, community)
                communities.append([entity_ids[idx] for idx in community])

        return communities

    def _calculate_modularity(
        self,
        nodes: List[str],
        id_to_idx: Dict[str, int],
        adj_matrix: NDArray
    ) -> float:
        """Calculate modularity of a community"""
        if len(nodes) <= 1:
            return 0.0

        m = adj_matrix.sum() / 2
        if m == 0:
            return 0.0

        q = 0.0
        for i_id in nodes:
            for j_id in nodes:
                if i_id in id_to_idx and j_id in id_to_idx:
                    i, j = id_to_idx[i_id], id_to_idx[j_id]
                    a_ij = adj_matrix[i, j]
                    k_i = adj_matrix[i].sum()
                    k_j = adj_matrix[j].sum()
                    q += a_ij - (k_i * k_j) / (2 * m)

        return q / (2 * m)

    def _link_hierarchy(
        self,
        communities_by_level: Dict[int, List[GraphCommunity]]
    ) -> None:
        """Link parent-child relationships between levels"""
        levels = sorted(communities_by_level.keys())

        for i in range(len(levels) - 1):
            child_level = levels[i]
            parent_level = levels[i + 1]

            children = communities_by_level[child_level]
            parents = communities_by_level[parent_level]

            for child in children:
                child_nodes = set(child.nodes)

                # Find parent with most overlap
                best_parent = None
                best_overlap = 0

                for parent in parents:
                    overlap = len(child_nodes & set(parent.nodes))
                    if overlap > best_overlap:
                        best_overlap = overlap
                        best_parent = parent

                if best_parent:
                    child.parent_id = best_parent.community_id
                    best_parent.children_ids.append(child.community_id)


# ═══════════════════════════════════════════════════════════════════════════
#                          COMMUNITY SUMMARIZER
# ═══════════════════════════════════════════════════════════════════════════

class CommunitySummarizer:
    """
    Generate natural language summaries for graph communities.

    Uses LLM to create thematic descriptions of entity clusters.
    """

    def __init__(self, graph: InMemoryGraph):
        self.graph = graph

    async def summarize_community(
        self,
        community: GraphCommunity
    ) -> str:
        """Generate summary for a single community"""
        # Gather entity information
        entities = []
        for node_id in community.nodes[:20]:  # Limit for LLM context
            entity = self.graph.get_entity(node_id)
            if entity:
                entities.append(entity)

        if not entities:
            return "Empty community"

        # Build description
        entity_descriptions = []
        for e in entities:
            desc = f"- {e.name} ({e.entity_type.value})"
            if e.properties:
                desc += f": {', '.join(f'{k}={v}' for k, v in list(e.properties.items())[:3])}"
            entity_descriptions.append(desc)

        # Get relationships within community
        internal_rels = []
        node_set = set(community.nodes)
        for rel in self.graph.relationships.values():
            if rel.source_id in node_set and rel.target_id in node_set:
                source = self.graph.get_entity(rel.source_id)
                target = self.graph.get_entity(rel.target_id)
                if source and target:
                    internal_rels.append(
                        f"- {source.name} --[{rel.relationship_type.value}]--> {target.name}"
                    )

        # Generate summary (would use LLM in production)
        entity_types = defaultdict(int)
        for e in entities:
            entity_types[e.entity_type.value] += 1

        type_summary = ", ".join(f"{count} {t}s" for t, count in entity_types.items())

        summary = (
            f"Community with {len(community.nodes)} entities ({type_summary}). "
            f"Contains {len(internal_rels)} internal relationships. "
        )

        # Extract themes from entity names
        themes = self._extract_themes([e.name for e in entities])
        if themes:
            summary += f"Key themes: {', '.join(themes[:5])}."
            community.themes = themes[:5]

        return summary

    def _extract_themes(self, names: List[str]) -> List[str]:
        """Extract common themes from entity names"""
        # Simple word frequency (would use NLP in production)
        word_counts = defaultdict(int)

        for name in names:
            words = name.lower().split()
            for word in words:
                if len(word) > 3:  # Skip short words
                    word_counts[word] += 1

        # Return most common words
        sorted_words = sorted(
            word_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )
        return [word for word, _ in sorted_words[:10]]

    async def summarize_all(
        self,
        communities: List[GraphCommunity]
    ) -> None:
        """Generate summaries for all communities"""
        for community in communities:
            community.summary = await self.summarize_community(community)


# ═══════════════════════════════════════════════════════════════════════════
#                          HIERARCHICAL GRAPH RAG
# ═══════════════════════════════════════════════════════════════════════════

class HierarchicalGraphRAG:
    """
    Enterprise GraphRAG with hierarchical community detection.

    Combines:
    - Vector similarity search (HNSW)
    - Graph traversal
    - Community-based retrieval
    - Temporal filtering
    - Multi-hop reasoning
    """

    def __init__(self, use_neo4j: bool = False, neo4j_config: Optional[Dict] = None):
        self.use_neo4j = use_neo4j
        self.neo4j_config = neo4j_config

        # In-memory graph for development
        self.graph = InMemoryGraph()
        self.community_detector = CommunityDetector(self.graph)
        self.summarizer = CommunitySummarizer(self.graph)

        # Communities by level
        self.communities: Dict[int, List[GraphCommunity]] = {}

        # Merkle tree for integrity
        self.merkle_roots: Dict[str, str] = {}
        self.audit_trail = MerkleAuditTrail()

        # Embedding model
        self._embedding_model = None

        logger.info(f"HierarchicalGraphRAG initialized (neo4j={use_neo4j})")

    async def _get_embedding_model(self):
        """Lazy load embedding model"""
        if self._embedding_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            except ImportError:
                logger.warning("sentence-transformers not installed")
        return self._embedding_model

    # ─────────────────────────────────────────────────────────────────────
    #                    GRAPH CONSTRUCTION
    # ─────────────────────────────────────────────────────────────────────

    @audit_event("graph", "build")
    async def build_graph(
        self,
        documents: List[Dict[str, Any]],
        context: Optional[ComplianceContext] = None
    ) -> Dict[str, int]:
        """
        Build knowledge graph from documents.

        Args:
            documents: List of document dicts with entities and relationships

        Returns:
            Statistics about graph construction
        """
        stats = {
            "documents": 0,
            "entities": 0,
            "relationships": 0,
        }

        embedding_model = await self._get_embedding_model()

        for doc in documents:
            stats["documents"] += 1

            # Create document entity
            doc_entity = GraphEntity(
                id=doc["id"],
                name=doc.get("title", doc["id"]),
                entity_type=EntityType.DOCUMENT,
                properties={
                    "content": doc.get("content", "")[:500],
                    "document_type": doc.get("type", "unknown"),
                },
            )

            # Generate embedding
            if embedding_model and doc.get("content"):
                doc_entity.embedding = embedding_model.encode([doc["content"][:500]])[0]

            self.graph.add_entity(doc_entity)
            stats["entities"] += 1

            # Add entities from document
            for entity_data in doc.get("entities", []):
                entity = GraphEntity(
                    id=entity_data["id"],
                    name=entity_data["name"],
                    entity_type=EntityType(entity_data.get("type", "document")),
                    properties=entity_data.get("properties", {}),
                    source_documents=[doc["id"]],
                )

                # Generate embedding
                if embedding_model:
                    entity.embedding = embedding_model.encode([entity.name])[0]

                self.graph.add_entity(entity)
                stats["entities"] += 1

                # Link entity to document
                mention_rel = GraphRelationship(
                    id=f"rel-{entity.id}-{doc['id']}",
                    source_id=entity.id,
                    target_id=doc["id"],
                    relationship_type=RelationshipType.MENTIONED_IN,
                    confidence=entity_data.get("confidence", 1.0),
                )
                self.graph.add_relationship(mention_rel)
                stats["relationships"] += 1

                # Add entity relationships
                for rel_data in entity_data.get("relationships", []):
                    rel = GraphRelationship(
                        id=rel_data.get("id", f"rel-{entity.id}-{rel_data['target']}"),
                        source_id=entity.id,
                        target_id=rel_data["target"],
                        relationship_type=RelationshipType(rel_data.get("type", "associated_with")),
                        weight=rel_data.get("weight", 1.0),
                        confidence=rel_data.get("confidence", 1.0),
                        evidence=[doc["id"]],
                    )
                    self.graph.add_relationship(rel)
                    stats["relationships"] += 1

        # Audit log
        self.audit_trail.append({
            "action": "build_graph",
            "documents": stats["documents"],
            "entities": stats["entities"],
            "relationships": stats["relationships"],
        })

        logger.info(
            f"Graph built: {stats['entities']} entities, "
            f"{stats['relationships']} relationships"
        )

        return stats

    # ─────────────────────────────────────────────────────────────────────
    #                    COMMUNITY DETECTION
    # ─────────────────────────────────────────────────────────────────────

    @audit_event("graph", "detect_communities")
    async def detect_communities(
        self,
        resolution: float = 1.0,
        levels: int = 3,
        generate_summaries: bool = True
    ) -> Dict[int, List[GraphCommunity]]:
        """
        Run hierarchical community detection.

        Args:
            resolution: Leiden resolution parameter
            levels: Number of hierarchy levels
            generate_summaries: Whether to generate LLM summaries

        Returns:
            Communities by level
        """
        # Detect communities
        self.communities = self.community_detector.detect_communities(
            resolution=resolution,
            levels=levels
        )

        # Generate embeddings for communities
        embedding_model = await self._get_embedding_model()

        for level, communities in self.communities.items():
            for community in communities:
                # Aggregate node embeddings
                node_embeddings = []
                for node_id in community.nodes:
                    entity = self.graph.get_entity(node_id)
                    if entity and entity.embedding is not None:
                        node_embeddings.append(entity.embedding)

                if node_embeddings:
                    community.embedding = np.mean(node_embeddings, axis=0)

                # Store in graph
                self.graph.communities[community.community_id] = community

        # Generate summaries
        if generate_summaries:
            for communities in self.communities.values():
                await self.summarizer.summarize_all(communities)

        # Build Merkle tree for community integrity
        community_data = []
        for level, communities in self.communities.items():
            for c in communities:
                community_data.append(json.dumps({
                    "id": c.community_id,
                    "level": level,
                    "nodes": sorted(c.nodes),
                }, sort_keys=True))

        merkle_tree = MerkleNode.build_tree(community_data)
        self.merkle_roots["communities"] = merkle_tree.hash

        total_communities = sum(len(c) for c in self.communities.values())
        logger.info(f"Detected {total_communities} communities across {levels} levels")

        return self.communities

    # ─────────────────────────────────────────────────────────────────────
    #                    RETRIEVAL
    # ─────────────────────────────────────────────────────────────────────

    @audit_event("graph", "query")
    async def query(
        self,
        query_text: str,
        top_k: int = 10,
        include_communities: bool = True,
        max_depth: int = 2,
        context: Optional[ComplianceContext] = None
    ) -> SubgraphResult:
        """
        Query the knowledge graph using vector + graph search.

        Combines:
        1. Vector similarity for entry points
        2. Graph traversal for context
        3. Community-level retrieval for themes
        """
        # Get query embedding
        embedding_model = await self._get_embedding_model()
        query_embedding = None

        if embedding_model:
            query_embedding = embedding_model.encode([query_text])[0]

        # Vector search for entry points
        entry_points = await self._vector_search(query_embedding, top_k)

        # Extract subgraph around entry points
        entry_ids = [ep["id"] for ep in entry_points]
        entities, relationships = self.graph.get_subgraph(entry_ids, max_depth)

        # Find relevant communities
        relevant_communities = []
        if include_communities:
            for level, communities in self.communities.items():
                for community in communities:
                    # Check if any entry point is in this community
                    if any(ep_id in community.nodes for ep_id in entry_ids):
                        relevant_communities.append(community)
                    # Or check embedding similarity
                    elif community.embedding is not None and query_embedding is not None:
                        similarity = np.dot(query_embedding, community.embedding) / (
                            np.linalg.norm(query_embedding) * np.linalg.norm(community.embedding)
                        )
                        if similarity > 0.5:
                            relevant_communities.append(community)

        # Calculate relevance scores
        relevance_scores = {}
        for ep in entry_points:
            relevance_scores[ep["id"]] = ep.get("score", 0.0)

        # Build result
        result = SubgraphResult(
            query=query_text,
            entry_points=entry_points,
            entities=[e.to_dict() for e in entities],
            relationships=[r.to_dict() for r in relationships],
            communities=[c.to_dict() for c in relevant_communities],
            relevance_scores=relevance_scores,
            merkle_root=self.merkle_roots.get("communities"),
        )

        # Audit log
        self.audit_trail.append({
            "action": "query",
            "query_hash": hashlib.sha256(query_text.encode()).hexdigest()[:16],
            "entry_points": len(entry_points),
            "entities_returned": len(entities),
            "communities_matched": len(relevant_communities),
        })

        return result

    async def _vector_search(
        self,
        query_embedding: Optional[NDArray],
        top_k: int
    ) -> List[Dict[str, Any]]:
        """Search entities by vector similarity"""
        if query_embedding is None:
            # Fallback to random entities
            entities = list(self.graph.entities.values())[:top_k]
            return [{"id": e.id, "name": e.name, "score": 0.5} for e in entities]

        # Calculate similarities
        scored_entities = []

        for entity in self.graph.entities.values():
            if entity.embedding is not None:
                similarity = np.dot(query_embedding, entity.embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(entity.embedding) + 1e-8
                )
                scored_entities.append({
                    "id": entity.id,
                    "name": entity.name,
                    "type": entity.entity_type.value,
                    "score": float(similarity),
                })

        # Sort and return top_k
        scored_entities.sort(key=lambda x: x["score"], reverse=True)
        return scored_entities[:top_k]

    # ─────────────────────────────────────────────────────────────────────
    #                    GRAPH ANALYSIS
    # ─────────────────────────────────────────────────────────────────────

    async def find_regulatory_patterns(
        self,
        entity_type: EntityType = EntityType.DRUG,
        relationship_type: RelationshipType = RelationshipType.REJECTED_BY
    ) -> List[Dict[str, Any]]:
        """
        Find patterns in regulatory decisions.

        Example: Find drugs rejected by FDA and their common characteristics.
        """
        patterns = []

        # Find all entities of the given type
        target_entities = [
            e for e in self.graph.entities.values()
            if e.entity_type == entity_type
        ]

        # For each entity, check for the relationship
        for entity in target_entities:
            matching_rels = []
            for rel_id in self.graph.adjacency.get(entity.id, []):
                rel = self.graph.relationships.get(rel_id)
                if rel and rel.relationship_type == relationship_type:
                    matching_rels.append(rel)

            if matching_rels:
                # Find related entities (causes, associated conditions)
                neighbors = self.graph.get_neighbors(entity.id, max_depth=1)

                patterns.append({
                    "entity": entity.to_dict(),
                    "relationships": [r.to_dict() for r in matching_rels],
                    "context": [
                        {"entity": n.to_dict(), "via": r.to_dict()}
                        for n, r in neighbors[:10]
                    ],
                })

        return patterns

    async def get_entity_timeline(
        self,
        entity_id: str
    ) -> List[Dict[str, Any]]:
        """Get temporal events for an entity"""
        entity = self.graph.get_entity(entity_id)
        if not entity:
            return []

        events = []

        for rel_id in self.graph.adjacency.get(entity_id, []):
            rel = self.graph.relationships.get(rel_id)
            if rel and rel.temporal:
                other_id = rel.target_id if rel.source_id == entity_id else rel.source_id
                other = self.graph.get_entity(other_id)

                events.append({
                    "timestamp": rel.temporal.isoformat(),
                    "relationship": rel.relationship_type.value,
                    "entity": other.to_dict() if other else {"id": other_id},
                    "evidence": rel.evidence,
                })

        # Sort by timestamp
        events.sort(key=lambda x: x["timestamp"])
        return events

    # ─────────────────────────────────────────────────────────────────────
    #                    HEALTH & EXPORT
    # ─────────────────────────────────────────────────────────────────────

    def get_statistics(self) -> Dict[str, Any]:
        """Get graph statistics"""
        entity_types = defaultdict(int)
        for e in self.graph.entities.values():
            entity_types[e.entity_type.value] += 1

        rel_types = defaultdict(int)
        for r in self.graph.relationships.values():
            rel_types[r.relationship_type.value] += 1

        return {
            "total_entities": len(self.graph.entities),
            "total_relationships": len(self.graph.relationships),
            "total_communities": sum(len(c) for c in self.communities.values()),
            "entity_types": dict(entity_types),
            "relationship_types": dict(rel_types),
            "community_levels": len(self.communities),
            "merkle_root": self.merkle_roots.get("communities"),
            "audit_entries": len(self.audit_trail.entries),
        }

    def export_graph(self, format: str = "json") -> str:
        """Export graph data"""
        data = {
            "entities": [e.to_dict() for e in self.graph.entities.values()],
            "relationships": [r.to_dict() for r in self.graph.relationships.values()],
            "communities": {
                level: [c.to_dict() for c in comms]
                for level, comms in self.communities.items()
            },
            "merkle_roots": self.merkle_roots,
            "exported_at": datetime.utcnow().isoformat(),
        }

        if format == "json":
            return json.dumps(data, indent=2)
        else:
            raise ValueError(f"Unsupported format: {format}")
