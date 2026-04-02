# Troubleshooting Guide

## Common Errors and Solutions

### Hardhat Errors

#### HH600: Compilation Failed

**Symptom:** `Error HH600: Compilation failed`

**Common Causes:**
1. **DeclarationError: Undeclared identifier** - External functions cannot call other external functions directly without `this.`. Fix: Extract core logic into `internal` functions.
2. **Missing imports** - Ensure all OpenZeppelin imports use correct 4.x paths.
3. **Solidity version mismatch** - All contracts must use `pragma solidity ^0.8.19`.

**Solution:**
```bash
# Clean and recompile
npx hardhat clean
npx hardhat compile
```

#### HH1: Invalid/Unexpected Network Config

**Symptom:** Hardhat fails to load config with network errors.

**Solution:** Ensure all network configs in `hardhat.config.ts` have valid schema. Remove `forking: { enabled: false }` - Hardhat requires omitting the forking block entirely when unused.

#### HH404: Network Not Found

**Symptom:** `Error HH404: Network besu-local not found`

**Solution:** Use the correct network name `besuLocal` (no hyphen):
```bash
npx hardhat run scripts/deploy/01_deploy_core.js --network besuLocal
```

#### HH8: Plugin Loading Error

**Symptom:** Hardhat fails to load plugins.

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Verify plugins are loaded
npx hardhat --help
```

### Solidity Compilation Errors

#### DeclarationError: "X is not visible"

**Cause:** In Solidity, `external` functions cannot be called directly from within the same contract. They require `this.functionName()`.

**Fix:** Extract the core logic into an `internal` function:
```solidity
// Before (broken)
function doWork() external { /* ... */ }
function doWorkBatch() external {
    doWork(); // ERROR: external not visible
}

// After (fixed)
function _doWork() internal { /* ... */ }
function doWork() external { _doWork(); }
function doWorkBatch() external {
    _doWork(); // OK: internal is visible
}
```

#### TypeError: Invalid implicit conversion from string literal to string calldata

**Cause:** String literals cannot be passed to `calldata` parameters in internal functions.

**Fix:** Change internal function parameters from `calldata` to `memory`:
```solidity
// Before (broken)
function _log(string calldata msg) internal { }

// After (fixed)
function _log(string memory msg) internal { }
```

### Docker / Network Errors

#### Container Won't Start

**Symptom:** `docker compose up -d` fails or containers exit immediately.

**Solutions:**
```bash
# Check Docker daemon
docker info

# Check container logs
docker compose logs validator1

