# Matcha live end-to-end test report — 15 September 2026

## Outcome and scope

**131 automated checks: 122 PASS, 9 FAIL.** These include expanded filter/sort/auth cases, additional security probes, and cleanup. Three deployment failures and one additional notification-content defect are documented separately below. Backend typecheck and frontend production build both passed.

Actual HTTP requests, multipart uploads, PostgreSQL queries, and authenticated Socket.io WebSocket clients were used. This was not a code-only review. All requested feature cases were exercised. Browser rendering, form interaction, actual email delivery, and external GPS geocoding were not tested. Frontend HTML returned 200, but the existing container deployment's API proxy returned 502; consequently the frontend deployment does **not** pass an end-to-end browser flow.

The original backend could not connect to the database. Feature tests used a disposable `matcha-e2e-runtime` container running the current backend source, sharing the existing `matcha-pg` network namespace, with DB_HOST=127.0.0.1 and the database container's configured credentials. NODE_ENV=test and an empty RESEND_API_KEY suppressed real email delivery; handlers still executed their email attempts and tolerated the expected missing-key error. No mocks replaced HTTP, SQL, or socket operations.

Database: actual `matcha_db` in `matcha-pg`, initially zero users. One account was registered through HTTP; four additional verified accounts were inserted through SQL with controlled ages (22, 32, 42, 52), genders, preferences, fame (10, 30, 50, 70), locations, and coordinates. Photos and tags were added through HTTP. Because preference updates fail, orientation fixtures used SQL: discovery passes below demonstrate the discovery logic, **not successful profile setup through the UI/API**. Client cookies came from real logins. Separate synthetic X-Forwarded-For values kept fixture logins from consuming one rate-limit bucket; spoofing that header was independently tested and failed.

Tests followed the requested feature sequence; live messages were sent during the connected state before the unlike/block tests. All five notification types were checked after triggering the corresponding actions. No application fixes were made. The pre-existing edit to `Backend/src/controllers/profileController.ts` was preserved.

## 1. Registration and signing in

| Requested case | Result | Actual evidence |
|---|---|---|
| Valid registration, persisted row, bcrypt rather than plaintext | PASS | 201; stored hash prefix `$2b$10$`; password comparison through login succeeded. |
| Duplicate email | PASS | 409: `An account with this email address already exists` |
| Duplicate username | PASS | 409: `This username is already taken` |
| Dictionary password | PASS | 400 for `Password123!`: `Password is too common and easily guessable. Please choose a stronger password.` |
| Missing required fields | PASS | 400: `Email is required` |
| Login before verification | PASS | 403: `Your account is not verified yet. Please check your email to activate it.` |
| Verify using DB token | PASS | 200; queried `is_verified=true`. |
| Correct verified login and JWT cookie | PASS | 200; token cookie with HttpOnly, SameSite=Lax, Path=/, Max-Age=86400. |
| Wrong password, generic message | PASS | Known and unknown usernames both 401: `Invalid username or password`. |
| Logout clears cookie | PASS | 200; `token=; ... Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`. |
| Forgot password, existing and absent email | PASS | Both 200 with identical `If that email is registered, a password reset link has been sent.` |
| Valid reset; old/new password checks | PASS | Reset 200; old password 401; new password 200. |

## 2. User profile

| Requested case | Result | Actual evidence |
|---|---|---|
| Authenticated own profile, safe fields | PASS | 200 with profile, tags/photos, location and fame; no password hash or reset/verification token fields. |
| Update names/email and persist | PASS | 200; SQL confirmed Alicia / Tester and the new email. Re-verification concern: F6. |
| Update gender and biography | PASS | 200; SQL confirmed `female` and `Test biography`. |
| Update heterosexual preference | **FAIL** | 400: `Sexual preference must be one of: ` — F1. |
| Update homosexual preference | **FAIL** | Same 400 — F1. |
| Update bisexual preference | **FAIL** | Same 400 — F1. |
| Reject invalid gender/preference | PASS | Both 400 with enum-validation messages. |
| Add tag and reuse case variant | PASS | First 201, case variant 200; exactly one shared tag row. |
| Remove tag link, preserve shared tag | PASS | 200; link gone, tag row retained. |
| Upload photo and persist file/row | PASS | Five uploads succeeded; all five files existed and SQL counted five rows. |
| Reject sixth photo | PASS | 400: `You already have the maximum of 5 photos. Delete one before uploading another.` |
| Reject non-image | PASS | Text/plain `.txt` upload returned 400. |
| Change profile picture | PASS | 200; exactly one flagged row, belonging to the selected photo. |
| Delete photo file and row | PASS | 200; file and SQL row removed. Response flag defect: F4. |
| Manual location | PASS | 200; SQL confirmed `location_text='Audit City'`. |
| Numeric fame rating | PASS | Response contained a number. |
| Every profile route without valid cookie | PASS | All 11 method/path combinations returned 401 for both missing and malformed cookies (22 requests). Includes views, likes, tags, photos and location. |

