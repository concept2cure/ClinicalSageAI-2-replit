WITH trails AS (
      SELECT id,operation_type,section_id,
        (operation_type='ASSEMBLY_SOURCES' OR (section_id IS NULL AND metadata->'assembly'->'sources' IS NOT NULL)) AS source_marker
      FROM authoring_audit_trail WHERE doc_id=$1::uuid AND tenant_id=$2
        AND (section_id IS NULL OR operation_type='ASSEMBLY_SOURCES')
    ), chains AS (
      SELECT a.id,a.action,a.table_name,a.record_id,a.new_values->>'trailId' AS trail_id,
             to_jsonb(a)->>'chain_seq' AS sequence
        FROM audit_logs a WHERE a.tenant_id=$2 AND (
          (a.table_name='authoring_document' AND a.record_id=$1::uuid::text AND
            (a.action='authoring.section.ASSEMBLY_SOURCES' OR a.new_values->>'operationType'='ASSEMBLY_SOURCES'))
          OR (a.new_values->>'docId'=$1::uuid::text AND
            (a.action='authoring.section.ASSEMBLY_SOURCES' OR a.new_values->>'operationType'='ASSEMBLY_SOURCES'))
          OR EXISTS (SELECT 1 FROM trails t WHERE t.source_marker AND t.id::text=a.new_values->>'trailId')
        )
    ), matches AS (
      SELECT t.id AS event_id,c.id AS audit_id,t.operation_type,t.section_id,c.action,c.table_name,c.record_id,c.sequence,
        CASE WHEN length(c.sequence)<=19 AND c.sequence ~ '^[1-9][0-9]*$'
          THEN c.sequence::numeric END AS position
      FROM trails t FULL OUTER JOIN chains c ON c.trail_id=t.id::text
      WHERE t.source_marker OR c.id IS NOT NULL
    ), summary AS (
      SELECT count(*)>0 AS has_events,
        COALESCE(bool_and(event_id IS NOT NULL AND audit_id IS NOT NULL AND section_id IS NULL AND operation_type='ASSEMBLY_SOURCES'
          AND action='authoring.section.ASSEMBLY_SOURCES' AND table_name='authoring_document' AND record_id=$1::uuid::text
          AND position>0 AND position<=9223372036854775807),true)
          AND count(*)=count(DISTINCT event_id) AND count(*)=count(DISTINCT audit_id)
          AND count(*)=count(DISTINCT position) AS ordering_valid FROM matches
    ) SELECT summary.*,
      (SELECT event_id::text FROM matches ORDER BY position DESC NULLS LAST LIMIT 1) AS event_id,
      (SELECT audit_id::text FROM matches ORDER BY position DESC NULLS LAST LIMIT 1) AS audit_id,
      (SELECT sequence FROM matches ORDER BY position DESC NULLS LAST LIMIT 1) AS sequence FROM summary
