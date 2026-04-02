# Deployment Guide

## Overview

This guide covers deployment procedures for the Philippine Government Federated Blockchain across different environments.

## Deployment Environments

| Environment | Purpose | Network | Validators |
|-------------|---------|---------|------------|
| Development | Local testing | hardhat | N/A |
| POC | Agency demos | besuLocal | 3 |
| Staging | Pre-production | besuStaging | 4 |
| Production | Live operations | besuProduction | 5+ |

## Pre-Deployment Checklist

### Security

- [ ] Private keys stored in secure vault (NOT in .env for production)
- [ ] TLS certificates generated and validated
- [ ] Firewall rules configured
- [ ] API authentication enabled
- [ ] Host allowlist configured

### Infrastructure

- [ ] Server resources meet requirements
- [ ] Network connectivity verified
- [ ] DNS records configured
- [ ] Load balancer configured (production)
- [ ] Backup systems ready

### Compliance

- [ ] Data residency verified (Philippines)
- [ ] Audit logging enabled
- [ ] Retention policies configured
- [ ] Access control documented

## POC Deployment

### Step 1: Prepare Environment

```bash
# Install dependencies
npm install

# Copy environment
cp .env.example .env

# Configure for POC
cat > .env << EOF
BESU_RPC_URL=http://localhost:8545
CHAIN_ID=1981
DEPLOYER_PRIVATE_KEY=0x$(openssl rand -hex 32)
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 12)
EOF
```

### Step 2: Generate Network

```bash
chmod +x scripts/network/setup_qbft.sh

./scripts/network/setup_qbft.sh \
  --nodes 3 \
  --observers 1 \
  --chain-id 1981 \
  --block-time 5
```

### Step 3: Start Network

```bash
cd docker
docker compose up -d

# Wait for network to stabilize
sleep 30

# Verify network
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Step 4: Deploy Contracts

```bash
cd ..

# Deploy to POC network
npx hardhat run scripts/deploy/01_deploy_core.js --network besuLocal

# Verify deployment
npx hardhat run scripts/utils/verify_deployment.js --network besuLocal
```

### Step 5: Register Agencies

```javascript
// scripts/register-agencies.js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
    const deployments = JSON.parse(
        fs.readFileSync("deployed-addresses.json")
    ).besuLocal;
    
    const AccessManager = await hre.ethers.getContractFactory("AccessManager");
    const accessManager = AccessManager.attach(deployments.accessManager);
    
    const [admin] = await hre.ethers.getSigners();
    
    // Register agencies
    const agencies = [
        { id: "BIR-001", address: "0x...", metadata: "ipfs://QmBIR" },
        { id: "NBI-001", address: "0x...", metadata: "ipfs://QmNBI" },
        { id: "DOH-001", address: "0x...", metadata: "ipfs://QmDOH" },
    ];
    
    for (const agency of agencies) {
        await accessManager.connect(admin).registerAgency(
            hre.ethers.keccak256(hre.ethers.toUtf8Bytes(agency.id)),
            agency.address,
            hre.ethers.keccak256(hre.ethers.toUtf8Bytes(agency.metadata))
        );
        console.log(`Registered ${agency.id}`);
    }
}

main();
```

```bash
npx hardhat run scripts/register-agencies.js --network besuLocal
```

## Production Deployment

### Architecture

```
                         ┌─────────────────┐
                         │   Load Balancer │
                         │   (nginx/HAProxy)│
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
       ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
       │  Validator 1│     │  Validator 2│     │  Validator 3│
       │   (DICT)    │     │   (BIR)     │     │   (NBI)    │
       │  10.0.1.10  │     │  10.0.1.11  │     │  10.0.1.12 │
       └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
       ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
       │  Validator 4│     │  Validator 5│     │  Observer   │
       │   (DOH)     │     │   (COA)     │     │  (Read)     │
       │  10.0.1.13  │     │  10.0.1.14  │     │  10.0.1.20  │
       └─────────────┘     └─────────────┘     └─────────────┘
```

### Step 1: Infrastructure Setup

#### Server Configuration

```yaml
# ansible/production.yml
all:
  children:
    validators:
      hosts:
        validator1:
          ansible_host: 10.0.1.10
          agency: DICT
          role: validator
        validator2:
          ansible_host: 10.0.1.11
          agency: BIR
          role: validator
        validator3:
          ansible_host: 10.0.1.12
          agency: NBI
          role: validator
        validator4:
          ansible_host: 10.0.1.13
          agency: DOH
          role: validator
        validator5:
          ansible_host: 10.0.1.14
          agency: COA
          role: validator
    observers:
      hosts:
        observer1:
          ansible_host: 10.0.1.20
          agency: Public
          role: observer
```

### Step 2: Security Configuration

#### TLS Certificates

```bash
# Generate CA (offline, secure location)
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/C=PH/ST=Metro Manila/L=Manila/O=DICT/CN=PH Gov Blockchain CA"

# Generate server certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/C=PH/ST=Metro Manila/L=Manila/O=DICT/CN=validator1.blockchain.gov.ph"

# Sign certificate
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt
```

#### Firewall Rules

```bash
# Allow P2P traffic (inter-validator)
iptables -A INPUT -p tcp --dport 30303 -s 10.0.1.0/24 -j ACCEPT

# Allow RPC from load balancer
iptables -A INPUT -p tcp --dport 8545 -s 10.0.0.10 -j ACCEPT

