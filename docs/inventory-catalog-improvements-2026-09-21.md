# Inventory catalog improvements — 2026-09-21

Implemented product thumbnails (HTTPS image URL field with preview/fallback), capacity/color labels, exact identifier search priority and Enter-to-open, lazy warehouse stock popovers, separately labelled cash/credit price ranges, expandable IMEI/barcode rows, per-unit sale/purchase/transfer/edit actions, and personal column/density/sort preferences.

Bulk edits support category, brand and supplier for admins/managers only. Selecting a product includes every child record; the review shows their before/after values. Server-side fingerprints reject changed metadata or group membership after review. Updates are transactional and idempotent, preserve item IDs and stock ledger, and retain an actor/time audit record in inventory_bulk_edits. Limits: 50 selections / 5,000 child records per operation. Brand changes recalculate grouping.

Migration 0032 adds image_url and inventory_bulk_edits only. Existing photos are not invented; users enter HTTPS URLs in the item editor. View preferences are per user/role/browser, not synced between devices. Zero stock remains hidden by default; exact scans can open zero-stock records. Warehouse popovers explicitly show all warehouses and children, independently of list filters.

Validation: full npm test suite, production build, scoped ESLint, API regression tests (image validation/preservation, exact search, warehouse stock, permission checks, omitted fields, idempotency, stale preview rejection, unchanged ledger), disposable-database Chrome audit. Browser checks cover expansion, stock popovers, persisted density, bulk preview/apply, scan-to-open, unit choice, exact-unit sale, and mobile/desktop overflow. Evidence: artifacts/inventory-catalog-audit (local, not committed).
