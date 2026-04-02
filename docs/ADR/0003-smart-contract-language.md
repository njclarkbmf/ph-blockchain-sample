# ADR-0003: Use Solidity 0.8.19 for Smart Contracts

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, Development Team |
| **Supersedes** | None |

## Context

Smart contracts must be written in a language that:
- Is supported by Hyperledger Besu's EVM
- Has mature security libraries and audit tooling
- Is widely adopted in the enterprise blockchain community
- Supports built-in overflow/underflow protection for financial safety

## Decision

We will use **Solidity 0.8.19** for all smart contracts.

Solidity 0.8.x introduced automatic arithmetic overflow/underflow checks, removing the need for SafeMath libraries. Version 0.8.19 is a stable LTS release with full Besu 24.6.0 compatibility.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Solidity 0.8.20+** | Newer features (user-defined value types, transient storage) | Uses PUSH0 opcode (EIP-3855) not supported by Besu 24.6.0 | Incompatible with our Besu version; would require upgrade first |
| **Solidity 0.7.x** | Wider Besu version compatibility | No built-in overflow protection, requires SafeMath | Less safe; 0.8.x overflow checks are critical for government financial operations |
| **Vyper** | Simpler syntax, security-focused design | Smaller ecosystem, fewer libraries, limited tooling support | OpenZeppelin and most audit tools target Solidity |
| **Fe / Huff** | Emerging languages with safety guarantees | Immature tooling, no production deployments | Too early for government use |

## Consequences

### Positive
- Automatic overflow/underflow protection eliminates an entire class of vulnerabilities
- Mature ecosystem: OpenZeppelin, Slither, Mythril, Hardhat all support 0.8.19
- Largest developer pool — Solidity is the most widely used smart contract language
- Full compatibility with Besu 24.6.0 and all EVM targets

### Negative / Trade-offs
- Cannot use PUSH0 opcode features available in 0.8.20+ until Besu is upgraded
- Solidity's complexity surface is larger than Vyper's, increasing audit scope

### Compliance Impact
- Built-in overflow protection supports RA 10173 Sec. 14 (security safeguards)
- Mature audit tooling enables regular security reviews per DICT guidelines

## References

- [Solidity 0.8.19 Release Notes](https://github.com/ethereum/solidity/releases/tag/v0.8.19)
- [Besu EVM Compatibility](https://besu.hyperledger.org/private-networks/reference/solidity-opcodes/)
