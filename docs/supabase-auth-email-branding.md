# Supabase Auth Email Branding

VaultedShield now owns a branded signup confirmation template in the repo:

- Template: `supabase/templates/confirm_signup.html`
- Local CLI config: `supabase/config.toml`
- Client redirect path: `src/lib/auth/accessPortal.js`

## What this implements

- Signup confirmation subject: `Confirm your VaultedShield account`
- Branded VaultedShield HTML confirmation email
- Confirmation links redirected back to `/#/login`
- Email confirmations enabled in local Supabase config

## Local development

If you use local Supabase:

1. Start the local stack with `supabase start`
2. Run the app on `http://127.0.0.1:5173` or `http://localhost:5173`
3. Open the local email inbox UI from the Supabase local stack to preview the message

## Hosted Supabase projects

If this app is using a hosted Supabase project, the repo template is still the source of truth, but hosted Auth settings must also be updated in the Supabase dashboard.

Review these settings:

- Auth > URL Configuration
  - Site URL should match the deployed VaultedShield app URL
  - Redirect URLs must include the deployed login landing URL, such as `https://your-domain/#/login`
- Auth > Email Templates
  - Confirmation subject should be `Confirm your VaultedShield account`
  - Confirmation HTML should mirror `supabase/templates/confirm_signup.html`
- Auth > SMTP Settings
  - Sender name should be `VaultedShield`
  - Sender address should use a domain-controlled mailbox for trust and deliverability

## Why this matters

This closes the trust gap called out in product feedback:

- the user sees clear company identification in the email
- the confirmation CTA looks intentional, not generic
- the verification link returns to a branded VaultedShield route instead of a vague landing page

## Deployment note

Changes to `supabase/config.toml` affect local CLI-managed environments. Hosted Supabase projects still require the corresponding dashboard configuration unless your deployment process explicitly syncs auth settings.
