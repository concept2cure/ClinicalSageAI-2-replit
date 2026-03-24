# Audit: High-Performance Resource Allocation for Training and Inference

**Date:** 2026-03-24  
**Scope:** Current repository implementation and infrastructure definitions for model training/inference efficiency, emphasizing inference-dominant workloads.

---

## Executive Verdict

The current platform is **application-scalable** (API + worker autoscaling, queue-based processing, provider failover), but **not yet inference-infrastructure optimized** for modern AI workloads.

- **Strengths today:** horizontal scaling patterns, queue workers, Redis-backed coordination, multi-provider LLM failover, cost-aware model metadata.
- **Primary gap:** inference is mostly delegated to third-party APIs (OpenAI/Kimi/HuggingFace API style usage), with no first-class GPU scheduling, custom silicon routing, or low-latency model serving stack in-repo.
- **Net assessment:** good reliability foundation; limited control over token throughput economics, tail latency, and accelerator utilization.

**Readiness score (for "high-performance inference resource allocation")**: **4.5 / 10**.

---

## Evidence Snapshot (Current State)

### 1) Inference architecture is provider-routed, not accelerator-orchestrated

- Multi-provider service supports OpenAI + Kimi with circuit breakers and failover.
- No evidence of in-cluster GPU runtime (e.g., vLLM/Triton/TensorRT-LLM/KServe) being actively deployed in production path.
- Lumen router lists local model support conceptually, but primary registration/behavior is still API-provider oriented.

**Evidence**
- `server/lib/multi-provider-llm.ts` (provider configs, failover, circuit breaker).  
- `lumen_cortex/enterprise/llm_router.py` (provider abstraction and model registry incl. API providers and optional local).  

### 2) Worker scalability exists, but is CPU/memory-centric

- Kubernetes worker autoscaling uses **CPU + memory utilization** thresholds.
- Helm values define worker `CONCURRENCY`, memory restart threshold, and standard CPU/memory requests/limits.
- This is solid for general background processing, but not specific to GPU token-serving saturation or batch-prefill scheduling.

**Evidence**
- `charts/trialsage-cer/templates/worker-hpa.yaml`.  
- `charts/trialsage-cer/templates/worker-deployment.yaml`.  
- `charts/trialsage-cer/values.yaml`.

### 3) Cloud compute baseline is ECS Fargate (no GPU primitives in module)

- Terraform module provisions ECS Fargate API/worker services and desired-count scaling patterns.
- No GPU node groups, no accelerator instance class strategy, no model-serving cluster profile.

**Evidence**
- `terraform/modules/ecs-fargate/main.tf`.  
- `terraform/environments/production/main.tf`.

### 4) Embedding/vector pipeline is practical, but external-call heavy

- Vectorization worker batches embedding requests (`BATCH_SIZE=5`) and uses OpenAI embeddings.
- Good first-order batching exists, but no dynamic micro-batching controller based on P95 latency/queue pressure.

**Evidence**
- `server/workers/vectorization-worker.ts`.

### 5) Training stack is lightweight classical ML; no distributed training fabric

- Training scripts focus on local RandomForest training workflows.
- No distributed training orchestration (no DeepSpeed/FSDP/Ray/Kubeflow/PyTorch distributed job specs in current production path).

**Evidence**
- `scripts/train_final_model.py`.  
- `server/services/python/ml/train_rf_model.py`.

---

## Gap Analysis Against Target State

### Target Pattern A: Custom silicon / accelerator-aware serving

**Current:** No explicit support for Groq LPU, AWS Inferentia/Trainium, or GPU-aware inference scheduler in deployment modules.  
**Gap:** Missing hardware abstraction layer for accelerator class selection + per-model routing policy.

### Target Pattern B: Vast data fabric for inference-time context movement

**Current:** Redis + Postgres + S3-style resources exist, but no explicit low-latency feature store / vector cache tiering strategy across hot-warm-cold paths.  
**Gap:** Missing inference data plane optimization (prompt cache, embedding cache eviction policy, semantic shard locality).

