# ADR-0006: Adapter Pattern for Blockchain Abstraction

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, Development Team, Enterprise Architecture |
| **Supersedes** | None |

## Context

The POC uses Hyperledger Besu, but production deployment may target:
- Hyperledger Fabric EVM (for agencies already on Fabric)
- Enterprise Besu with Tessera/Orion (for privacy requirements)
- Private Ethereum networks

Application code should not need to change when the underlying blockchain platform changes.

## Decision

We will use the **Adapter Pattern** with an abstract `ChainAdapter` interface that defines all blockchain operations. Concrete implementations (`BesuAdapter`, `FabricAdapter`, `ProductionAdapter`) handle platform-specific details.

Application code depends only on the `ChainAdapter` interface and injects the appropriate implementation at runtime based on configuration.

The interface covers:
- Connection management (`connect`, `disconnect`)
- Contract interactions (`callContract`, `sendTransaction`)
- Event subscriptions (`getPastEvents`, `subscribeToEvents`)
- Account operations (`getBalance`, `getNonce`, `isContract`)
- Block and transaction queries

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Direct ethers.js calls in application code** | Simple, no abstraction layer | Tightly couples application to ethers.js and Besu RPC | Migration requires rewriting all blockchain calls |
| **Repository pattern** | Familiar to enterprise developers | Designed for data access, not blockchain-specific operations | Does not capture blockchain concepts (events, gas, receipts) |
| **Adapter pattern (chosen)** | Clean separation, easy to swap implementations, testable | Adds abstraction layer, requires maintaining interface | Best balance of flexibility and maintainability |
| **Multi-chain SDK (web3.js + ethers.js)** | Supports multiple providers simultaneously | Increases bundle size, conflicting APIs | Unnecessary complexity for a single-platform-at-a-time deployment |

## Consequences

### Positive
- Swap blockchain platforms by changing configuration, not application code
- Each adapter encapsulates platform-specific details (gas models, retry logic, WebSocket handling)
- Easy to test — mock adapters can be injected for unit tests
- Clear migration path documented in `docs/portability-guide.md`

### Negative / Trade-offs
- Abstraction layer adds indirection — developers must understand both the interface and the implementation
- Interface must anticipate all required operations; adding new operations requires updating all adapters
- TypeScript adapter adds compilation step vs. plain JavaScript

### Compliance Impact
- Adapter pattern supports DICT DBS-005 (interoperability) by enabling migration between platforms
- No compliance impact — this is a purely architectural decision

## References

- [Adapter Pattern (Gang of Four)](https://en.wikipedia.org/wiki/Adapter_pattern)
- [Portability Guide](../portability-guide.md)
