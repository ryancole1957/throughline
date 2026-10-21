# Design system

Throughline uses a quiet, ledger-style interface: dense information, hairline structure, and color reserved for state. The goal is to make evidence and accountability easier to scan, not to decorate the page.

## Principles

- **Two states, never one score.** Supply and acceptance are always presented as separate signals.
- **Structure over ornament.** Hierarchy comes from 1px rules, whitespace, and background shifts. Static panels have no shadows.
- **Color means something.** The accent is used for primary actions and current selection. Green, amber, and red are reserved for status.
- **Machine identifiers are monospaced.** Codes, paths, versions, and hashes use the mono stack. Everything else uses the UI stack.
- **Density with air.** Compact tables and forms, but every group has a clear heading and predictable spacing.

## Color

| Token | Value | Usage |
| --- | --- | --- |
| Accent | `#2758c4` | Primary action, active navigation, focus ring |
| Accent hover | `#1e47a4` | Hover state |
| Accent soft | `#eef3fc` | Selected rows, informational backgrounds |
| Paper | `#f4f5f6` | Application background |
| Surface | `#ffffff` | Panels, sidebar, top bar |
| Surface sunken | `#fafbfc` | Table headers, inset blocks |
| Ink | `#191f28` | Primary text |
| Ink sub | `#5c6773` | Secondary text |
| Ink faint | `#8b95a1` | Labels and metadata |
| Hairline | `#e4e7ec` | Dividers |
| Hairline strong | `#cfd4dc` | Control outlines |
| Success | `#1a7f42` on `#e9f6ec` | Accepted, verified, passed |
| Warning | `#96660a` on `#fdf3e0` | Conditional, needs information, returned |
| Danger | `#b42318` on `#fdeeee` | Rejected, high risk, overdue, escalated |

The accent should occupy no more than roughly 10% of any screen. Its scarcity is what gives it meaning.

## Typography

- UI stack: system sans-serif.
- Mono stack: `ui-monospace, "SF Mono", Cascadia Mono, Menlo, Consolas, monospace`.
- Title: 600, 16px.
- Section: 600, 13px.
- Body: 400, 13px, 1.6 line height.
- Label: 500, 12px.
- Numeric columns use tabular figures.

## Layout

- Fixed 218px sidebar: brand, project switcher, grouped navigation, version.
- Sticky 54px top bar with the current view and account menu.
- Content column with consistent padding and a readable maximum width.
- Dashboard uses a two-column grid; long titles truncate and overflow scrolls inside the panel rather than the page.
- Spacing rhythm: 4 / 8 / 12 / 14 / 22px.

## Product surfaces

- **Teams** — a responsive card grid with team name, membership role, member count, and project count. Cards use the same hairline panel language as the rest of the product.
- **Team workspace** — an invite block with a monospaced join code, a compact owner-only invitation form, a member table, and a project table. Owner controls are visible only to the owner.
- **Page & API map** — a compact table connecting each frontend page to its backend endpoint, service, data tables, environment, and owner. The add/edit form requires a page and endpoint; rows can be edited or deleted.
- **Language switch** — a compact globe-marked selector in the top bar and on authentication screens. It supports English, Simplified Chinese, Japanese, Spanish, French, and German. The preference is stored locally and applied without a reload.

## Components

- **Buttons** — 4px radius, 29px height, white text on accent for primary actions; outlined ghost buttons for secondary actions; red ghost only for destructive decisions.
- **Status tags** — light background with a darker tone of the same hue. Supply and acceptance tags always appear together.
- **Panels** — white surface, 1px hairline, 6px radius, no shadow. Flush tables scroll horizontally.
- **Inputs** — 1px control outline, 4px radius, 30px height; focus adds a soft accent ring.
- **Gate progress** — a three-step visual (submission → review → acceptance) that communicates the core product rule. It must not be replaced by a progress bar.
- **Overlays** — drawers, dialogs, and toasts are the only elements with a shadow.

## Accessibility

- Body text meets WCAG AA contrast.
- All interactive elements are keyboard reachable with a visible focus ring.
- Rows and dialogs expose accessible names.
- Print output for reports and sign-off is a first-class view, not an afterthought.
- Motion is limited to short state transitions and respects reduced-motion preferences.
