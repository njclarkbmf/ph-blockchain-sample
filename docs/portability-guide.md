# Portability Guide

## Overview

This guide details the migration paths from the POC implementation to production Hyperledger environments. The adapter pattern ensures minimal code changes during migration.

## Migration Paths

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Current: Besu POC                                  │
│                           - QBFT Consensus                                   │
│                           - BesuAdapter                                      │
│                           - Docker Compose                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │  Hyperledger      │ │  Enterprise     │ │  Private        │
        │  Fabric EVM       │ │  Besu           │ │  Ethereum       │
        └───────────────────┘ └─────────────────┘ └──────────────────┘
```

## Path 1: Hyperledger Fabric EVM

### Architecture Comparison

| Aspect | Besu POC | Fabric EVM |
|--------|----------|------------|
| Consensus | QBFT | Raft/Kafka |
| Identity | Ethereum addresses | Fabric MSP |
| Smart Contracts | Solidity | Solidity (EVM chaincode) |
| State DB | LevelDB/RocksDB | CouchDB |
| Network | P2P | Gossip |

### Migration Steps

#### Step 1: Environment Setup

```bash
# Install Fabric dependencies
npm install fabric-network fabric-ca-client

# Update package.json
{
  "dependencies": {
    "fabric-network": "^2.2.20",
    "fabric-ca-client": "^2.2.20"
  }
}
```

#### Step 2: Implement Fabric Adapter

```javascript
// src/adapters/FabricAdapter.js
const { Gateway, Wallets } = require('fabric-network');
const { ChainAdapter } = require('./ChainAdapter');

class FabricAdapter extends ChainAdapter {
    constructor(config) {
        super(config.peerUrl, config.channelId, config.networkName);
        this.config = config;
        this.gateway = null;
        this.network = null;
        this.contract = null;
    }

    async connect() {
        // Create wallet
        const wallet = await Wallets.newFileSystemWallet('./wallet');
        
        // Check if identity exists
        const identity = await wallet.get(this.config.identity);
        if (!identity) {
            throw new Error(`Identity ${this.config.identity} not found in wallet`);
        }

        // Connect to gateway
        this.gateway = new Gateway();
        await this.gateway.connect(this.config.connectionProfile, {
            wallet,
            identity: this.config.identity,
            discovery: { enabled: true, asLocalhost: false },
        });

        // Get network and contract
        this.network = await this.gateway.getNetwork(this.config.channelId);
        this.contract = this.network.getContract(this.config.chaincodeName);

        this.connected = true;
    }

    async callContract(contractAddress, abi, functionName, args) {
        // Evaluate transaction (read)
        const result = await this.contract.evaluateTransaction(
            functionName,
            ...args.map(a => JSON.stringify(a))
        );
        return JSON.parse(result.toString());
    }

    async sendTransaction(contractAddress, abi, functionName, args) {
        // Submit transaction (write)
        await this.contract.submitTransaction(
            functionName,
            ...args.map(a => JSON.stringify(a))
        );
        
        // Return mock receipt for compatibility
        return {
            status: 1,
            transactionHash: this.generateTxHash(),
        };
    }

    // ... implement other ChainAdapter methods
}

module.exports = { FabricAdapter };
```

#### Step 3: Update Configuration

```yaml
# fabric-config.yaml
name: "ph-gov-blockchain"
version: "1.0.0"
client:
  organization: "DICT"
  connection:
    timeout:
      peer:
        endorser: "300"
organizations:
  DICT:
    mspid: "DICTMSP"
    peers:
      - "peer0.dict.gov.ph"
    certificateAuthorities:
      - "ca.dict.gov.ph"
peers:
  peer0.dict.gov.ph:
    url: "grpcs://peer0.dict.gov.ph:7051"
    tlsCACerts:
      path: "./tls/peer.crt"
chaincodeName: "document-registry"
channelId: "gov-channel"
```

#### Step 4: Update Application Code

```javascript
// Before (Besu)
const { BesuAdapter } = require('./adapters/BesuAdapter');
const adapter = new BesuAdapter({
    rpcUrl: 'http://localhost:8545',
    chainId: 1981,
    privateKey: process.env.PRIVATE_KEY,
});

// After (Fabric)
const { FabricAdapter } = require('./adapters/FabricAdapter');
const adapter = new FabricAdapter({
    connectionProfile: './fabric-config.yaml',
    identity: 'admin@dict.gov.ph',
    channelId: 'gov-channel',
    chaincodeName: 'document-registry',
});

// Application code remains the same
await adapter.connect();
const result = await adapter.callContract(
    contractAddress,
    abi,
    'getDocument',
    [documentId]
);
```

#### Step 5: Migrate Smart Contracts

Fabric EVM uses Solidity but with some differences:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

// Import Fabric EVM compatibility layer
import "@hyperledger/fabric-evm/compat.sol";

contract DocumentRegistry is AccessControl, Pausable {
    // Fabric EVM uses different storage patterns
    // Use mapping instead of complex structs for better performance
    
    mapping(bytes32 => DocumentRecord) private _documents;
    
    // Fabric identity integration
    function getCallerMSP() internal view returns (string memory) {
        return FabricCompatibility.getMSPId();
    }
    
    // Rest of contract remains similar
}
```

