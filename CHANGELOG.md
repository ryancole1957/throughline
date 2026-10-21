# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [3.4.0] - 2026-10-21

### Added

- Team workspaces with strict tenant isolation between normal users.
- Self-service registration, ten-character invite codes, invite links, and owner-managed membership.
- Multi-team membership: users can belong to several teams and switch between them.
- System administrator access across teams for platform operations.
- A six-language interface: English, Simplified Chinese, Japanese, Spanish, French, and German, with a persistent language selector.
- Team-aware project creation and project discovery.
- A redesigned Page & API map presented as a card wall: each page records an access URL, a page screenshot, and every backend endpoint it calls with method, path, and purpose, alongside service, data tables, environment, and owner.
- Search across page, endpoint, service, table, and owner, with service, HTTP method, and screenshot filters; the active query is kept in the URL so a filtered view can be shared or reopened.
- Screenshots are downscaled in the browser and stored inside the database, so the standard SQLite backup captures them; migration `002-page-mappings` converts single-endpoint rows automatically.
- End-to-end verification steps now bind to the work items and page mappings they cover, edited from a scope dialog that was previously a read-only, always-empty field.
- A recorded pass carries a fingerprint of its scope; changing a linked item's acceptance standard or editing a linked mapping flags the step as needing re-verification instead of deleting the earlier result. Uploading a screenshot does not invalidate a pass.
- Recording a failed step can open a tracked risk in the same action, carrying the failure note, severity, owner, due date, and the step's linked items.
- Migration `003-verification-scope` adds mapping timestamps, the step scope fingerprint, and the step-to-mapping links.
- Owner controls for team rename, direct member invitations, and invite-code rotation.

### Changed

- Rebranded the product as Throughline and standardized delivery terminology across the interface, API messages, documentation, packages, and deployment assets.
- Product positioning broadened from a narrow ownership-transfer tool to a shared delivery workspace for product and engineering teams.
- Project member candidates are restricted to the project's team.
- Project visibility is granted through team membership; project roles still govern actions.
- Version schema and deployment image updated to 3.4.0.

### Removed

- Project template selection; projects are defined by their team, scope, and data.
- Verbose interface explanations and marketing copy.
- Demo accounts and seeded example projects.
- Built-in project templates and industry-specific sample content.

## [3.3.0] - 2026-08-14

### Added

- Canonical report snapshots and stale-signature detection.
- Conditional acceptance with owner, due date, and severity.
- Risk escalation and exception approval flows.
- Asset verification and credential rotation tracking.

### Changed

- Acceptance gate now evaluates only current-revision reviews.
- Markdown report export includes the completion snapshot and open obligations.

## [3.2.0] - 2026-06-03

### Added

- Page-to-API mappings with environment and owner metadata.
- End-to-end verification steps and recorded results.
- Append-only audit trail for project, item, risk, and asset changes.

### Changed

- Supply and acceptance states are displayed independently in every project view.
- Role-based navigation and server-side authorization checks were tightened.

## [3.1.0] - 2026-04-19

### Added

- Initial project lifecycle: Draft, Scope, Collection, Walkthrough, Verification, Sign-off, Closed.
- Evidence records with environment, version, and reference fields.
- Technical review and business review workflows.
- Project membership roles: Acceptance owner, Delivery, Technical reviewer, Business reviewer, Observer.

## [3.0.0] - 2026-02-02

### Added

- SQLite persistence with WAL, foreign keys, and explicit migrations.
- Session-based authentication, CSRF protection, and account administration.
- Docker Compose deployment with Caddy automatic HTTPS.
- MIT open-source release.
