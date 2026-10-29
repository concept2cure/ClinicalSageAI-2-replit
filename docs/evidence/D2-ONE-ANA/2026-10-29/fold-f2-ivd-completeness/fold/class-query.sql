-- Organisations entitled to ivd-completeness and not to device-diagnostics, by the
-- rule canAccessModule applies (server/services/license-manager.ts): a live enabled
-- grant allows; an enabled = false row refuses; otherwise the plan decides. Both
-- modules are min_tier 'standard' with no industry (20260823 packaging), and an
-- unrecognised or missing tier ranks as standard. Read-only.
WITH s AS (
  SELECT o.id AS organization_id,
         COALESCE(o.tier, 'standard') <> 'free' AS plan_includes,
         ic.enabled AS ic_enabled, (ic.expires_at IS NULL OR ic.expires_at > now()) AS ic_live,
         dd.enabled AS dd_enabled, (dd.expires_at IS NULL OR dd.expires_at > now()) AS dd_live
    FROM organizations o
    LEFT JOIN module_subscriptions ic ON ic.organization_id = o.id AND ic.module_id = 'ivd-completeness'
    LEFT JOIN module_subscriptions dd ON dd.organization_id = o.id AND dd.module_id = 'device-diagnostics'
)
SELECT organization_id,
       CASE WHEN dd_enabled IS FALSE THEN 'device-diagnostics switched off'
            ELSE 'ivd-completeness granted above the plan' END AS why
  FROM s
 WHERE ((ic_enabled IS TRUE AND ic_live) OR (ic_enabled IS DISTINCT FROM FALSE AND plan_includes))
   AND NOT ((dd_enabled IS TRUE AND dd_live) OR (dd_enabled IS DISTINCT FROM FALSE AND plan_includes))
 ORDER BY organization_id;
