# Release plan

## Release 1: built in this repository
Accounts and security (email confirmation, lockout, two-factor, reset, sessions), invitations, workspaces, onboarding and trial; branches with lifecycle and closure review; organisation; people, custom roles and branch scope; tasks; checklists with review; approvals with multi-step rules; purchasing through partial receipt; inspections with scoring, findings and independently verified corrective actions; SOPs with acknowledgements; training with quizzes and expiry; tickets; assets and licences; sales, royalty rules, statements and payment allocation; reports and CSV export; audit log; attachments; plans, invoices, renewals, suspension, company export, closure and scheduled deletion; platform admin; Docker deployment, CI, backup and restore.

## Needed before taking paying customers (not code in this repo)
- Outbound email provider (`SMTP_URL`).
- Payment collection: a gateway behind `BillingProvider`, or run on invoices and bank transfer.
- Hosting, a domain with HTTPS, monitoring on `/api/health`, and the daily scheduler job.
- Privacy policy, terms and a data-processing agreement reviewed by a lawyer; these are not provided.
- A restore drill and an external security review before sensitive data goes in.

## Release 2: not built
Franchise applicant pipeline, agreements and renewals; opening projects; stock ledger and transfers; configuration studio (custom fields, forms, workflows, terminology); region and brand scoping in the People screen and on all records; saved views and column controls on tables; scheduled reports; integrations, webhooks and API credentials; supplier, contractor and external-auditor portals; SLA and escalation rules; shift rosters and leave; campaigns; SSO; object storage for large files.

## Separately priced extensions
Industry modules (print production, restaurant food-safety, education, retail, service jobs); offline inspection capture; e-signature and legal-document generation; payroll, biometric attendance and recruitment; video hosting and proctored exams; advertising and social publishing; a full customer CRM.

## Not planned (distinct products)
Restaurant POS, school ERP, print-production software, retail billing, marketplace payouts, stored-value wallets, automated royalty collection.
