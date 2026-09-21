# Ant Design UI migration

The application now uses Ant Design 6 with the Next.js App Router style registry, Mongolian locale and a shared orange/purple CRM theme. Login and all CRM modules share the same controls.

## Components

- Layout/Menu and mobile Drawer navigation.
- Button, Input, TextArea, searchable Select, DatePicker, Checkbox and Radio.
- Modal and Drawer with the existing unsaved-change guard.
- Tabs, Table, Pagination, Popover, Switch, Empty and contextual message notifications.

The adapters in `components/ui` preserve existing business forms. Select and date controls retain native backing fields for FormData, required/min/max validation and dirty tracking. Date values remain local wall-clock strings; existing server conversion to Ulaanbaatar time is unchanged. Uncontrolled text controls reset with their native form. Table renderers retain custom row components and the mobile lead-card layout.

Existing charts, business calendars and domain-specific layouts remain custom components. Unused UI scaffolding remains available in the repository; it is not part of the active CRM screens.

## Validation

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.
- `node scripts/ux-audit.mjs`: desktop/mobile navigation, delivery form, history, draft protection, validation, keyboard tabs, error recovery, SMS settings, chat drafts, restore flow and overflow checks. Screenshots: `artifacts/antd-ux-audit/`.
- `node scripts/lead-purchase-audit.mjs`: actual Ant Select and DatePicker interactions, stock checks, sale confirmation and persistence on desktop/mobile.
- `node scripts/inventory-audit.mjs "D:\Downloads\AOM Inventory-2026.09.17.xlsx"`: inventory views and a disposable import of 3,096 accepted rows, excluding 19 conflicting rows.

Browser audits use disposable local databases and test identities. They do not modify production inventory or send real SMS.
