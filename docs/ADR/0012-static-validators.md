# ADR-0012: Static Validator Mode (Not Contract-Based)

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-20 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, Network Operations |
| **Supersedes** | None |

## Context

Besu's QBFT consensus supports two validator management modes:
1. **Static** — validators are encoded in the genesis `extraData` field
2. **Contract** — validators are managed by a smart contract at a specified address

The initial genesis configuration used `validatorSelectionMode: "contract"` with `validatorContractAddress: "0x...8888"`, but the `extraData` field was all zeros (no validators encoded). This meant no validators were registered at genesis and the chain could not produce blocks.

## Decision

We will use **static validator mode** for the POC, with validator addresses encoded in the genesis `extraData` field.

The `setup_qbft.sh` script generates node keypairs, derives Ethereum addresses, and populates the genesis `extraData` with the validator addresses before the network starts.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Contract mode** | Dynamic validator changes without network restart, on-chain governance of validators | Requires pre-deployed validator contract at genesis, complex initialization | Too complex for POC; contract must exist and be populated before first block |
| **Static mode (chosen)** | Simple, works out of the box, no additional contracts needed | Changing validators requires network restart with new genesis | Sufficient for POC where validator set is fixed |
| **Hybrid (static → contract transition)** | Start simple, migrate to contract mode later | QBFT does not support transitioning from static to contract mode | Not supported by Besu |

## Consequences

### Positive
- Network starts immediately with validators defined in genesis
- No dependency on external contracts for consensus
- Simpler genesis file — fewer failure modes
- `setup_qbft.sh` automates the extraData generation

### Negative / Trade-offs
- Changing the validator set requires stopping the network, updating genesis, and restarting
- Not suitable for production where agencies may join/leave dynamically
- Production migration to contract mode requires a new network (not an in-place upgrade)

### Compliance Impact
- No direct compliance impact. Production deployment should evaluate contract mode for dynamic agency management.

## References

- [QBFT Validator Selection Modes](https://besu.hyperledger.org/private-networks/concepts/poa/qbft/)
- [Genesis extraData Format for QBFT](https://besu.hyperledger.org/private-networks/how-to/configure/qbft/#extra-data)