### Fabric-Specific Considerations

#### Identity Management

```javascript
// Register agency with Fabric CA
const fabricCA = require('fabric-ca-client');

async function registerAgency(agencyName, agencyMSP) {
    const caClient = new fabricCA.Client({ url: 'https://ca.gov.ph:7054' });
    
    const adminIdentity = { credentials: adminCreds };
    const adminUser = await caClient.getUserContext('admin', true);
    
    // Register agency
    const secret = await caClient.register({
        enrollmentID: `agency-${agencyName}`,
        enrollmentSecret: '',
        role: 'peer',
        attributes: [
            { name: 'agency', value: agencyName },
            { name: 'role', value: 'agency' },
        ],
    }, adminUser);
    
    // Enroll agency
    const enrollment = await caClient.enroll({
        enrollmentID: `agency-${agencyName}`,
        enrollmentSecret: secret,
    });
    
    // Create identity
    const identity = {
        credentials: enrollment,
        mspId: agencyMSP,
        type: 'X.509',
    };
    
    return identity;
}
```

#### Chaincode Endorsement

```yaml
# endorsement-policy.yaml
Identities:
  - Principal: "DICTMSP.member"
  - Principal: "BIRMSP.member"
  - Principal: "NBIMSP.member"
Policy:
  "OR('DICTMSP.member', 'BIRMSP.member', 'NBIMSP.member')"
```

## Path 2: Enterprise Besu

### Architecture Comparison

| Aspect | Besu POC | Enterprise Besu |
|--------|----------|-----------------|
| Consensus | QBFT | QBFT/IBFT 2.0 |
| Privacy | None | Tessera/Orion |
| Identity | Ethereum addresses | CA-based |
| Deployment | Docker | Kubernetes |

### Migration Steps

#### Step 1: Enable Privacy (Tessera)

```yaml
# docker-compose.enterprise.yml
services:
  tessera:
    image: quorumengineering/tessera:23.1.0
    ports:
      - "9101:9101"
    volumes:
      - ./tessera:/config
    command: >
      -configfile /config/tessera-config.json

  validator1:
    image: hyperledger/besu:24.6.0
    environment:
      - PRIVACY_ENABLED=true
      - PRIVACY_URL=http://tessera:9101
      - PRIVACY_PUBLIC_KEY=/config/tessera/public_key
```

#### Step 2: Configure Tessera

```json
// tessera-config.json
{
  "useWhiteList": false,
  "jdbc": {
    "username": "tessera",
    "password": "password",
    "url": "jdbc:h2:./data/tessera;AUTO_RECONNECT=TRUE;DB_CLOSE_ON_EXIT=FALSE",
    "autoCreateTables": true
  },
  "serverConfigs": [
    {
      "app": "Q2T",
      "enabled": true,
      "serverAddress": "http://0.0.0.0:9101",
      "communicationType": "REST"
    },
    {
      "app": "P2P",
      "enabled": true,
      "serverAddress": "http://0.0.0.0:9102",
      "communicationType": "REST"
    }
  ],
  "peer": [
    {
      "url": "http://tessera2:9102"
    }
  ],
  "keys": {
    "passwords": [],
    "keyData": [
      {
        "privateKeyPath": "/config/tessera/key.key",
        "publicKeyPath": "/config/tessera/public_key"
      }
    ]
  },
  "alwaysSendTo": []
}
```

#### Step 3: Implement Privacy Groups

```javascript
// Create privacy group for agency
async function createPrivacyGroup(memberPublicKeys) {
    const response = await fetch('http://tessera:9101/privacygroup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Agency Privacy Group',
            description: 'Private transactions for agencies',
            members: memberPublicKeys,
        }),
    });
    
    const result = await response.json();
    return result.privacyGroupId;
}

// Send private transaction
async function sendPrivateTransaction(privacyGroupId, txData) {
    const response = await fetch('http://besu:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'priv_sendRawTransaction',
            params: [txData, privacyGroupId],
            id: 1,
        }),
    });
    
    return response.json();
}
```

#### Step 4: Configure CA-Based Authentication

```toml
# besu-enterprise.toml
# TLS Configuration
p2p-tls-enabled=true
p2p-tls-keystore-file="/etc/besu/tls/keystore.p12"
p2p-tls-keystore-password-file="/etc/besu/tls/password.txt"

# RPC Authentication
rpc-http-authentication-enabled=true
rpc-http-authentication-jwt-public-key-file="/etc/besu/auth/jwt_public_key.pem"

# Account Permissioning
permissions-accounts-config-file-enabled=true
permissions-accounts-config-file="/etc/besu/accounts.toml"
```

