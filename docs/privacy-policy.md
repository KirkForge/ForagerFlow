# Privacy Policy — ForagerFlow

Effective date: 2026-06-18

## What ForagerFlow is

ForagerFlow is an offline-first Progressive Web App (PWA) for mushroom identification. It runs ONNX machine-learning models entirely in your browser. No image is uploaded to a remote server for identification.

## What data we collect

**No images, location, or personal identifiers are collected by default.**

The app may collect the following telemetry data only when telemetry is enabled (`VITE_FEATURE_TELEMETRY=true`):

- App events such as model load, inference completion, and errors (no image content)
- Web Vitals metrics (page load timing)
- Generic device capabilities (memory class, connection type) used to gate large model downloads

If `VITE_TELEMETRY_ENDPOINT` is configured, telemetry events are sent to that endpoint via `navigator.sendBeacon`. Otherwise, events are buffered locally in the browser's `localStorage` for support/diagnostic export.

## What data is stored locally

- Identification history (species name, confidence, edibility, timestamp, and an optional thumbnail) is stored in the browser's IndexedDB.
- Safety acknowledgement and model-download confirmations are stored in `localStorage`.
- Buffered telemetry events are stored in `localStorage`.

You can clear history at any time from the History panel. Clearing history removes all locally stored identification records.

## Third-party content

The app includes a "Verify this species online" link that opens a Google search in a new tab. The search query contains only the predicted species name. No other data is shared with Google.

## Your choices

- Disable telemetry: set `VITE_FEATURE_TELEMETRY=false` at build time.
- Do not configure `VITE_TELEMETRY_ENDPOINT` to keep telemetry on-device only.
- Clear history and `localStorage` via browser settings to remove all local data.

## Contact

For privacy questions, contact the repository maintainer listed in the project README.
