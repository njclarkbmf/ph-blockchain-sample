# Compliance Documentation

## Overview

This document outlines the compliance framework for the Philippine Government Federated Blockchain, addressing regulatory requirements from RA 10173 (Data Privacy Act), DICT guidelines, and COA audit requirements.

## Regulatory Framework

### Agency Role Mapping

| Role | Agency | Smart Contract Role | Permissions |
|------|--------|--------------------|-------------|
| **ADMIN** | DICT (Dept. of Information & Communications Technology) | `ADMIN_ROLE` + `DEFAULT_ADMIN_ROLE` | System administration, agency registration, pause/unpause, contract upgrades |
| **AGENCY** | BIR (Bureau of Internal Revenue), NBI (National Bureau of Investigation), DOH (Dept. of Health) | `AGENCY_ROLE` | Document registration, access sharing, document versioning |
| **AUDITOR** | COA (Commission on Audit), Office of the Ombudsman | `AUDITOR_ROLE` | Read-only audit access, compliance report generation, log querying |
| **OPERATOR** | Network operators | `OPERATOR_ROLE` | Node operations, monitoring, non-administrative tasks |
| **SYSTEM** | System processes | `SYSTEM_ROLE` | Internal system operations (AuditLog only) |

### RA 10173 - Data Privacy Act of 2012

#### Key Requirements

| Section | Requirement | Implementation |
|---------|-------------|----------------|
| Sec. 11 | Data minimization | Only document hashes stored on-chain |
| Sec. 12 | Purpose limitation | Document type classification enforced |
| Sec. 13 | Storage limitation | Off-chain data retention policies |
| Sec. 14 | Security safeguards | Permissioned network, encryption |
| Sec. 15 | Accountability | Immutable audit trail |
| Sec. 16 | Data subject rights | Off-chain data access procedures |

#### Implementation Details

**Data Minimization (Sec. 11)**

```solidity
// DocumentRegistry.sol - Only hashes stored
struct DocumentRecord {
    bytes32 documentHash;      // SHA-256 hash only
    bytes32 metadataHash;      // IPFS pointer hash
    // NO document content stored
    // NO PII stored
}
```

**Security Safeguards (Sec. 14)**

```toml
# permission-config.toml
[Node]
enabled=true
allowlist=[
  "enode://validator1@dict.gov.ph:30303",
  "enode://validator2@bir.gov.ph:30303",
  "enode://validator3@nbi.gov.ph:30303"
]

[Account]
enabled=true
allowlist=[
  "0xDICT_ADMIN_ADDRESS",
  "0xBIR_AGENCY_ADDRESS",
  "0xNBI_AGENCY_ADDRESS"
]
```

### DICT Guidelines for Government Blockchain

#### Technical Standards

| Standard | Requirement | Status |
|----------|-------------|--------|
| DBS-001 | Permissioned network | ✅ Implemented |
| DBS-002 | Audit logging | ✅ Implemented |
| DBS-003 | Key management | ✅ HSM support |
| DBS-004 | Data residency | ✅ Philippines-only |
| DBS-005 | Interoperability | ✅ EVM compatible |

#### Agency Onboarding

```javascript
// Agency registration process
async function onboardAgency(agencyDetails) {
    // 1. Verify agency authorization
    const authorization = await verifyAgencyAuthorization(
        agencyDetails.name,
        agencyDetails.mandate
    );
    
    // 2. Generate agency identity
    const identity = await generateAgencyIdentity(agencyDetails);
    
    // 3. Register on blockchain
    await accessManager.registerAgency(
        ethers.keccak256(ethers.toUtf8Bytes(agencyDetails.id)),
        identity.address,
        ethers.keccak256(ethers.toUtf8Bytes(identity.metadataUri))
    );
    
    // 4. Log onboarding
    await auditLog.logComplianceAction(
        ethers.keccak256(ethers.toUtf8Bytes("DICT")),
        "AGENCY_ONBOARDED",
        ethers.keccak256(ethers.toUtf8Bytes(agencyDetails.id)),
        ethers.keccak256(JSON.stringify(agencyDetails))
    );
    
    return identity;
}
```

### COA Audit Requirements

#### Audit Trail Requirements

| Requirement | Implementation | Verification |
|-------------|----------------|--------------|
| Transaction logging | All operations logged | AuditLog contract |
| Document integrity | Cryptographic hashes | SHA-256/Keccak |
| Access logging | All queries logged | Event emissions |
| Report generation | Compliance reports | generateComplianceReport() |
| Retention (10 years) | Immutable blockchain | Consensus guarantee |

#### Audit Query Interface

