# F1–F8 fixes and targeted live verification — 16 September 2026

## Result

**All eight fix groups pass.** The final combined run covers all nine original failed assertions (including the three separate preference values), plus F8's notification identity defect and the requested chat pagination check. It also checks related edge cases specific to these fixes. The full 131-check suite was not rerun.

Each fix was implemented and checked with real HTTP/PostgreSQL in the requested order: F3 → F5 → F1 → F2 → F4 → F6 → F7 → F8. F8 also used two real Socket.io WebSocket clients. The same targeted groups then passed together against the final code. Backend TypeScript checking and `git diff --check` passed.

| Fix | Final result | Observed behavior |
|---|---|---|
| F3 — Block bypass | PASS | Both directions return **404**, `This profile does not exist`; no visits or notifications written. |
| F5 — Header-spoofed rate limiting | PASS | Login returns 401 for the first ten invalid credentials, then **429**, even with a different X-Forwarded-For on each request. Registration caps at 10; forgot-password and resend-verification cap at 5. All reject continued attempts with 429. |
| F1 — Heterosexual update | PASS | **200**; returned value and database match. |
| F1 — Homosexual update | PASS | **200**; returned value and database match. |
| F1 — Bisexual update | PASS | **200**; returned value and database match. Existing browse/search matching still treats NULL and empty preferences as bisexual, including either gender. |
| F2 — Like without a flagged picture | PASS | **403**, `You need to select a profile picture on your own profile before you can like other members.` Viewer flags both false; no like inserted. Selecting a picture allows 201. |
| F4 — Photo deletion flags | PASS | Unrelated photo: **200**, `was_profile_picture=false`, `has_profile_picture=true`, count 1. Selected final photo: **200**, `was_profile_picture=true`, `has_profile_picture=false`, count 0. |
| F6 — Pending email verification | PASS | Update **200**, old email retained and verified; new address appears as `pending_email`. Confirmation **200** activates new address and clears pending state. Existing cookie remains usable. Expired and superseded tokens return **400**; an address claimed before confirmation returns **409** without replacing the active address. |
| F7 — Notifications pagination | PASS | `limit=-1` → **400**, `limit must be between 1 and 100 (got -1)`. Zero, >100, fractions, malformed/empty/duplicate limits also return 400. Default and limits 1/100 return 200. Negative offset returns 400. |
| F7 — Chat pagination | PASS | The same limit checks pass against a genuinely connected pair; invalid `beforeId` also returns 400. |
| F8 — Counterpart identity | PASS | Alice receives Bob's ID/name/username; Bob receives Alice's. Both database notification contents exactly match their respective socket contents. |

[Captured evidence from the final run](fixes-evidence.json).

## File-by-file changes

Paths below are relative to the repository root. These describe changes made in this fix pass, not pre-existing edits.

