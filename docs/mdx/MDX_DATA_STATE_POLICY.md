# MDx Data-State Policy

Live panels must represent `loading`, `live-data`, `empty`, `unavailable`, `permission-denied`, and `sample/demo` distinctly. `null` is not permission or empty. Sample data is permitted only after an explicit sample opt-in or documented demo tenant decision, must remain visibly fictional, must not ground AnA as tenant evidence, and must be disabled or watermarked for exports.

The MDx program shell now renders loading and unavailable states instead of substituting portfolio fixtures. `useSampleRows` remains the approved explicit sample-mode boundary and its tests establish that unresolved, empty and error-adjacent values do not become fixtures. Individual MDx surfaces still require a complete audit against this policy; failure of that audit blocks release.

The in-memory dossier store no longer seeds fictional 510(k), PMA, or CER evidence at module import. Empty backend hydration actively clears prior content; loading, empty, and unavailable file panels are distinct; live sections replace rather than merge with sample evidence. Kit dossier content is installed only through the explicit sample-mode boundary. Permission-denied still requires a typed HTTP error contract in the dossier hook and remains a blocker.
