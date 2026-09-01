---
version: alpha
name: Appachas — Mesa Clara
description: >-
  A clear, friendly and lightweight design system for Appachas. It combines a
  calm paper-like surface with confident blue actions and green confirmation.
colors:
  primary: "#1463D8"
  primary-pressed: "#0B54BB"
  primary-soft: "#DCEAFF"
  on-primary: "#FFFFFF"
  secondary: "#159A63"
  secondary-soft: "#DDF6EA"
  secondary-text: "#0B5132"
  on-secondary: "#FFFFFF"
  tertiary: "#F4B740"
  tertiary-text: "#8A6100"
  neutral: "#F7F9FC"
  surface: "#FFFFFF"
  surface-subtle: "#F0F5FB"
  surface-accent: "#E8F0FA"
  on-surface: "#102A43"
  on-surface-variant: "#526579"
  outline: "#8FA3B8"
  outline-variant: "#CBD8E6"
  error: "#C73E4D"
  error-soft: "#FCE7EA"
  error-text: "#7A1D29"
  on-error: "#FFFFFF"
  scrim: "rgb(16 42 67 / 28%)"
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: "40px"
    fontWeight: 800
    lineHeight: "48px"
    letterSpacing: "-0.02em"
  headline-lg:
    fontFamily: Manrope
    fontSize: "28px"
    fontWeight: 800
    lineHeight: "36px"
    letterSpacing: "-0.015em"
  headline-md:
    fontFamily: Manrope
    fontSize: "22px"
    fontWeight: 750
    lineHeight: "30px"
  title-md:
    fontFamily: Manrope
    fontSize: "16px"
    fontWeight: 750
    lineHeight: "24px"
  body-lg:
    fontFamily: Inter
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-md:
    fontFamily: Inter
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "21px"
  label-md:
    fontFamily: Inter
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.02em"
  amount-lg:
    fontFamily: Manrope
    fontSize: "32px"
    fontWeight: 800
    lineHeight: "40px"
    letterSpacing: "-0.02em"
  amount-md:
    fontFamily: Manrope
    fontSize: "18px"
    fontWeight: 750
    lineHeight: "24px"
  caption:
    fontFamily: Inter
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  none: "0px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: "9999px"
spacing:
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  gutter: "16px"
  desktop-margin: "32px"
  safe-area-bottom: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  button-primary-disabled:
    backgroundColor: "{colors.outline-variant}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  button-destructive-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  text-field-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.error-text}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  info-card:
    backgroundColor: "{colors.surface-accent}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  avatar:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-pressed}"
    rounded: "{rounded.full}"
    size: "40px"
  amount-total:
    textColor: "{colors.on-surface}"
    typography: "{typography.amount-lg}"
  amount-positive:
    textColor: "{colors.secondary-text}"
    typography: "{typography.amount-md}"
  sticky-action-bar:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "16px"
---

# Appachas — Mesa Clara

## Overview

Appachas is a lightweight shared-expense product. Its visual identity should feel like a clear shared table: friendly, trustworthy and easy to scan when people are moving quickly. The system uses a calm, paper-like light surface, a single confident blue for action, and green for positive confirmation.

The design language is intentionally restrained. It should reduce cognitive load, make numerical information easy to compare, and communicate trust without implying account-level identity or payment security. Product-specific flows, screen architecture and microcopy live in `PRODUCT_DESIGN.md`; this file is the source of truth for visual decisions.

## Colors

The palette is built around high-legibility navy text on a cool off-white background. Blue is reserved for the most important action and navigation. Green confirms a positive or completed state. Yellow is a quiet attention accent, never the primary action. Red is reserved for validation and destructive actions.

- **Primary:** confident blue for primary actions, active navigation, links and focus.
- **Secondary:** balanced green for positive amounts, success and completion.
- **Tertiary:** warm yellow for small non-critical attention cues.
- **Neutral:** cool paper tones that create hierarchy through surfaces rather than heavy borders.
- **Error:** restrained red for invalid input and irreversible actions only.

The normative color values and semantic variants are defined in the `colors` front matter. Use the darker text variants on soft backgrounds when the foreground needs to meet WCAG AA contrast. Never use color as the only indication of a positive, negative, selected or invalid state.

## Typography

The typography strategy combines **Manrope** for expressive hierarchy and numerical emphasis with **Inter** for functional reading. Manrope gives headings and amounts a distinct voice; Inter keeps labels, helpers and longer text neutral and legible.

- Use `display-lg` sparingly for a high-value headline or a prominent total.
- Use `headline-lg` and `headline-md` to establish page and section hierarchy.
- Use `title-md` for component titles and named items.
- Use `body-lg` for primary reading and `body-md` for supporting information.
- Use `label-md` for field labels, compact controls and status labels.
- Use `amount-lg` and `amount-md` for values that need fast comparison. Apply tabular numerals to aligned numerical lists.
- Use `caption` only for secondary metadata; never use it for required instructions or error messages.

Keep type at its defined size and line height. Do not use all caps for sentences. A screen should generally use no more than two font weights at once.

