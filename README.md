# Network Manager

A multi-company SaaS for running franchise and multi-branch networks: branches, tasks and checklists, approvals, purchasing, inspections with corrective actions, SOPs, training, tickets, assets, royalties, plans and billing. Each company gets its own isolated workspace; the platform operator gets an admin area.

Scope and design direction: [`docs/project-brief.md`](docs/project-brief.md) · Screens: [`docs/screen-register.md`](docs/screen-register.md) · Release plan: [`docs/release-plan.md`](docs/release-plan.md) · Running it: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)

## Status: ready for a closed pilot, with two things you must add
**Working and tested end to end** against a real database: sign-up with email confirmation, sign-in with lockout, two-factor (TOTP + recovery codes), password reset, sessions, invitations, workspaces, onboarding with a 14-day trial, branches (create, edit, suspend, close with outstanding-work review), organisation, people and custom roles, tasks, checklists with review, approvals with multi-step routing, purchasing (requisition → approval → order → partial receipt with discrepancies), inspections (weighted scoring, findings, corrective actions, independent verification), SOPs with versions and acknowledgements, training with quizzes and expiry, tickets, assets and licences, sales and royalties (rules, statements, review, issue, payment allocation), plan changes with limit enforcement, invoices and a renewal job, company export, closure and scheduled deletion, platform admin, audit log, CSV reports, file attachments.

**You must add before taking real customers:**
1. **Email.** Set `SMTP_URL`. Without it nobody receives confirmation, reset or invitation emails.
2. **Card payments, if you want them.** Billing ships as invoice + manual "mark paid". A gateway needs your account; see "Payments" in the operations guide.

**Also built:** a configuration studio (your own fields on branches, tasks and tickets, validated in the database, and renamable terms such as Branch to Store); a custom report builder (pick columns, filters and sort, preview, save, download); Spanish for menus, the shell, sign-in and the command centre; franchise pipeline with agreements, fees, renewals, transfer and a public enquiry form; opening projects with industry templates; a stock ledger; region and brand scoping; ticket SLAs with escalation; API keys, a read API and signed webhooks; rosters and leave; saved table views; scheduled reports with export history.

