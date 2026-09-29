# Direct website loan intake

The storefront server posts to `POST /api/integrations/web-loans` using the private `X-Web-Loan-Token` header. `CRM_WEB_LOAN_TOKEN` must match on both servers. The browser never receives this token. On the current shared host, `CRM_WEB_LOAN_URL` uses loopback port 3001, avoiding public DNS during delivery.

Payload: `request_id` (UUID), `name`, `phone` (8 digits), `registration` (2 Cyrillic letters plus 8 digits), and `product`. Extra fields such as owner/status are rejected. The CRM generates source, owner, status and timestamps. Source is `Вэбсайт`; current automatic assignment settings apply, including duty roster and operator exclusion. Unassigned requests remain in the existing waiting queue; suppressed numbers are not scheduled or notified.

The request receipt, lead, audit entry and notifications commit in one transaction. Retrying an identical UUID/payload returns the same lead; changing its payload returns 409. The storefront retries transient failures up to three times with the same UUID and only displays success after CRM acknowledgement. If all attempts fail, the form preserves its fields and retry ID in the current page. There is no background queue: the user must retry an unresolved submission. Reloading the form discards the in-memory retry ID.

After cutover, `CRM_DIRECT_WEB_LOANS=true` excludes Sheet connection 2 from sync and rejects attempts to edit/reactivate it. The web Sheet tab is removed from CRM settings; connection 1 (online loan requests) remains. Historical Sheet rows and imported leads are retained. Existing Sheet 2 requests must be synced once after the old storefront process has drained, before disabling that connection.

The storefront integration source is mirrored in `deploy/storefront/loan-request-form-route.ts`. Its form client must send a stable UUID across retries and accept the CRM string ID. The old Storefront `LoanRequestForm` write and Google append are replaced by CRM intake; CRM becomes the sole new-request record for this form. Other storefront routes are unchanged.

Validation includes token rejection, strict payload validation, simultaneous retry deduplication, conflicting reuse, assignment excluding operators, suppression, transactional audit creation, upstream timeouts and false-success prevention. Live-like end-to-end tests use an isolated MySQL stage, never real customer messages.

## Deployed 2026-09-29

CRM release: `/srv/antmall-crm/releases/504b442`. Website remains at `/home/ubuntu/antmallmnnew-nextjs`, PM2 process `nextjsapp`; its two source changes are committed there as `ac1665d`. The reviewed client change is saved in `deploy/storefront/loan-request-client.patch`. Unrelated existing website working-tree changes were preserved.

Both production builds passed. Forty isolated test suites passed, plus actual MySQL concurrent intake tests and the complete production-built website-to-CRM flow against the stage database. The final legacy web Sheet sync imported two remaining requests, then connection 2 was disabled. Production checks confirmed matching private credentials, intake validation/authentication, Sheet 1 HTTP 200, Sheet 2 HTTP 410, and website/form HTTP 200. Test services were stopped. No synthetic loan was inserted into production and no SMS was sent during these checks.

Private pre-cutover website files and previous build are under `/srv/antmall-crm/backups/web-intake-cutover`; production SQL backup was taken before activation. Do not re-enable web Sheet sync or revert the form without reconciling requests already accepted directly into CRM.

## Automatic acknowledgement SMS

New website requests create a `sms_pending` activity in the same transaction only when the `new` SMS rule is enabled and the phone is not suppressed. Next.js `after` dispatches after the intake response, preventing Unitel latency from causing website retries. A conditional database claim moves the activity to `sms_sending` before contacting Unitel. Duplicate submissions cannot send twice. The rule and suppression are checked again before sending. Success/failure replaces the activity with a readable note; HTTP acceptance is not a delivery receipt. No previous requests are backfilled. No automatic retry occurs after a provider failure or uncertain timeout. A process crash may leave a pending/sending activity requiring inspection; inspect Unitel history before any manual resend.
