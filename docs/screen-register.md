# Screen register

Links each screen to its role, workflow, permissions, data and acceptance criteria
(brief §27). **Status:** `built` = runs in this repo on sample data; `planned` = specified only.
**Release:** R1 first commercial release · R2 second release · EXT separately priced extension.

Permission notation is `resource:action` using `lib/rules/permissions.ts`.
Data refers to tables in `supabase/migrations/`; `(new)` means a table that does not exist yet.

## Built screens (sample data, no database wired)

| Screen | Route | Roles | Workflow | Permissions | Data | Acceptance criteria | Status |
|---|---|---|---|---|---|---|---|
| Command centre | `/` | all company roles | Triage: attention list, decisions waiting, selected metrics | `tasks:view`, `approvals:view` | branches, approvals (new) | Leads with exceptions and approvals; each metric/alert links to its records; shows last-updated time and metric definition; works at 390px without horizontal scroll | built |
| Branches | `/branches` | owner, brand head, regional, branch manager | Find, filter, sort, open record | `branches:view`; create needs `branches:create` | `branches`, `branch_history` | Search + status filter + sort kept in URL; "no results" state with clear-filters; Add disabled with reason when plan limit reached; status shown as text + icon | built |
| Approvals | `/approvals` | anyone with `approvals:approve` | Review request, evidence, impact, prior decisions → decide | `approvals:approve`, limit via `approval_limit_minor` | approvals (new) | Request, evidence, impact, history and decision are on one screen; a person cannot approve their own request or above their limit; reject needs a reason | built (actions not wired) |
| Plan & billing | `/billing` | owner, billing contact | Compare plans → validate limits → confirm | `billing:view`, `billing:configure` | `plans`, `plan_versions`, `subscriptions` | Over-limit is explained, never deletes; modules with unresolved work stay usable to finish; takes effect at renewal; past invoices unchanged | built (confirm not wired) |
| Close branch | `/branches/[code]/close` | owner, regional | Outstanding-work review → access removal last | `branches:archive` | `branches` + orders/stock/dues/assets (new) | Close is disabled until orders, stock, dues, assets, integrations, tasks are resolved; access removal listed per person; progress is saved | built (close not wired) |
| Workspace selector | `/workspaces` | any user in 2+ companies | Explicit switch | none (own memberships) | `memberships` | Switch is explicit; never merges data; offers "Request access" | built |
| Planned-screen placeholder | `/m/[slug]` | n/a | Stand-in for every unbuilt nav item | n/a | n/a | Says what it is, which release, and that nothing was lost | built |

## Planned screens by module

| Module (brief §) | Key screens | Primary roles | Core permissions | Core data (new) | Acceptance headline | Release |
|---|---|---|---|---|---|---|
| Auth & accounts (4) | sign in, 2FA, recovery, invitation, access request, sessions | all | n/a | Supabase Auth, `invitations` | Reset and revocation work; org names are not discoverable | R1 |
| Onboarding (5) | checklist, business profile, first branch, invite team, activate | owner | `organisation:configure` | `onboarding_progress` | Resume later; sample data flagged; flow 1 of design acceptance | R1 |
| Platform admin (6) | company directory, plans, invoices, support, audit | platform staff | platform roles | `platform_invoices`, `incidents` | Support access is time-limited and audited (schema done) | R1 |
| Org & branches (8) | org tree, brand/region/entity, branch profile, transfer, suspend | owner, admin | `organisation:*`, `branches:*` | extend `branches` | History preserved on move (schema done) | R1 |
| Tasks & approvals (11) | checklists, tasks, kanban, approval inbox, delegation, escalation | branch manager, employee | `tasks:*`, `approvals:*` | `tasks`, `checklists`, `approval_rules` | Branch-timezone deadlines; reject needs reason | R1 |
| SOPs & documents (12) | library, reader, editor, acknowledgements | all | `documents:*` | `documents`, `document_versions` | Revision can trigger acknowledgement tasks | R1 |
| Inspections (13) | templates, conduct, findings, corrective actions, verification | inspector, manager | `inspections:*` | `inspections`, `findings`, `corrective_actions` | Flow 2: finding → action → independent verification | R1 |
| Training (14) | catalogue, lesson player, quiz, completion, certificates | all | `training:*` | `courses`, `enrolments` | Pass marks, attempts, expiry | R1 |
| Purchasing (16) | requisition, approval, PO, goods receipt, discrepancy | branch manager, purchasing | `purchasing:*` | `requisitions`, `purchase_orders`, `receipts` | Flow 3: request → approval → order → partial receipt | R1 |
| Tickets & incidents (19) | tickets, complaints, incidents, SLA | all | `tickets:*` | `tickets` | Internal, customer and platform support kept separate | R1 |
| Reports (21) | library, branch comparison, scheduled, exports | managers | `reports:view`, `reports:export` | views over core tables | No cross-company benchmarks | R1 |
| Franchise pipeline (9) | enquiry, applicants, territory, agreements, renewals | franchise team | `franchise:*` | `applicants`, `agreements` | Prospect never confused with active partner | R2 |
| Opening projects (10) | project, milestones, readiness, launch approval | project lead | `projects:*` | `projects` | Same task engine as daily ops | R2 |
| Royalties & finance (17) | rules, preview, statement, allocation, ageing | finance | `royalties:*`, `sales:*` | `royalty_rules`, `statements`, `ledger_entries` | Flow 4; SaaS and royalty ledgers never mixed (rules done) | R2 |
| Assets & licences (20) | register, work orders, warranties, licence expiry | manager | `assets:*` | `assets`, `work_orders` | Downtime tracked | R2 |
| Inventory (16) | stock ledger, transfer, count, wastage | branch, purchasing | `inventory:*` | `stock_movements` | Batch/expiry is an extension | R2 |
| Configuration studio (22) | forms, workflows, custom fields, versions | admin | `studio:configure` | `form_versions` | Publishing never corrupts existing submissions | R2 |
| Marketing (18) | campaigns, assets, proof of execution | brand team | `marketing:*` | `campaigns` | Central distribution, local evidence | EXT |
| Integrations (23) | marketplace, mapping, sync history, webhooks | admin | `integrations:*` | `integrations`, `sync_runs` | One scope per named connector | EXT |
| Industry modules (24) | restaurant, print, retail, education, service | varies | per module | per module | Inherit shared permissions/tasks/reports | EXT |
| Offline inspections (13) | capture, sync | inspector | `inspections:*` | sync queue | Defined sync and conflict rules | EXT |

## Design acceptance flows

| # | Flow | Rules proven | Screens built |
|---|---|---|---|
| 1 | Registration → setup → first branch → invite | `create_company()` creates owner membership (db test) | none yet |
| 2 | Inspection → finding → action → verification | none yet | none yet |
| 3 | Purchase request → approval → order → partial receipt | approval routing, limits (unit tests) | approvals (partial) |
| 4 | Royalty calc → review → statement → allocation | rule selection, minimums, lifecycle, allocation (unit tests) | none yet |
| 5 | Plan change → limit validation → billing confirmation | `evaluatePlanChange` (unit tests) | billing |
| 6 | Branch closure → outstanding work → access removal | `closureChecklist`, `accessRemovalPlan` (unit tests) | close branch |
