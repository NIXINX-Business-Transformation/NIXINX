# NIXINX Corporate PWA · v0.2.0

Trilingual corporate site (`/en`, `/es`, `/fr`) and Firebase-backed lead intake for **nixinx.com**. This is the corporate site, not the private NIXINX Control backoffice, NIXINX Engine, or customer MI app.

## Run

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

If installing dependencies is blocked by network access, build on Vercel after importing this repository. Do not claim the build succeeded until Vercel reports READY and the pages and form have passed verification.

## Vercel

- Connect GitHub repository: `NIXINX-Business-Transformation/NIXINX`.
- Framework: Next.js; root directory: repository root; build command `npm run build`.
- Deploy to a Vercel generated preview URL first. Add `nixinx.com` only after reviewing the preview and DNS ownership.
- Never touch `bt.nixinx.com`, `portal.bt.nixinx.com`, or `*.nixinx.site` during this release.

## Firebase lead capture

Create/use a **NIXINX-owned** Firebase project, not an HTL/HTW customer project. Create Firestore. Set the server-only Vercel environment variables from `.env.example`: 

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (escaped newlines accepted)
- `LEADS_HASH_SECRET` (random long secret)

The server writes only to two collections: `marketing_leads` (new inquiries) and `marketing_lead_rate_limits` (hourly anti-abuse counters). Admin SDK credentials remain on the server. No client-side write access is configured. Rate limiter uses hashed IP-hour, never saves raw IP, and caps each IP at five requests per hour. Honeypot and server validations apply.

For additional bot protection, configure **both** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, and register the domain in Cloudflare Turnstile. Configure `NEXT_PUBLIC_CONTACT_EMAIL` only if a public mailbox is verified. The form returns `FORM_NOT_CONFIGURED` and does not falsely acknowledge saving a lead until Firebase settings are present.

**Firestore security rule suggestion for these collections:** deny all client-side reads and writes. Admin SDK bypasses security rules and uses its service-account IAM permissions. Grant the service account only what is necessary for authorized collection operations and monitor Firestore usage.

## Localization and SEO

- English, Spanish and French content parity.
- `/` redirects according to browser language (`fr` / `es`; defaults to `en`).
- Language switcher on every homepage, localized consent and privacy notice.
- HTML `lang`, alternate URLs, canonical tags, manifest, generated icon and mobile-responsive styles.

## Important commercialization constraints

- Our six capabilities: Infrastructure & Integrations; NIXINX Software; Control; Engine; Management Information; Performance Management.
- Public domain `.com`; operational apps `.app`; private MI `.site`; NIXINX administration `.org`.
- Do not offer unlimited on-site installation, wiring or consulting within subscriptions. Referral commissions and partner status must be verified before being claimed.
- Customer information belongs in customer infrastructure; MI licence cancellation must not delete historical data or stop independent batch ingestion. These rules apply to separate services, not code running in this public website.

## Release checklist

- [ ] GitHub branch and Vercel build pass.
- [ ] Three languages render on desktop and mobile; links navigate.
- [ ] Legal entity, privacy notice and public email verified for Canada before public launch.
- [ ] Firebase credentials configured and dummy lead submitted, observed in the correct NIXINX Firestore project.
- [ ] Rate-limit, honeypot, invalid input and missing-config paths verified.
- [ ] Optionally configure Turnstile with both keys.
- [ ] Custom nixinx.com domain added **only after explicit launch approval**.
- [ ] Backup and review old bt.nixinx.com content before decommissioning.
