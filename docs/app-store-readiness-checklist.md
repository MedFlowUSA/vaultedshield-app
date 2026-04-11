# App Store Readiness Checklist

Last reviewed: April 10, 2026

## Current call

VaultedShield is not yet ready for Apple App Store or Google Play submission.

The web app builds, the Capacitor shell is initialized, and native project folders now exist, but the submission layer is still incomplete.

## Current blockers

- Native release setup is still incomplete.
  - iOS and Android projects now exist.
  - Signing, archive/release validation, and store metadata are still not configured.
- Native permission/compliance coverage is only partially done.
  - iOS camera usage text is now present.
  - Android manifest now declares camera support.
  - iOS privacy manifest coverage still needs review, including whether `PrivacyInfo.xcprivacy` is needed for the final shipped app and SDK mix.
- Legal/privacy materials are still beta-level.
  - Privacy policy page needs production legal review and final language.
  - Store privacy/data safety answers still need to be completed from real backend behavior.
- Native release assets are missing.
  - Store screenshots.
  - Native icons and splash assets.
  - Signing configuration.
  - Review credentials / app access notes.

## Repo evidence

- Capacitor config exists in `capacitor.config.json`.
- Android project exists in `android/`.
- iOS project exists in `ios/`.
- Camera capture is used in `src/utils/cameraCapture.js`.
- iOS camera purpose string exists in `ios/App/App/Info.plist`.
- Android camera capability metadata exists in `android/app/src/main/AndroidManifest.xml`.
- Account Center is available in-app at `/account`.
- Account signup exists in `src/pages/AuthSignupPage.jsx`.
- Privacy policy route exists at `/privacy-policy`.
- Production deletion request migration now exists at `supabase/migrations/20260410_add_account_deletion_workflow.sql`.
- Privileged deletion edge function now exists at `supabase/functions/request-account-deletion/index.ts`.
- Frontend deletion helper now exists at `src/lib/auth/requestAccountDeletion.js`.

## Work needed before TestFlight / internal testing

1. Sync the latest web build into native projects when app code changes.
   - `npm run build`
   - `npx cap sync`
2. Open the native projects and verify they build locally.
   - Android Studio for `android/`
   - Xcode for `ios/`
3. Verify the camera flow on physical iPhone and Android devices.
4. Review whether additional native permission strings or manifests are required for the final shipped feature set.
5. Deploy the new Supabase migration and edge function to the target project, then verify the full delete-account flow against live auth and storage data.

## Work needed before public submission

1. Replace beta privacy copy with production policy language and a real support/privacy contact path.
2. Complete Apple privacy details and Google Play Data safety disclosures.
3. Prepare store listing copy, screenshots, icons, and review notes.
4. Configure signing, versioning, and release builds.
5. Review final iOS privacy manifest requirements for the app and included SDKs.
6. Test login, upload, camera capture, legal links, sign out, and account controls on both platforms.
7. Run a live end-to-end verification of the deletion flow against the production Supabase project before submission.

## Account Deletion Status

Implemented in repo:

- Users can initiate deletion directly from the in-app Account Center without contacting support.
- The flow now uses a dedicated Supabase edge function instead of a client-side placeholder.
- Recent-auth enforcement is implemented both in the client flow and again on the server.
- Deletion requests are logged in `account_deletion_requests` with lifecycle fields for request time, status, completion time, failure reason, and metadata.
- Owned household data is modeled to delete through `households.owner_user_id`, and dedicated policy intelligence data is modeled to delete through `vaulted_policies.user_id`.
- The new migration adds a foreign key from `vaulted_policies.user_id` to `auth.users(id)` with `on delete cascade` so auth-user deletion can cascade both ownership trees safely.
- Stored document objects in `vaulted-platform-documents` and `vaulted-policy-files` are explicitly removed by the server-side deletion function before auth-user deletion completes.
- On success, the app clears local app storage, signs the user out, and routes back to the signed-out login surface with a confirmation message.

Deferred or still operationally required:

- The migration and edge function still need to be deployed to each target Supabase environment.
- Live QA should verify failure handling for stale sessions, network loss, storage cleanup errors, and duplicate deletion requests.
- Legal review still needs to confirm whether any narrow retention obligations require a longer-lived audit record or additional reviewer-facing copy.

Reviewer expectations this now addresses:

- Apple: in-app account deletion is reachable directly from the account area.
- Apple: destructive deletion now includes a reauthentication step when the session is stale.
- Google Play: account deletion is user-initiated in product rather than support-only.
- Both stores: the app now has an auditable server-side deletion lifecycle instead of a local-only placeholder.

## Policy checkpoints to verify during submission

- Apple privacy policy URL is required in App Store Connect.
- Apple account-based apps are expected to support account deletion.
- Google Play apps must complete the Data safety form.
- Google Play apps with account creation must satisfy account deletion requirements.
- Google Play target API requirements must be met by the final Android build.

## Handy links

- Apple App Review Guidelines:
  - https://developer.apple.com/app-store/review/guidelines
- Apple App Privacy Details:
  - https://developer.apple.com/app-store/app-privacy-details/
- Apple App Information reference:
  - https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/
- Apple account deletion guidance:
  - https://developer.apple.com/support/offering-account-deletion-in-your-app
- Google Play app review prep:
  - https://support.google.com/googleplay/android-developer/answer/9859455?hl=en
- Google Play Data safety:
  - https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- Google Play account deletion:
  - https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN
- Google Play target API level requirements:
  - https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-mt
