# Ubuntu / MySQL migration

Target: existing Ubuntu host 202.131.1.134. CRM runs separately on localhost:3001 under `antmall-crm`; existing sites and port 3000 remain independent. Apache terminates TLS. Node runtime is installed at `/opt/antmall-crm-node/bin/node`.

## Current status — 2026-09-29

The user postponed DNS/certificate work. Public CRM remains on Vercel/Turso; the source is not frozen. No CRM Apache virtual host is enabled and no CRM certificate was issued. The canceled DNS challenge must not be reused. Port 3001 is a loopback-only preparation instance of the original release using Turso. The isolated MySQL stage on port 3002 is stopped after validation.

The migration branch is preparation only. Do not promote the stage or rehearsal databases: stage contains test mutations, and rehearsal is an unfrozen historical snapshot. Final cutover requires a fresh, frozen-source import and HTTPS/DNS validation.

## Storage compatibility

`MYSQL_URL` selects MySQL; absent it, Turso remains active. The adapter uses a bounded pool, UTC sessions, strict writes, binary/no-pad identity comparisons and explicit case-insensitive search. Shared write transactions lock one CRM-only row to preserve the existing serialized inventory workflow. SQL placeholders remain bound; duplicate handling does not suppress truncation/validation errors.

MySQL schema is generated from the reviewed SQLite migration schema. Monetary columns that historically contained SQLite REAL values despite an INTEGER declaration become DOUBLE; authoritative `*_cents` stay BIGINT. Import refuses non-integral values in remaining integer columns. SKU codes, auto-increment high-water mark, stock movement row IDs, indexes and SKU triggers are preserved. Trigger installation runs under the migration administrator; the runtime user must not have SUPER or schema-administration privileges.

## Cutover order

1. Verify the release against an isolated MySQL copy. Stage has synthetic authentication and disabled SMS/Sheet writes.
2. Obtain the CRM certificate, install the Apache virtual host and check HTTPS using an explicit DNS override before changing public DNS.
3. Deploy the migration gate to every Turso-backed production instance. Confirm the deployed revision before freezing.
4. Freeze Turso using `node --env-file=... scripts/migration-source.mjs freeze`. This is an atomic setting change serialized with writes. Existing older deployments without the gate must be retired or blocked before cutover.
5. Import into a **new empty** `antmall_crm_production` database with `scripts/mysql-import.mjs`. Supply MYSQL_URL, Turso credentials, CRM_BACKUP_DIR and, for schema/trigger administration, MYSQL_ADMIN_SOCKET. The script saves a private source snapshot, SHA-256 and metadata, and compares every imported row.
6. Switch the server release/env to MySQL. Preserve Google credentials, encryption key, public API token digest and business settings. Set AUTH_URL=https://crm.antmall.mn. Restart only the CRM service and verify HTTPS/API behavior.
7. Point Datacom's crm A record to 202.131.1.134; remove conflicting crm CNAME/AAAA entries if present. Preserve unrelated DNS records. Keep Turso fenced while DNS caches expire.
8. Configure certificate renewal to HTTP webroot after public DNS points to this host; test renewal. Install daily MySQL backups and perform a restore test.

## Rollback

Before MySQL receives production writes, restore the previous release/connection and deliberately release the Turso fence. After MySQL receives any production writes, DNS-only rollback is unsafe: reconcile/export those writes first. Keep the old Turso source, private snapshot, release archive and migration verification report until cutover acceptance.

## Initial validation

The staging copy verified all 45 business tables byte-for-byte at the JSON field level, including 29,912 leads, 3,164 inventory registrations and 3,019 deliveries. Final import also retains `crm_migrations` and takes a new snapshot while the source is frozen. These initial counts are not final cutover totals.

Read smoke coverage includes CRM reports/calendar/duplicates, inventory products/balances/purchases/sales/search, marketing, IT, counts, delivery, schedule, dashboard, chat/search, notifications, todos, meetings and settings. Write coverage includes fractional amounts, SKU triggers, stale edits, inventory rollback, operator pending sales, concurrent approval, role restrictions, reminder claim/ack and notification claims.

Secrets and backups are server-private and must not be committed. Staging data is never promoted to production because it contains test changes.

The final importer rehearsal verified 46 tables including 39 migration records, 29,918 leads and 3,164 inventory registrations. The source continued operating during this rehearsal.

The rehearsal SQL backup was restored into `antmall_crm_test_restore` and all 46 tables matched the saved source snapshot. Local typecheck, lint, production build, production smoke and all 35 isolated test suites passed. The isolated MySQL app passed 38 read endpoints and the write/concurrency/role checks described above. Google OAuth and real SMS delivery remain cutover checks.

## Backup operation

Run `sudo bash deploy/ubuntu/mysql-backup.sh antmall_crm_production` after cutover. It creates a consistent compressed SQL dump including triggers, with private permissions and a SHA-256 sidecar in `/srv/antmall-crm/backups/mysql`. Incomplete dumps are removed. No retention deletion is automatic; establish retention and an encrypted off-server copy before relying on this as disaster recovery.

Schedule the script daily only after the production database exists. Restore into a new isolated database with `gzip -dc BACKUP.sql.gz | sudo mysql NEW_DATABASE`, then verify the restored rows and triggers. Never restore over the live database as a test.
