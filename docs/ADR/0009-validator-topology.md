# ADR-0009: Three-Validator Minimum Topology

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, BIR, NBI |
| **Supersedes** | None |

## Context

QBFT consensus requires `3f + 1` validators to tolerate `f` Byzantine faults. The POC must demonstrate multi-agency consensus while remaining deployable on a single development machine.

## Decision

We will deploy **3 validator nodes** (DICT, BIR, NBI) plus **1 observer node** (DOH) and **1 bootnode** for peer discovery.

With 3 validators, the network tolerates `f = 0` faulty nodes (requires all 3 to be honest). This is sufficient for POC demonstration but not production-ready fault tolerance.

## Alternatives Considered

| Alternative | Validators | Fault Tolerance | Why Rejected |
|-------------|-----------|-----------------|--------------|
| **2 validators** | 2 | 0 (no BFT) | Below QBFT minimum of 3 validators |
| **3 validators (chosen)** | 3 | 0 | Minimum viable for QBFT; sufficient for POC demo |
| **4 validators** | 4 | 1 | Better fault tolerance but requires more resources; target for staging |
| **5 validators** | 5 | 1 | Production target; too resource-intensive for POC |

## Consequences

### Positive
- Minimum viable QBFT network — demonstrates consensus with 3 agencies
- Fits on a single development machine (8 GB RAM, 4 cores)
- Clear scaling path: add validators for production (5+ recommended)

### Negative / Trade-offs
- Zero fault tolerance — if any validator goes down, consensus stalls
- Not representative of production resilience (requires 4+ validators for f=1)
- Observer node (DOH) does not participate in consensus, only reads chain state

### Compliance Impact
- Multi-agency validator set demonstrates federated governance per DICT National Blockchain Strategy
- Production deployment must increase to 4+ validators for fault tolerance per DICT availability requirements

## References

- [QBFT Validator Requirements](https://besu.hyperledger.org/private-networks/concepts/poa/qbft/)
- [DICT National Blockchain Strategy](https://dict.gov.ph/)