### Target Pattern C: Hybrid cloud GPU orchestration

**Current:** Fargate + Kubernetes-style autoscaling templates exist, but no hybrid control plane for bursting across providers or regions based on queue/SLA/cost.  
**Gap:** Missing policy engine for placement, admission control, and model SLA classes.

---

## Priority Recommendations

## P0 (0–30 days): Build observability and control loop before buying hardware

1. **Introduce inference SLO telemetry contract**
   - Track per-model: tokens/sec, prefill latency, decode latency, queue wait, timeout rate, cost/request.
   - Add route-level tags: provider, model, fallback-used, retry-count.

2. **Add inference admission + routing policy layer**
   - Policy dimensions: latency class (interactive/background), max cost/request, compliance boundary, fallback order.
   - Enforce hard guardrails (drop/defer downgrade) during congestion.

3. **Implement prompt/embedding cache strategy**
   - Reuse deterministic prompts and embedding payloads where permissible.
   - Add cache hit KPIs and expiry tiers.

**Expected result:** 15–30% cost reduction and improved P95 stability without infra migration.

## P1 (31–90 days): Add GPU-capable inference plane (while retaining API fallback)

1. **Deploy a self-hosted model-serving lane for selected workloads**
   - Start with non-critical or high-volume predictable paths (summarization/extraction).
   - Candidate stack: vLLM or Triton on Kubernetes GPU node pool.

2. **Create dual-lane router**
   - Lane A: external API providers (current path).
   - Lane B: internal GPU serving for designated model IDs/use cases.
   - Decision criteria: SLA, cost threshold, queue depth.

3. **Add HPA/KEDA on queue + token metrics**
   - Scale on queue depth and token throughput, not only CPU/memory.

**Expected result:** stronger unit economics on repetitive inference, better control of throughput.

## P2 (90–180 days): Hybrid/cloud-burst + accelerator diversification

1. **Hybrid burst orchestrator**
   - Policy-driven placement across primary cloud, secondary cloud, and API fallback.

2. **Accelerator experiment track**
   - Benchmark one of: Groq LPU endpoint, Inferentia2, or high-memory GPU profile for dominant workload shape.
   - Compare on cost/1M tokens, P95, failure isolation, engineering complexity.

3. **Data fabric hardening**
   - Add feature/vector locality strategy and cross-region replication policy for inference context stores.

**Expected result:** resilient multi-lane inference plane with predictable costs under load spikes.

---

## Practical Architecture Blueprint (Recommended)

- **Control Plane**
  - Routing policy service (cost/SLA/compliance aware).
  - Central model registry + capability metadata.
  - Capacity forecaster (queue + historical demand).

- **Data Plane**
  - API lane: OpenAI/Kimi/Anthropic (failover retained).
  - GPU lane: self-hosted serving cluster with dynamic batching.
  - Cache lane: prompt/embedding/response cache with TTL tiers.

- **Operations Plane**
  - Unified metrics: provider latency, accelerator utilization, queue delay, token economics.
  - Reliability controls: circuit breaker (already present), retry budgets, overload shedding.

---

## Risk Register

1. **Vendor concentration risk** (current external API-heavy pattern).
2. **Opaque latency variance** from third-party endpoints.
3. **Limited cost controllability** at high sustained token volumes.
4. **No explicit accelerator failover policy** for future on-prem/hybrid footprint.

---

## Conclusion

The system is already **well-positioned operationally** for resilient application workflows (queues, autoscaling, failover), but it is **not yet optimized as an inference infrastructure platform**. The fastest path is to:

1) instrument inference economics + SLOs,  
2) introduce policy-based routing,  
3) stand up a targeted GPU/self-hosted lane while preserving current API resilience.

This phased approach minimizes migration risk while directly addressing the user goal: **high-performance, efficient allocation for inference-dominant workloads**.
