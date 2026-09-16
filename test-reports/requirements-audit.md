# Phase 1 — Current requirements audit (16 September 2026)

Scope: current backend routes/controllers/queries, frontend routes/pages/components, SQL schema/migrations, seed script, tracked files and ignore rules. The supplied Matcha subject v6.1 is an assessment reference, not authorization to change the application. This phase makes no application fixes. Prior live reports are supplementary; implementation conclusions below were checked against the current source. “Done” means implemented in the inspected code, not a blanket security/browser certification. “Partial” includes implementation gaps or required verification that remains outstanding.

## Registration and signing in

| Requirement | Status | Notes / current location |
|---|---|---|
| Register with email, username, first/last name, password | Done | `Backend/src/controllers/authController.ts`, `services/authService.ts`, `Frontend/src/pages/RegisterPage.tsx`; manual validation and bcrypt persistence. |
| Dictionary password rejection | Partial | `Backend/src/services/authService.ts:loadCommonPasswords/validatePassword`; exact comparison against a small (~104-entry) list, not broad multilingual dictionary coverage required by the PDF. Falls back to seven entries when unavailable. |
| Unique email verification link | Partial | Cryptographically random expiring token and Resend sender implemented; `authController.ts`, `emailService.ts`, `VerifyEmailPage.tsx`. Actual delivery with configured sender/domain is not established; failed sending still returns successful registration. |
| Username + password login | Done | `authController.ts:login`, `LoginPage.tsx`; verification gate, bcrypt compare and httpOnly cookie. |
| Password reset email | Partial | Request/reset endpoints, expiring DB token and both frontend pages exist. External mail delivery remains unverified (`emailService.ts`). |
| One-click logout from any page | Partial | Available on browse and own profile. Missing from `ChatPage.tsx`, `ProfileViewPage.tsx`, social-list pages, and auth token pages reachable while signed in. No global authenticated shell in `App.tsx`. |

## User profile

| Requirement | Status | Notes / current location |
|---|---|---|
| Gender, sexual preferences, biography | Done | `ProfilePage.tsx`, `profileController.ts`; valid three-value preference array is restored. Gender enum consistency remains a forms issue noted below. |
| Reusable tags | Done | Shared `tags` plus `user_tags`; normalization/reuse in `tagQueries.ts` and `TagPicker.tsx`. |
| Up to five photos and one profile picture | Partial | Upload/delete/select UI and API exist; partial unique index allows at most one flagged image. Five-photo check is count-then-insert, so simultaneous uploads can exceed the limit; no transaction/quota lock (`profileController.ts:uploadPhoto`). |
| Modify all info, names and email anytime | Partial | Editing implemented; pending-email flow now preserves active address. `ProfilePage.tsx` ignores returned pending address/message and says “Profile saved”; new-email verification/retry state is not shown. An empty stored preference becomes `''` in own-profile response and can make unrelated saves fail. |
| See profile viewers | Done | `/profile/viewers`, own-profile views tab and `/api/profile/me/views`; `SocialListLayout.tsx`, `profileQueries.ts`. |
| See users who liked you | Done | `/profile/likers`, own-profile likes tab and `/api/profile/me/likes`. |
| Public fame rating | Done | `fameRatingService.ts`, public queries, `FameBadge.tsx`: distinct viewers + likes + profile-completion bonus. Chat's header badge is hardcoded to 0, a display inconsistency (`ChatPage.tsx`). |
| GPS with explicit consent | Done | `LocationSection.tsx` calls geolocation only after the share button; private coords stored and reverse-geocoded by backend. Actual GPS provider/browser-permission execution not repeated here. |
| Manual location required if GPS declined | Partial | Manual field and endpoint validate input, but browse/search have no guard requiring either GPS or location text. User can skip it and call matching APIs (`browsingController.ts`, `searchController.ts`, `candidateQueries.ts`). |
| Location editable anytime | Done | Profile location section and authenticated PUT endpoint remain available. |

## Browsing and research

