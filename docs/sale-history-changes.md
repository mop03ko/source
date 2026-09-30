# Approved direct-sale editing and deletion

Admin and manager roles can open **Засах / устгах** from the warehouse sales table or the approved request detail. Director/agent/operator/courier roles cannot edit or delete confirmed sales.

The editor supports the item, branch, quantity, unit price, customer, bill/contract, sale date, payment channel, note, accessories and gifts. A reason is mandatory. Deletion requires an explicit confirmation showing the sale and explaining stock restoration.

Changes run in the existing serialized database transaction with a revision precondition and idempotent request UUID. Main and gift ledger movements are reversed together; an edit then validates and posts the replacement. Insufficient stock, inconsistent historical movements, stale revisions or invalid input roll back the entire operation. Returned historical cost is reused before allocating additional stock cost, so metadata-only edits preserve original cost.

Reversals retain the original accounting dates, while their creation timestamps record when the correction happened. This prevents a historical edit from doubling the old period's outflow. The editor remains open when the viewport changes between desktop and mobile.

Active sales are removed on deletion so existing sales/report queries exclude their revenue and cost. Original and reversal stock movements remain, and `inventory_sale_changes` preserves the original sale, identifiers, movements, actor and reason. Edited sales retain their ID, original creator and creation timestamp. Linked approved requests receive the new payload; deleted requests retain their original record but disappear from the active approved list. No customer SMS is sent by these operations.

Loan-purchase sales and loan gift lines are excluded: deleting those requires coordinating the loan status and fulfillment, outside this direct-sale workflow. Imported rows without reconcilable stock movements are rejected rather than manufacturing returned stock.

Migration: `0043_sale_history_changes.sql`; production MySQL: `scripts/mysql-sale-history-migrate.mjs antmall_crm_production` after backup. Tests: `tests/sale-history.test.cjs`, the full isolated suite, disposable MySQL smoke, and local browser edit/delete fixtures. No production sale is modified for validation.
