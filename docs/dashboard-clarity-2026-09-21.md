# Dashboard clarity review and changes

The dashboard mixed daily action counts, all-time workload and creation-date reports; it repeated metrics in a long grid, displayed all status rows even when empty, and marketing daily tasks used IT status labels. The administration report made five requests without consistently bounded timeouts or protection against late date-range responses.

The dashboard now keeps daily work first and moves the report date picker inside a separate management report. Ant Design Tabs separate sales leads, marketing and IT; Card/Statistic identify metrics and scope, Progress shows nonempty status distribution, Table paginates pending approvals, Alert explains current workload, and Empty/Skeleton show meaningful empty/loading states. Pending approvals explicitly ignore the report period and require review and a reason. Export is disabled during loading/error. Range requests have 20-second timeouts and sequence protection.

Daily role views retain server-enforced access and own-task scope. Overdue work is highlighted; unscheduled work has an explicit next step. Marketing uses marketing status labels. Today-new requests are labelled as today's incoming requests instead of total requests. Approval dialog cannot close while saving.

Validation: production build, scoped ESLint, CRM/dashboard/marketing regression tests and disposable local Chrome audit for all seven roles. Audit covers report tabs, approval validation and save, absence of management report for isolated roles and agents, overdue tasks, and desktop/tablet/mobile overflow. No production data or permissions changed.