| Requirement | Status | Notes / current location |
|---|---|---|
| Orientation-compatible suggestions; bisexual default | Done | `candidateQueries.ts` applies viewer preference and defaults NULL/empty to bisexual. This satisfies the PDF's viewer-direction examples; it does not enforce reciprocal candidate preference if a stricter interpretation is expected. |
| Ranking combines proximity, shared tags and fame | Done | `matchScoringService.ts`: 45% geography, 35% shared tags, 20% fame; SQL scoring before pagination. |
| Priority to the same geographic area | Partial | Same-area gets maximum geographic contribution, but overall relevance can rank an out-of-area user above an in-area user. Default ordering has no hard same-area-first key (`browsingQueries.ts:buildOrderBy`). Clarify whether the evaluator accepts a boost or expects strict priority. |
| Browse sort/filter: age, location, fame, common tags | Done | `BrowsePage.tsx`, `FilterPanel.tsx`, `SortControl.tsx`, validated backend query builders. |
| Advanced search: age/fame ranges, location, one/multiple tags | Partial | Fully implemented `/api/search` with any/all tag matching. No frontend route/page/client calls this endpoint (`App.tsx`, `Frontend/src/api`). Browse filters expose similar criteria but only call suggestions. |
| Advanced search sortable/filterable by same criteria | Partial | Backend supports all requested criteria (`searchController.ts`, `searchQueries.ts`); dedicated research UI integration is absent. |

## Profile view

| Requirement | Status | Notes / current location |
|---|---|---|
| Public profile info except email/password | Done | Explicit public select and frontend rendering in `profileViewQueries.ts` / `ProfileViewPage.tsx`; no credentials/tokens/precise GPS exposed there. |
| Visit history | Done | GET records each visit, first visit creates view notification; self/blocked reads excluded. |
| Like requires own flagged profile picture | Done | `userHasProfilePicture` SQL and controller/viewer flags now use the selected-picture rule. |
| Unlike / disconnect | Done | Removes like and breaks mutual connection; HTTP/socket chat access uses connected state. |
| View fame rating | Done | Public payload and displayed badge. |
| Actual online status and offline last connection | Partial | Public status is “logged in within five minutes” (`profileViewQueries.ts:isUserOnline`); actual socket presence map is not used. Long-online and recently-disconnected users can display incorrectly; timestamp updated on login, not last disconnect. |
| Report fake account | Done | Validated report action/UI and DB row (`profileViewController.ts`, `reportQueries.ts`). |
| Block | Partial | Both direct profile directions and discovery are denied; likes removed. Social view/like lists do not filter blocks, and socket sending relies on likes without a separate block check (race risk). No blocked-list page exists to recover the unblock button after navigating away from the now-inaccessible profile. |
| Clear liked-me/mutual status and disconnect option | Done | Relationship flags and controls rendered in `ProfileViewPage.tsx`. |
| PDF: unlike prevents further notifications from that user | Missing | Unlike emits its notification but leaves no suppression state. A later profile view or renewed like can still notify (`profileViewController.ts`). This is an explicit additional PDF clause. |

## Chat and notifications

| Requirement | Status | Notes / current location |
|---|---|---|
| Connected-only real-time chat, ≤10 sec | Partial | Backend immediate socket delivery and connection checks exist. Browser page has no `message:new`/`message:sent` listener to append to its messages state; context only updates conversations. `loadMessages` depends on `messages` while an effect depending on it resets/loads messages, creating a likely refetch loop. Browser delivery/latency is not certified (`ChatPage.tsx`, `SocketContext.tsx`). |
| Unread message indicator on every page | Partial | Badge only in chat header, no global navigation. Initial unread API responses discarded; sent messages increment own unread count; context counts are not reset consistently on logout (`SocketContext.tsx`, `ChatPage.tsx`). |
| Live like-received notification | Done | DB insert and immediate `notification:new` emit in `profileViewController.ts`. No production latency guarantee measured. |
| Live profile-viewed notification | Partial | Emitted for first visit per pair only, not subsequent visits. If every visit must notify, current suppression misses events. |
| Live message-received notification | Done | DB insert and emit in `socketServer.ts`. |
| Live mutual-like/new-connection notification | Done | Both users receive counterpart identity after F8; DB/socket paths present. |
| Live unlike-from-connected-user notification | Done | Only emitted when mutual connection existed, as required. |
| Unread notification indicator on every page | Partial | Only ChatPage renders the badge. Initial counts ignored, notification popover uses separate state, live context IDs use Date.now rather than DB IDs, and read operations do not synchronize the context count. Global delivery/display within ten seconds is not demonstrated. |

