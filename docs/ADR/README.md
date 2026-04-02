# Architecture Decision Records (ADR)

This directory contains the Architecture Decision Records for the Philippine Government Federated Blockchain POC.

## What is an ADR?

An Architecture Decision Record is a short document that captures:
- **What** decision was made
- **Why** it was made (context, constraints, trade-offs)
- **What** alternatives were considered
- **What** the consequences are

ADRs are immutable once accepted. If a decision changes, a new ADR supersedes the old one.

## Format

We follow the [Michael Nygard format](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions):

| Field | Description |
|-------|-------------|
| **Status** | `Proposed` → `Accepted` → `Superseded` → `Deprecated` |
| **Context** | What forces, constraints, and stakeholders influenced this decision? |
| **Decision** | What did we decide? (use "we will..." language) |
| **Consequences** | What are the resulting benefits and trade-offs? |

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](0001-blockchain-platform.md) | Use Hyperledger Besu as Blockchain Platform | Accepted |
| [0002](0002-consensus-mechanism.md) | Use QBFT Consensus for Permissioned Network | Accepted |
| [0003](0003-smart-contract-language.md) | Use Solidity 0.8.19 for Smart Contracts | Accepted |
| [0004](0004-access-control.md) | Role-Based Access Control with OpenZeppelin AccessControl | Accepted |
| [0005](0005-data-privacy.md) | Hash-Only Document Storage (No PII On-Chain) | Accepted |
| [0006](0006-adapter-pattern.md) | Adapter Pattern for Blockchain Abstraction | Accepted |
| [0007](0007-development-framework.md) | Use Hardhat as Development Framework | Accepted |
| [0008](0008-deployment-strategy.md) | Docker Compose for Local Network Orchestration | Accepted |
| [0009](0009-validator-topology.md) | Three-Validator Minimum Topology | Accepted |
| [0010](0010-audit-trail.md) | Immutable On-Chain Audit Trail | Accepted |
| [0011](0011-monitoring-stack.md) | Prometheus + Grafana for Monitoring | Accepted |
| [0012](0012-static-validators.md) | Static Validator Mode (Not Contract-Based) | Accepted |
| [0013](0013-configuration-strategy.md) | Environment-Based Configuration (No Hardcoded Values) | Accepted |

## Template

See [template.md](template.md) for the ADR template to use when creating new records.

## How to Add a New ADR

1. Copy `template.md` to a new file: `NNNN-short-title.md`
2. Fill in the fields following the format
3. Set status to `Proposed`
4. Submit for review
5. Once accepted, update status to `Accepted`
6. If superseding an existing ADR, update the old ADR's status to `Superseded by [NNNN](NNNN-title.md)`
