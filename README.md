# AntMall CRM

Private, authenticated Mongolian CRM for AntMall. The Sites deployment is owner-only by default. Grant a teammate platform access and add their ChatGPT sign-in email in the application's Team section to allow team use. Do not make the site public to work around team access.

## First use

1. Open the private site while signed into the owning ChatGPT account. The first verified owner-only visitor initializes the organization and administrator membership.
2. Add a request or import UTF-8 CSV using the in-app blank template. Import is previewed and confirmed, up to 100 rows per batch; duplicate and suppressed phone numbers are skipped. Google Sheet imports use the configured connection; no sample personal data is seeded.
3. Add members and assign requests. Agents only access their own requests; managers access all requests; admins also manage members. Team registration sends no email invitations.
4. Record interactions, set the next appointment in Ulaanbaatar time, and manage Recycle from the request detail panel.

## Included

- Persistent D1 records with generated Drizzle migrations.
- Server-verified identity and membership authorization on every API request.
- Request create/update, source, owner, stage, next action, phone-normalized duplicate detection.
- Search, stage filter, 40-row pagination and CSV export of the displayed page.
- Interaction timeline, optimistic concurrency control and atomic activity logging.
- Phone-wide do-not-contact suppression; no-answer attempts counted across the last 14 days.
- Recycle enrolment and next-call scheduling, stop after the third unanswered call even if a later appointment was submitted.
- Closed and opted-out cases excluded from the contact queue. Unconnected expired Recycle cycles excluded from the active queue.
- All-time live status distribution and purchased-stage conversion; no fabricated historical baseline or causal ROI.
- Mongolian internal guide and responsive interface.

## Deliberate boundaries

Calls/SMS/Messenger are performed externally and logged here. No automatic outbound messaging, Facebook integration, background notification service, purchasing or bank-loan submission is connected. The first deployment is private to the owner; adding application membership alone does not grant platform access. No deletion or opt-out reversal is exposed. CSV export is explicitly page-scoped. The displayed activity history is the last 100 events; older events remain in the database. No demo data is seeded.

## Validation

`pnpm exec tsc --noEmit` checks the application. `node tests/crm.test.cjs` runs the actual route handlers against an in-memory SQLite D1-compatible adapter, exercising authentication, authorization, request lifecycle, CSV/imports, concurrency, opt-out and Recycle limits. `node <sites-plugin>/scripts/build-site.mjs` produces the deployment bundle.

WebMCP tools open existing views and the creation form only; they do not save records. Runtime WebMCP validation and browser visual validation were unavailable because this task did not authorize a managed browser preview. They are not represented as completed checks.

## Google Sheets integration

The Google Sheets page is admin-only. It is prefilled from the observed `ЗЭЭЛИЙН ХҮСЭЛТ-2026.09.07` workbook and `Онлайн зээлийн хүсэлт-2026/09` tab. Selected columns are A (timestamp), B (phone), D (product), E (employee name), H (initial status), and C (registration). Free-text financial details are not requested. Header drift fails closed. All-history mode is enabled by default; employee alias mapping still requires active CRM members.

An administrator must configure a dedicated Google service account with Sheets API enabled, share only the source workbook with its service-account email as Viewer, upload the JSON key in the CRM settings, map source employee names to existing active CRM members, test the read and then enable automatic reading. Credentials are encrypted with AES-GCM using a separately managed Sites secret `CRM_CONNECTION_ENCRYPTION_KEY`. Read responses never expose the private key; OAuth uses `spreadsheets.readonly` with no delegated user. The shared key is not in the source repository.

Automatic polling occurs every 30 seconds while at least one authenticated CRM page is visible, with a global lease and 25-second minimum interval. There is no provisioned scheduler while all pages are closed. A persistent background integration is still a separate deployment prerequisite; this build does not claim real-time or always-on Google change delivery. At most 80 changed/new requests are applied per poll. Existing source assignments are processed ahead of new imports. New imports run newest first. A row-derived timestamp plus normalized phone provides retry identity without modifying the Sheet; editing the timestamp or phone creates a new source identity; it does not rewrite a previous request. Sheets may grow to 60,000 rows; larger sources fail explicitly rather than silently truncate.

