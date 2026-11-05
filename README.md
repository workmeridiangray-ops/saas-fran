# Network Manager

A multi-company SaaS for running franchise and multi-branch networks: branches, tasks and checklists, approvals, purchasing, inspections with corrective actions, SOPs, training, tickets, assets, royalties, plans and billing. Each company gets its own isolated workspace; the platform operator gets an admin area.

Scope and design direction: [`docs/project-brief.md`](docs/project-brief.md) · Screens: [`docs/screen-register.md`](docs/screen-register.md) · Release plan: [`docs/release-plan.md`](docs/release-plan.md) · Running it: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)

## Status: ready for a closed pilot, with two things you must add
**Working and tested end to end** against a real database: sign-up with email confirmation, sign-in with lockout, two-factor (TOTP + recovery codes), password reset, sessions, invitations, workspaces, onboarding with a 14-day trial, branches (create, edit, suspend, close with outstanding-work review), organisation, people and custom roles, tasks, checklists with review, approvals with multi-step routing, purchasing (requisition → approval → order → partial receipt with discrepancies), inspections (weighted scoring, findings, corrective actions, independent verification), SOPs with versions and acknowledgements, training with quizzes and expiry, tickets, assets and licences, sales and royalties (rules, statements, review, issue, payment allocation), plan changes with limit enforcement, invoices and a renewal job, company export, closure and scheduled deletion, platform admin, audit log, CSV reports, file attachments.

**You must add before taking real customers:**
1. **Email.** Set `SMTP_URL`. Without it nobody receives confirmation, reset or invitation emails.
2. **Card payments, if you want them.** Billing ships as invoice + manual "mark paid". A gateway needs your account; see "Payments" in the operations guide.

**Not built** (see the release plan): franchise applicant pipeline and agreements, opening projects, stock ledger, configuration studio (custom forms and workflows), integrations and webhooks, supplier and contractor portals, offline inspections, SSO, payroll or HR, and industry-specific modules. The interface is English only; money and dates follow the company's currency and time zone.

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

## Known limitations
- Single region, single database. No read replicas or sharding.
- Search is substring matching over a few record types, adequate for thousands of records per company, not millions.
- Files are stored in Postgres (5 MB limit each). For heavy media use, move them to object storage.
- Realtime updates aren't implemented; pages show fresh data on load or after an action.
- Access can be limited **by branch** in the app. The database also understands region and brand scope, but the People screen doesn't offer them and most records don't carry a region or brand, so a person scoped that way would see little. Treat region and brand scoping as not yet available.
