# ADR-0004: Role-Based Access Control with OpenZeppelin AccessControl

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, BIR, NBI, DOH, COA, Ombudsman |
| **Supersedes** | None |

## Context

Government agencies have different roles and permissions:
- DICT administers the network and registers agencies
- BIR, NBI, DOH register and share documents
- COA and Ombudsman audit all operations
- Network operators manage node infrastructure

Access control must be:
- Granular enough to distinguish agency roles
- Auditable (every role change is logged)
- Portable to other EVM platforms (Fabric EVM, Enterprise Besu)

## Decision

We will use **OpenZeppelin's AccessControl** contract as the foundation for role-based access control, with custom roles: `ADMIN_ROLE`, `AGENCY_ROLE`, `AUDITOR_ROLE`, and `OPERATOR_ROLE`.

Each contract (AccessManager, DocumentRegistry, AuditLog) inherits AccessControl and defines its own role constants using `keccak256("ROLE_NAME")`.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Ownable (single owner)** | Simple, low gas cost | Single point of failure, no role granularity | Government networks require multi-role governance |
| **Custom RBAC from scratch** | Full control, no external dependencies | Must implement and audit all edge cases, reinventing the wheel | OpenZeppelin AccessControl is battle-tested and audited |
| **Role-based with on-chain registry** | Centralized role management across contracts | Adds complexity, requires cross-contract calls | Each contract manages its own roles for standalone deployability |
| **Attribute-Based Access Control (ABAC)** | Fine-grained, policy-driven | Complex to implement on-chain, high gas costs | Overkill for POC; RBAC satisfies current requirements |

## Consequences

### Positive
- Battle-tested implementation — OpenZeppelin AccessControl is used in thousands of production contracts
- Role hierarchy supports government organizational structure
- Each contract can be deployed standalone with its own role management
- `grantRole`/`revokeRole` events provide built-in audit trail for role changes

### Negative / Trade-offs
- Each contract maintains its own role state — no centralized role registry across contracts
- Role constants are contract-specific; migrating roles between contracts requires re-granting
- Custom `revokeRole(bytes32,address,bytes32)` shadows OpenZeppelin's `revokeRole(bytes32,address)`, requiring signature disambiguation in tests

### Compliance Impact
- Role-based access satisfies DICT DBS-001 (permissioned network)
- Audit trail of role changes supports COA audit requirements
- Separation of ADMIN/AGENCY/AUDITOR roles enforces principle of least privilege

## References

- [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/4.x/api/access#AccessControl)
- [NIST RBAC Model](https://csrc.nist.gov/projects/role-based-access-control)
