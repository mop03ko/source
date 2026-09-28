# Navigation and data loading

- CRM-instance memory cache: 15-second TTL, at most 12 responses, duplicate reads share a pending request. No localStorage or shared server cache.
- CRM mutations, manual refresh, settings/profile saves invalidate cached reads. Identity or role changes invalidate the cache; 401/403 clears displayed CRM data.
- Visible-page focus and a 60-second interval refresh expired data. Server endpoints remain authenticated and `no-store`.
- Non-sales modules share `view=workspace`: directory, settings and navigation counters remain available; lead rows, row count and reports are omitted.
- Module code preloads on navigation hover/focus. Delivery, performance, dashboard reports and loan purchase panels load on demand.
- First load uses a layout skeleton. Refresh uses a narrow progress bar. A mismatched sales-list scope hides old rows until the matching response arrives. Reduced-motion preferences disable the animation.

## Verification

Disposable local SQLite + production Next build, Chrome: dashboard → guide → settings → guide → dashboard, one-second waits between navigation clicks, after initial requests settle.

Before: **4** `/api/crm` reads. After: **1** read (`view=workspace`). This is a **75% reduction in CRM reads for this sequence**, not a production latency or Core Web Vitals claim. Other module requests are excluded.

`node scripts/navigation-audit.mjs after` asserts at most one CRM read for that sequence. `tests/workspace-read.test.cjs`, existing CRM/cache tests, and dashboard role/mobile browser checks cover the affected behavior.