# Allow metrics from monitoring
iptables -A INPUT -p tcp --dport 9545 -s 10.0.2.0/24 -j ACCEPT

# Drop all other incoming
iptables -A INPUT -j DROP
```

### Step 3: Deploy Nodes

```bash
# Copy configuration to all nodes
ansible-playbook -i ansible/production.yml ansible/deploy-node.yml

# Verify all nodes
ansible -i ansible/production.yml all -m shell -a "docker compose ps"
```

### Step 4: Initialize Genesis

```bash
# Copy genesis to all nodes
ansible -i ansible/production.yml all -m copy \
  -a "src=config/besu/genesis_qbft.json dest=/etc/besu/genesis_qbft.json"

# Copy permissioning config
ansible -i ansible/production.yml all -m copy \
  -a "src=config/besu/permission-config.toml dest=/etc/besu/permissions_config.toml"
```

### Step 5: Start Network

```bash
# Start bootnode first
ansible -i ansible/production.yml validators[0] -m shell \
  -a "docker compose up -d bootnode"

# Wait for bootnode
sleep 10

# Start validators
ansible -i ansible/production.yml validators -m shell \
  -a "docker compose up -d validator"

# Start observers
ansible -i ansible/production.yml observers -m shell \
  -a "docker compose up -d observer"
```

### Step 6: Deploy Contracts

```bash
# Deploy from secure deployment machine
npx hardhat run scripts/deploy/01_deploy_core.js --network besuProduction

# Record addresses securely
cat deployed-addresses.json | sops encrypt > deployed-addresses.json.enc
```

### Step 7: Post-Deployment Verification

```bash
# Run verification
npx hardhat run scripts/utils/verify_deployment.js --network besuProduction

# Check all validators are in sync
for i in 1 2 3 4 5; do
    echo "Validator $i:"
    curl -s http://10.0.1.1$i:8545 -X POST \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
done
```

## Rollback Procedure

### Contract Rollback

```bash
# 1. Pause contracts
npx hardhat console --network besuProduction

> const AccessManager = await ethers.getContractFactory("AccessManager").attach("0x...");
> await AccessManager.pause();

# 2. Deploy previous version
npx hardhat run scripts/deploy/01_deploy_core.js --network besuProduction

# 3. Verify and unpause
npx hardhat run scripts/utils/verify_deployment.js --network besuProduction
```

### Network Rollback

```bash
# Stop all nodes
ansible -i ansible/production.yml all -m shell -a "docker compose down"

# Restore from backup
ansible -i ansible/production.yml all -m shell \
  -a "rm -rf /var/lib/besu/data && cp -r /backup/besu/data /var/lib/besu/"

# Restart
ansible -i ansible/production.yml all -m shell -a "docker compose up -d"
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'besu-production'
    static_configs:
      - targets:
        - 'validator1:9545'
        - 'validator2:9545'
        - 'validator3:9545'
        - 'validator4:9545'
        - 'validator5:9545'
    metrics_path: '/metrics'
    scheme: 'https'
    tls_config:
      ca_file: '/etc/prometheus/ca.crt'
```

### Alert Rules

```yaml
# alert_rules.yml
groups:
  - name: production
    rules:
      - alert: ValidatorDown
        expr: up{job="besu-production"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Validator {{ $labels.instance }} is down"
          
      - alert: ConsensusIssue
        expr: count(besu_blockchain_chain_height) < 4
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Less than 4 validators in consensus"
```

## Maintenance

### Regular Tasks

| Task | Frequency | Command |
|------|-----------|---------|
| Log rotation | Daily | `logrotate /etc/logrotate.d/besu` |
| Backup | Daily | `./scripts/backup.sh` |
| Health check | Hourly | `./scripts/health-check.sh` |
| Certificate renewal | Annual | `./scripts/renew-certs.sh` |

### Upgrades

```bash
# 1. Stop node
docker compose down

# 2. Backup data
cp -r /var/lib/besu/data /backup/besu/data-$(date +%Y%m%d)

# 3. Update image
docker compose pull

# 4. Start node
docker compose up -d

# 5. Verify sync
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Disaster Recovery

### Backup Strategy

```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/backup/besu/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup blockchain data
cp -r /var/lib/besu/data $BACKUP_DIR/data

# Backup configuration
cp /etc/besu/*.toml $BACKUP_DIR/config/
cp /etc/besu/*.json $BACKUP_DIR/config/

# Backup keys (ENCRYPTED)
sops encrypt /etc/besu/keys/*.key > $BACKUP_DIR/keys.enc

# Upload to secure storage
aws s3 cp $BACKUP_DIR s3://ph-gov-blockchain-backup/$(date +%Y%m%d)/
```

### Recovery Procedure

```bash
# 1. Download backup
aws s3 cp s3://ph-gov-blockchain-backup/20240101/ /restore/

# 2. Decrypt keys
sops decrypt /restore/keys.enc > /etc/besu/keys/node.key

# 3. Restore data
cp -r /restore/data /var/lib/besu/

# 4. Restore config
cp /restore/config/*.toml /etc/besu/
cp /restore/config/*.json /etc/besu/

# 5. Start node
docker compose up -d
```

## Compliance Documentation

### Audit Trail

All deployments must maintain:
- Deployment timestamp
- Deployer identity
- Contract addresses
- Configuration hashes
- Verification results

### Change Management

All changes require:
- Change request ticket
- Approval from DICT
- Rollback plan
- Testing evidence
- Post-deployment verification
