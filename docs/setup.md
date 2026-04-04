# Setup Guide

## Network Architecture

- **Consensus**: QBFT (Quorum Byzantine Fault Tolerance)
- **Validator quorum**: 3-of-3 required for block production
- **Chain ID**: 1981
- **Block period**: 5 seconds
- **Epoch length**: 30,000 blocks
- **Nodes**: 1 bootnode (discovery), 3 validators, 1 observer (read-only)

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 100 GB SSD | 500 GB NVMe |
| Network | 100 Mbps | 1 Gbps |

### Software Requirements

- **Docker**: 24.0+
- **Docker Compose**: 2.20+
- **Node.js**: 18.x or 20.x
- **npm**: 9.x or 10.x
- **Git**: 2.40+

### Installation

```bash
# Install Node.js (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20

# Verify installations
node --version
npm --version
docker --version
docker compose version
```

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url> ph-blockchain-sample
cd ph-blockchain-sample
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# See Environment Configuration section below
```

### 4. Start Docker Network

```bash
# Start all services
cd docker
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f validator1
```

> ⚠️ **Known Issue — setup_qbft.sh keypair generation**
>
> `setup_qbft.sh` currently generates mismatched keypairs. Running it to
> regenerate node keys will break QBFT consensus. Do not run this script
> until the fix is applied. See [docs/troubleshooting.md](docs/troubleshooting.md)
> Issue 6 for the correct key generation procedure.

### 5. Deploy Smart Contracts

```bash
# Return to project root
cd ..

# Deploy to local Besu network
npm run deploy:besuLocal

# Verify deployment
npm run verify:besuLocal
```

### 7. Access Monitoring

Grafana is available at **http://localhost:8080** (admin/admin).
Dashboards are provisioned automatically at container startup — no
manual Grafana UI steps are required.

The **Besu QBFT Overview** dashboard is available immediately after
`docker compose up` and includes:
- Chain height over time
- Peer count per node
- Transaction pool depth
- Chain head timestamp
- JVM memory usage per node

> If panels show "No data", see [docs/troubleshooting.md](docs/troubleshooting.md)
> Issue 7.

```bash
# Prometheus Metrics (raw)
open http://localhost:9090
```

## Environment Configuration

### .env File

```bash
# =============================================================================
# Network Configuration
# =============================================================================

# Local Besu Network (POC/Development)
BESU_RPC_URL=http://localhost:8545
BESU_WS_URL=ws://localhost:8546
CHAIN_ID=1981

# Production Network
PRODUCTION_RPC_URL=https://blockchain.gov.ph/rpc
PRODUCTION_CHAIN_ID=19810

# =============================================================================
# Account Configuration
# =============================================================================

# Deployer private key (NEVER commit to git!)
# Generate with: openssl rand -hex 32
DEPLOYER_PRIVATE_KEY=0x...

# Production deployer (separate key for production)
PRODUCTION_DEPLOYER_PRIVATE_KEY=0x...

# =============================================================================
# Gas Configuration
# =============================================================================

# Gas price in wei (for permissioned networks)
GAS_PRICE=1000000000

# =============================================================================
# Monitoring Configuration
# =============================================================================

# Grafana admin password
GRAFANA_ADMIN_PASSWORD=admin123

# =============================================================================
# Optional: Block Explorer
# =============================================================================

# Block explorer API for contract verification
BLOCK_EXPLORER_API_URL=
BLOCK_EXPLORER_URL=
ETHERSCAN_API_KEY=
```

## Docker Network Setup

### Starting Services

```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d validator1

# Start with rebuild
docker compose up -d --build
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes blockchain data!)
docker compose down -v

# Stop specific service
docker compose stop validator1
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f validator1

# Last 100 lines
docker compose logs --tail=100 validator1
```

### Service Health

```bash
# Check service status
docker compose ps

# Check validator health
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Smart Contract Deployment

### Deploy to Local Network

```bash
# Deploy core contracts
npm run deploy:besuLocal

# Output shows contract addresses:
# AccessManager:    0x...
# DocumentRegistry: 0x...
# AuditLog:         0x...
```

### Deploy to Production

```bash
# Deploy to production network
npm run deploy:production

# IMPORTANT: Ensure PRODUCTION_DEPLOYER_PRIVATE_KEY is set
```

### Verify Deployment

```bash
# Run verification checks
npm run verify:besuLocal

# Check deployed addresses
cat deployed-addresses.json
```

