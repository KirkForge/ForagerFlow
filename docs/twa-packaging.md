# Trusted Web Activity (TWA) packaging

ForagerFlow is a Vite-built PWA. It can be distributed as an Android APK via a
[Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)
shell that ships no app logic — the browser renders the PWA exactly as it does
when installed from the web.

## What is in the repo

- `public/manifest.webmanifest` — PWA manifest with `shortcuts` and maskable icons.
- `public/.well-known/assetlinks.json` — digital-asset link file, generated from
  your signing fingerprint.
- `twa/` — minimal Android project using
  [`androidbrowserhelper`](https://github.com/GoogleChromeLabs/android-browser-helper).
- `scripts/generate-assetlinks.cjs` — generates `assetlinks.json` from env vars.
- `scripts/build-twa.cjs` — copies icons, generates per-build config, and invokes
  `./twa/gradlew assembleRelease`.

## Prerequisites

- JDK 17+.
- Android SDK with command-line tools (`ANDROID_SDK_ROOT` or `ANDROID_HOME`).
- A domain that serves the PWA over HTTPS.

## 1. Domain verification

The Android app must prove it owns the host it launches. This is done with the
`.well-known/assetlinks.json` file.

Get the SHA-256 fingerprint of your APK signing certificate:

- For Play/App signing: copy the fingerprint from **Play Console → Setup → App
  integrity → Play app signing**.
- For a local debug key:
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
  ```

Generate the file:

```bash
TWA_HOST=foragerflow.example.com \
TWA_SHA256_FINGERPRINT=AA:BB:CC:DD:... \
  node scripts/generate-assetlinks.cjs
```

Serve `public/.well-known/assetlinks.json` from `https://foragerflow.example.com/.well-known/assetlinks.json`.
Vite copies it to `dist/.well-known/assetlinks.json` during `pnpm build`, and the
Dockerfile serves static files from `dist/`.

Verify with Google's statement list tool or:

```bash
curl -s https://foragerflow.example.com/.well-known/assetlinks.json | jq .
```

## 2. Build the APK

```bash
pnpm build
TWA_HOST=foragerflow.example.com node scripts/generate-assetlinks.cjs
TWA_HOST=foragerflow.example.com node scripts/build-twa.cjs
```

The unsigned APK is written to:

```
dist/twa/foragerflow-release-unsigned.apk
```

If you do not have the Android SDK installed locally, the build will fail with a
clear message. The GitHub Actions release workflow installs the SDK automatically
and builds the APK for every release.

## 3. Sign and publish

Sign the unsigned APK with your release key:

```bash
apksigner sign --ks release.keystore \
  --out foragerflow-release.apk \
  dist/twa/foragerflow-release-unsigned.apk
```

Then upload `foragerflow-release.apk` to Play Console or sideload it for testing.

## 4. Play Console / internal testing checklist

- [ ] Release signing fingerprint matches `TWA_SHA256_FINGERPRINT` used to
      generate `assetlinks.json`.
- [ ] `assetlinks.json` is reachable over HTTPS with `application/json`.
- [ ] `manifest.webmanifest` has `display: standalone` (or `standalone` first in
      `display_override`).
- [ ] Adaptive icons render correctly on Android 8+ (the launcher icon is
      generated from `public/icons/icon-512.png` with the theme-color
      background).
- [ ] The app opens the correct host and the URL bar is hidden on first launch.

## Updating the host or fingerprint

Run `scripts/generate-assetlinks.cjs` again, redeploy the PWA so the new
`assetlinks.json` is live, then rebuild and re-sign the APK.

## Files generated during build (gitignored)

The build script copies icon PNGs and a generated `twa-config.xml` into the
Android project. These are ignored by `.gitignore`:

- `twa/app/src/main/res/mipmap-*/`
- `twa/app/src/main/res/mipmap-*-round/`
- `twa/app/src/main/res/values/twa-config.xml`
- `twa/app/build/`
- `twa/.gradle/`

Do not commit the unsigned or signed APKs; release artifacts are uploaded by
GitHub Actions instead.
