# `ci:project-creation-owners` matches a retired creator by route shape (F1, 2026-11-09)

**Owner.** The coordinating session (`01JbQUvB…`), which made `POST /api/c2c/projects` the only HTTP
creator of projects in A2.9 (2026-10-26).

## What already exists

- `scripts/ci/check-project-creation-owners.mjs` has two jobs:
  - It counts project and program inserts against `WRITER_OWNERS`.
  - It refuses a POST registered again at a path in `RETIRED_CREATORS`, through `findRetiredCreatorRegistrations`.
- It runs in `.husky/pre-push` (`ci:project-creation-owners:selftest`, then `ci:project-creation-owners`).
- Before this change, the retired-route check compared the registered path **as a string**. It matched only
  `method === 'post'`.

## The defect

Retired routes are listed by the parameter names they had. That came to matter on 2026-11-08. The coordinator's
first P-109 clarification approved a child-project door at `POST /:parentId/children` in
`server/routes/project-hierarchy.ts`. A2.9 had already retired that door, and the second clarification
(`def1c13176`) withdrew the approval.
The retired entry there is `'/:projectId/children'`. A renamed parameter is the same route to Express, and the
gate passed it:

- `planted-live-at-head.txt`: the gate at HEAD `3409684c85`. A `router.post('/:parentId/children', …)` appended to
  `server/routes/project-hierarchy.ts` passes: exit 0.
- `red-before-shape.txt`: the new selftest cases against the old matcher. They fail on the first case:
  `Missed a renamed retired creator: router.post('/:parentId/children', h)`.

The slice that was actually built does not register the route; it creates the work project through intake.
The gate is closed so that nothing else can bring the route back unseen.

## The change

- `routeShape(path)` reduces a route to what Express matches:
  - every `:name`, with its `(pattern)` and `?`, becomes `:`;
  - a trailing slash is dropped (Express's default non-strict routing);
  - case is ignored (Express's default).
- `findRetiredCreatorRegistrations` compares shapes, and counts `all` as well as `post`, because `router.all`
  answers a POST.
- Selftest cases added:
  - Refused: the renamed parameter, a trailing slash, a parameter with a pattern and a capital, `all`, and
    `route(…).post`.
  - Passed:
    - a GET at the same shape;
    - a longer path under it (`/:parentId/children/:childId/move`);
    - a different last segment (`/:parentId/child`).

## Evidence

| File | What it shows |
|---|---|
| `planted-live-at-head.txt` | The old gate passes a renamed retired route planted in the real file |
| `red-before-shape.txt` | The new selftest cases fail against the old matcher |
| `planted-live.txt` | The new gate refuses the same plant: `project-hierarchy.ts:386: retired POST /:parentId/children`, exit 1 |
| `green.txt` | The selftest and the live gate both pass on the repository as it is |

The plant was reverted after each run; `server/routes/project-hierarchy.ts` is unchanged by this commit.
