# Screen register

Each screen with its route, who can use it, the workflow it belongs to, the permission it needs, the tables behind it and what "done" means. **Status** is what exists in this repository and is covered by the end-to-end suite unless stated.
Permissions are `resource:action` from `lib/rules/permissions.ts`. A role is a bundle of these; people can also be scoped to branches.

## Built

| Area | Screens (route) | Permission | Data | Acceptance (summary) |
|---|---|---|---|---|
| Account | Sign up `/signup`, confirm email `/verify`, sign in `/signin`, two-factor `/2fa`, forgot/reset `/forgot` `/reset`, accept invitation `/invite/[token]`, profile/security/sessions `/account`, workspaces `/workspaces`, create company `/onboarding` | none (own account) | `identity.*`, `profiles`, `memberships` | Same response whether or not an address is registered; 5 failed attempts lock 15 min; reset links are single-use and sign out other devices; recovery codes work once |
| Command centre | `/` | any member | many | Leads with overdue work, approvals, expiries; every item links to its records; first-use checklist when empty |
| Branches | List `/branches`, add `/branches/new`, record `/branches/[id]`, close `/branches/[id]/close` | `branches:*` | `branches`, `branch_history` | Search/filter/sort in the URL; plan limit explained with upgrade link; closing is blocked until orders, dues, assets and tasks are resolved, access removed last |
| Organisation | `/organisation` | `organisation:*`, `franchise:*` | brands, regions, legal entities, departments, partners | Everything optional; archive, never delete |
| People & access | `/people`, roles `/people/roles` | `users:*` | `memberships`, `roles`, `invitations` | Invite by email with role and branch scope; custom roles from a permission grid; can't edit or suspend your own access |
| Tasks | `/tasks`, `/tasks/new`, `/tasks/[id]` | `tasks:*` | `tasks`, `task_comments` | Deadlines entered in the branch's time zone; proof required when flagged |
| Checklists | `/checklists`, `/checklists/[branch]/[template]` | `tasks:*` | `checklist_templates`, `checklist_runs` | One run per branch/template/day (branch's own date); required items block submit; sent back with a reason, resubmit |
| Approvals | `/approvals` (inbox, mine, decided), `?tab=rules` | `approvals:*` | `approval_rules`, `approval_requests`, `approval_decisions` | Request, lines, evidence and history on one screen; no self-approval, no over-limit, steps in order; rejection needs a reason |
| Purchasing | `/purchasing` (requisitions, orders, suppliers & items), `/purchasing/new`, `/purchasing/[id]`, `/purchasing/orders/[id]` | `purchasing:*` | suppliers, catalogue, requisitions, POs, receipts | Exact integer totals; partial receipts; over-receipt refused; rejected goods need a reason |
| Inspections | `/inspections` (inspections, findings, actions, templates), `/inspections/new`, `/inspections/[id]`, `/inspections/findings/[id]` | `inspections:*`, `actions:*` | templates, inspections, findings, corrective actions | Weighted score, critical failure caps at 70%; failed items need comments; fixes need proof and independent verification; rejection reopens |
| Knowledge | `/knowledge`, `/knowledge/new`, `/knowledge/[id]` | `documents:*` | documents, versions, acknowledgements | Edits create drafts; publishing notifies everyone and replaces the live version; acknowledgement tracker for managers |
| Training | `/training`, `/training/new`, `/training/[id]` | `training:*` | courses, enrolments | Answer key never sent to learners; attempts limited; expiry; reassign restarts attempts |
| Tickets | `/tickets`, `/tickets/new`, `/tickets/[id]` | `tickets:*` | tickets, comments | Internal, customer complaint and incident kept as separate types; resolution required to close |
| Assets & licences | `/assets` (assets, licences) | `assets:*` | assets, licences | Expiry flags at 30 days; disposal needs approval permission |
| Sales & royalties | `/royalties` (statements, sales, payments, rules), `/royalties/[id]` | `royalties:*`, `sales:*` | rules, sales reports, statements, partner payments, allocations | Dated rule versions can't overlap; preparer can't approve; issued statements are immutable; payments apply oldest-first and never beyond what's owed |
| Reports | `/reports`, `/api/export/[kind]` | `reports:*`, `<area>:export` | views over the above | CSV with formula-injection guard; permission-aware; full company JSON export for owners |
| Audit log | `/audit` | `organisation:configure` | `audit_log` | Append-only, field names only |
| Notifications, search | `/notifications`, `/search` | any member | notifications + record tables | Search only returns what you can see |
| Plan & billing | `/billing` | `billing:*` | plans, subscriptions, invoices | Over-limit explained, nothing deleted; modules with unresolved work stay usable; scheduled to renewal; issued invoices immutable; closure and export |
| Franchise | Pipeline, territories, agreements, renewals `/franchise`, add `/franchise/new`, applicant `/franchise/[id]`, agreement `/franchise/agreements/[id]`, public enquiry `/apply/[company]` | `franchise:*` | applicants, checks, territories, agreements, fees | Stages move one step at a time; a territory is held by one applicant or partner; approval needs every check verified and creates an *approved* (not active) partner; signing activates; signed terms are immutable; renewals are new versions; reminders; transfer and termination keep history |
| Opening projects | `/projects`, `/projects/new`, `/projects/[id]` | `projects:*` | projects, project items | Starts from an industry template (restaurant, print, retail, education, service); evidence where required; blockers stop launch; launch needs approval authority and opens the branch; a launched checklist is a record |
| Stock | `/stock` (levels, movements) | `inventory:*` | stock movements (append-only), reorder points | Goods received feed the ledger; the level is the sum and can't go below zero; use, wastage, transfers and counts need reasons where they change the book figure |
| Roster & leave | `/roster` (week, my leave, leave to decide) | `people:*` | shifts, leave requests | No overlapping shifts, none during approved leave, leave can't be approved over a shift; employees see only their own |
| Integrations | `/integrations`, `/api/v1/*`, `/api/cron/webhooks` | `integrations:*` | API keys (hashed), webhooks, deliveries | Secrets shown once and never readable again; signed webhooks with timestamps; retries with backoff and a log; private-network targets refused; read-only API with scopes and a rate limit |
| Reports (extended) | schedules, export history on `/reports` | `reports:*` | schedules, runs | Scheduled CSV runs as the person who set it up and stops if they lose access; every export is logged |
| Table views | saved views on branches, tasks and tickets; comfortable/compact rows | any member | saved views | Private to you |
| Platform admin | `/platform`, `/platform/companies`, `/platform/companies/[id]`, `/platform/invoices`, `/platform/plans` | platform staff | all (service access) | Suspend/reactivate with a recorded reason; versioned plans; mark invoices paid; every action audited under the operator's id |

## Not built
Single sign-on; a card payment gateway; offline inspection capture; supplier, contractor and external-auditor portals; the configuration studio (custom fields, form and workflow builders, terminology); a custom report builder and per-user column pickers; campaign management; payroll and biometric attendance; industry modules beyond the opening templates (print-job tracking, food-safety logs, student services and so on); multi-language interface. See `docs/release-plan.md`.

## Design acceptance flows
| # | Flow | Covered by |
|---|---|---|
| 1 | Registration → setup → first branch → staff invitation | `tests/e2e/01-start.mjs`, `02-purchasing.mjs` (invite) |
| 2 | Inspection → finding → corrective action → verification | `tests/e2e/03-inspection.mjs`, `tests/db/workflows.sql` |
| 3 | Purchase request → approval → order → partial receipt | `tests/e2e/02-purchasing.mjs` |
| 4 | Royalty calculation → review → statement → payment allocation | `tests/e2e/04-royalties.mjs` |
| 5 | Subscription change → limit validation → billing confirmation | `tests/e2e/05-billing.mjs` |
| 7 | Franchise enquiry → pipeline → approval → agreement → active partner | `tests/e2e/09-franchise.mjs` |
| 6 | Branch closure → outstanding-work review → access removal | `tests/e2e/08-closure.mjs` |