**Not built:** see [Not built yet](#not-built-yet) below for the full list. Read it before promising anything to a customer.

Screens: [dashboard](docs/screens/dashboard.png) · [approvals](docs/screens/approvals.png) · [orders](docs/screens/purchasing-order.png) · [billing](docs/screens/billing.png) · [roles](docs/screens/roles.png) · [phone](docs/screens/dashboard-phone.png)

## Run it
```bash
cp .env.example .env            # set POSTGRES_PASSWORD and CRON_SECRET
docker compose up -d --build    # http://localhost:3000
```
Development: Node 22 and Postgres 16.
```bash
createdb nm && export DATABASE_URL=postgres:///nm
npm install && npm run db:migrate && npm run dev
```

## Tests
```bash
npm run typecheck && npm test        # unit tests: rules, auth primitives, design contrast
npm run db:test                      # SQL: tenant isolation, workflows, billing, retention (needs Postgres access)
npm run build && npm start &         # then:
npm run e2e                          # browser flows against the real app and database
```
The end-to-end suite covers each acceptance flow (registration → first branch → invite; inspection → verification; purchase → partial receipt; royalty → payment; plan change → limits → invoice; branch closure), security (cross-company access, reset, lockout, two-factor, sessions), and accessibility (axe on every screen at desktop and phone width).

## How it is built
- Next.js 15 (App Router, server actions), TypeScript, Tailwind. Postgres is the only datastore.
- **Isolation is in the database.** Every tenant table carries `company_id`; children reference parents by `(id, company_id)` so a row can't point into another company. Row-level security checks the person's role grants and branch/region/brand scope on every statement. The app connects as one role and switches to `authenticated` with the signed-in user's id per request.
- **Integrity is in the database too:** approvers can't decide their own requests, above their limit, or out of step; receipts can't exceed orders; issued statements and invoices are immutable; a verifier can't be the person who did the work; status changes that belong to a workflow can't be set by hand.
- Business rules (permissions, approval routing, plan limits, royalties, scoring, closure) are small pure modules in `lib/rules` with their own tests.
- Money is integer minor units everywhere. SaaS invoices and franchise royalties are separate ledgers that can't be combined.
- Authentication is built in (`identity` schema, never visible to row-level-security roles). Mail goes through `identity.outbox`.

## Not built yet
Each item says **why** it isn't built, so you know whether it is waiting on you, waiting on design work, or deliberately out of scope. Nothing here is half-wired; there is no screen, table or setting for it unless the State column says so.

| Area | State | Why it isn't built | What starting it involves |
|---|---|---|---|
| Single sign-on (SAML / OIDC) | Not built. Sign-in is email + password + optional TOTP. | **Needs something from you.** It can't be tested without a real identity provider (Okta, Entra, Google Workspace) and its settings. Shipping untested sign-in code would be a security risk. | Per-company provider settings, a callback route, and account linking in the `identity` schema. |
| Card payment gateway | Not built. Billing is invoices plus manual "mark paid" through the `BillingProvider` interface. | **Needs something from you.** It needs your gateway account and API keys (Stripe or similar) and a decision on tax and refunds. | Implement the interface, add the gateway webhook, switch the provider. |
| Offline inspections | Not built. Inspections need a connection. | **Needs design first.** Working offline means a local store, a sync queue and conflict rules against inspection scoring and verification. Done badly it loses or double-counts audit data, so it should be designed and tested on real devices, not rushed. | Local draft storage, sync, conflict handling. |
| Supplier, contractor and auditor portals | Not built. Outside people can only be given a narrow role as ordinary members. | **Needs design first.** Outside users need their own access model and row-level security so they can never see company data by accident. That is a security design, not just screens. | An external-user type, simplified screens, new RLS policies. |
| Studio: custom forms and workflow builder | Not built. Custom **fields** (branches, tasks, tickets) and **terminology** are built. | **Not reached yet.** It is the largest part of the studio (custom record types, form layouts, a rules engine). Fields and terminology were built first because they give the most value for the least risk. | A record-type definition store and a workflow engine. |
| Report builder: more datasets, joins, charts; scheduling saved reports | Partly built: branches, tasks and tickets with custom fields. | **Not reached yet.** Each new dataset needs its own column whitelist and row-level-security review so a report can never expose more than the person may see. Scheduling saved reports reuses the existing scheduler and was left out of this round. | Extend `lib/rules/report-builder.ts`; link saved reports to `report_schedules`. |
| Campaigns / marketing | Not built. | **Out of scope for now.** It is a different product area (audiences, sending reputation, consent, unsubscribe law) that the brief only mentions in passing. | Needs its own scoping. |
| Industry modules beyond the opening templates | Not built. Only opening checklists per industry exist. | **Out of scope for now.** Print jobs, food-safety logs and student services are each separate products with their own data models; they should follow real customers in those industries. | Per-industry data models and screens. |
| Multi-language | Partly built. Spanish covers menus, the app shell, sign-in and the command centre; everything else is English. | **Not reached yet, and needs a translator.** Wrapping the remaining screens in `t()` is mechanical, but machine-written Spanish for legal, billing and error text should be checked by a fluent reviewer before customers see it. | Translate remaining screens and emails; add more language files like `lib/i18n-es.ts`. |
| Payroll and biometrics | Not built. Rosters and leave exist; pay does not. | **Out of scope, deliberately.** Payroll is jurisdiction-specific tax and labour law, and biometrics carries privacy law. Both need specialists and a compliance review, not general code. | A separate project per country. |

Also absent, by design for now: realtime updates and object storage for files (see Known limitations). The release plan in [`docs/release-plan.md`](docs/release-plan.md) tracks the same list.

## Known limitations
- Single region, single database. No read replicas or sharding.
- Search is substring matching over a few record types, adequate for thousands of records per company, not millions.
- Files are stored in Postgres (5 MB limit each). For heavy media use, move them to object storage.
- Realtime updates aren't implemented; pages show fresh data on load or after an action.
- Access can be limited by **region** (including the regions beneath it), **brand** and **branch**. A person must match every group you tick. Records that don't belong to a branch (company-wide tasks, for example) are invisible to anyone scoped below the whole company.
