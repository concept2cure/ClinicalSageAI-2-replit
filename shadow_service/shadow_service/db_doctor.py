#!/usr/bin/env python3
"""Database Doctor - Diagnostic script for database connectivity.

Verifies:
- Environment variable configuration
- Direct connection (for migrations/ingestion)
- Pooled connection (for API traffic, PgBouncer compatible)
- Part 11 session context injection
- Pool health and sizing

Usage:
    python -m shadow_service.db_doctor
    
Environment variables checked:
    DATABASE_URL_DIRECT     - Direct PostgreSQL connection
    DATABASE_URL_POOLED     - PgBouncer pooled connection
    DATABASE_URL            - Fallback for both
    DB_CONNECT_RETRIES      - Retry count (default: 3)
    DB_CONNECT_RETRY_BASE_MS - Base retry delay (default: 250)
"""

import asyncio
import os
import sys
from datetime import datetime


async def main():
    """Run database diagnostics."""
    print("=" * 70)
    print("🔬 Database Doctor - Enterprise Connectivity Diagnostics")
    print("=" * 70)
    print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    print()
    
    # Check environment variables
    print("📋 Environment Configuration")
    print("-" * 50)
    
    env_vars = [
        ("DATABASE_URL_DIRECT", "Direct PostgreSQL (migrations, ingestion)"),
        ("DATABASE_URL_POOLED", "PgBouncer pooled (API traffic)"),
        ("DATABASE_URL", "Fallback URL"),
        ("DB_CONNECT_RETRIES", "Connection retry count"),
        ("DB_CONNECT_RETRY_BASE_MS", "Retry base delay (ms)"),
        ("DATABASE_POOL_SIZE", "Pool max size"),
    ]
    
    configured_count = 0
    for var, desc in env_vars:
        value = os.getenv(var, "")
        if value:
            # Mask password in DSN
            if "://" in value and "@" in value:
                masked = value.split("@")[0].rsplit(":", 1)[0] + ":***@" + value.split("@")[1]
            else:
                masked = value[:20] + "..." if len(value) > 20 else value
            print(f"  ✅ {var}: {masked}")
            configured_count += 1
        else:
            print(f"  ⚠️  {var}: (not set)")
    
    print()
    
    if configured_count == 0:
        print("❌ No database URLs configured!")
        print("   Service will run in LITE MODE (no database operations)")
        print()
        print("To configure, set one or more of:")
        print("  export DATABASE_URL=postgresql://user:pass@host:port/db")
        print("  export DATABASE_URL_DIRECT=postgresql://user:pass@host:port/db")
        print("  export DATABASE_URL_POOLED=postgresql://user:pass@host:port/db?pgbouncer=true")
        return 1
    
    # Test connections
    print("🔌 Connection Tests")
    print("-" * 50)
    
    try:
        from shadow_service.db_enterprise import (
            get_db_manager,
            close_db_manager,
            RequestContext,
            PoolType,
        )
        
        manager = await get_db_manager()
        
        if manager.is_lite_mode:
            print("  ⚠️  Running in LITE MODE - no database connections")
            return 1
        
        # Test each pool
        for pool_type in [PoolType.DIRECT, PoolType.POOLED]:
            pool = manager.get_pool(pool_type)
            if pool is None:
                print(f"  ⚠️  {pool_type.value}: Pool not available")
                continue
            
            try:
                async with pool.acquire() as conn:
                    # Basic connectivity
                    version = await conn.fetchval("SELECT version()")
                    print(f"  ✅ {pool_type.value}: Connected")
                    print(f"     PostgreSQL: {version[:50]}...")
                    
                    # Pool stats
                    print(f"     Pool size: {pool.get_size()}/{pool.get_max_size()}")
                    print(f"     Idle connections: {pool.get_idle_size()}")
                    
            except Exception as e:
                print(f"  ❌ {pool_type.value}: {e}")
        
        print()
        
        # Test Part 11 context injection
        print("🔐 Part 11 Context Injection Test")
        print("-" * 50)
        
        ctx = RequestContext(
            user="db-doctor@concept2cure.ai",
            request_id="DOCTOR-001",
            reason="Diagnostic test",
            program_id="TEST-PROGRAM",
        )
        
        try:
            async with manager.transaction(ctx) as conn:
                # Verify context was set
                user = await conn.fetchval("SELECT current_setting('app.user', true)")
                request_id = await conn.fetchval("SELECT current_setting('app.request_id', true)")
                reason = await conn.fetchval("SELECT current_setting('app.reason', true)")
                program_id = await conn.fetchval("SELECT current_setting('app.program_id', true)")
                
                print(f"  ✅ app.user: {user}")
                print(f"  ✅ app.request_id: {request_id}")
                print(f"  ✅ app.reason: {reason}")
                print(f"  ✅ app.program_id: {program_id}")
                
                # Verify transaction-local (should not persist after transaction)
                
        except Exception as e:
            print(f"  ❌ Context injection failed: {e}")
        
        print()
        
        # Verify context doesn't leak
        print("🧪 Context Isolation Test")
        print("-" * 50)
        
        try:
            async with manager.acquire() as conn:
                user_after = await conn.fetchval("SELECT current_setting('app.user', true)")
                if user_after == "db-doctor@concept2cure.ai":
                    print("  ⚠️  Context leaked! Check set_config is_local=true")
                else:
                    print(f"  ✅ Context properly isolated (app.user={user_after or 'null'})")
        except Exception as e:
            print(f"  ⚠️  Could not verify isolation: {e}")
        
        print()
        
        # Schema check
        print("📊 Schema Check")
        print("-" * 50)
        
        try:
            async with manager.acquire() as conn:
                schemas = await conn.fetch("""
                    SELECT schema_name 
                    FROM information_schema.schemata 
                    WHERE schema_name IN ('prose', 'audit', 'exports', 'gcc')
                    ORDER BY schema_name
                """)
                
                expected = {'prose', 'audit', 'exports', 'gcc'}
                found = {r['schema_name'] for r in schemas}
                
                for schema in expected:
                    if schema in found:
                        print(f"  ✅ {schema}: Present")
                    else:
                        print(f"  ⚠️  {schema}: Missing (run migrations)")
                        
        except Exception as e:
            print(f"  ⚠️  Schema check failed: {e}")
        
        print()
        
        # Health check summary
        print("📈 Health Check Summary")
        print("-" * 50)
        
        health = await manager.health_check()
        print(f"  Status: {health['status'].upper()}")
        print(f"  Mode: {health['mode']}")
        
        for pool_name, pool_health in health.get('pools', {}).items():
            status = pool_health.get('status', 'unknown')
            if status == 'healthy':
                latency = pool_health.get('latency_ms', 0)
                print(f"  {pool_name}: ✅ {latency:.2f}ms")
            else:
                error = pool_health.get('error', 'Unknown error')
                print(f"  {pool_name}: ❌ {error}")
        
        await close_db_manager()
        
    except ImportError as e:
        print(f"  ❌ Import error: {e}")
        print("     Make sure you're running from the shadow_service directory")
        return 1
    except Exception as e:
        print(f"  ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    print()
    print("=" * 70)
    print("✅ Database Doctor completed successfully")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
