# Architecture Documentation

## Overview

The Philippine Government Federated Blockchain is a permissioned blockchain network built on Hyperledger Besu with QBFT consensus. It enables secure, auditable document sharing across government agencies while maintaining compliance with RA 10173 (Data Privacy Act) and DICT guidelines.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Philippine Government Federated Blockchain            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │  Validator 1 │  │  Validator 2 │  │  Validator 3 │                       │
│  │   (DICT)     │  │   (BIR)      │  │   (NBI)      │                       │
│  │   QBFT       │  │   QBFT       │  │   QBFT       │                       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                       │
│         │                 │                 │                                │
│         └─────────────────┼─────────────────┘                                │
│                           │                                                  │
│                    ┌──────▼───────┐                                          │
│                    │   QBFT       │                                          │
│                    │  Consensus   │                                          │
│                    └──────┬───────┘                                          │
│                           │                                                  │
│         ┌─────────────────┼─────────────────┐                                │
│         │                 │                 │                                │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐                       │
│  │   Observer   │  │  Bootnode    │  │   RPC        │                       │
│  │   (DOH)      │  │  Discovery   │  │  Gateway     │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                           Smart Contract Layer                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  AccessManager  │  │ DocumentRegistry│  │    AuditLog     │              │
│  │  - Role Mgmt    │  │  - Doc Hashes   │  │  - Audit Trail  │              │
│  │  - Permissions  │  │  - Access Ctrl  │  │  - Compliance   │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
├─────────────────────────────────────────────────────────────────────────────┤
│                           Application Layer                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  ChainAdapter   │  │  BesuAdapter    │  │ ProductionAdapter│             │
│  │  (Interface)    │  │  (POC/Dev)      │  │  (Enterprise)   │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Blockchain Network

#### Consensus: QBFT (Quorum Byzantine Fault Tolerance)
- **Block Time**: 5 seconds
- **Finality**: Immediate (no forks)
- **Validator Count**: Minimum 4 for BFT (2f+1 where f=1)
- **Fault Tolerance**: Up to 1 malicious validator

#### Node Types
| Type | Count | Purpose | Ports |
|------|-------|---------|-------|
| Validator | 3 | Consensus, block production | 8545, 30303, 9545 |
| Observer | 1 | Read-only, redundancy | 8545, 8547 |
| Bootnode | 1 | Peer discovery | 30303 |

### 2. Smart Contracts

#### AccessManager
Role-based access control for government agencies.

**Roles:**
- `ADMIN_ROLE` - DICT (system administration)
- `AGENCY_ROLE` - Government agencies (BIR, NBI, DOH, etc.)
- `AUDITOR_ROLE` - COA, Ombudsman (compliance auditing)
- `OPERATOR_ROLE` - Network operators

**Key Functions:**
- `registerAgency()` - Register new agency
- `suspendAgency()` - Suspend non-compliant agency
- `grantAuditorRole()` - Grant audit access

#### DocumentRegistry
Immutable document hash registry.

**Features:**
- Store document hashes (SHA-256/Keccak-256)
- Off-chain metadata pointers (IPFS)
- Inter-agency access control
- Document versioning

**Key Functions:**
- `registerDocument()` - Register document hash
- `grantAccess()` - Share with other agency
- `updateDocument()` - Create new version

#### AuditLog
Immutable audit trail for compliance.

**Categories:**
- `DOCUMENT` - Document operations
- `ACCESS` - Access control events
- `SYSTEM` - System administration
- `COMPLIANCE` - Compliance actions
- `SECURITY` - Security events

**Key Functions:**
- `logAction()` - Record audit entry
- `getAgencyLogs()` - Query by agency
- `generateComplianceReport()` - Generate report

