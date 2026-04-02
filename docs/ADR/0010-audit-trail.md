# ADR-0010: Immutable On-Chain Audit Trail

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | COA, Ombudsman, DICT, All Agencies |
| **Supersedes** | None |

## Context

COA (Commission on Audit) requires:
- Immutable transaction trail for all government operations
- 10-year audit retention minimum
- Tamper-evident records
- Ability to generate compliance reports

The blockchain's inherent immutability makes it an ideal audit trail platform.

## Decision

We will implement an **immutable on-chain audit trail** via the `AuditLog` smart contract.

Key design decisions:
- **Append-only** — no function exists to modify or delete log entries
- **Categorized** — entries are classified (DOCUMENT, ACCESS, SYSTEM, COMPLIANCE, SECURITY, OTHER)
- **Indexed by agency** — efficient querying per agency
- **Hash-based evidence** — details stored off-chain; only cryptographic hashes on-chain
- **Auditor-gated queries** — only `AUDITOR_ROLE` holders can generate compliance reports
- **Self-auditing** — compliance report generation and log queries are themselves logged

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Off-chain audit logs** | Cheaper, easier to query, no gas costs | Not tamper-evident, requires trust in log operator | Blockchain immutability is the core value proposition |
| **Event-only audit (no state)** | Zero storage cost, all data in event logs | Harder to query on-chain, requires external indexer | State-based storage enables on-chain verification |
| **On-chain state + events (chosen)** | Tamper-evident, queryable on-chain, events for off-chain indexing | Gas cost per log entry, state bloat over time | Best balance of immutability and queryability |
| **Merkle tree audit log** | Compact proofs, efficient verification | Complex to implement, harder to query by agency | Over-engineered for POC scope |

## Consequences

### Positive
- Immutable by design — no delete or modify functions exist
- Categorized entries enable filtered queries (by agency, category, time range, action)
- Auditor role gating ensures only authorized parties generate reports
- Self-auditing: report generation and queries are logged for accountability
- Events enable off-chain indexing by monitoring tools (Prometheus, Grafana)

### Negative / Trade-offs
- Gas cost per log entry — high-volume operations increase transaction costs
- State bloat over time — 10-year retention means entries accumulate indefinitely
- On-chain queries are limited by block gas — large time-range queries may fail
- No built-in data export — requires off-chain tooling for COA report generation

### Compliance Impact
- **COA audit requirements**: Immutable trail, 10-year retention, compliance reports
- **RA 10173 Sec. 15** (accountability): All actions logged with agency, actor, timestamp, and evidence hash
- **DICT DBS-002** (audit logging): Structured events for all inter-agency operations

## References

- [COA Audit Requirements for IT Systems](https://www.coa.gov.ph/)
- [RA 10173 Sec. 15 (Accountability)](https://www.privacy.gov.ph/data-privacy-act/)
