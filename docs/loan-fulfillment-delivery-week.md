# Loan purchases and weekly deliveries

Loan intake deduplicates phone, normalized registration and product within the same Ulaanbaatar day. Request UUID retries retain their existing result. Web duplicates do not add an assignment, SMS or Sheet mirror row. Sheet imports skip duplicates before their batch cap, while preserving existing linked records and owner updates. Historical duplicate leads are not deleted.

Purchase confirmation records the main product, zero-price gifts and priced accessories in one stock transaction. A single branch with sufficient stock is automatic; multiple branches require selection. Delivery requires an active courier scheduled for delivery that day and chooses the smallest current daily load. If any stock or courier check fails, the whole purchase rolls back. The confirmation UI uses the loan contract label and omits commission/tax fields. Existing sales history is unchanged.

Delivery lists default to the current Monday–Sunday week in Ulaanbaatar. `period=archive` retains every earlier record, including unfinished deliveries; `period=upcoming` shows later weeks. Archiving is a date-based view, so no rows are deleted or rewritten and the boundary advances automatically. Delivery dashboard aggregates and courier dashboard tasks are server-scoped to this week. Other roles' task dates are unchanged.

Stock pickers for loan purchases, gifts, accessories, sales and transfers request `available_only=1`. Filtering happens before product grouping, serial selection and pagination and excludes inactive or nonpositive-stock items. Purchase receipts and historical lookup retain the complete catalog. Confirmation still validates current stock transactionally.

Deploy the additive `0040_loan_fulfillment.sql` schema before activating the application. For MySQL, after a backup run `sudo /opt/antmall-crm-node/bin/node scripts/mysql-loan-fulfillment-migrate.mjs antmall_crm_production`. The script only creates the three new tables and records its checksum; it does not run the Turso migration/import tools. An application rollback can leave these additive tables in place.

Validation: isolated fulfillment, concurrent web dedup, CRM imports, Sheet duplicate batch draining, stock picker, delivery/archive/role isolation, UB Sunday/Monday/year boundaries, and dashboard tests. All tests use disposable fixtures and send no real SMS.