## 3. Browsing

| Requested case | Result | Actual evidence |
|---|---|---|
| Set-up viewer gets only other users | PASS* | 200; exactly four fixture candidates; self absent. |
| Heterosexual orientation | PASS* | Exactly opposite-gender fixtures returned. |
| Homosexual orientation | PASS* | Exactly same-gender fixtures returned. |
| Bisexual and unset orientation | PASS* | Each returned both genders/all four fixtures. |
| Blocks excluded | PASS | Blocker and blocked user both excluded from each other's suggestions. |
| Age, fame, location, tags individually | PASS | Exact fixture IDs matched each filter; age/fame selected fixtures 1 and 2, location 0 and 1, tag 0–2. |
| Combined filters | PASS | Age + fame + location + tag returned exactly fixture 1. |
| Sort options | PASS | age, fame, commonTags, location and relevance checked asc/desc. Relevance intentionally remains descending even when asc is requested. |
| Inverted age range | PASS | 400: `minAge (40) cannot be greater than maxAge (20)` |
| Invalid sortBy | PASS | 400: `sortBy must be one of: relevance, age, location, fame, commonTags (got "invalid")` |
| Pagination and total | PASS | limit=2 pages 1/2 combined exactly equalled full ordered result; each total=4. |

*Preference and precise-coordinate fixture setup used SQL because preference updates fail. This does not excuse F1.

## 4. Research / advanced search

| Requested case | Result | Actual evidence |
|---|---|---|
| GET /api/search without params | PASS | 200; all four eligible fixtures returned. |
| Age filter | PASS | Exact expected two fixtures. |
| Rating/fame filter | PASS | Exact expected two fixtures. |
| Location filter | PASS | Exact expected two fixtures. |
| Tags filter | PASS | Exact expected three fixtures. |
| Combined filters use AND | PASS | Exactly one fixture satisfied all four filter types. |
| Orientation and self exclusion | PASS* | All four preference states checked; exact expected genders/IDs and self absent. |
| Sort options | PASS | age, fame, commonTags and location each verified ascending and descending using returned values. |
| Additional validation, blocks, pagination | PASS | Inverted range/invalid sort 400; both block directions excluded; exact page slicing and total=4. |

## 5. Profile view, likes, blocks and reports

| Requested case | Result | Actual evidence |
|---|---|---|
| View profile records visit and hides email/password | PASS | 200; view row queried; sensitive fields absent. |
| Like with no photos at all | PASS | 403: `You need to add at least one photo to your own profile before you can like other members.` |
| Like with photos but no flagged profile picture | **FAIL** | 201: `You liked this member` — F2. Overall strict “NO profile picture” requirement fails. |
| Like with profile picture | PASS | 201, `has_liked=true`. |
| Duplicate like | PASS | 400: `You have already liked this member`. |
| Mutual like and newly_connected | PASS | 201, `newly_connected=true`; both public relationship responses had `is_connected=true`. |
| Unlike breaks connection/chat | PASS | 200, `is_connected=false`; socket send rejected and REST history 403. |
| Block removes both likes | PASS | 201; SQL showed zero likes in either direction. |
| Block prevents viewing in both directions | **FAIL** | Blocked → blocker: 404. Blocker → blocked: 200 with full public profile — F3. |
| Report creates row | PASS | 201; report row confirmed through SQL. |
| Like/block/report yourself | PASS | Each 400: `You cannot perform this action on your own profile`. |
| View/like/block against either block direction | **FAIL** | GET by blocker returned 200 (F3). Other five combinations returned expected 403/404. |

## 6. Chat and notifications

| Requested case | Result | Actual evidence |
|---|---|---|
| Connected users exchange live messages | PASS | Two socket clients sent `Audit hello` and `Audit reply`; each counterpart received `message:new`; both DB rows existed; connected REST history returned both. |
| Non-connected pair rejected | PASS | Socket acknowledgement: `{success:false,error:"You can only message connected users"}`; REST history 403; attempted message absent from DB. |
| Like notification: row and socket | PASS | `like` rows and `notification:new` events recorded. |
| Profile-view notification: row and socket | PASS | `view` rows and events recorded. |
| Message notification: row and socket | PASS | `message` rows and events recorded. |
| Mutual-like notification: rows and sockets | PASS | `new_connection` rows/events reached both users. Sender/name content defect additionally observed: F8. |
| Unlike notification: row and socket | PASS | `unlike` row/event recorded after breaking mutual connection. |
| Accurate unread-count endpoint | PASS | API/SQL matched: user 1 = 4; user 2 = 5. |

## Failures, exact evidence, likely causes and proposed fixes

