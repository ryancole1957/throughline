# Security policy

## Supported versions

Throughline is currently maintained on the latest release line. Security fixes are applied to the latest release.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability.

Report it privately through the repository's security advisory feature, or contact the maintainers through the private channel listed in the repository profile. Include:

- a description of the issue and its impact
- affected versions and configuration
- reproduction steps or a proof of concept
- any suggested mitigation

You should receive an acknowledgement within a few business days. Please allow time for a fix and coordinated disclosure before publishing details.

## Security model

Throughline is designed for self-hosting behind HTTPS. Operators are responsible for:

- setting a strong, unique `SESSION_SECRET`
- creating strong administrator credentials
- restricting network access to the service
- keeping the host, Docker, and dependencies patched
- protecting database backups and secret-store references
- deciding whether public self-registration should be enabled (`ALLOW_REGISTRATION`)

The application enforces server-side role checks, team-level tenant isolation, CSRF protection for unsafe methods, rate limiting, secure session cookies in production, and last-administrator protection. Platform administrators can access all teams; normal users can only access projects in teams they belong to. The application does not provide binary uploads, email delivery, or an external object store in this release.

## Out of scope

- vulnerabilities requiring a compromised host or administrator account
- denial-of-service through resource exhaustion on an already-trusted network
- issues in third-party dependencies that are already fixed in a supported release
