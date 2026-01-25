# ADR-0004: LUMEN CORTEX AI Architecture

## Status

**Accepted**

- Date: 2026-01-15
- Deciders: AI Team, Platform Architecture, Compliance Team
- Technical Story: Enterprise AI intelligence system for regulatory submissions

## Context

The Concept2Cure platform requires AI capabilities for:

1. **Document Analysis** - Extract tables, figures, citations from regulatory documents
2. **Intelligent Querying** - RAG-based question answering over regulatory knowledge
3. **Hallucination Prevention** - Critical for regulatory accuracy
4. **Audit Compliance** - All AI outputs must be traceable and verifiable
5. **Multi-Provider Resilience** - Cannot depend on single AI provider

Regulatory AI challenges:

- FDA submissions cannot contain AI hallucinations
- All generated content must cite authoritative sources
- Audit trails must show AI decision provenance
- Model outputs must be reproducible for validation

## Decision

**We will implement LUMEN CORTEX as an enterprise-grade AI intelligence layer with mechanistic hallucination detection, multi-provider routing, and 21 CFR Part 11 compliant audit trails.**

### Core Architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                      LUMEN CORTEX                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   GraphRAG  │  │  Citation   │  │   Table     │             │
│  │   Pipeline  │  │  Enforcer   │  │  Extractor  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────┴────────────────┴────────────────┴──────┐             │
│  │              LLM Router (Circuit Breakers)     │             │
│  └──────┬────────────────┬────────────────┬──────┘             │
│         │                │                │                     │
│    ┌────┴────┐     ┌─────┴─────┐    ┌─────┴─────┐              │
│    │ OpenAI  │     │ Anthropic │    │   Local   │              │
│    │ GPT-4o  │     │  Claude   │    │  Models   │              │
│    └─────────┘     └───────────┘    └───────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              21 CFR Part 11 Compliance Layer            │   │
│  │   • Merkle Audit Trails  • Digital Signatures           │   │
│  │   • WORM Storage         • Access Control               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components:

1. **GraphRAG Pipeline** - Hierarchical vector + knowledge graph retrieval
2. **Citation Enforcer** - Multi-layer hallucination detection
3. **Table Extractor** - Bayesian ensemble for clinical tables
4. **LLM Router** - Multi-provider with circuit breakers
5. **Compliance Layer** - Part 11 integration

## Consequences

### Positive

- **Regulatory Safety**: Mechanistic hallucination detection
- **Provider Independence**: No single point of failure
- **Audit Ready**: Complete AI decision provenance
- **Performance**: Circuit breakers prevent cascading failures
- **Extensibility**: Plugin architecture for new AI capabilities

### Negative

- **Complexity**: Multiple subsystems to maintain
- **Cost**: Multi-provider routing increases API costs
- **Latency**: Citation validation adds processing time
- **Training**: Team must understand AI compliance requirements

### Neutral

- All AI outputs include confidence scores
- Citation validation is mandatory (cannot be bypassed)
- Audit logs grow with AI usage

## Alternatives Considered

### Option A: Direct LLM Integration

**Description:** Call OpenAI/Anthropic directly without abstraction

**Pros:**

- Simple implementation
- Lower latency
- Easier debugging

**Cons:**

- Single provider dependency
- No hallucination detection
- No audit trail
- Provider outage = system outage

**Why not chosen:** Unacceptable risk for regulated content generation.

### Option B: LangChain Framework

**Description:** Use LangChain for AI orchestration

**Pros:**

- Large ecosystem
- Pre-built components
- Active community

**Cons:**

- Abstraction overhead
- Rapid API changes
- Limited compliance features
- Black box behavior

**Why not chosen:** Insufficient control for Part 11 compliance requirements.

### Option C: AWS Bedrock / Azure OpenAI

**Description:** Cloud-native AI services

**Pros:**

- Enterprise support
- Compliance certifications
- Managed infrastructure

**Cons:**

- Vendor lock-in
- Limited model selection
- Higher costs
- Less customization

**Why not chosen:** Need multi-provider flexibility and custom compliance layer.

## Implementation Notes

### Citation Enforcement

```python
# lumen_cortex/enterprise/citation.py
class CitationEnforcer:
    """Multi-layer hallucination detection"""

    async def validate(self, response: str, sources: List[Source]) -> ValidationResult:
        # Layer 1: Extract claims from response
        claims = await self.extract_claims(response)

        # Layer 2: Match claims to sources
        matches = await self.match_to_sources(claims, sources)

        # Layer 3: NLI entailment verification
        entailments = await self.verify_entailment(matches)

        # Layer 4: Self-consistency check
        consistency = await self.check_consistency(response, sources)

        return ValidationResult(
            is_valid=all(e.entailed for e in entailments),
            faithfulness_score=self.compute_faithfulness(entailments),
            ungrounded_claims=[c for c, e in zip(claims, entailments) if not e.entailed]
        )
```

### LLM Router with Circuit Breakers

```python
# lumen_cortex/enterprise/llm_router.py
class LLMRouter:
    """Multi-provider routing with resilience"""

    def __init__(self):
        self.providers = {
            'openai': OpenAIProvider(circuit_breaker=CircuitBreaker(
                failure_threshold=3,
                recovery_timeout=60
            )),
            'anthropic': AnthropicProvider(circuit_breaker=CircuitBreaker(
                failure_threshold=3,
                recovery_timeout=60
            )),
        }

    async def route(self, request: AIRequest) -> AIResponse:
        for provider_name in self.get_priority_order(request):
            provider = self.providers[provider_name]
            if provider.circuit_breaker.is_closed():
                try:
                    return await provider.complete(request)
                except ProviderError:
                    provider.circuit_breaker.record_failure()
        raise AllProvidersFailedError()
```

### Audit Integration

```python
# Every AI operation creates audit entry
@audit_event(category="AI_INFERENCE")
async def generate_response(self, query: str, context: ComplianceContext) -> str:
    context.require_permission(Permission.AI_QUERY)

    response = await self.llm_router.route(AIRequest(query=query))
    validation = await self.citation_enforcer.validate(response, context.sources)

    if not validation.is_valid:
        raise HallucinationDetectedError(validation.ungrounded_claims)

    return response
```

## Related Decisions

- ADR-0001 - Drizzle ORM (stores AI audit trails)
- ADR-0002 - Multi-tenant architecture (per-tenant AI context)
- ADR-0003 - 21 CFR Part 11 (compliance layer integration)

## References

- [Retrieval Augmented Generation](https://arxiv.org/abs/2005.11401)
- [FACTUM: Factuality Checking](https://arxiv.org/abs/2310.08157)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [21 CFR Part 11 AI Guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/computer-software-assurance-production-and-quality-system-software)

---

## Revision History

| Date       | Author        | Description                         |
| ---------- | ------------- | ----------------------------------- |
| 2026-01-15 | AI Team       | Initial decision                    |
| 2026-01-25 | Platform Team | Implementation complete, documented |
