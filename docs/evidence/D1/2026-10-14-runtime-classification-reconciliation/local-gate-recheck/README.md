# D1: actual image-assets gate recheck after the two-entry reconciliation

The actual image runtime-assets gate and its unchanged self-test both passed
sequentially under Node22 in the explicitly allocated root runner slot. The gate
took8.756seconds; the self-test took1.121seconds. Peak child RSS was941,676KiB.
No Docker build/pull, installation, validator/JAR, native database or source
compiler execution occurred in this phase. esbuild is part of the gate's normal
read-only production-graph analysis.

The actual gate found73 app-root paths resolved by3,135 shipped modules:25
shipped and covered,45 correctly not shipped, and3 existing known gaps with
written decisions. No classification was waived. The unchanged self-test passed
the intact fixture and rejected all11 forced failure cuts, including unused
classification, missing COPY, ignored context, missing source, unclassified
runtime path and missing rationale.

All6,920 source/input records matched before and after both checks. The lossless
compressed inventory retains the complete source-path/hash records; its decoded
hash equals both original private inventories. [manifest.json](manifest.json)
pins13 critical files and all5 artifacts. Gate/self-test logs and execution
metadata are exact copies of their private originals. The five validator-download
source files still match the previous frozen component proof.

The [earlier actual stale-entry failure](../../2026-10-14-pinned-verapdf-download/image-runtime-checks.txt)
and the [two-line source assessment](../README.md) remain unchanged. This new
phase qualifies the inventory reconciliation and the existing detector behavior;
it does not qualify a completed image build, production boot/sign-in, PDF/A
compliance of client exports, deployment, clinical content or agency acceptance.
The separately observed hosted image-boot success for publishedbaff precedes
this uncommitted changed-source Dockerfile and does not substitute for its proof.
