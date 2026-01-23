from __future__ import annotations

# Centralized SQL strings (keeps interrogator logic readable)

INSERT_TRUTH = """INSERT INTO truth.clinical_truth_store (
  nct_id, substance_id, metric_name, metric_value_float, metric_value_text,
  is_primary_endpoint, source_document_ref, source_document_hash
) VALUES (
  %(nct_id)s, %(substance_id)s, %(metric_name)s, %(metric_value_float)s, %(metric_value_text)s,
  %(is_primary_endpoint)s, %(source_document_ref)s, %(source_document_hash)s
)
RETURNING id;
"""

INSERT_FRAGMENT = """INSERT INTO prose.smart_fragments (
  ectd_section_path, jurisdiction, content_prose, embedding,
  objectivity_score, confidence_rating, is_verified_against_truth,
  regulatory_precedent_id, burden_of_proof_justification
) VALUES (
  %(ectd_section_path)s, %(jurisdiction)s, %(content_prose)s, %(embedding)s,
  %(objectivity_score)s, %(confidence_rating)s, %(is_verified_against_truth)s,
  %(regulatory_precedent_id)s, %(burden_of_proof_justification)s
)
RETURNING id, version_id;
"""

UPDATE_FRAGMENT = """UPDATE prose.smart_fragments
SET
  ectd_section_path = COALESCE(%(ectd_section_path)s, ectd_section_path),
  jurisdiction = COALESCE(%(jurisdiction)s, jurisdiction),
  content_prose = COALESCE(%(content_prose)s, content_prose),
  embedding = COALESCE(%(embedding)s, embedding),
  objectivity_score = COALESCE(%(objectivity_score)s, objectivity_score),
  confidence_rating = COALESCE(%(confidence_rating)s, confidence_rating),
  is_verified_against_truth = COALESCE(%(is_verified_against_truth)s, is_verified_against_truth),
  regulatory_precedent_id = COALESCE(%(regulatory_precedent_id)s, regulatory_precedent_id),
  burden_of_proof_justification = COALESCE(%(burden_of_proof_justification)s, burden_of_proof_justification)
WHERE id = %(fragment_id)s
RETURNING id, version_id;
"""

GET_FRAGMENT_HEADER = """SELECT *
FROM prose.smart_fragments
WHERE id = %(fragment_id)s;
"""

GET_FRAGMENT_VERSION = """SELECT *
FROM prose.smart_fragment_versions
WHERE fragment_id = %(fragment_id)s AND version_id = %(version_id)s;
"""

LIST_FRAGMENT_VERSIONS = """SELECT fragment_id, version_id, ectd_section_path, jurisdiction,
       created_at, created_by, change_reason, request_id
FROM prose.smart_fragment_versions
WHERE fragment_id = %(fragment_id)s
ORDER BY version_id DESC;
"""

INSERT_TRUTH_LINK = """INSERT INTO prose.fragment_truth_links (
  fragment_id, truth_id, claim_kind, claim_span, extracted_claim_value
) VALUES (
  %(fragment_id)s, %(truth_id)s, %(claim_kind)s, %(claim_span)s, %(extracted_claim_value)s
)
ON CONFLICT (fragment_id, truth_id, claim_kind) DO NOTHING
RETURNING id;
"""

GET_TRUTH_LINKS_WITH_TRUTH = """SELECT
  ftl.id AS link_id,
  ftl.fragment_id,
  ftl.truth_id,
  ftl.claim_kind,
  ftl.claim_span,
  ftl.extracted_claim_value,
  ftl.created_at AS link_created_at,

  ct.nct_id,
  ct.substance_id,
  ct.metric_name,
  ct.metric_value_float,
  ct.metric_value_text,
  ct.is_primary_endpoint,
  ct.source_document_ref,
  ct.source_document_hash,
  ct.created_at AS truth_created_at
FROM prose.fragment_truth_links ftl
JOIN truth.clinical_truth_store ct ON ct.id = ftl.truth_id
WHERE ftl.fragment_id = %(fragment_id)s;
"""

INSERT_PRECEDENT = """INSERT INTO adversarial.regulatory_adversarial_precedents (
  agency_code, failure_mode, historical_question, precedent_vector, source_ref
) VALUES (
  %(agency_code)s, %(failure_mode)s, %(historical_question)s, %(precedent_vector)s, %(source_ref)s
)
RETURNING id;
"""

SEARCH_PRECEDENTS_BY_VECTOR = """SELECT
  id, agency_code, failure_mode, historical_question, source_ref,
  (precedent_vector <-> %(query_vector)s::vector) AS distance
FROM adversarial.regulatory_adversarial_precedents
WHERE precedent_vector IS NOT NULL
  AND (%(agency_code)s IS NULL OR agency_code = %(agency_code)s)
ORDER BY precedent_vector <-> %(query_vector)s::vector
LIMIT %(top_k)s;
"""

INSERT_AUDIT_LOG = """INSERT INTO audit.concomitant_audit_logs (
  fragment_id, agent_identity, risk_status, feedback_payload, drift_magnitude
) VALUES (
  %(fragment_id)s, %(agent_identity)s, %(risk_status)s, %(feedback_payload)s::jsonb, %(drift_magnitude)s
)
RETURNING id;
"""
