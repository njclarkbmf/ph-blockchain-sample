# ADR-0001: Use Hyperledger Besu as Blockchain Platform

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, BIR, NBI, DOH, COA |
| **Supersedes** | None |

## Context

The Philippine Government requires a permissioned blockchain platform for inter-agency document sharing that must:
- Support Byzantine Fault Tolerant consensus for a federated trust model
- Be EVM-compatible to leverage existing Solidity tooling and developer skills
- Support node and account permissioning for government-only participation
- Be portable to enterprise environments (Hyperledger Fabric, private Ethereum)
- Comply with RA 10173 (Data Privacy Act) and DICT guidelines
- Have active enterprise support and a clear migration path to production

## Decision

We will use **Hyperledger Besu** as the blockchain platform for this POC.

Besu is an Ethereum client developed under the Apache 2.0 license, written in Java. It supports multiple consensus mechanisms (QBFT, IBFT 2.0, Clique, Ethash), permissioning, privacy via Tessera/Orion, and is fully EVM-compatible.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Hyperledger Fabric** | Strong permissioning, channel-based privacy, mature enterprise adoption | Requires learning chaincode (Go/Java), not EVM-native, steeper learning curve | EVM compatibility is critical for Solidity contracts and developer onboarding |
| **Quorum (ConsenSys)** | Built-in privacy, QBFT support | Enterprise licensing uncertainty, smaller open-source community | Besu offers equivalent features under Apache 2.0 with broader consensus options |
| **Private Ethereum (Geth)** | Maximum compatibility, large ecosystem | No built-in permissioning, PoW/PoS not suited for permissioned networks | Requires additional tooling for permissioning; Besu has it built-in |
| **Corda** | Strong privacy, designed for regulated industries | Not EVM-compatible, JVM-based DSL, steep learning curve | Incompatible with Solidity smart contracts |

## Consequences

### Positive
- Full EVM compatibility enables use of Solidity, Hardhat, ethers.js, and OpenZeppelin
- QBFT consensus provides immediate finality (no forks) suitable for government operations
- Built-in permissioning (node and account allowlisting) meets DICT security requirements
- Clear migration path to Hyperledger Fabric EVM and Enterprise Besu with Tessera
- Apache 2.0 license with no vendor lock-in

### Negative / Trade-offs
- Besu's Java runtime requires more memory than lightweight alternatives
- Privacy groups (Tessera/Orion) require additional infrastructure not included in POC
- Smaller community than Geth, though growing rapidly in enterprise sector

### Compliance Impact
- Permissioned network satisfies DICT DBS-001 (permissioned network requirement)
- Node/account allowlisting supports RA 10173 Sec. 14 (security safeguards)

## References

- [Hyperledger Besu Documentation](https://besu.hyperledger.org/)
- [DICT National Blockchain Strategy](https://dict.gov.ph/)
- [QBFT vs IBFT 2.0 Comparison](https://besu.hyperledger.org/private-networks/concepts/poa/)