## Agency Registration

After deployment, register government agencies:

```javascript
const { ethers } = require("hardhat");

async function registerAgencies() {
    const AccessManager = await ethers.getContractFactory("AccessManager");
    const accessManager = AccessManager.attach("0x..."); // Your deployed address
    
    const [admin] = await ethers.getSigners();
    
    // Register BIR
    await accessManager.connect(admin).registerAgency(
        ethers.keccak256(ethers.toUtf8Bytes("BIR-001")),
        "0xBIR_AGENCY_ADDRESS",
        ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmBIRMetadata"))
    );
    
    // Register NBI
    await accessManager.connect(admin).registerAgency(
        ethers.keccak256(ethers.toUtf8Bytes("NBI-001")),
        "0xNBI_AGENCY_ADDRESS",
        ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmNBIMetadata"))
    );
    
    // Register COA as auditor
    await accessManager.connect(admin).grantAuditorRole(
        "0xCOA_AUDITOR_ADDRESS",
        ethers.keccak256(ethers.toUtf8Bytes("COA-001"))
    );
}
```

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check Docker daemon
docker info

# Check logs
docker compose logs validator1

# Restart container
docker compose restart validator1
```

#### RPC Connection Failed

```bash
# Check if RPC is responding
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Expected: {"jsonrpc":"2.0","id":1,"result":"0x..."}
```

#### Contract Deployment Failed

```bash
# Check deployer balance
npx hardhat run scripts/check-balance.js --network besuLocal

# Fund deployer account (for POC)
# In genesis_qbft.json, ensure deployer has balance
```

#### Permission Denied

```bash
# Fix script permissions
chmod +x scripts/network/setup_qbft.sh

# Fix file permissions
chmod 644 config/besu/*.json
chmod 644 config/besu/*.toml
```

### Network Reset

```bash
# WARNING: This deletes all blockchain data!

# Stop containers
docker compose down -v

# Remove generated files
rm -rf network-setup/
rm deployed-addresses.json

# Regenerate network
./scripts/network/setup_qbft.sh --nodes 3 --observers 1

# Restart
docker compose up -d

# Redeploy contracts
npm run deploy:besuLocal
```

## Init Containers

The `ph-*-init` containers (using `alpine:3.19`) run once at startup to set
correct file ownership on Besu data volumes, then exit with code 0. Docker
Desktop shows them as stopped with a play button — this is **correct and
expected**. Do not restart them manually.

## Key Files

Node private keys must exist in `config/besu/keys/` before starting the
network. These files are gitignored and must be generated or restored before
first use. See ⚠️ Known Issue below regarding `setup_qbft.sh` before
regenerating keys.

## Genesis Alloc Requirement

In a QBFT permissioned network there are no mining rewards. All accounts that
need ETH (validators for internal operations, deployer for contract deployment)
must be pre-funded in the genesis `alloc` section. The alloc is set once at
genesis and cannot be changed without wiping the chain. Current pre-funded
addresses and amounts are defined in `config/besu/genesis_qbft.json`.

## How to Wipe and Restart Cleanly

A full wipe is required after any genesis change:

```bash
cd docker
docker compose down -v     # -v removes volumes = wipes all chain state
docker compose up -d
```

> ⚠️ This destroys all chain state including deployed contracts.
> Re-run `npm run deploy:besuLocal` after restarting.

## Verifying Block Production Before Deploying

Before running deploy scripts, confirm blocks are being produced:

```bash
python3 -c "
import urllib.request, json, time
for _ in range(3):
    data = json.dumps({'jsonrpc':'2.0','method':'eth_blockNumber',
           'params':[],'id':1}).encode()
    req = urllib.request.Request('http://localhost:8545', data=data,
          headers={'Content-Type':'application/json'})
    print('Block:', int(json.loads(urllib.request.urlopen(req).read())
          ['result'], 16))
    time.sleep(6)
"
```

Block number must be incrementing before running deploy scripts.

## Next Steps

1. **Configure Agencies**: Register government agencies using AccessManager
2. **Deploy Applications**: Build agency-specific applications using the adapters
3. **Set Up Monitoring**: Configure Grafana alerts and dashboards
4. **Backup Configuration**: Backup genesis file and keys securely
5. **Plan Production**: Review production deployment guide

## Support

For issues and questions:
- Check documentation in `/docs`
- Review troubleshooting section
- Contact DICT Blockchain Team
