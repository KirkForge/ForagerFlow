# ADR-007: iOS build blocker — EAS credentials require interactive Apple Developer session

**Status:** Accepted  
**Date:** 2026-07-23

## Context

ForagerFlow is a PWA deployable as an Android TWA. The iOS path would use EAS Build (`eas build --platform ios`) to produce an iOS wrapper. The Expo/EAS toolchain is configured (`eas.json` exists, iOS provisioning profile and bundle ID are specified), but no iOS build has ever completed because `eas credentials` requires an interactive Apple Developer Program login.

## Decision

Document the exact blocker and remediation steps. Do not attempt to automate around the interactive credential step — it is an Apple-imposed requirement.

## Blocker

`eas build --platform ios` fails at the credentials step:
1. `eas credentials` prompts for Apple ID + 2FA (TOTP or SMS)
2. The Apple Developer Program membership ($99/yr) must be active
3. A signing certificate and provisioning profile are generated interactively
4. These cannot be pre-provisioned in CI without storing the certificate + private key in EAS's credential store (which requires the interactive session to set up initially)

The codebase configuration for iOS is complete — `eas.json`, `app.json`/`app.config.ts`, and the TWA/PWA manifest are all ready. The **only** gap is the interactive Apple credentials session.

## Remediation steps (for a session that has credentials)

1. **Ensure active Apple Developer Program membership** — sign in at https://developer.apple.com and verify the account is in good standing ($99/yr).

2. **Run the interactive credentials setup:**
   ```bash
   npx eas credentials
   # Select platform: iOS
   # Log in with Apple ID + 2FA
   # EAS will generate or import the distribution certificate and provisioning profile
   ```

3. **Verify credentials are stored:**
   ```bash
   npx eas credentials list --platform ios
   # Should show: Distribution Certificate, Provisioning Profile
   ```

4. **Run the iOS build:**
   ```bash
   npx eas build --platform ios --profile preview
   ```

5. **Verify the build completes** — download the `.ipa` from the EAS dashboard and install on a test device.

## Current state (verified 2026-07-25)

- `eas.json`: **NOT present** — Expo/EAS toolchain not yet initialized
- `app.json`/`app.config.ts`: **NOT present** — no bundle ID or iOS capabilities configured
- PWA manifest: valid and servable (`public/manifest.webmanifest`)
- TWA Android build: configured (`twa/` directory, `build.gradle.kts`, `twa-config.xml`)
- **Credentials**: not set up — Apple Developer Program membership ($99/yr) required first
- **Gap is two-fold**: (1) EAS/iOS config files must be created, (2) interactive Apple credentials session needed

## Consequences

- iOS builds remain blocked until a team member completes the interactive `eas credentials` session
- Once credentials are set up, `eas build --platform ios --profile preview` should produce a valid `.ipa`
- The blocker is procedural (Apple's 2FA requirement), not technical
- Adding a CI job for iOS builds would require storing the Apple ID + app-specific password as repo secrets, but the initial credentials session must still be run interactively at least once