### 3. Adapter Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Code                          │
├─────────────────────────────────────────────────────────────┤
│                     ChainAdapter                             │
│                   (Abstract Interface)                       │
├─────────────────────────────────────────────────────────────┤
│            │                        │                        │
│            ▼                        ▼                        │
│    ┌───────────────┐        ┌───────────────┐               │
│    │ BesuAdapter   │        │ProductionAdapter│              │
│    │ (POC/Dev)     │        │ (Enterprise)   │               │
│    │ - ethers.js   │        │ - Fabric EVM   │               │
│    │ - QBFT        │        │ - HSM          │               │
│    └───────────────┘        └───────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Document Registration Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Agency  │────▶│  Adapter │────▶│Contract  │────▶│  Besu    │
│  App     │     │          │     │Registry  │     │  Node    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │ 1. Hash doc    │                │                │
     │    (SHA-256)   │                │                │
     │                │                │                │
     │ 2. registerDoc │                │                │
     │                │ 3. TX sign     │                │
     │                │    & send      │                │
     │                │                │ 4. Validate    │
     │                │                │    & execute   │
     │                │                │                │
     │                │                │ 5. Emit event  │
     │                │                │                │
     │                │ 6. Receipt     │                │
     │                │    + logs      │                │
     │                │                │                │
     │ 7. Store TX    │                │                │
     │    hash +      │                │                │
     │    document ID │                │                │
     ▼                ▼                ▼                ▼
```

### Inter-Agency Access Flow

```
┌──────────┐                              ┌──────────┐
│  Agency A│                              │  Agency B│
│  (Owner) │                              │(Requester)│
└────┬─────┘                              └────┬─────┘
     │                                         │
     │ 1. Grant access via                    │
     │    DocumentRegistry                    │
     │                                         │
     │ 2. Event emitted                        │
     │    (AccessGranted)                     │
     │                                         │
     │                                         │ 3. Query
     │                                         │    document
     │                                         │    metadata
     │                                         │
     │                                         │ 4. Verify
     │                                         │    access
     │                                         │    on-chain
     │                                         │
     │                                         │ 5. Request
     │                                         │    document
     │                                         │    from Agency A
     │                                         │    (off-chain)
     ▼                                         ▼
```

## Security Architecture

### Key Management

```
┌─────────────────────────────────────────────────────────────┐
│                      Key Hierarchy                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐                                        │
│  │   Root CA       │  (DICT - Offline, HSM)                │
│  └────────┬────────┘                                        │
│           │                                                  │
│  ┌────────▼────────┐                                        │
│  │  Intermediate   │  (Per-agency CA)                       │
│  │      CA         │                                        │
│  └────────┬────────┘                                        │
│           │                                                  │
│  ┌────────▼────────┐                                        │
│  │   Node Keys     │  (Besu node identity)                  │
│  │   Account Keys  │  (Transaction signing)                 │
│  └─────────────────┘                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Network Security

| Layer | Control | Implementation |
|-------|---------|----------------|
| P2P | Node permissioning | Enode allowlist |
| RPC | Authentication | JWT tokens |
| Transport | Encryption | TLS 1.3 |
| Account | Permissioning | Address allowlist |

### Data Protection

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Document content | Off-chain (agency storage) | Agency encryption |
| Document hash | On-chain | Immutable |
| Metadata pointer | On-chain | IPFS hash |
| PII | NEVER stored | N/A |
| Audit logs | On-chain | Immutable |

## Compliance Mapping

### RA 10173 (Data Privacy Act)

| Requirement | Implementation |
|-------------|----------------|
| Data minimization | Only hashes stored on-chain |
| Purpose limitation | Document type classification |
| Storage limitation | Off-chain data retention policies |
| Security safeguards | Permissioned network, encryption |
| Accountability | Immutable audit trail |

### DICT Guidelines

| Requirement | Implementation |
|-------------|----------------|
| Inter-agency sharing | Access control contracts |
| Audit trail | AuditLog contract |
| System availability | Multi-validator consensus |
| Incident response | Pause functionality |

### COA Requirements

| Requirement | Implementation |
|-------------|----------------|
| Transaction trail | All operations logged |
| Document integrity | Cryptographic hashes |
| Access logging | All queries logged |
| Report generation | Compliance report functions |

## Scalability Considerations

### Current Capacity
- **TPS**: ~100-500 (permissioned network)
- **Block time**: 5 seconds
- **Block gas limit**: 44M gas

### Scaling Options

1. **Horizontal**: Add observer nodes for read scaling
2. **Vertical**: Increase validator resources
3. **Sharding**: Future - partition by agency type
4. **Layer 2**: Future - state channels for high-frequency ops

## Monitoring

### Metrics (Prometheus)
- Block height
- Peer count
- Transaction pool size
- Gas usage
- JVM metrics

### Alerts
- Node down
- Consensus issues
- High transaction rejection
- Resource exhaustion

### Dashboards (Grafana)
- Network overview
- Validator performance
- Transaction analytics
- Compliance metrics
