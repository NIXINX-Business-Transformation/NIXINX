# NIXINX — Business Transformation architecture and commercial mapping

This document follows the owner-defined model discussed in this conversation. It is strategy/target architecture, **not proof** that all modules are live.

## Digital boundaries
- nixinx.com: corporate website, marketing, enquiries, public case studies with consent.
- nixinx.org: organization, invoices, staff communications, contacts, CRM/opportunities, partners, public catalogue editing and financing-program research.
- nixinx.app: operational software subscriptions / Firebase project per legal tenant, licensed access controlled by NIXINX.
- nixinx.site: private MI portal for authorized company users; wildcard verified in **legacy** Vercel project `sites` but identity, tenant isolation, reporting ACL and revocation are **not** established by wildcard alone.

## Source-to-decision flow
Business domain (Commercial, Marketing, CX, Operations, Finance, Training etc.) → industry specialization (restaurants, retail, staffing, services) → external provider (e.g. Toast) / internal NIXINX Software → **daily batch** source sync → isolated customer-owned BigQuery Data Warehouse → centrally managed proprietary NIXINX Engine running calculations through customer-authorized resources → private customer-specific MI report / KPI perspective (weights, gate KPI, multiplier KPI, formulas, variations, currencies, counts, booleans, history) → PM decision cycle.

Client pays their own storage and BigQuery processing actually billed to their account; NIXINX pays its Engine infrastructure, own proprietary IP, own PWA/Looker licences. Engine entitlement is separate from ingest/retention. On MI cancellation, revoke MI access and licensed Engine activity as contracted; **never delete client data or stop independent daily batch ingestion**.

## Business Model Canvas
1. **Segments:** SMEs, independent/multi-site restaurants initially; expand by domain to retail, wholesale, services and staffing.
2. **Value:** accessible outsourced business transformation and disciplined management visibility; avoid overstating comparisons or guaranteeing returns.
3. **Channels:** public nixinx.com, specialist referral partners, direct selling, future customer portals.
4. **Relationships:** fixed-scope implementation, managed recurring service, optional performance advisory.
5. **Revenue:** diagnosis/implementation, integrations, system migrations, managed MI & maintenance, licensed operational software, separately scoped PM/advisory, verified referral programs with partners like Owner.com/POS providers.
6. **Resources:** reusable architecture, IP, code, engine, connector registry, staff/contractors, relationships and partner agreements.
7. **Activities:** discovery, systems integration, project delivery, platform maintenance, KPI modelling, licensing, consultative improvement.
8. **Partners:** POS, ecommerce, Owner.com, marketing/SEO, connectivity/networking installers, Cloud vendors, payments, delivery, signages, payroll/accounting, agencies, financing ecosystem, implementation subcontractors.
9. **Costs:** cloud platforms, NIXINX software licences, specialist delivery, customer acquisition, support and monitoring; customer-owned storage and processing charged to client.

## Backoffice reference mapping from earlier portal screenshots
- Showcases: public stories after consent, no private client data.
- Contacts: people directory, separate from companies/opportunities.
- Partners: vendor arrangements, referral URLs, commissions (never promise before verification).
- Internal solutions: costings, implementation modules and margin tracking.
- CRM/opportunities: lead capture and sales pipeline.
- Programs and grants: public or non-profit assistance programs, eligibility and expiry; externally verified.
- Platforms and links: operational bookmarks, references.
- Public catalogue: approved marketing claims, multilingual services, no confidential commercial terms.

**These belong to nixinx.org/backoffice, not the public PWA.** This version of nixinx.com implements ONLY public content and first-contact collection, as requested; it does not migrate the existing portal's data automatically.

## SWOT (strategic hypotheses)
- **Strengths:** proven multi-location operational/implementation expertise; cross-industry reusable design; managed service differentiator.
- **Weaknesses:** founder concentration; need for verified production MI, support automation and robust onboarding.
- **Opportunities:** SME transformation gaps; vendor referral arrangements; recurring management information; industry expansion.
- **Threats:** commodity SaaS/AI offerings; platform API changes; security/privacy; client and partner concentration; fixed-price overcommitments.

## Publication boundaries
The public website does not claim that user access controls, private Google ACL, MI dashboards, secure cross-tenant reporting, or payment collection are currently live. These features require separate implementation, testing, evidence and approval.