#### Step 5: Kubernetes Deployment

```yaml
# kubernetes/validator-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: validator1
spec:
  replicas: 1
  selector:
    matchLabels:
      app: validator
      id: "1"
  template:
    metadata:
      labels:
        app: validator
        id: "1"
    spec:
      containers:
        - name: besu
          image: hyperledger/besu:24.6.0
          ports:
            - containerPort: 8545
            - containerPort: 30303
          volumeMounts:
            - name: config
              mountPath: /etc/besu
            - name: data
              mountPath: /var/lib/besu
            - name: keys
              mountPath: /etc/besu/keys
              readOnly: true
          env:
            - name: PRIVACY_ENABLED
              value: "true"
            - name: PRIVACY_URL
              value: "http://tessera:9101"
      volumes:
        - name: config
          configMap:
            name: besu-config
        - name: data
          persistentVolumeClaim:
            claimName: besu-data-pvc
        - name: keys
          secret:
            secretName: besu-keys
```

## Path 3: Private Ethereum

### Migration Steps

#### Step 1: Update Consensus (if needed)

For Clique PoA:

```json
// genesis-clique.json
{
  "config": {
    "chainId": 1981,
    "clique": {
      "period": 5,
      "epoch": 30000
    }
  }
}
```

#### Step 2: Update Adapter

```javascript
// src/adapters/EthereumAdapter.js
const { BesuAdapter } = require('./BesuAdapter');

class EthereumAdapter extends BesuAdapter {
    // EthereumAdapter extends BesuAdapter since both use standard EVM
    // Override only if Ethereum-specific behavior needed
    
    async getNetworkInfo() {
        const info = await super.getNetworkInfo();
        
        // Add Ethereum-specific metrics
        info.difficulty = await this.provider.send('eth_getDifficulty', []);
        
        return info;
    }
}

module.exports = { EthereumAdapter };
```

## Adapter Selection

```javascript
// src/adapters/index.js
const { BesuAdapter } = require('./BesuAdapter');
const { ProductionAdapter } = require('./ProductionAdapter');

function createAdapter(environment) {
    switch (environment) {
        case 'development':
        case 'poc':
            return new BesuAdapter({
                rpcUrl: process.env.BESU_RPC_URL,
                chainId: parseInt(process.env.CHAIN_ID),
                privateKey: process.env.DEPLOYER_PRIVATE_KEY,
            });
            
        case 'fabric':
            const { FabricAdapter } = require('./FabricAdapter');
            return new FabricAdapter({
                connectionProfile: process.env.FABRIC_CONNECTION_PROFILE,
                identity: process.env.FABRIC_IDENTITY,
                channelId: process.env.FABRIC_CHANNEL_ID,
                chaincodeName: process.env.FABRIC_CHAINCODE_NAME,
            });
            
        case 'enterprise-besu':
            return new ProductionAdapter({
                rpcUrl: process.env.ENTERPRISE_RPC_URL,
                privacyEnabled: true,
                tesseraUrl: process.env.TESSERA_URL,
                caEnabled: true,
            });
            
        case 'production':
            return new ProductionAdapter({
                rpcUrl: process.env.PRODUCTION_RPC_URL,
                hsmEnabled: true,
                auditLogEnabled: true,
            });
            
        default:
            throw new Error(`Unknown environment: ${environment}`);
    }
}

module.exports = { createAdapter };
```

## Migration Checklist

### Pre-Migration

- [ ] Backup all data and configurations
- [ ] Document current contract addresses
- [ ] Test migration in staging environment
- [ ] Prepare rollback plan
- [ ] Notify all agencies of maintenance window

### During Migration

- [ ] Stop all transactions
- [ ] Export current state
- [ ] Deploy new infrastructure
- [ ] Import state to new environment
- [ ] Verify contract functionality
- [ ] Run verification tests

### Post-Migration

- [ ] Verify all agencies can connect
- [ ] Confirm audit logs are working
- [ ] Test document registration
- [ ] Validate access control
- [ ] Monitor for 24 hours
- [ ] Document lessons learned

## Compatibility Matrix

| Feature | Besu POC | Fabric EVM | Enterprise Besu | Private Ethereum |
|---------|----------|------------|-----------------|------------------|
| Smart Contracts | ✅ | ✅ | ✅ | ✅ |
| QBFT Consensus | ✅ | ❌ | ✅ | ❌ |
| Privacy Groups | ❌ | ✅ | ✅ | ❌ |
| CA Identity | ❌ | ✅ | ✅ | ❌ |
| HSM Support | ⚠️ | ✅ | ✅ | ✅ |
| Kubernetes | ⚠️ | ✅ | ✅ | ✅ |
| Audit Trail | ✅ | ✅ | ✅ | ✅ |

## Support Contacts

- **DICT Blockchain Team**: blockchain@dict.gov.ph
- **Technical Documentation**: /docs
- **Migration Support**: migration-support@dict.gov.ph
