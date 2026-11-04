# Network Manager

Multi-company SaaS for managing franchises, company-owned branches and outlets: shared
foundation plus industry modules. Scope and UI/UX direction: [`docs/project-brief.md`](docs/project-brief.md).
Screen-by-screen plan: [`docs/screen-register.md`](docs/screen-register.md). Releases: [`docs/release-plan.md`](docs/release-plan.md).

**Status: foundation.** What exists, and what is verified:

| Piece | State |
|---|---|
| Design system: tokens, status labels, tables, panels, states (`lib/design`, `components/ui`) | built; contrast tested |
| App shell: permission- and plan-aware nav, workspace switcher, scope chip, search, notifications | built |
| Screens: command centre, branches, approvals, plan & billing, branch closure, workspace selector | built on **sample data**; decision/confirm buttons are not wired |
| Business rules: permissions, plan limits, royalties, approvals, branch closure, money | built; 28 unit tests |
| Database: companies, org tree, roles, memberships, plans, audit, support access, RLS | built; isolation tests against real Postgres |
| Auth, API/data layer, onboarding, every other module | **not built** (see screen register) |

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:3000
npm test             # unit tests (rules + design tokens)
npm run typecheck
npm run db:test      # needs a reachable Postgres and a role that can create databases
```

## Rules that matter

- **Tenancy**: every child row references its parent by `(id, company_id)`, so a row cannot point at another
  company's brand, region or branch. RLS scopes every read and write to company, role grant and branch/region/brand scope.
- **No hard deletes** of organisation records: archive instead. The audit log is append-only, field names only.
- **Money** is integer minor units. SaaS subscription and franchise royalty ledgers are never combined.
- **Plan changes** never delete data; plan versions are immutable so history is never rewritten.
- **Support access** to a customer workspace needs a reasoned, time-limited grant and is audited.
- The permission model exists twice (`lib/rules/permissions.ts` and `app.has_perm()` in SQL). Keep them in step;
  a parity test is the next thing to add.
