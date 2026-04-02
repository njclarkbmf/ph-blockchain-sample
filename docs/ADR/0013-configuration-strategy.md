# ADR-0013: Environment-Based Configuration (No Hardcoded Values)

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, Security Team, Operations |
| **Supersedes** | None |

## Context

The POC must be deployable across multiple environments (local development, POC demo, staging, production) without code changes. Configuration values such as RPC URLs, chain IDs, private keys, and gas prices vary per environment.

Additionally, security best practices and RA 10173 require that sensitive values (private keys, credentials) are never committed to version control.

## Decision

We will use **environment-based configuration** with the following patterns:

1. **`.env.example`** — Template with placeholder values, committed to version control
2. **`.env`** — Actual values, gitignored, loaded via `dotenv`
3. **`process.env.VAR \|\| "default"`** — All configuration in `hardhat.config.ts` uses environment variables with sensible defaults for local development
4. **No hardcoded addresses, private keys, or chain IDs** in source code

All network configurations (besuLocal, besuProduction, fabricEVM, enterpriseBesu) read from environment variables.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Hardcoded config in source** | Simple, no setup required | Requires code changes per environment, risks committing secrets | Violates security best practices and RA 10173 |
| **JSON config files** | Structured, version-controllable | Still risks committing secrets, requires file management | Environment variables are the industry standard for 12-factor apps |
| **HashiCorp Vault / AWS Secrets Manager** | Enterprise-grade secret management | Requires infrastructure, overkill for POC | Target for production; env vars suffice for POC |
| **Environment variables (chosen)** | Industry standard (12-factor), gitignore-friendly, simple | Manual setup per environment, no encryption at rest | Best balance of security and simplicity for POC |

## Consequences

### Positive
- Zero code changes required to deploy to different environments
- `.env` is gitignored — secrets never committed
- `.env.example` serves as documentation of required configuration
- Same codebase works for Besu, Fabric EVM, and Enterprise Besu
- Defaults enable local development without any configuration

### Negative / Trade-offs
- Environment variables are plaintext — no encryption at rest
- No secret rotation automation — manual process
- Large number of environment variables can be confusing to manage
- No validation of environment variable values at startup (beyond type coercion)

### Compliance Impact
- **RA 10173 Sec. 14** (security safeguards): Private keys stored in environment, not in source code
- **DICT Guidelines**: Separate configuration for development, staging, and production environments
- **COA**: Deployment configuration is auditable via `.env.example` template

## References

- [The Twelve-Factor App: Config](https://12factor.net/config)
- [OWASP Secret Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
