# Loan purchases and weekly deliveries

Loan intake deduplicates phone, normalized registration and product within the same Ulaanbaatar day. Request UUID retries retain their existing result. Web duplicates do not add an assignment, SMS or Sheet mirror row. Sheet imports skip duplicates before their batch cap, while preserving existing linked records and owner updates. Historical duplicate leads are not deleted.

Purchase confirmation records the main product, zero-price gifts and priced accessories in one stock transaction. A single branch with sufficient stock is automatic; multiple branches require selection. Delivery requires an active courier scheduled for delivery that day and chooses the smallest current daily load. If any stock or courier check fails, the whole purchase rolls back. The confirmation UI uses the loan contract label and omits commission/tax fields. Existing sales history is unchanged.

Delivery lists default to the current Monday–Sunday week in Ulaanbaatar. `period=archive` retains every earlier record, including unfinished deliveries; `period=upcoming` shows later weeks. Archiving is a date-based view, so no rows are deleted or rewritten and the boundary advances automatically. Delivery dashboard aggregates and courier dashboard tasks are server-scoped to this week. Other roles' task dates are unchanged.

Stock pickers for loan purchases, gifts, accessories, sales and transfers request `available_only=1`. Filtering happens before product grouping, serial selection and pagination and excludes inactive or nonpositive-stock items. Purchase receipts and historical lookup retain the complete catalog. Confirmation still validates current stock transactionally.

Deploy the additive `0040_loan_fulfillment.sql` schema before activating the application. For MySQL, after a backup run `sudo /opt/antmall-crm-node/bin/node scripts/mysql-loan-fulfillment-migrate.mjs antmall_crm_production`. The script only creates the three new tables and records its checksum; it does not run the Turso migration/import tools. An application rollback can leave these additive tables in place.

Validation: isolated fulfillment, concurrent web dedup, CRM imports, Sheet duplicate batch draining, stock picker, delivery/archive/role isolation, UB Sunday/Monday/year boundaries, and dashboard tests. All tests use disposable fixtures and send no real SMS.

## Deployment — 2026-09-30

Application release `3b633d8` is active at `/srv/antmall-crm/releases/3b633d8`, served by `antmall-crm` on `https://crm.antmall.mn`. Previous release `fffee85` is retained for rollback. Source is pushed to `feature/direct-web-loans`.

Before activation, the live source matched `fffee85` exactly; production was backed up to `/srv/antmall-crm/backups/mysql/antmall_crm_production-20260930T050833-235121.sql.gz`. The additive MySQL migration and its repeat verification both passed. Existing delivery rows were not modified.

All 42 isolated suites, lint, TypeScript, local and Ubuntu production builds passed. Local production HTTP/auth checks and seven desktop/mobile UI captures passed without runtime exceptions or page overflow. A disposable MySQL database also verified the actual adapter's transaction/notification behavior, daily duplicate rejection, gift stock, idempotent replay, atomic rollback, courier assignment and delivery queries; the test database and its user were removed afterward.

Authenticated read-only checks passed first on port 3002 and then on the public production domain: 3,019 archived deliveries, 0 deliveries in September 28–October 4, and 492 available product groups at verification time. Product and serial picker results all had positive stock. No customer request, sale or SMS was created during production verification. Courier authorization is covered by fixture tests; there was no already-linked active courier login available for the production HTTP check.
