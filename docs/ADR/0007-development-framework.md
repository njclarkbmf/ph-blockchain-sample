# ADR-0007: Use Hardhat as Development Framework

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, Development Team |
| **Supersedes** | None |

## Context

The development team needs a framework that:
- Compiles Solidity 0.8.19 contracts
- Runs local blockchain for testing
- Supports TypeScript configuration
- Has plugin ecosystem for verification, gas reporting, coverage
- Integrates with ethers.js v6
- Is actively maintained and widely adopted

## Decision

We will use **Hardhat** (v2.20.1) with the `@nomicfoundation/hardhat-toolbox` meta-plugin.

Hardhat provides compilation, local blockchain (Hardhat Network), testing, deployment scripting, and a rich plugin ecosystem. The `hardhat-toolbox` bundles ethers, chai matchers, gas reporter, solidity-coverage, and TypeChain in a single dependency.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Truffle / Ganache** | Mature, large existing codebase | Truffle discontinued (Consensys sunset 2023), Ganache maintenance mode | No longer actively developed; Hardhat is the industry standard |
| **Foundry** | Fast (Rust-based), Solidity-native testing | Testing in Solidity (not JavaScript), smaller JS ecosystem integration | Team expertise is in JavaScript/TypeScript; Hardhat has better JS tooling |
| **Brownie** | Python-based, good for data science teams | Python-only, smaller community, less active development | Team uses TypeScript; Hardhat has native TS support |
| **Hardhat (chosen)** | Industry standard, excellent TS support, rich plugin ecosystem, active development | Slower than Foundry for large test suites | Best fit for team skills and enterprise requirements |

## Consequences

### Positive
- Industry-standard tooling — most Solidity developers are familiar with Hardhat
- TypeScript-first configuration with full type safety
- Hardhat Network provides fast, forkable local testing
- Plugin ecosystem: verification, gas reporting, coverage, TypeChain bindings
- Excellent error messages and stack traces

### Negative / Trade-offs
- Hardhat Network is not Besu — subtle behavioral differences may exist (gas calculation, opcode behavior)
- Slower test execution than Foundry for very large test suites
- Requires Node.js runtime — adds dependency for CI/CD pipelines

### Compliance Impact
- No direct compliance impact. Indirectly supports compliance through better testing and verification tooling.

## References

- [Hardhat Documentation](https://hardhat.org/docs)
- [Hardhat vs Foundry Comparison](https://hardhat.org/hardhat-runner/docs/other-guides/hardhat-vs-foundry)