## Layout

The layout follows a fluid mobile-first grid with a 4 px base unit and an 8 px visual rhythm. Content should remain comfortable at 320 px and scale to a centered, fixed-max-width layout on larger screens.

- Use `spacing.gutter` for the default mobile page gutter and `spacing.desktop-margin` from desktop widths upward.
- Group related content with `spacing.lg`; separate major sections with `spacing.xl` or `spacing.2xl`.
- Use an 8 px rhythm for lists, rows and control groups, with the 4 px unit only for micro-adjustments.
- Keep text blocks at a readable measure rather than stretching prose across a wide screen.
- Use CSS Grid or Flexbox so the DOM order remains the reading order on mobile.
- Preserve a bottom safe area for mobile action bars using `spacing.safe-area-bottom` in addition to normal padding.
- At 768 px and above, content may reflow into two columns when that improves comparison; do not introduce dense dashboards solely to fill space.
- At 1024 px and above, use a max content width around 1120 px and maintain generous outer margins.

## Elevation & Depth

Depth is created primarily with tonal layers: `surface` content sits on `neutral` or `surface-subtle`, while `surface-accent` highlights an important summary. This keeps the interface calm and avoids a heavy application-shell appearance.

- Use a white `card` on the neutral background to establish the main content layer.
- Use `info-card` for informational emphasis without making it look interactive.
- Standard card shadow, when needed: `0 2px 8px rgb(16 42 67 / 8%)`.
- Elevated dialog shadow, when needed: `0 8px 24px rgb(16 42 67 / 12%)`.
- Use the `scrim` token for modal backdrops.
- Avoid black shadows, glossy gradients and multiple competing elevations in one view.
- A focus indicator is a 2 px primary ring with a 2 px offset; it must remain visible against every surface.

## Shapes

The shape language is soft-touch and practical. Rounded corners make the tool approachable, while a limited scale keeps the interface coherent.

- Use `rounded.sm` for fields, buttons and compact rows.
- Use `rounded.md` for grouped controls and selection chips.
- Use `rounded.lg` for cards and informational containers.
- Use `rounded.xl` only for prominent sheets or large confirmation surfaces.
- Use `rounded.full` for avatars, badges and genuinely pill-shaped controls.
- Do not mix sharp and rounded geometry casually in the same view.
- The minimum interactive target is 44 × 44 px; 48 px is preferred for primary buttons and selectable rows.
- Borders are reserved for inputs, selected states, outline buttons and contrast needs. Prefer surface changes for structural grouping.

## Components

Components should use the front matter tokens as their normative visual contract. The token map includes primary, hover, disabled and error variants so state changes do not alter layout or invent new colors.

### Buttons

Primary buttons are solid blue with white text and a minimum height of 48 px. Outline buttons are transparent with a blue border and text. Destructive actions use the destructive outline style until the final confirmation step. Keep one primary action as the clear visual priority in a view.

### Inputs

Inputs use a white surface, persistent labels, comfortable horizontal padding and a visible focus ring. Helper and error copy sits below the field. Error fields use the error-soft surface and error-text, plus an icon or message; never rely on red alone.

### Chips, checkboxes and radio controls

Selection controls use the primary-soft or secondary-soft surface for the selected state, a visible check or selected indicator, and a label that remains readable at all times. The control itself must be a native checkbox, radio or button in the implementation.

### Lists and data rows

Rows use spacing and tonal changes before dividers. Leading avatars may use the `avatar` token. Numeric values align to the trailing edge and use tabular numerals. Trailing actions must have an accessible label and a target of at least 44 × 44 px.

### Cards and action bars

Cards group one coherent decision or piece of information. Padding defaults to 24 px on large cards and 16 px on compact surfaces. Sticky action bars use an opaque surface, preserve safe-area padding and do not obscure the last content item.

### Feedback and dialogs

Success and error feedback should be brief, inline or announced through a polite live region. Confirmation dialogs use the surface layer, clear consequence text and a visible non-destructive cancel action. Use a bottom sheet on mobile and a centered dialog on desktop when the same decision needs modal treatment.

## Do's and Don'ts

- **Do** use the primary color for the single most important action in a view.
- **Do** use tonal surfaces to establish hierarchy before adding borders or shadows.
- **Do** keep amounts, labels and control states readable at 320 px and 200% text zoom.
- **Do** maintain WCAG AA contrast, visible focus and 44 × 44 px touch targets.
- **Do** pair semantic color with text, an icon or a shape so meaning survives without color vision.
- **Do** preserve sentence case and a friendly, direct voice in interface labels.
- **Don't** use more than two font weights on one screen without a strong reason.
- **Don't** mix unrelated radii, visual styles or icon families in the same view.
- **Don't** use gradients, charts, decorative finance imagery or gamification to communicate a simple amount or status.
- **Don't** use red for ordinary warnings or green for unrelated decoration.
- **Don't** use icon-only actions without an accessible name.
- **Don't** let sticky controls cover content or the mobile browser safe area.
