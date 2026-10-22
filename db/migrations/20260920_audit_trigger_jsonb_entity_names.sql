-- =============================================================================
-- Generic audit-trigger repair: shape-safe entity names
--
-- The governed-content creator (054_gcc_part11_audit.sql) now resolves optional
-- entity-name fields from to_jsonb(NEW/OLD), but existing databases retain an
-- older function body that dereferences NEW.title directly. PL/pgSQL raises
-- before COALESCE can fall through when a row type has no title column, which
-- blocks inserts into identity.organizations and prevents C-48's FK bridge.
--
-- This companion belongs on the deploy path because the creator is GCC-only and
-- does not re-run during incremental deploys. CREATE OR REPLACE is idempotent;
-- it changes no table, audit record, trigger attachment, or historical row.
-- =============================================================================

DO $repair$
BEGIN
  IF to_regprocedure('audit.audit_trigger_func()') IS NULL THEN
    RAISE NOTICE '[audit-trigger-repair] audit.audit_trigger_func() is absent; skipping optional repair';
    RETURN;
  END IF;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION audit.audit_trigger_func()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $body$
    DECLARE
        v_event_category audit.event_category;
        v_old_json JSONB;
        v_new_json JSONB;
        v_changed_fields TEXT[];
        v_entity_id UUID;
        v_entity_name TEXT;
    BEGIN
        IF TG_OP = 'INSERT' THEN
            v_event_category := 'CREATE';
            v_new_json := to_jsonb(NEW);
            v_entity_id := NEW.id;
            v_entity_name := COALESCE(
                v_new_json ->> 'title',
                v_new_json ->> 'application_number',
                v_new_json ->> 'email',
                v_new_json ->> 'org_name',
                NEW.id::TEXT
            );
        ELSIF TG_OP = 'UPDATE' THEN
            v_event_category := 'UPDATE';
            v_old_json := to_jsonb(OLD);
            v_new_json := to_jsonb(NEW);
            v_entity_id := NEW.id;
            v_entity_name := COALESCE(
                v_new_json ->> 'title',
                v_new_json ->> 'application_number',
                v_new_json ->> 'email',
                v_new_json ->> 'org_name',
                NEW.id::TEXT
            );

            SELECT ARRAY_AGG(key) INTO v_changed_fields
            FROM (
                SELECT key FROM jsonb_each(v_new_json)
                EXCEPT
                SELECT key FROM jsonb_each(v_old_json) WHERE v_old_json->key = v_new_json->key
            ) changed;

            IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
                RETURN NEW;
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            v_event_category := 'DELETE';
            v_old_json := to_jsonb(OLD);
            v_entity_id := OLD.id;
            v_entity_name := COALESCE(
                v_old_json ->> 'title',
                v_old_json ->> 'application_number',
                v_old_json ->> 'email',
                v_old_json ->> 'org_name',
                OLD.id::TEXT
            );
        END IF;

        PERFORM audit.log_event(
            p_category := v_event_category,
            p_entity_type := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
            p_entity_id := v_entity_id,
            p_entity_name := v_entity_name,
            p_description := TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
            p_previous_values := v_old_json,
            p_new_values := v_new_json,
            p_changed_fields := v_changed_fields
        );

        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END;
    $body$;
  $function$;
END;
$repair$;
