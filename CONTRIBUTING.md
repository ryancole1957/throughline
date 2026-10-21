# Contributing to Throughline

Thanks for taking the time to contribute.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For substantial changes, open an issue first so the approach can be discussed.
- Security vulnerabilities must not be reported in public issues. See [SECURITY.md](SECURITY.md).

## Development setup

```bash
cp .env.example .env
# Set SESSION_SECRET and BOOTSTRAP_ADMIN_* in .env
# Set ALLOW_REGISTRATION=false if you want an invite-only local instance
npm install
npm run dev
```

The application runs at <http://localhost:5173> with the API on port 4000. Sign in as the bootstrap administrator, create a team, and use its invite link to test onboarding.

## Quality checks

Every pull request must pass:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Pull requests

- Keep changes focused. Separate refactors from behavioral changes.
- Include tests for new domain rules and API behavior.
- Update documentation and the changelog when behavior or configuration changes.
- Describe the problem, the chosen approach, and how the change was verified.
- Do not include secrets, production data, personal information, or generated build output.

## Code conventions

- TypeScript across `shared`, `server`, and `web`.
- Server-side authorization is the source of truth; UI restrictions are only a convenience.
- Domain invariants belong in `apps/server/src/domain` and must be covered by tests.
- Do not add telemetry, third-party analytics, external fonts, or CDNs.
- Keep user-facing copy concise.

## Commit messages

Use the imperative mood and a short subject line. A body is welcome when the reason for the change is not obvious from the diff.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
