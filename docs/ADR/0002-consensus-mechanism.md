# ADR-0002: Use QBFT Consensus for Permissioned Network

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, BIR, NBI, DOH |
| **Supersedes** | None |

## Context

The network requires a consensus mechanism that:
- Provides immediate transaction finality (no forks, no reorgs)
- Tolerates Byzantine faults in a permissioned setting with known validators
- Operates efficiently with a small number of validators (3-5 agencies)
- Is suitable for government agencies that do not trust each other fully but agree on a shared protocol

## Decision

We will use **QBFT (Quorum Byzantine Fault Tolerance)** consensus with a 5-second block time.

QBFT is a variant of IBFT 2.0 that supports dynamic validator set changes via smart contract or static configuration. It tolerates up to `f` faulty nodes in a network of `3f + 1` validators. With 3 validators, the network tolerates 1 faulty node.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **IBFT 2.0** | Proven in enterprise deployments, immediate finality | Static validator set requires genesis restart to change | QBFT supports dynamic validator changes without network restart |
| **Clique (PoA)** | Simple to configure, low overhead | No Byzantine fault tolerance, vulnerable to collusion | Insufficient fault tolerance for a multi-agency trust network |
| **Ethash (PoW)** | Decentralized, battle-tested | High energy consumption, probabilistic finality, slow blocks | Unsuitable for permissioned government networks |
| **Eth2 PoS** | Energy-efficient, large validator sets | Requires 32 ETH stake, complex setup, not designed for permissioned networks | Overkill for a small federated network |

## Consequences

### Positive
- Immediate finality — transactions are confirmed in a single block, no reorgs
- Byzantine fault tolerance — network continues operating with 1 faulty/malicious validator
- 5-second block time provides responsive UX for inter-agency operations
- Dynamic validator management allows adding/removing agencies without network restart

### Negative / Trade-offs
- Requires at least 4 validators for BFT (3f+1 where f=1); POC uses 3 which tolerates only 0 faults
- Communication overhead is O(n²) — acceptable for small validator sets but does not scale to hundreds
- Block time of 5 seconds is a trade-off between responsiveness and network stability

### Compliance Impact
- Immediate finality supports COA audit requirements — no ambiguity about transaction ordering
- Byzantine fault tolerance ensures network availability per DICT DBS-004 (system availability)

## References

- [QBFT Specification](https://besu.hyperledger.org/private-networks/concepts/poa/qbft/)
- [Byzantine Fault Tolerance Explained](https://en.wikipedia.org/wiki/Byzantine_fault)