# Verify config files exist
ls -la config/besu/genesis_qbft.json
ls -la config/besu/nodes/*.toml

# Reset network
docker compose down -v
docker compose up -d
```

#### RPC Connection Failed

**Symptom:** Cannot connect to `http://localhost:8545`

**Solutions:**
```bash
# Check if RPC is responding
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check container status
docker compose ps

# Restart validator
docker compose restart validator1
```

#### Permission Denied on Setup Script

**Solution:**
```bash
chmod +x scripts/network/setup_qbft.sh
```

### Deployment Errors

#### Deployer Has No Balance

**Symptom:** `Deployer has no balance. Please fund the deployer account.`

**Solution:** For POC, the genesis file pre-funds specific addresses. Ensure your deployer key matches one of the pre-funded addresses in `config/besu/genesis_qbft.json`, or add your address to the `alloc` section.

#### Contract Deployment Reverted

**Symptom:** Transaction reverts during deployment.

**Solutions:**
1. Check gas limit is sufficient
2. Verify constructor arguments are valid
3. Check deployer has required roles/permissions
4. Review contract constructor for require() conditions

### Test Errors

#### Event Assertion Mismatch

**Symptom:** `Expected arguments array to have length X, but it has Y`

**Cause:** Event has more/fewer parameters than the test expects.

**Solution:** Use manual event parsing instead of `.withArgs()`:
```javascript
// Instead of:
await expect(tx).to.emit(contract, "MyEvent").withArgs(a, b);

// Use:
const receipt = await tx.wait();
const event = receipt.logs.find(log => {
  try { return contract.interface.parseLog(log)?.name === "MyEvent"; }
  catch { return false; }
});
const parsed = contract.interface.parseLog(event);
expect(parsed?.args?.paramA).to.equal(a);
expect(parsed?.args?.paramB).to.equal(b);
```

#### Ambiguous Function Description

**Symptom:** `ambiguous function description (i.e. matches "func(bytes32,address)", "func(bytes32,address,bytes32)")`

**Cause:** Contract has multiple functions with the same name but different signatures (e.g., custom `revokeRole` + OpenZeppelin's `revokeRole`).

**Solution:** Use the full signature selector:
```javascript
// Instead of:
await contract.revokeRole(role, account, agencyId);

// Use:
await contract["revokeRole(bytes32,address,bytes32)"](role, account, agencyId);
```

#### Indexed String Comparison Fails

**Symptom:** `expected Indexed{...} to equal 'some-string'`

**Cause:** Indexed `string` and `bytes` parameters in events are stored as their keccak256 hash, not the raw value.

**Solution:**
```javascript
// Indexed strings return an Indexed object with .hash property
expect(parsed?.args?.action?.hash).to.equal(
  ethers.keccak256(ethers.toUtf8Bytes("EXPECTED_STRING"))
);
```

### Network Reset

If everything is broken, try a full reset:

```bash
# Stop containers and delete volumes
cd docker && docker compose down -v

# Remove generated files
cd ..
rm -rf network-setup/
rm -f deployed-addresses.json

# Clean Hardhat artifacts
npx hardhat clean

# Reinstall dependencies (if needed)
rm -rf node_modules
npm install

# Regenerate network config
chmod +x scripts/network/setup_qbft.sh
./scripts/network/setup_qbft.sh --nodes 3 --observers 1

# Restart
cd docker && docker compose up -d
cd ..

# Wait for network to stabilize
sleep 30

# Deploy contracts
npm run deploy:besuLocal
```

## Getting Help

- Check the [Setup Guide](setup.md) for installation steps
- Review the [Deployment Guide](deployment.md) for deployment procedures
- See [Compliance Documentation](compliance.md) for regulatory requirements
- Contact: blockchain@dict.gov.ph

## Known Limitations (POC)

These are intentional design choices for the proof-of-concept that should be addressed before production deployment.

### Docker / Network

| Limitation | Impact | Production Fix |
|------------|--------|----------------|
| **Only validator1 exposes host ports** — Validators 2, 3, and observer1 have no `ports:` mappings. | External applications can only reach the network through validator1's RPC (port 8545). Internal nodes are reachable only from within the Docker `blockchain` network. | Add unique host port mappings (e.g., `8555:8545` for validator2) or deploy a load balancer in front of all validators. |
| **`deploy.resources` is Swarm-only** — CPU/memory limits in `deploy.resources` blocks are silently ignored by `docker compose` (non-Swarm mode). | No resource constraints on containers when using `docker compose up`. A single runaway container could consume all host resources. | Use `mem_limit`/`cpus` at the service level for Compose V2, or deploy to Docker Swarm/Kubernetes where resource limits are enforced. |
| **`contractSizeLimit: 2147483647`** — Genesis sets contract size limit to INT_MAX (~2 GB). | No protection against oversized contract deployments. In production, this could enable denial-of-service via bloated contracts. | Set a reasonable limit (e.g., `24576` bytes = EIP-170 default, or `49152` for permissioned networks). |
| **No TLS on P2P or RPC** — All node configs have `p2p-tls-enabled=false` and `rpc-http-tls-enabled=false`. | Traffic between nodes and between clients and nodes is unencrypted. Acceptable for local POC but not for production. | Enable TLS with certificates from a government CA. See [Deployment Guide](deployment.md) TLS section. |
| **`host-allowlist=["*"]`** — All nodes accept HTTP requests from any origin. | No CORS protection. Fine for local development but exposes RPC to any origin in production. | Restrict to specific IPs/domains: `host-allowlist=["localhost", "10.0.0.0/8"]`. |

### Smart Contracts

| Limitation | Impact | Production Fix |
|------------|--------|----------------|
| **`_getCallerAgencyId()` is a placeholder** — Returns `keccak256(abi.encodePacked(msg.sender))` instead of looking up a real agency registry. | Agency-based authorization in DocumentRegistry uses address matching (`doc.agencyAddress == msg.sender`) as a fallback. Works for POC but doesn't integrate with AccessManager. | Deploy an identity registry or integrate with AccessManager to map addresses to agency IDs. |
| **No contract upgradeability** — Contracts are not proxy-based. | Upgrading requires deploying new contracts and migrating state. | Implement UUPS or Transparent Proxy pattern for upgradeable contracts. |
| **No on-chain governance** — Admin actions (pause, suspend) are controlled by a single address. | Single point of failure. If the admin key is compromised, the entire network can be paused. | Implement multi-sig (e.g., OpenZeppelin Governor) or DAO-based governance for admin actions. |

### Infrastructure

| Limitation | Impact | Production Fix |
|------------|--------|----------------|
| **Keys generated locally with openssl** — `setup_qbft.sh` generates secp256k1 keys using openssl, not an HSM. | Keys are stored as plaintext files. Acceptable for POC but not for production. | Use HSM (AWS KMS, Azure Key Vault, HashiCorp Vault) or Besu's `operator generate-blockchain-config` with encrypted keystores. |
| **No backup/recovery automation** — Blockchain data persists in Docker named volumes with no automated backup. | Data loss if Docker volumes are deleted (`docker compose down -v`). | Implement automated volume snapshots or use external storage (EBS, Azure Disk) with backup policies. |