Changed Sheet assignment updates the CRM owner and immutable activity history. CRM status, contacts, notes and agreed callbacks are not overwritten. Unmapped or inactive assignees are withheld from all agents in an unassigned queue visible to management. Mapping a formerly unassigned new request creates its first work task. An agent loses read access to a reassigned request immediately at the API layer, and visible request details are checked on the next 30-second refresh. The spreadsheet controls ownership of linked leads. Row deletion never deletes CRM history. Unknown source stages are held for review. Existing manual requests sharing a phone are not automatically hijacked.

Run `node tests/sheets.test.cjs` for the actual integration handlers against an in-memory SQLite adapter and mocked Google responses, including encrypted key roundtrip, scope/selected-column checks, setup activation gate, idempotency, row reorder, owner handoff, permissions, preservation of CRM history and callback, unmapped staff, terminal/opt-out handling and header drift. Real Google runtime connectivity remains unverified until the administrator completes credential setup.

## Personal notifications

The top-bar bell shows only the signed-in member's assigned requests (including manager/admin accounts). Creating/importing an assigned request and changing its owner persist an assignment notice in the same D1 transaction. Google Sheets sync uses the same path. Repeated syncs and failed optimistic updates cannot create duplicate notices. Unknown/inactive assignees receive no notice.

The open CRM polls every 30 seconds and materializes due reminders with a stable request/owner/schedule key. Read state persists across devices. Reassigned, closed, opted-out, rescheduled and expired unconnected-cycle reminders are filtered from the active inbox. There are 20 items per page; the read button affects only the displayed unread IDs. Notification API derives recipients from server authentication and rejects cross-origin writes.

Optional desktop notifications require a user gesture, browser permission, HTTPS and an open CRM tab. Only generic text is shown outside the app. Delivery is best effort: browsers may throttle background tabs and mobile/embedded browsers may not support it. Atomic alert claims prevent duplicate desktop delivery across tabs; inbox records remain if OS display fails. This is not a service-worker push service; closed-browser delivery, email and SMS are not implemented. Due reminders missed while closed appear on the next open. Sheets assignment notifications start once the existing Google connection is configured and a sync runs.

Verification: `pnpm exec tsc --noEmit`, `node tests/crm.test.cjs`, `node tests/sheets.test.cjs`, and the Sites production build. Route tests use real SQLite and mocked platform identity/Google transport; OS notification permission/display has not been browser-tested.

A deployment secret `CRM_GOOGLE_SERVICE_ACCOUNT_JSON` can supply an initial key. Only an authenticated administrator sync consumes it. It is sealed into D1 only if no key exists, preserves existing configuration, then runs the normal Google/header test before enabling sync. Failed validation leaves sync disabled with an actionable error; the admin can retry using Test connection and Enable. Existing credentials and a manually stopped connection are never overwritten or re-enabled by bootstrap. No raw key is included in source/build artifacts.


## Import completeness and registration numbers

The online-loan tab now imports all historical dates by default (including existing saved configurations). Administrators may disable all-history mode and set a start date. Other workbook tabs remain separate sources and are not silently merged. Known source labels are mapped; ambiguous/unrecognized outcomes and missing products enter a paused review stage. Invalid timestamps/phones and exact timestamp+phone duplicates stay in the row issue list. Suppressed phones remain excluded. The diagnostics show source/eligible/date-filtered/invalid/duplicate/review counts, per-pass register backfills and pending work, refreshed every 15 seconds in Settings.

Different timestamp+phone identities create distinct Sheet requests even when the phone already exists. Stable source link identity prevents repeated imports. Manual/CSV duplicate policy remains unchanged. Up to 80 writes per sync continue across passes; the CRM must remain open for its existing polling. Registry backfills participate in this same queue.

Column C supplies registration numbers. Existing configuration gains this mapping on read. Registration is optional, normalized to uppercase, and accepts two Cyrillic letters plus eight digits; this is format validation, not identity verification. Invalid source values are reported without rejecting the rest of a valid request. Existing linked requests with blank registration are backfilled. Manual edits or clears are protected from subsequent backfill. Full registration is shown only in the protected request details/edit UI, not desktop notifications or activity notes. Existing per-owner authorization remains in force.

Request creation time is now displayed independently of the next-contact schedule in the table, detail and CSV, including year and UTC+08 clock time. Timestamp parsing validates calendar days/hours (no rollover), supports local ISO and en_US slash formats/AM-PM, and tolerates the observed trailing backslash typo. Numeric Sheets serial conversion and previously valid timestamp identities are unchanged. Invalid date cells remain excluded with separate date/phone counts and links to the source timestamp cell; no date is guessed from row order or neighboring customers. Existing valid dates are not bulk rewritten.
