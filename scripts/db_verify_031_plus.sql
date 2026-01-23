-- db_verify_031_plus.sql
-- Verification script for 031+ migrations (fail builds if not wired)

DO $$
BEGIN
  -- Required schemas
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='safety') THEN
    RAISE EXCEPTION 'Missing schema: safety';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='cro_ops') THEN
    RAISE EXCEPTION 'Missing schema: cro_ops';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='intel') THEN
    RAISE EXCEPTION 'Missing schema: intel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='discovery') THEN
    RAISE EXCEPTION 'Missing schema: discovery';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='registry') THEN
    RAISE EXCEPTION 'Missing schema: registry';
  END IF;

  -- Key tables
  PERFORM 1 FROM information_schema.tables WHERE table_schema='safety' AND table_name='signals';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing safety.signals'; END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='intel' AND table_name='pack_exports';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing intel.pack_exports'; END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='entity_chain_events';
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing audit.entity_chain_events'; END IF;

  -- Immutability triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='intel' AND c.relname='pack_exports' AND t.tgname='trg_no_update_delete_pack_exports'
  ) THEN
    RAISE EXCEPTION 'Missing immutability trigger on intel.pack_exports';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='audit' AND c.relname='entity_chain_events' AND t.tgname='trg_no_update_delete_entity_chain_events'
  ) THEN
    RAISE EXCEPTION 'Missing immutability trigger on audit.entity_chain_events';
  END IF;

  -- RLS enabled checks (sample)
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='safety' AND c.relname='signal_versions' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on safety.signal_versions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='cro_ops' AND c.relname='rbm_findings' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on cro_ops.rbm_findings';
  END IF;
END $$;