```javascript
// Generate compliance report for COA
async function generateCOAReport(startTime, endTime, agencyId) {
    const auditLog = await getAuditLogContract();
    
    // Get all events in time range
    const events = await auditLog.getLogsByTimeRange(startTime, endTime);
    
    // Filter by agency if specified
    const agencyEvents = agencyId 
        ? await auditLog.getAgencyLogs(agencyId)
        : events;
    
    // Generate report hash
    const reportData = {
        period: { start: startTime, end: endTime },
        agency: agencyId || "ALL",
        eventCount: agencyEvents.length,
        generatedAt: Date.now(),
        generatedBy: "COA_AUDITOR",
    };
    
    const reportHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(reportData))
    );
    
    // Log report generation
    await auditLog.generateComplianceReport(
        ethers.keccak256(ethers.toUtf8Bytes("COA")),
        startTime,
        endTime,
        reportHash
    );
    
    return {
        ...reportData,
        hash: reportHash,
        events: agencyEvents,
    };
}
```

## Data Protection

### Data Classification

| Classification | On-Chain | Off-Chain | Encryption |
|----------------|----------|-----------|------------|
| Public | Hash only | Full document | None |
| Internal | Hash + metadata | Full document | Agency encryption |
| Confidential | Hash only | Encrypted storage | AES-256 |
| Restricted | Hash only | HSM storage | HSM encryption |

### PII Handling

**NEVER Store On-Chain:**
- Names
- Addresses
- ID numbers (SSS, TIN, Passport)
- Contact information
- Biometric data

**Off-Chain Storage:**

```javascript
// Off-chain document storage with PII
class SecureDocumentStorage {
    constructor() {
        this.encryptionKey = process.env.DOCUMENT_ENCRYPTION_KEY;
        this.storageUrl = process.env.SECURE_STORAGE_URL;
    }
    
    async storeDocument(document, metadata) {
        // Remove PII from metadata
        const sanitizedMetadata = this.sanitizeMetadata(metadata);
        
        // Encrypt document
        const encrypted = await this.encrypt(document);
        
        // Store in secure storage
        const storageId = await this.upload(encrypted);
        
        // Return only hash and pointer
        return {
            hash: ethers.keccak256(document),
            metadataHash: ethers.keccak256(
                ethers.toUtf8Bytes(JSON.stringify(sanitizedMetadata))
            ),
            storagePointer: `secure://${storageId}`,
        };
    }
    
    sanitizeMetadata(metadata) {
        // Remove PII fields
        const { name, address, idNumber, ...safe } = metadata;
        return safe;
    }
}
```

## Key Management

### Key Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    Key Management Hierarchy                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Level 1: Root CA                                           │
│  - Stored offline in HSM                                    │
│  - DICT custody                                             │
│  - Annual rotation                                          │
│                                                              │
│  Level 2: Agency CA                                         │
│  - Stored in agency HSM                                     │
│  - Per-agency custody                                       │
│  - Semi-annual rotation                                     │
│                                                              │
│  Level 3: Node Keys                                         │
│  - Stored in secure vault                                   │
│  - Node operator custody                                    │
│  - Quarterly rotation                                       │
│                                                              │
│  Level 4: Account Keys                                      │
│  - Stored in encrypted wallet                               │
│  - User custody                                             │
│  - Monthly rotation recommended                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Rotation Policy

```bash
#!/bin/bash
# scripts/rotate-keys.sh

# Key rotation schedule
declare -A ROTATION_SCHEDULE=(
    ["root_ca"]="365"
    ["agency_ca"]="180"
    ["node_key"]="90"
    ["account_key"]="30"
)

rotate_key() {
    local key_type=$1
    local key_id=$2
    
    # Generate new key
    openssl genrsa -out "${key_id}_new.key" 4096
    
    # Create CSR
    openssl req -new -key "${key_id}_new.key" \
        -out "${key_id}_new.csr"
    
    # Sign with parent CA
    # ... signing process ...
    
    # Backup old key
    mv "${key_id}.key" "${key_id}_old_$(date +%Y%m%d).key"
    
    # Activate new key
    mv "${key_id}_new.key" "${key_id}.key"
    
    # Log rotation
    echo "$(date): Rotated ${key_type} key ${key_id}" >> /var/log/key-rotation.log
}
```

## Audit Procedures

### Regular Audits

| Audit Type | Frequency | Auditor | Scope |
|------------|-----------|---------|-------|
| Internal | Monthly | Agency IT | Access logs |
| External | Quarterly | COA | Full system |
| Security | Semi-annual | Third-party | Penetration test |
| Compliance | Annual | DICT | Regulatory |

### Audit Log Structure

```solidity
// AuditLog.sol - Event structure
event AuditEntry(
    bytes32 indexed agencyId,    // Which agency
    string indexed action,       // What action
    uint256 timestamp,           // When
    bytes32 hash,                // Evidence hash
    bytes32 entryId,             // Unique ID
    address indexed actor,       // Who
    string resourceType,         // What type
    bytes32 resourceId           // Which resource
);
```

### Audit Query Examples

```javascript
// Query all document registrations by agency
async function getAgencyDocumentRegistrations(agencyId, startTime, endTime) {
    const auditLog = await getAuditLogContract();
    
    const events = await auditLog.getPastEvents('AuditEntry', {
        filter: {
            agencyId: agencyId,
            action: 'DOCUMENT_REGISTERED',
        },
        fromBlock: await getBlockByTime(startTime),
        toBlock: await getBlockByTime(endTime),
    });
    
    return events.map(e => ({
        timestamp: e.args.timestamp,
        documentId: e.args.resourceId,
        actor: e.args.actor,
        txHash: e.transactionHash,
    }));
}

