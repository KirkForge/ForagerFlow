# Accessibility Statement — ForagerFlow

ForagerFlow aims to meet WCAG 2.1 Level AA for core user flows. This is a target, not a certification.

## Current status

- All interactive elements have accessible labels or `aria-label` attributes.
- The first-run safety modal uses a native `<dialog>` with `showModal()`, trapping focus in the top layer.
- Status messages use `aria-live` regions.
- The capture button exposes `aria-busy` during inference.
- Color is not the only indicator of edibility; text labels ("POISONOUS", "Edible", "Unknown") are always shown.

## Known limitations

- The app is primarily visual: camera viewfinder, species images, and result charts are not fully described for screen-reader users.
- Thumbnail images in history have alt text derived from species names.
- Some advanced warnings rely on color-coded classes in addition to text.

## Feedback

If you encounter an accessibility barrier, open an issue in the project repository with the "accessibility" label.
