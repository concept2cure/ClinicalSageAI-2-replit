# Published-source production image smoke

W1/D2 supporting boot and rendering evidence, 2026-10-14. Actual GitHub job
[116073085619](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38625681016/job/116073085619)
completed successfully for published commit `fa39bd5d8cd5641a6dc0d5b573c145f4e17731cd`.
This is a separate later phase; prior local/helper-only source pins remain intact.

The canonical unadapted Dockerfile built both provision and production targets.
The actual image fetched veraPDF 1.30.2, checked the pinned SHA256
`287cc9c9757f99dcff4a2d39b68268245b48103fb6af443162d5a29df2afa332`,
and passed both the PDF/A-1b toolchain probe and the strict production pipeline
argument probe. The production image runs as `appuser`.

The job started an empty TLS PostgreSQL, provisioned it with the actual provision
image, verified non-superuser/NOBYPASSRLS runtime role posture, and booted the
actual production image. `/readyz` reached 200 after seven seconds; `/healthz`
returned 200. Real login required an authenticator second factor and completed
with `/api/auth/me` 200. The job tore down its synthetic containers.

The full decoded job log is preserved losslessly as deterministic gzip/base64;
its decoded bytes and SHA256 are recorded. The raw log secret scan found zero
findings. Source pins refer to the actual published commit, not current working
files. Job metadata records all individual steps.

This proves that image build and synthetic boot/sign-in path. It does not prove
agency acceptance, AWS deployment, scientific document quality, actual client
production qualification, or the whole CI pipeline. The same run's lint job
failed a migration-comment header check; that failure is retained separately.
The newly prepared submission UI/source-reader increment is not part of this
published-source image evidence.