// Query all access grants
async function getAllAccessGrants(startTime, endTime) {
    const auditLog = await getAuditLogContract();
    
    const events = await auditLog.getPastEvents('AccessGranted', {
        fromBlock: await getBlockByTime(startTime),
        toBlock: await getBlockByTime(endTime),
    });
    
    return events.map(e => ({
        timestamp: e.args.timestamp,
        documentId: e.args.documentId,
        grantedTo: e.args.agencyId,
        txHash: e.transactionHash,
    }));
}
```

## Incident Response

### Security Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Key compromise, consensus failure | Immediate |
| High | Unauthorized access attempt | 1 hour |
| Medium | Policy violation | 24 hours |
| Low | Minor configuration issue | 7 days |

### Incident Response Procedure

```javascript
// Incident response smart contract functions
async function handleKeyCompromise(compromisedAddress) {
    const accessManager = await getAccessManagerContract();
    const auditLog = await getAuditLogContract();
    
    // 1. Pause system if critical
    await accessManager.pause();
    
    // 2. Revoke all roles
    const roles = [ADMIN_ROLE, AGENCY_ROLE, AUDITOR_ROLE];
    for (const role of roles) {
        if (await accessManager.hasRole(role, compromisedAddress)) {
            await accessManager.revokeRole(
                role,
                compromisedAddress,
                ethers.keccak256(ethers.toUtf8Bytes("INCIDENT_RESPONSE"))
            );
        }
    }
    
    // 3. Log incident
    await auditLog.logSecurityEvent(
        ethers.keccak256(ethers.toUtf8Bytes("DICT")),
        "KEY_COMPROMISE_RESPONSE",
        ethers.keccak256(ethers.toUtf8Bytes(compromisedAddress)),
        ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            timestamp: Date.now(),
            action: "KEY_REVOKED",
            reason: "SECURITY_INCIDENT",
        })))
    );
    
    // 4. Notify agencies (off-chain)
    await notifyAgencies({
        type: "SECURITY_ALERT",
        severity: "CRITICAL",
        action: "KEY_COMPROMISE",
        address: compromisedAddress,
    });
}
```

## Compliance Reporting

### Monthly Compliance Report

```javascript
// Generate monthly compliance report
async function generateMonthlyReport(year, month) {
    const startTime = new Date(year, month - 1, 1).getTime() / 1000;
    const endTime = new Date(year, month, 0).getTime() / 1000;
    
    const report = {
        period: `${year}-${String(month).padStart(2, '0')}`,
        generatedAt: new Date().toISOString(),
        
        // Network statistics
        network: {
            totalBlocks: await getBlockCount(startTime, endTime),
            totalTransactions: await getTransactionCount(startTime, endTime),
            activeValidators: await getValidatorCount(),
            uptime: await calculateUptime(startTime, endTime),
        },
        
        // Agency statistics
        agencies: {
            totalRegistered: await getAgencyCount(),
            newRegistrations: await getNewAgencies(startTime, endTime),
            suspended: await getSuspendedAgencies(),
        },
        
        // Document statistics
        documents: {
            totalRegistered: await getDocumentCount(startTime, endTime),
            byType: await getDocumentsByType(startTime, endTime),
            accessGrants: await getAccessGrantCount(startTime, endTime),
        },
        
        // Compliance metrics
        compliance: {
            auditEventsLogged: await getAuditEventCount(startTime, endTime),
            policyViolations: await getPolicyViolations(startTime, endTime),
            securityIncidents: await getSecurityIncidents(startTime, endTime),
        },
    };
    
    return report;
}
```

## Regulatory Contacts

| Agency | Contact | Purpose |
|--------|---------|---------|
| DICT | blockchain@dict.gov.ph | Technical oversight |
| NPC | compliance@privacy.gov.ph | Data privacy |
| COA | ict@coa.gov.ph | Audit requirements |
| Ombudsman | ict@ombudsman.gov.ph | Investigation access |

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-01-01 | DICT | Initial release |
| 1.1 | 2024-06-01 | DICT | Added key management |

## Approval

This compliance documentation is approved by:

- **DICT Undersecretary for ICT Policy**
- **National Privacy Commission Representative**
- **Commission on Audit Representative**

Date: _______________
