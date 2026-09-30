# Direct-sale gifts and accessories

Both the new-record direct-sale form and the warehouse sale form support:

- `has_accessories`: a boolean only; no product or quantity selection and no inventory movement.
- `gifts`: up to 20 stocked inventory selections with quantities and branches; optional promotion name.
- A single sufficient branch is automatic; multiple sufficient branches require a selection.

All new direct-sale submissions, including admin and manager submissions, store authoritative gift snapshots in the pending request without reserving or withdrawing stock. Approval revalidates all stock, including combined main/gift quantities for the same item and warehouse. Main sale, gift movements, identifiers, metadata and approval status commit in one existing serialized transaction. Receipt retries cannot withdraw stock twice.

Gifts have no additional sale revenue. Their cost is included in the parent sale cost, keeping one sale count and correct overall profit. Gift stock movements share the parent sale reference. Saved JSON contains no cost/profit fields; restricted-role APIs continue to remove cost columns. Gift identifiers are appended without replacing the main sale's identifiers.

Migration: `0042_direct_sale_extras.sql`. Production MySQL additive migration: `sudo /opt/antmall-crm-node/bin/node scripts/mysql-direct-sale-extras-migrate.mjs antmall_crm_production`, after a database backup. Existing sales default to no gifts/accessories.

Validation: `tests/direct-sale-gifts.test.cjs` covers approval, stock aggregation, insufficient-stock rollback, idempotency, cost, identifiers and role privacy. Local browser fixtures cover actual multi-gift saving and desktop/mobile rendering. No production sale or SMS is created by validation.

Approval/rejection and approved-sale editing/deletion are restricted to admin and manager roles. Directors can view requests and submit sales for approval; they cannot finalize a new sale or change an approved sale. Every new direct sale requires a separate explicit approval, including entries submitted by an admin or manager. The submitter may approve their own request if they have admin/manager rights; a different approver is not required.
