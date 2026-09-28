# Mobile review — 2026-09-28

## Fixed

- Inventory, marketing and IT searches shrank beside filters (24–85 px in the initial views). Searches now occupy their own row; a loaded 320 px inventory view measured 255 px.
- Sales navigation hid sections beyond horizontal scrolling. Mobile now uses a labelled Ant Design Select; desktop keeps its navigation buttons.
- Settings/detail tab wrappers use a labelled mobile selector, preserving draft guards and desktop tabs.
- Saved filters are inside the additional-filter disclosure. Empty bulk selection no longer shows disabled export/reset actions; selecting rows reveals them.
- Compact mobile headers, inventory controls and dashboard spacing reduce the distance to content. Touch targets and form text sizes are increased.
- Schedule primary actions wrap instead of clipping the add-assignment button.
- Modal forms use one main scroll area with viewport limits and safe-area footer spacing.
- Date/time picker previously measured 469 px wide, starting at x=-21 on a 320 px viewport. Calendar and time now stack in a 304 px panel at x=8, with bounded vertical scrolling.

## Validation

- Local production build with disposable SQLite fixtures and synthetic accounts; no production customer data or real SMS used.
- Geometry sweep across dashboard, sales, inventory, schedule, delivery, marketing, IT, settings and guide at 320/360/390/430 px. No document-level horizontal overflow found. Initial sweep included loading states; loaded views were also inspected directly, especially the affected search fields, schedule actions and pickers.
- Exercised sales section selection, bulk select/clear, settings section selection, inventory add form, inventory balance view, team list, chat list/thread, meeting form and marketing date/time picker. Chat also checked at 390×500.
- Desktop settings verified at 1280×900: four tabs retained and no page overflow.
- `npm run lint`, `npm test` (34 isolated suites), `npm run build`, and `npm run test:production` passed.
- Screenshots are local artifacts under `artifacts/mobile-20260928/`; final inventory and date/time examples are `inventory-final-390.png` and `datetime-320.png`.

## Limits

Chrome viewport testing is not physical iOS Safari/Android keyboard testing. Wide analytical tables retain internal horizontal scrolling. This is a visual/responsive review, not exhaustive validation of every business workflow or every role's permissions.