### D1 — Database deployment / occupied port

`docker network connect --alias db matchaa_matcha-network matcha-pg` failed:

```text
Error response from daemon: driver failed programming external connectivity on endpoint matcha-pg (...): failed to bind host port 0.0.0.0:5432/tcp: address already in use
```

The existing PostgreSQL container had empty active network/port mappings despite being running. A host-side connection to 127.0.0.1:5432 returned `password authentication failed for user "postgres"`; it was not a verified connection to the target container. No test data was inserted through that host connection. The attempted container DNS connection returned `getaddrinfo EAI_AGAIN db` / `Connection terminated due to connection timeout`.

Likely configuration: [docker-compose.yml:11](/home/lkazaz/Desktop/Matchaa/docker-compose.yml:11). Proposed fix: identify the service occupying host port 5432; intentionally choose a free published port or resolve that conflict, then recreate/reconnect the database service with its intended network. Do not remove the database volume. No permanent change applied.

### D2 — Backend container points at itself for PostgreSQL

Actual runtime `DB_HOST=localhost`; startup logged `[PostgreSQL] Failed to connect to database "matcha_db":` and `[Server] Fatal error during startup:` with no useful error text. Public API connection failed/reset.

Likely configuration: [docker-compose.yml:59](/home/lkazaz/Desktop/Matchaa/docker-compose.yml:59), [env.ts:13](/home/lkazaz/Desktop/Matchaa/Backend/src/config/env.ts:13). Proposed fix: use `DB_HOST=db` for the container deployment and keep localhost only for host-based development; restore database networking first. Improve startup logging for AggregateError details.

### D3 — Frontend container API proxy points at itself

`GET http://localhost:5173/` → 200; `GET http://localhost:5173/api/health` → **502 Bad Gateway** with an empty body. Vite log: `http proxy error: /api/health` followed by `AggregateError [ECONNREFUSED]`.

Likely cause: [vite.config.ts:12](/home/lkazaz/Desktop/Matchaa/Frontend/vite.config.ts:12) and upload target at line 17 use `http://localhost:3000` inside the frontend container. Proposed fix: make the server-side proxy target environment-specific (`http://backend:3000` in Docker, localhost in host development). Do not use the internal Docker hostname as the browser's public API URL.

### F1 — Every supported sexual preference is rejected (three failed checks)

Each PUT /api/profile/me with `sexual_preferences` equal to heterosexual, homosexual or bisexual returned:

```json
{"success":false,"message":"Sexual preference must be one of: "}
```

HTTP **400** for all three; expected 200. [profileController.ts:47](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/profileController.ts:47) defines `ALLOWED_SEXUAL_PREFERENCES = ['']`; validation at line 70 also rejects empty input. Proposed fix: restore the three allowed preference strings and the intended bisexual default at line 49. This is in the user's pre-existing modified file; no edits were made. API field name is plural `sexual_preferences`.

### F2 — Liking allowed without a selected profile picture

After deleting the flagged photo while retaining other photos, POST /api/users/3/like returned **201**, `"message":"You liked this member"`, `has_liked=true`; expected 403.

Likely cause: [profileViewController.ts:87](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/profileViewController.ts:87) uses `userHasAnyPhoto`. Proposed fix: require a photo with `is_profile_picture=TRUE` and use that same rule for viewer flags/messages.

### F3 — A blocker can still view the blocked profile

After user 1 blocked user 2, GET /api/users/2 as user 1 returned **200**, a complete public profile, and `relationship.has_blocked=true`; expected 403/404. Reverse GET returned 404 correctly.

Likely cause: [profileViewController.ts:190](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/profileViewController.ts:190) rejects only `is_blocked_by` before reading/logging the profile. Proposed fix: reject `has_blocked` too, before fetching the profile or recording a visit/notification. Interaction endpoints already enforce both directions. This is both a feature failure and a privacy concern.

### F4 — Deleting an unrelated photo returns the wrong profile-picture flag

DELETE returned **200**:

```json
{"success":true,"message":"Photo deleted","data":{"deleted_id":1,"was_profile_picture":false,"has_profile_picture":false,"photo_count":4,"fame_rating":0}}
```

A different photo was still flagged in the database. Likely cause: [profileController.ts:571](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/profileController.ts:571) hardcodes false. Proposed fix: compute the flag from remaining rows. File and row deletion itself passed.

### F5 — Login rate limit bypassed through a request header

Ten bad logins from one claimed X-Forwarded-For IP returned **401**, the eleventh **429**. Changing only that header from `198.51.100.20` to `198.51.100.21` immediately returned **401** again instead of continuing to rate-limit. No network source change occurred.

