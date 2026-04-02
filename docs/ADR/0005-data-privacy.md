# ADR-0005: Hash-Only Document Storage (No PII On-Chain)

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, NPC (National Privacy Commission), All Agencies |
| **Supersedes** | None |

## Context

RA 10173 (Data Privacy Act of 2012) requires:
- Data minimization (Sec. 11) — only collect data necessary for the purpose
- Security safeguards (Sec. 14) — protect personal information
- Storage limitation (Sec. 13) — retain data only as long as necessary

The blockchain stores document records that must be:
- Verifiable (agencies can prove a document existed at a point in time)
- Tamper-evident (any modification is detectable)
- Accessible for inter-agency sharing

## Decision

We will store **only cryptographic hashes** (SHA-256/Keccak-256) of documents on-chain. Original documents and any personally identifiable information (PII) are stored off-chain in agency-managed secure storage.

The on-chain `DocumentRecord` stores:
- `documentHash` — hash of the original document
- `metadataHash` — hash of off-chain metadata (IPFS pointer or storage reference)
- `agencyId` — registering agency identifier
- `timestamp` — registration time
- `documentType` — classification code

**Never stored on-chain:** document content, names, addresses, ID numbers, biometric data, or any PII.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Store full documents on-chain** | Self-contained, no external dependency | Violates RA 10173, high gas costs, immutable PII exposure | Directly violates data privacy law |
| **Encrypt documents on-chain** | Documents on-chain but encrypted | Key management complexity, encrypted data is still personal data under RA 10173 | Encryption does not exempt data from privacy requirements |
| **Store documents in IPFS with on-chain CID** | Decentralized storage, content-addressable | IPFS is public by default; government documents require access control | Requires private IPFS cluster, adds operational complexity |
| **Hash-only (chosen)** | Compliant, low gas, simple | Requires off-chain storage infrastructure, document retrieval is off-chain | Best balance of compliance, cost, and simplicity |

## Consequences

### Positive
- Full RA 10173 compliance — no PII on-chain, only irreversible hashes
- Low gas costs — storing 32-byte hashes is significantly cheaper than full documents
- Tamper-evident — any document modification changes the hash, detectable on-chain
- Portable — hash verification works on any EVM chain

### Negative / Trade-offs
- Document retrieval depends on off-chain storage availability
- If off-chain storage is lost, the on-chain hash cannot recover the document
- Agencies must maintain their own secure storage infrastructure

### Compliance Impact
- **RA 10173 Sec. 11** (data minimization): Only hashes stored, not document content
- **RA 10173 Sec. 13** (storage limitation): Off-chain data can be deleted per retention policy while on-chain hash remains as audit evidence
- **RA 10173 Sec. 14** (security safeguards): Hashes are irreversible; PII is never exposed on-chain
- **DICT DBS-002** (audit logging): All document registrations emit structured events

## References

- [RA 10173 Full Text](https://www.privacy.gov.ph/data-privacy-act/)
- [NPC Advisory on Blockchain and Data Privacy](https://www.privacy.gov.ph/)
- [EIP-725: Key Management](https://eips.ethereum.org/EIPS/eip-725)
