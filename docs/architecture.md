# Architecture Documentation

## Overview

The Philippine Government Federated Blockchain is a permissioned blockchain network built on Hyperledger Besu with QBFT consensus. It enables secure, auditable document sharing across government agencies while maintaining compliance with RA 10173 (Data Privacy Act) and DICT guidelines.

## System Architecture

![Three-tier permissioned blockchain showing DICT, BIR, and NBI as QBFT validator nodes converging on consensus, with DOH as a read-only observer, underpinned by AccessManager, DocumentRegistry, and AuditLog smart contracts, and surfaced to agency applications through the ChainAdapter abstraction layer](../img/system_architecture_ph_blockchain.svg)


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

![Adapter pattern isolating agency application code from blockchain implementation details via a ChainAdapter abstract interface, with BesuAdapter targeting Hyperledger Besu over ethers.js for POC environments and ProductionAdapter integrating HSM-backed signing for enterprise deployment](../img/adapter_pattern.svg)

## Data Flow

### Document Registration Flow

![Seven-step document registration sequence where an agency application SHA-256 hashes a document locally, submits it through the adapter as a signed transaction, the DocumentRegistry smart contract validates and stores the hash on-chain, emits an event, and returns the transaction receipt and document ID to the originating agency](../img/document_registration_flow.svg)

### Inter-Agency Access Flow

![Five-step inter-agency access sequence where Agency A grants access via the DocumentRegistry smart contract triggering an AccessGranted event, after which Agency B queries document metadata on-chain, verifies access permissions, and retrieves the actual document directly from Agency A through a secured off-chain channel](../img/inter_agency_access_flow.svg)

## Security Architecture

### Key Management

![Three-tier PKI hierarchy anchored by a DICT-controlled offline Root CA stored in HSM, delegating to per-agency Intermediate CAs, which in turn issue Besu node identity keys for peer authentication and account keys for transaction signing at the operational layer](../img/key_management_hierarchy.svg)

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