Likely cause: [rateLimiter.ts:35](/home/lkazaz/Desktop/Matchaa/Backend/src/middleware/rateLimiter.ts:35) trusts the raw client header. Proposed fix: derive the address from Express `req.ip` with an accurately restricted trusted-proxy configuration; ensure the edge replaces untrusted forwarding headers. Consider per-account limits in addition to IP limits. This also affects other limiters built with the same helper.

### F6 — Email changes retain verification of the previous address

PUT /api/profile/me returned **200**, persisted a different email, and SQL still showed `is_verified=true`. No ownership verification of the new address occurred.

Likely cause: [profileController.ts:268](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/profileController.ts:268) assigns `data.email` without a new verification flow. Proposed fix: store a pending email and verify it before replacement, or clear verification and send a new token with deliberate session handling. Keep the current email until the new address is verified if uninterrupted account access is desired.

### F7 — Negative notification limit produces a server error

GET /api/notifications?limit=-1 returned **500**:

```json
{"success":false,"message":"An unexpected internal server error occurred. Please try again later."}
```

Backend log: `LIMIT must not be negative`. Likely cause: [notificationController.ts:20](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/notificationController.ts:20) caps the upper bound only, passing a negative SQL LIMIT through [notificationQueries.ts:61](/home/lkazaz/Desktop/Matchaa/Backend/src/db/queries/notificationQueries.ts:61). Proposed fix: validate a positive bounded integer and return 400 using the existing shared pagination validators. Chat history uses a similar parser; that related negative-limit case was not runtime-tested.

### F8 — Mutual-match notification identifies the wrong person (additional observed defect)

The event sent to Fixture0 included:

```json
{"type":"new_connection","from_user":{"id":1,"first_name":"Fixture0","username":"e2e1789494883248f0"},"with_user_id":1,"content":"You and Fixture0 liked each other — you are now connected!"}
```

User 1 is Alicia, not Fixture0. The corresponding DB notification for user 2 also named Fixture0 instead of Alicia. Delivery passed; content correctness fails. This was identified directly in captured live rows/events, separately from the 131 automated assertions.

Likely cause: [profileViewController.ts:299](/home/lkazaz/Desktop/Matchaa/Backend/src/controllers/profileViewController.ts:299) and line 305 reuse `req.user` for both recipients. Proposed fix: fetch the other user and build each recipient's message and `from_user` from their actual counterpart.

## Additional security observations (code inspection, not proven exploits)

- [env.ts:20](/home/lkazaz/Desktop/Matchaa/Backend/src/config/env.ts:20) falls back to a source-visible JWT signing secret. Fail startup when a strong externally supplied secret is missing in production. The test did not attempt to forge JWTs or determine whether the deployed secret equals the fallback.
- [socketServer.ts:48](/home/lkazaz/Desktop/Matchaa/Backend/src/sockets/socketServer.ts:48) permits arbitrary origins; HTTP [app.ts:23](/home/lkazaz/Desktop/Matchaa/Backend/src/app.ts:23) reflects origins when configured with `*`, with credentials enabled. Restrict allowed origins and enforce the intended Origin policy for socket handshakes. Cross-site exploitation was not tested, and depends on cookie/browser/deployment conditions.
- [userQueries.ts:206](/home/lkazaz/Desktop/Matchaa/Backend/src/db/queries/userQueries.ts:206) updates the password without a session-version/revocation mechanism in the inspected auth middleware. Existing JWTs may remain usable after password reset; token replay after reset was not tested. Consider a token version or password-change timestamp check, including existing sockets.
- The inspected raw discovery/report/message queries bind user values; dynamic discovery sort fields are allowlisted. No SQL-injection defect was established. This is not an exhaustive proof that every query is safe.
- Every tested profile endpoint rejected missing and invalid cookies. Public-profile payloads inspected in this pass omitted email, password hashes and account tokens. These passes do not establish that all untested endpoints or deployment configurations are secure.

## Cleanup and artifacts

Deleted test users **1, 2, 3, 4, 5**, all test-created tags and uploaded files. SQL verification after cleanup showed **zero rows in all ten tables**: users, tags, user_tags, photos, views, likes, blocks, reports, messages and notifications. No pre-existing user data was present or deleted. Serial sequences advanced normally and were not reset. No manual SQL cleanup is needed.

The temporary test runtime is removed and the three existing Matcha containers are restored to their original stopped state. The attempted network attachment failed; no permanent networking change was applied. Backend typecheck and frontend build passed; frontend build regenerated ignored build artifacts. No source/configuration fixes were made.

- [Raw HTTP/SQL/socket evidence](e2e-evidence.json): assertions plus request/response trace; auth tokens redacted.
- [Every automated assertion](e2e-checks.md): all 131 checks with PASS/FAIL and evidence.
- The one-off harness and startup script remain in `/tmp/matcha-e2e/` for audit; the harness uses container-specific paths and is not a portable project test suite.
