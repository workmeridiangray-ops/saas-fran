# Release plan

## Release 1: built in this repository
Accounts and security (email confirmation, lockout, two-factor, reset, sessions), invitations, workspaces, onboarding and trial; branches with lifecycle and closure review; organisation; people, custom roles and branch scope; tasks; checklists with review; approvals with multi-step rules; purchasing through partial receipt; inspections with scoring, findings and independently verified corrective actions; SOPs with acknowledgements; training with quizzes and expiry; tickets; assets and licences; sales, royalty rules, statements and payment allocation; reports and CSV export; audit log; attachments; plans, invoices, renewals, suspension, company export, closure and scheduled deletion; platform admin; Docker deployment, CI, backup and restore.

## Needed before taking paying customers (not code in this repo)
- Outbound email provider (`SMTP_URL`).
- Payment collection: a gateway behind `BillingProvider`, or run on invoices and bank transfer.
- Hosting, a domain with HTTPS, monitoring on `/api/health`, and the daily scheduler job.
- Privacy policy, terms and a data-processing agreement reviewed by a lawyer; these are not provided.
- A restore drill and an external security review before sensitive data goes in.

## Built since the first release
Franchise applicant pipeline, territories, agreements, fees, renewals and ownership transfer, with a public enquiry form; opening projects with industry templates and a launch gate; stock ledger; region and brand scoping across every record; ticket SLAs and escalation; API keys, a read API and signed webhooks with a delivery log; saved table views and density; scheduled reports and export history; rosters and leave; form input preserved after an error, and a warning before leaving unsaved edits.

## Still not built
Single sign-on; a card gateway; offline inspection capture; supplier, contractor and auditor portals; the configuration studio (custom fields, form and workflow builders, terminology settings); a custom report builder; campaigns; per-user column pickers; industry modules beyond the opening templates; more than one interface language.

## Separately priced extensions
Industry modules (print production, restaurant food-safety, education, retail, service jobs); offline inspection capture; e-signature and legal-document generation; payroll, biometric attendance and recruitment; video hosting and proctored exams; advertising and social publishing; a full customer CRM.

## Not planned (distinct products)
Restaurant POS, school ERP, print-production software, retail billing, marketplace payouts, stored-value wallets, automated royalty collection.
