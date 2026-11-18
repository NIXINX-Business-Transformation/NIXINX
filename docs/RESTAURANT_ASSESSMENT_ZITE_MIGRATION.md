# Restaurant Assessment — Zite integration and migration plan

## Current system

- Public assessment hosted on Zite: https://vv7qctrcfg.zite.so/
- Separate private Zite application: NIXINX Admin, for prospect and report management.
- According to the Zite editor change history (reviewed Nov 2026), the survey includes 26 initial questions (A01-A26), 50 optional deeper questions (B01-B50), conditional logic, scoring, immediate reports, anti-duplicate persistence, and EN/ES/FR language selection. These are provider/editor statements and must be verified by real submission.
- Do not duplicate the 76-question bank or rewrite evaluation logic in the public corporate Next.js site.

## Corporate entry point

- /en/assessment, /es/assessment, /fr/assessment are localized **corporate landing pages**.
- Each page mounts the **same** Zite survey through the exact proven Zite SDK integration from `business-transformation/src/components/RestaurantAssessment.tsx` (`data-zite-id=vv7qctrcfg` and `https://server.zite.com/embed/v2-zite/`) only after a visitor clicks Start, with an always-visible direct link fallback.
- The Zite SDK may be blocked by browser extensions or network policy; the fallback launches the original Zite link. The old deployment used this SDK successfully; verify it also works in the new Next.js site on desktop and mobile.
- Homepage nav and a restaurant-specific CTA point to these routes.
- These pages provide disclosure that survey records are stored on Zite, not in the Firebase leads collection of the corporate website.
- /privacy redirects to the existing localized /{locale}/privacy notice, preserving the historical URL used by Zite. The policy and Zite app privacy link need legal and language-specific review.

## Cutover

1. Verify existing Zite survey opens directly and from the new corporate route on desktop and mobile. Test EN/ES/FR and A/B/report flows.
2. Confirm records reach the Zite **NIXINX Admin** application, including correct consent, company, language and IDs; test private access.
3. Review privacy links and retention practices. Verify that Zite's data usage and consent terms match website notice and Canadian privacy obligations.
4. Only when new routes pass testing, remove the old bt.nixinx.com assessment CTA/embed from its own code. Do NOT delete the Zite survey or disconnect its persistent database.
5. For full data consolidation, use an authorized Zite API, webhook or controlled CSV export/import with original IDs/dedupe; no direct Firebase lead sync is implemented by this migration.

## Optional branded domain

If Zite plan permits custom domains, a future subdomain such as diagnostic.nixinx.com can point directly to Zite. Domain DNS and paid plan are separate decisions; do not attach production domain without explicit authorization.

## Verification pending
- Frame embedding policy, on-mobile view/scroll, translated branch logic, scoring translations, data persistence, admin access and backup/export.
- No changes made to existing bt.nixinx.com, Zite databases or Vercel domain assignments.
