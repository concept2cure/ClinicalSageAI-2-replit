# Historical company correspondence after October 23 integration

What already exists: `server/services/authoring/authoring-export.ts` reads the retained company presentation; `docx/docxFactory.ts` renders Word and `pdf-converter.ts` renders PDF. This check reuses those canonical paths after merging the new shared conversion limiter, while preserving structural PDF normalization and isolated LibreOffice profiles.

The private `verify-company-correspondence-oct23.mts` harness executed successfully on October 23. It uses synthetic recorded correspondence and a retained revision/variant, then calls the actual Word renderer and strict LibreOffice converter. No AI provider is called. `verification.json` records the exact artifact hashes, five landscape pages, original logo bytes in Word, embedded PDF image, preserved signature statement and unchanged historical text/geometry after changing the current branding fixture. Repeated PDF rendering has the same digest.

The source-record executor is an explicit synthetic fixture; this does not qualify live correspondence creation or agency delivery. Current filing identity and reservation checks are separately exercised by native/component regressions. The October 21 artifacts remain in the parent directory as historical evidence.
