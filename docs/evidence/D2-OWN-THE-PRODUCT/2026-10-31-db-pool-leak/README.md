# D2: after about fourteen page visits, every screen failed until the server restarted (2026-10-31)

The founder reported "The UI doesn't work". This was one of the reasons, and it was the one that made everything fail, not just one screen.

**What the person saw.** The app worked at first. Then, after moving between screens for a while, each screen showed errors in place of its content. Sign-in failed too. It stayed that way until the server restarted.

**What the server said.** Every request answered 500 or 503 after 10 seconds, and the log read "timeout exceeded when trying to connect": the database connection pool (20 connections) was exhausted. `pg_stat_activity` showed all 20 connections idle, each last used for the notification badge count (`GET /api/mdx/notifications/unread-count`). They were checked out of the pool and never returned.

## What already exists

- **The request's connection lease** (`server/db/requestDbLease.ts`, `bindRequestDbClient`). The auth boundary binds one lazy, tenant-scoped client per request (`server/middleware/establishRequestTenantScope.ts`, `attachLazyClient`). The client is released when the response emits `finish` or `close`. Work that outlives its response, such as a detached AnA turn, takes a hold of its own.
- **The lazy client** (`server/middleware/lazyRequestDbClient.ts`). It takes a connection on its first query and returns it on `release()`. After a release, a query fails closed ("Cannot query a released request DB client") without taking a connection.
- **The auth boundary's warn mode** (`server/middleware/authBoundary.ts`). This is the default in every environment except production. It passes the authenticator a stand-in response that forwards only `on` and captures `status`.
- **Client-side read recovery** (`c3794c8fef`, `docs/evidence/D2-UI-READ-RECOVERY/2026-10-30/`). Screen reads now give up after 20 seconds and can be retried. That recovers a screen from a stalled read, but it cannot help while the server has no connections to give.
- Searches run: `bindRequestDbClient`, `res.on('close'`, `res.on('finish'`, `LazyRequestDbClient`, `retainRequestDbClient`, `timeout exceeded`, `pool exhausted`. No existing handling of a response that had already ended before the bind.

## Cause

Authentication is asynchronous: the token, the membership and the organisation's lifecycle are each read before the scope is bound. A page that navigates away, or a fetch that is aborted, can close its connection in that window.

1. The response's `close` has then already been emitted. It is not emitted again.
2. A response written to a closed socket never emits `finish`.
3. So nothing released the client, and the handler's first query took a connection that was never returned.

Each screen fires a dozen or more reads, and the badge count is read on every screen, so each navigation had a chance of abandoning one of them inside that window. About fourteen visits used up all twenty connections.

The first attempt at a fix checked the response's own state at bind time (`res.destroyed`, `res.writableFinished`). It was not enough here. Outside production, the response the scope sees is the auth boundary's stand-in, which has neither property. Tracing the live server showed every leaked bind receiving an object with only `on` and `status` (`01b-red-stand-in.txt` is the test for it).

## Fix

`bindRequestDbClient` releases the client at once when the request has already ended, that is, when one of these holds:

- the response is destroyed;
- the response has already finished;
- the request's own socket is destroyed.

The socket is asked because no stand-in can hide it. A handler on such a request then fails closed on its first query and takes no connection. Nobody is waiting for that response.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `server/db/__tests__/requestDbLease.test.ts` before the fix, on a real HTTP server: a client that disconnects before the bind leaves 1 connection outstanding. |
| `01b-red-stand-in.txt` | With only the response's state checked, the stand-in case still leaks: 1 outstanding. |
| `02-live-before.txt` | The dev server (PostgreSQL 16, pool 20) before the fix: 120 aborted badge reads, then sign-in answers 500 after 10 s. |
| `03-live-after.txt` | With the fix, on the same server: 480 aborted badge reads in four bursts. Sign-in answers 200 in about 20 ms after each, and the log has no pool timeout. The 20 idle connections are the pool's own, returned. |
| `04-browser-before.txt` | Before the fix, Chromium navigating eight launch surfaces and leaving each after 400 ms, 40 times: **no failure**. Reads that far in had already bound, and released on `close`. This walk does not catch the leak and is kept to say so. |
| `05-browser-walk-before.txt` | **The founder's experience, reproduced** before the fix. Chromium opens Home, Project home, Tasks, Communication, Vault, CMC, Quality and Reporting, each left to load for 7 s, twice. From visit 15, sign-in answers 500 after 10 s and pages show failed requests: 5 on Quality, 12 on Reporting. It stays that way after the browser closes. |
| `06-browser-walk-after.txt` | The same walk with the fix: 16 visits, sign-in 200 throughout, 0 failed requests on every page, 0 pool timeouts. |
| `07-mutations.txt` | Each clause removed in turn, and the whole check removed, each caught by its own case. |

**Also run.**
- `server/middleware`, `server/db`, `server/routes/ana-ri` and the detach-slot suite: 1,607 passed, 17 skipped, across 156 files. These include the detached AnA turn that keeps its lease past `close`.
- ESLint: clean on both files; the warning ratchet reports no change.

## Not changed, recorded

- **Outside production, the warn-mode stand-in also reaches the membership, lifecycle and storage-quota guards inside the authenticator.** Their refusals are captured as "unauthenticated, pass through" rather than answered. Production runs the boundary in enforce mode with the real response, so this is not a production exposure. It does mean those refusals are never seen in dev or staging as a customer would see them. Changing it is the auth boundary's design, not this fix.
