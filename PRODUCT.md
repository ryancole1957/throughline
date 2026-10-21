# Product

## Purpose

Throughline is a self-hosted delivery workspace for product and engineering teams. Teams use it to see progress, ownership, evidence, and the page-to-API relationships that connect frontend work to backend contracts. The same workspace supports planned ownership transfers: offboarding, role changes, service takeovers, vendor transitions, and operational transitions.

Success means a team can see what is ready, what still needs evidence or review, which frontend page depends on which backend endpoint, and what remains before a release or delivery milestone can be signed off.

## Users

- **Team owner / member** — a user can belong to multiple teams. Team membership grants visibility into the team's projects; team owners manage invites and membership.
- **Acceptance owner** — takes ownership, verifies in an authorized environment, records the acceptance decision, and signs the conclusion.
- **Delivery** — provides accurate material, explains historical decisions, demonstrates workflows, and discloses open issues.
- **Technical reviewer** — checks technical claims, interfaces, and contracts for assigned items.
- **Business reviewer** — confirms business behavior, acceptance criteria, and commitments.
- **Observer** — read-only project access.
- **System administrator** — manages accounts and platform operations independently of project roles.

## Onboarding

- Public registration can be enabled or disabled for the deployment.
- Any registered user can create a team and becomes its owner.
- Teams share a ten-character invite code and invite link. New members can self-register with the code or join from the link.
- Team owners can add already-registered teammates by email.
- Users can join multiple teams and switch between them from the workspace.

## Principles

1. Submission, review, and acceptance are separate. No screen may collapse them into a single completion percentage.
2. Evidence is bound to an environment and version. Conclusions without a source are not treated as verified.
3. Conditional acceptance must record an owner, due date, and severity. Open obligations are never hidden in a completion rate.
4. Role gates are enforced by the server. Client-side state cannot override them.
5. Changing an acceptance standard creates a new revision and invalidates earlier decisions without deleting history.
6. Team boundaries are absolute for normal users. A user only sees projects belonging to teams they belong to.

## Scope

- Team workspaces, self-registration, invite codes, invite links, and owner-managed membership.
- Users can belong to multiple teams; projects belong to one team.
- Project stages: Draft → Scope → Collection → Walkthrough → Verification → Sign-off → Closed, with pause, resume, and reopen.
- Two independent item states: supply and acceptance.
- Evidence records, technical reviews, business reviews, acceptance decisions, and conditions.
- Risk register, asset registry, page-to-API mapping (access URL, page screenshot, and every endpoint a page calls, with search and service/method filters), and end-to-end verification bound to work items and page mappings, with revision-aware invalidation of recorded passes.
- Scoped reports with Markdown export, canonical snapshot hashes, and sign-off.
- Append-only audit events for all material changes.
- Account and role administration.
- Interface localization in English, Simplified Chinese, Japanese, Spanish, French, and German.

## Non-goals

- Editing production databases or executing production changes.
- Automatically issuing approvals or rotating every credential.
- Replacing a document store, wiki, or project tracker.
- AI-driven execution of production operations.

## Security and data

- Normal users can only access projects within their teams. Platform administrators are explicitly allowed to access all teams for operation.
- Team owners manage invite codes and membership; project roles remain separate.
- Assets store references to managed secret stores; never plaintext passwords, tokens, or identity documents.
- The application ships with no demo accounts. The first administrator is created from explicit bootstrap configuration.
- No analytics, telemetry, external fonts, or CDNs.
