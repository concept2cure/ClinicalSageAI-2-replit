# Final rebuilt bundle QA

**Passed.** Independent read-only inspection of the frozen rebuilt package at canonical head `d58e7944ddd0265de07dc3861c7937a24ec3652b`, compared with explicit baseline `844a30c675cc95a934c033e4a1e335a54fa41f79`.

- ZIP: **1,219 entries**, **9,847,746 bytes**; CRC passed, with no duplicate, unsafe-path, symlink or encrypted entries.
- All **191 manifest-bound source files** match both ZIP bytes and current repository SHA-256. The manifest itself matches the archived copy.
- All **1,210 repository entries** and **9 root artifacts** match their current input files. Exported study/plan Markdown matches canonical report sources.
- The **1,319,443-byte patch** matches the ZIP, manifest and exact current Git diff from the explicit baseline. `git apply --reverse --check` passed without changing files.
- The current package README distinguishes historical reports/counts from canonical evidence, implemented slices from roadmap work, default-off features and host-admission limits. The historical reference remains separate.
- Current SQL chief-review evidence is included. HEAD and primary artifact hashes remained stable during inspection.

SHA-256 bindings:

| Artifact | SHA-256 |
| --- | --- |
| ZIP | `be730a8a3a6360bf5a454ff1837fc64dc8bbbcf6e5174e67a287598a662f9175` |
| Patch | `1ee457ed42194e54f14ec97cdeca56701e2ed6b012121406edd43c34698106c7` |
| Source manifest | `18b0b1618bd0a034a2ae00b348d37e5c073a35ebfb289efe381a75c64eab4ba2` |
| Current package README | `99b6c145f1dcaf845b986e9f7375d186fd70c5c05d3890e945b93f22292585a7` |

[Exact checks and source hashes](FINAL_BUNDLE_QA.json) are separate from the already frozen ZIP. This QA does not rerun or relabel application, type, independent or PostgreSQL qualifications, and does not establish deployment or remote artifact publication. No source, package tool or README was edited.
