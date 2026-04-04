# Troubleshooting Guide

## Table of Contents

- [Issue 1: No blocks produced — validators stuck](#issue-1-no-blocks-produced--validators-stuck-in-unable-to-find-sync-target)
- [Issue 2: Deployer has no balance / all accounts show 0 ETH](#issue-2-deployer-has-no-balance--all-accounts-show-0-eth)
- [Issue 3: Healthchecks failing — curl or wget not found](#issue-3-healthchecks-failing--curl-or-wget-not-found-in-besu-container)
- [Issue 4: verify_deployment.js fails — getChainId is not a function](#issue-4-verify_deploymentjs-fails--getchainid-is-not-a-function)
- [Issue 5: Init containers shown as running/stopped in Docker Desktop](#issue-5-init-containers-shown-as-runningstopped-in-docker-desktop)
- [Issue 6: setup_qbft.sh generates mismatched keypairs — KNOWN ISSUE](#issue-6-setup_qbftsh-generates-mismatched-keypairs--known-issue-not-yet-fixed)

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

## Besu QBFT Network Issues

### Issue 1: No blocks produced — validators stuck in "Unable to find sync target"

**Symptom:**
```
docker compose logs validator1 shows:
"FullSyncTargetManager | Unable to find sync target. Currently checking 3 peers"
```

**Cause:**
The validator address derived from the node's private key does not match
any address in genesis extraData. Besu does not recognise itself as a
validator and falls back to sync mode. This is caused by mismatched keypairs
(see setup_qbft.sh Known Issue).

**Diagnosis:**
```bash
# Get the actual address Besu derives from each validator key
docker exec ph-validator1 /opt/besu/bin/besu \
  public-key export-address \
  --node-private-key-file=/etc/besu/keys/validator1.key
# Repeat for validator2 and validator3
# Compare output against addresses in genesis extraData
```

**Fix:**
1. Get real addresses from diagnosis step above
2. Re-encode extraData RLP with correct addresses (see genesis_qbft.json notes)
3. Update alloc section with same addresses
4. `docker compose down -v && docker compose up -d`

---

### Issue 2: Deployer has no balance / all accounts show 0 ETH

**Symptom:**
```
npm run deploy:besuLocal shows: "Error: Deployer has no balance"
jq '.alloc' config/besu/genesis_qbft.json returns {}
```

**Cause:**
QBFT permissioned networks have no mining rewards. If genesis alloc is
empty, all accounts start with 0 ETH and no transactions can be submitted.

**Fix:**
Add alloc entries to genesis_qbft.json for all validator addresses and
the deployer address before first docker compose up. Genesis is immutable
once the chain starts — requires `docker compose down -v` to take effect.

---

### Issue 3: Healthchecks failing — curl or wget not found in Besu container

**Symptom:**
Docker marks Besu containers as unhealthy immediately

**Cause:**
Besu uses a distroless Docker image with no shell utilities available.

**Fix:**
Use bash /dev/tcp for healthchecks in docker-compose.yml:
```yaml
healthcheck:
  test: ["CMD-SHELL", "bash -c '(echo -e \"GET / HTTP/1.0\\r\\n\\r\\n\" > /dev/tcp/localhost/8545) 2>/dev/null && exit 0 || exit 1'"]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 120s
```

---

### Issue 4: verify_deployment.js fails — getChainId is not a function

**Symptom:**
```
npm run verify:besuLocal shows:
"Network connectivity check failed: hre.ethers.provider.getChainId is not a function"
```

**Cause:**
Script was written for ethers v5. Project uses ethers v6.

**Fix:**
```
v5: await provider.getChainId()
v6: (await provider.getNetwork()).chainId
```

Also check for other v5 patterns in the same file:
```
v5: ethers.utils.formatEther(x) → v6: ethers.formatEther(x)
v5: balance.gt(0)               → v6: balance > 0n
```

---

### Issue 5: Init containers shown as running/stopped in Docker Desktop

**Symptom:**
ph-bootnode-init, ph-validator1-init (etc.) appear in Docker Desktop
with a play button and 0B/0B memory usage

**Cause:**
Docker Desktop shows all containers including exited ones. These
alpine:3.19 containers run once to set correct file permissions on
Besu data volumes then exit with code 0.

**This is EXPECTED BEHAVIOUR. Do not restart them.**

---

### Issue 6: ⚠️ setup_qbft.sh generates mismatched keypairs — KNOWN ISSUE, NOT YET FIXED

**Symptom:**
After running setup_qbft.sh to regenerate keys, validators fail to
produce blocks (see Issue 1).

**Cause:**
The script calls `openssl ecparam -genkey` twice — once for the private
key file and once separately for the public key file. These are two
completely independent keypairs. The `.key.pub` file does not correspond
to the `.key` file.

**Impact:**
**DO NOT** run setup_qbft.sh to regenerate keys until this is fixed.
Use existing keys in `config/besu/keys/`.
If keys are lost, manually regenerate using the correct method below.

**Correct key generation (workaround until script is fixed):**
```bash
# Generate private key
openssl ecparam -name secp256k1 -genkey -noout | \
  openssl ec -no_public > config/besu/keys/validator1.key

# Derive public key FROM the same private key
openssl ec -in config/besu/keys/validator1.key -pubout \
  > config/besu/keys/validator1.key.pub

# Get the Ethereum address Besu will derive from this key
docker exec ph-validator1 /opt/besu/bin/besu \
  public-key export-address \
  --node-private-key-file=/etc/besu/keys/validator1.key

# Update genesis extraData and alloc with the new address
# Then: docker compose down -v && docker compose up -d
```

## Network Reset

If everything is broken, try a full reset:

```bash
# Stop containers and delete volumes
cd docker && docker compose down -v

# Remove generated files
cd ..
rm -f deployed-addresses.json

# Clean Hardhat artifacts
npx hardhat clean

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
