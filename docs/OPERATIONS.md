# Operations guide

## What you need
- Postgres 16 (managed or self-hosted) and a place to run one Node 22 container.
- An SMTP account for email (sign-up confirmation, password reset, invitations). Without `SMTP_URL`, emails are only written to `identity.outbox` and **nobody receives them**: fine for a demo, not for customers.
- A scheduler that can call one URL daily.
- Optionally, a payment gateway. Not included; see "Payments" below.

## Configuration (environment)
| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection. The role must be able to `set role authenticated` (a superuser, or a member of that role). |
| `APP_URL` | yes | Public base URL, used in email links. |
| `CRON_SECRET` | yes | 16+ characters. Bearer token for `/api/cron/renewals`. |
| `SMTP_URL` | for email | e.g. `smtps://user:pass@smtp.example.com`. |
| `MAIL_FROM` | no | Sender shown on email. |
| `RETENTION_DAYS` | no | Days a closed company stays before deletion. Default 90, minimum 30. |
| `BILLING_INSTRUCTIONS` | no | Text shown with unpaid invoices (bank details). |

## Deploy
```bash
docker compose up -d --build        # db + migrations + app on :3000  (needs POSTGRES_PASSWORD, CRON_SECRET in .env)
```
Or build the image and run it anywhere with the variables above. Put it behind HTTPS (the session cookie is `Secure` in production). Run `bash scripts/migrate.sh` (with `DATABASE_URL`) on every release **before** starting the new version; it applies each migration once, in one transaction.

### Roles on a managed Postgres
Migrations create `anon` and `authenticated` roles if missing. If your host doesn't allow `CREATE ROLE`, create them first and grant `authenticated` to the app's login role: `grant authenticated to app_user;`.

## First platform admin
Sign up in the app, confirm the email, then:
```bash
DATABASE_URL=... bash scripts/make-staff.sh you@yourcompany.com super_admin
```
`/platform` then appears. Roles: `super_admin` (everything), `billing` (invoices, suspend/reactivate), `support` (read-only), `technical`.

## Daily job
```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/renewals"
```
It is safe to run repeatedly. It: invoices subscriptions whose period ended; applies scheduled plan changes; marks unpaid companies past-due, then read-only after 7 days; deletes companies past their retention period. If it stops running, nobody is invoiced and nobody is suspended.

## Payments
Invoices are issued automatically at the plan's price. The shipped billing provider is **manual**: customers pay by bank transfer (or any off-platform method) and a billing admin presses **Mark paid** in `/platform/invoices`, which reactivates the company. There is no card gateway in this repository. To add one, implement `BillingProvider` (`lib/billing/provider.ts`), show its checkout link on the billing page, and call `select app.mark_invoice_paid('<invoice id>')` from a **signature-verified** webhook. Do not mark invoices paid from an unauthenticated request.

Franchise royalties are a different ledger (`statements`, `partner_payments`). The platform never collects them; partners' payments are recorded by the brand.

## Backups and recovery
```bash
DATABASE_URL=... BACKUP_DIR=/var/backups/nm KEEP_DAYS=30 bash scripts/backup.sh     # nightly; copy off the server
DATABASE_URL=...new-empty-db bash scripts/restore.sh /var/backups/nm/nm-....dump
```
Uploaded files live in the database, so a database backup covers them. **Test a restore into a scratch database before you rely on it**, and after every migration that changes tables. For point-in-time recovery use your provider's WAL archiving.

## Monitoring
- `GET /api/health` returns 200 when the app can reach the database, 503 otherwise. Point an uptime monitor at it.
- Logs go to stdout. Database errors that aren't user mistakes are logged as `[db]`; failed mail as `[mail]`.
- Watch: failed cron runs, `identity.outbox` rows with `sent_at is null` for more than a few minutes, and open invoices past due.

## Data lifecycle
- **Close**: an owner presses *Start closure* (Plan & billing). The workspace stays readable and exportable (JSON export of every table, CSV reports).
- **Delete**: after `RETENTION_DAYS` the daily job deletes the company's data. SaaS invoices are copied to `retained_invoices` first; the audit log (field names only) is kept.
- **Export on request**: the owner can download everything at any time, including while suspended.
- Individual people's accounts (`identity.users`) are separate from companies; deleting a person on request is a manual operator task: remove their memberships, anonymise their profile, delete the user row.

## Incident checklist
1. Is `/api/health` failing? Check the database first (connections, disk).
2. Users can't sign in: check `identity.users.locked_until` (5 failed attempts lock for 15 minutes) and the outbox for mail problems.
3. A customer is wrongly read-only: look at `companies.status` and open `platform_invoices`; pay or reactivate from `/platform`.
4. After any data fix, note it: platform actions are audited with the operator's id; direct SQL is not, so prefer the admin screens.

## Security notes for operators
- Customer isolation is enforced by Postgres row-level security, not just app code. The app connects as one role and `set role authenticated` per request; never run the app as a role that bypasses RLS and then remove that step.
- Rotate `CRON_SECRET` and database credentials like any other secret. There is no service key inside the browser bundle.
- Uploads are limited to 5 MB and an allowlist of types, checked by extension and file signature, and always downloaded as attachments.
- Passwords use scrypt; sessions are random tokens stored hashed; two-factor uses standard TOTP with single-use recovery codes.
