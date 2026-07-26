# VaultedShield production-readiness audit — 2026-07-25

## Executive summary

VaultedShield has broad household, insurance, property, mortgage, retirement, document, reporting, and continuity capabilities. Its parser already preserves substantial provenance and gates analytics through confidence thresholds. The highest-value release work is simplifying the information architecture and progressively disclosing the existing intelligence.

This update introduces the five-destination navigation model, a grouped My Financial Life hub, requested/last-route restoration, and baseline keyboard/mobile accessibility infrastructure without changing database structures or financial calculations.

## Findings

### P0 — security, data loss, or misleading calculations

- No new P0 regression was found by the repository test suite.
- Supabase migrations include account/household ownership and child-table RLS hardening.
- Parser analytics use configured minimum confidence thresholds and regression coverage includes missing/weak-input guards.
- Production verification still needs a real authenticated RLS exercise against a non-production Supabase project before public release.

### P1 — major usability, accessibility, or release readiness

- Primary navigation exposed internal module structure and too many destinations. Addressed in this update.
- Protected-route login discarded the requested route, and authenticated login defaulted to Insurance. Addressed in this update.
- Mobile navigation prevented body scrolling and supported Escape, but did not trap focus or restore focus consistently. Addressed in this update.
- Global skip navigation, consistent focus visibility, reduced-motion handling, and 44px interactive targets were incomplete. Baseline remediation added.
- Legal copy requires counsel review. Do not treat current placeholders as approved legal language.
- Automated browser accessibility and critical-journey end-to-end tests are not configured.

### P2 — consistency, performance, and maintainability

- Inline styles remain widespread; the initial token layer is now available in `src/index.css`, but component migration is incomplete.
- Production build highlights large lazy chunks: PDF.js ~463 KB, policy detail ~277 KB, and life-policy upload ~235 KB.
- PDF code is route-separated, but should be loaded only after file selection where possible and evaluated for worker-based parsing.
- Detail pages need a shared Summary / Analysis / Evidence presentation component.
- Upload Center, Vault, and module upload routes still need one shared state-machine/wizard component.

### P3 — optional polish

- Replace remaining decorative gradients and excessive pill treatments.
- Add consistent breadcrumbs and page-width primitives to all detail routes.
- Add measured Web Vitals and route-transition telemetry with privacy review.

## Verification

- `npm run lint`: pass
- `npm test`: pass, including navigation/legacy-route regression
- `npm run build`: pass
- Database migrations: none added
- Financial/parser calculations: unchanged by this update
- Deployment: not performed

## Security and usability hardening added after the audit

- Added migration `20260725_close_anonymous_document_access.sql` to require authenticated ownership for household access, make both document buckets private, and scope storage operations to the owning household or policy.
- Existing null-owned rows are preserved for administrative review; the migration does not delete customer data.
- Simulated property valuation fallback now defaults off and must be enabled explicitly.
- Upload Center now validates supported types and a 25 MB limit before upload, reports rejected files accessibly, and supports removing queued files.
- Login and registration now use visible labels, appropriate input types and autocomplete values, password visibility controls, stronger validation, and terms/privacy acknowledgment.
- Password recovery now includes both reset-email initiation and a recovery-token new-password screen.
- Added automated checks for upload validation, private-storage migration requirements, valuation defaults, and recovery-link classification.

## Remaining release gates

- Counsel-approved privacy, terms, AI limitation, retention, and insurance/financial education language.
- Axe-powered browser accessibility coverage and keyboard smoke tests.
- Authenticated desktop/mobile critical-journey E2E tests.
- Non-production Supabase RLS verification using two isolated accounts.
- Parser fixtures covering multiple carriers/layouts without customer documents.
- Performance measurements from a deployed preview, including LCP, INP, CLS, and route transition timing.