| File | Exactly what changed |
|---|---|
| `Backend/src/controllers/profileViewController.ts` | F3 checks both block directions before the profile read/visit. F2 uses the flagged-picture query for like authorization and viewer flags, with matching messages. F8 fetches the target user and builds each recipient's DB/socket notification from their counterpart. |
| `Backend/src/db/queries/profileViewQueries.ts` | Renamed the like-eligibility helper to `userHasProfilePicture`; its EXISTS query now requires `is_profile_picture=TRUE`. Discovery eligibility was not changed. |
| `Backend/src/middleware/rateLimiter.ts` | Shared limiter uses Express `req.ip` with socket-address fallback instead of reading raw X-Forwarded-For. Applies to all four limiters. |
| `Backend/src/app.ts` | Proxy trust defaults to false; trusts only explicitly configured proxy addresses. |
| `Backend/src/config/env.ts` | Added comma-separated `TRUSTED_PROXIES` IP/CIDR allowlist; default empty. Database/Docker settings untouched. |
| `Backend/src/controllers/profileController.ts` | Restored only the allowed sexual-preference array for F1. F4 reads remaining photo rows to derive picture presence/count; the already-correct deleted-row flag remains. F6 writes pending email plus a fresh expiring token instead of replacing the active address, invokes the existing verification sender, and reports delivery failure/retry instructions if sending fails. |
| `Backend/src/db/queries/profileQueries.ts` | Added remaining-photo lookup. Own-profile responses include `pending_email`. Profile updates can atomically store pending email, verification token and expiry; they no longer directly assign the active email. |
| `Backend/src/db/queries/userQueries.ts` | Added transactional pending-email confirmation with a user-row lock, token/expiry recheck, uniqueness recheck, unique-constraint conflict handling, and atomic email activation/pending-state clearing. Existing registration queries remain unchanged. |
| `Backend/src/controllers/authController.ts` | Existing verification route handles pending email before its already-verified shortcut. Accounts without a pending change retain the existing registration-verification path. |
| `Backend/src/types/index.ts` | Added optional nullable `pending_email` to the user type. Existing sanitization continues to exclude verification tokens. |
| `Backend/migrations/005_pending_email.sql` | New additive, repeatable migration adding nullable `users.pending_email`. Applied to `matcha_db` during this pass. |
| `schema.sql` | Includes `pending_email` for newly initialized databases. Existing databases must use migration 005. |
| `Backend/src/controllers/notificationController.ts` | Reuses the existing bounded-integer validator for limit 1–100 and nonnegative offset. Keeps default limit 30. |
| `Backend/src/controllers/chatController.ts` | Reuses the same validator for limit 1–100 and positive beforeId. Keeps default limit 50 and existing connection authorization. |
| `Backend/scripts/testReportedFixes.ts` | New targeted live regression runner; accepts `F3`, `F5`, `F1`, `F2`, `F4`, `F6`, `F7`, `F8`, or `all`. Creates uniquely named users, sends HTTP/socket requests, checks SQL, and removes its own fixtures. |
| `test-reports/fixes-report.md` | This fix summary and operational notes. |
| `test-reports/fixes-evidence.json` | Final targeted-run results and response/socket/database evidence. No JWTs, passwords or verification tokens stored. |

## Operational notes and scope

- **Migration 005 is applied to the current `matcha_db`.** For another existing database, apply `Backend/migrations/005_pending_email.sql` before starting the updated backend. Fresh databases use the updated root schema.
- Direct development needs no proxy setting. Behind a proxy, set `TRUSTED_PROXIES` to that deployment's actual trusted proxy IPs/CIDRs. The proxy must replace untrusted forwarding headers. No Docker, port, Vite, or network configuration was changed.
- Email replacement reuses registration's token generator, verification columns, verification route, and email-sending service. The active email stays verified while a replacement is pending. Submitting the proposed address again generates a fresh token and retries delivery; the previous token is invalidated. On send failure the API returns a clear retry message while preserving account access.
- Actual external email delivery was disabled in the disposable test runner. Logs confirm the existing sender was invoked for the proposed address; verification was exercised using DB tokens. The successful external delivery branch and browser UI were not exercised.
- No frontend source changes were made. The backend returns `pending_email` and a verification/retry message; the existing profile page's generic “Profile saved” notice does not yet render that message or provide a dedicated pending-email banner.
- The pre-existing gender allowlist and profile-display default edits in `profileController.ts` were preserved. Per the explicit F1 instruction, only the preference allowlist was restored; discovery's existing bisexual fallback was verified without changing its code.
- Changes are limited to F1–F8 and the directly requested supporting validation/migration/tests. The earlier PASS assertions were not rerun wholesale, so this report does not claim an exhaustive regression pass.

## Cleanup

The final run created users 22 and 23; earlier per-fix runs used 6–21. Each run deleted its own fixtures. Final SQL verification shows zero rows in all ten application tables. Photo fixtures were SQL-only and did not create uploaded files. No pre-existing users were present. Sequences were not reset.

The disposable `matcha-fixes-runtime` was removed and `matcha-pg` returned to its original stopped state. The existing backend/frontend containers remained stopped. The additive pending-email column remains as the required application migration. No manual test-data cleanup is needed.

## Running the focused checks again

With a reachable, migrated test database configured through the existing backend environment:

```sh
cd Backend
./node_modules/.bin/tsx scripts/testReportedFixes.ts all
```

Use an individual F-number instead of `all` for a single fix. The runner writes `/tmp/matcha-fixes-<selection>.json` by default; `FIX_REPORT_PATH` can override it. F8 uses the frontend's installed socket.io-client; `SOCKET_CLIENT_ROOT` can point to that frontend directory when needed. The test runner starts an ephemeral HTTP server itself; no already-running backend is required.