## General and cross-cutting

| Requirement | Status | Notes / current location |
|---|---|---|
| No unexpected/unhandled errors; proper statuses | Partial | Central error handler and targeted pagination fixes exist. Chat's mark-read async handlers have no catch; socket catch exposes raw `error.message`; frontend chat effect risks remain. This cannot be certified from compilation or past endpoint tests. |
| Hashed passwords | Done | bcrypt with cost 10; `authService.ts`, seeded passwords also hashed. Password validator accepts up to 128 characters although bcrypt's effective limit is 72 bytes, a separate strength/truncation concern. |
| No SQL injection | Done | Inspected query builders bind values; dynamic sort/column names come from fixed code/allowlists. No defect established; not an exhaustive penetration-test guarantee. |
| No XSS | Partial | React escaping used; no dangerouslySetInnerHTML found. Full stored/reflected/browser testing was not done. Socket errors/CORS/upload handling warrant broader security review. |
| No unauthorized uploads | Partial | Auth before multer; owner checks, MIME/extension/size and magic signatures enforced. Signature check does not decode an image, so forged headers can pass; concurrent count limit is not atomic. |
| No other security vulnerabilities | Partial | Source-visible JWT/password fallbacks, unrestricted socket origins, no session revocation after password reset, socket handlers do not revalidate expired/revoked sessions per event. These are findings, not newly executed exploit proofs. |
| Responsive/mobile on all screens | Partial | Responsive grids, drawers and breakpoints exist. Chat fixed-height panes, narrow headers/popovers and all modal states have not been exercised across mobile viewports. |
| Latest Firefox and Chrome | Partial | No current cross-browser run or browser-test configuration found; cannot claim compatibility merely from React/Vite usage. |
| Header, main, footer on every page | Partial | Landing has all three. Most authenticated pages omit footer; AuthCard and social layouts use div wrappers instead of a site-wide header/main/footer. |
| Proper validation for all forms | Partial | Backend validators and frontend error states exist. Frontend gender options include `other` while backend allows male/female; own-profile empty preference save issue; browse uses parseInt before sending, truncating fractional input; some positive-ID parsers accept suffix garbage. |
| Minimum 500 distinct profiles | Missing | **Live SQL on 16 September: 0 users, 0 distinct usernames** in `matcha-pg/matcha_db`. `seedFakeProfiles.ts` defaults to 500, but a script is not a populated evaluation database. No data seeded during audit. |
| No committed secrets; .env ignored | Partial | Backend/Frontend `.env` ignored, not tracked; no `.env` path found in inspected Git history. Tracked `env.ts` and compose contain credential fallbacks; seed script has a published shared seed password. No proof of private API-key leakage found; history scan was not a full secret-scanner audit. |
| PDF: micro-framework, manual SQL, no ORM/validator/account-manager framework | Done | Express + pg/manual SQL, handwritten validation; package manifests inspected. |

## Highest-priority remaining defense risks

1. Populate and verify the required 500 profiles before evaluation.
2. Repair frontend chat rendering/effect behavior and global unread indicators/count synchronization.
3. Add global logout and required page shells/footer coverage.
4. Enforce manual location before matching; integrate advanced research UI.
5. Correct actual presence/last-seen behavior and clarify strict same-area ranking.
6. Address security gaps, multilingual dictionary scope, and runtime/browser testing.
7. Surface pending-email confirmation/retry state and reconcile frontend/backend form enums.

No fixes to these findings are authorized as part of Phase 2. Phase 2 is colors only. The database was briefly started for the count query and restored to its original stopped state. D1–D3 deployment issues remain outside this work.

## Addendum observed during Phase 2 visual checks

Chrome emitted an existing React warning: `In HTML, <form> cannot be a descendant of <form>. This will cause a hydration error.` The outer edit form in `Frontend/src/pages/ProfilePage.tsx` contains `LocationSection`, whose manual-location UI renders another form. This strengthens the Partial ratings for form validation/error handling. The color-only structural comparison confirms this nesting was pre-existing; it was not changed. Socket connection errors during these visual checks were expected because browser fixture responses were used without a running backend.
