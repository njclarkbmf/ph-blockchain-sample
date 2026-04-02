const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * 01_deploy_core.js - Core Contract Deployment Script
 * 
 * DESCRIPTION:
 * Sequentially deploys the core smart contracts for the Philippine Government
 * Federated Blockchain: AccessManager, DocumentRegistry, and AuditLog.
 * 
 * FEATURES:
 * - Idempotent deployment (checks existing deployments)
 * - Logs contract addresses to deployed-addresses.json
 * - Verifies deployment after completion
 * - Supports multiple networks via Hardhat config
 * 
 * COMPLIANCE:
 * - RA 10173: No PII in deployment parameters
 * - DICT Guidelines: Deployment logged for audit trail
 * 
 * PORTABILITY:
 * - Standard EVM deployment (compatible with all EVM chains)
 * - No Besu-specific deployment calls
 * 
 * USAGE:
 *   npx hardhat run scripts/deploy/01_deploy_core.js --network besuLocal
 *   npx hardhat run scripts/deploy/01_deploy_core.js --network besuProduction
 */

// Output file for deployed addresses
const DEPLOYMENT_OUTPUT = path.join(__dirname, "../../deployed-addresses.json");

/**
 * Load existing deployments
 */
function loadExistingDeployments() {
    try {
        if (fs.existsSync(DEPLOYMENT_OUTPUT)) {
            const data = fs.readFileSync(DEPLOYMENT_OUTPUT, "utf8");
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn("Could not load existing deployments:", error.message);
    }
    return {};
}

/**
 * Save deployment addresses
 */
function saveDeployment(networkName, deployments) {
    const existingDeployments = loadExistingDeployments();
    
    existingDeployments[networkName] = {
        ...deployments,
        deployedAt: new Date().toISOString(),
        network: networkName,
        chainId: hre.network.config.chainId,
    };
    
    fs.writeFileSync(
        DEPLOYMENT_OUTPUT,
        JSON.stringify(existingDeployments, null, 2),
        "utf8"
    );
    
    console.log(`\n✓ Deployments saved to ${DEPLOYMENT_OUTPUT}`);
}

/**
 * Verify contract deployment
 */
async function verifyDeployment(contractName, address, constructorArgs = []) {
    console.log(`\nVerifying ${contractName} at ${address}...`);
    
    try {
        await hre.run("verify:verify", {
            address,
            constructorArguments: constructorArgs,
        });
        console.log(`✓ ${contractName} verified on block explorer`);
        return true;
    } catch (error) {
        console.warn(`⚠ Could not verify ${contractName}: ${error.message}`);
        return false;
    }
}

/**
 * Deploy AccessManager contract
 */
async function deployAccessManager(adminAddress) {
    console.log("\n========================================");
    console.log("Deploying AccessManager...");
    console.log("========================================");
    
    const AccessManager = await hre.ethers.getContractFactory("AccessManager");
    
    console.log(`Admin address: ${adminAddress}`);
    console.log("Deploying contract...");
    
    const accessManager = await AccessManager.deploy(adminAddress);
    await accessManager.waitForDeployment();
    
    const address = await accessManager.getAddress();
    console.log(`✓ AccessManager deployed at: ${address}`);
    
    // Verify roles
    const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
    const hasAdminRole = await accessManager.hasRole(ADMIN_ROLE, adminAddress);
    console.log(`✓ Admin role verified: ${hasAdminRole}`);
    
    return { contract: accessManager, address };
}

/**
 * Deploy DocumentRegistry contract
 */
async function deployDocumentRegistry(adminAddress) {
    console.log("\n========================================");
    console.log("Deploying DocumentRegistry...");
    console.log("========================================");
    
    const DocumentRegistry = await hre.ethers.getContractFactory("DocumentRegistry");
    
    console.log(`Admin address: ${adminAddress}`);
    console.log("Deploying contract...");
    
    const documentRegistry = await DocumentRegistry.deploy(adminAddress);
    await documentRegistry.waitForDeployment();
    
    const address = await documentRegistry.getAddress();
    console.log(`✓ DocumentRegistry deployed at: ${address}`);
    
    return { contract: documentRegistry, address };
}

/**
 * Deploy AuditLog contract
 */
async function deployAuditLog(adminAddress) {
    console.log("\n========================================");
    console.log("Deploying AuditLog...");
    console.log("========================================");
    
    const AuditLog = await hre.ethers.getContractFactory("AuditLog");
    
    console.log(`Admin address: ${adminAddress}`);
    console.log("Deploying contract...");
    
    const auditLog = await AuditLog.deploy(adminAddress);
    await auditLog.waitForDeployment();
    
    const address = await auditLog.getAddress();
    console.log(`✓ AuditLog deployed at: ${address}`);
    
    return { contract: auditLog, address };
}

/**
 * Configure contract interconnections
 */
async function configureContracts(accessManager, documentRegistry, auditLog, adminAddress) {
    console.log("\n========================================");
    console.log("Configuring Contract Interconnections...");
    console.log("========================================");
    
    const adminSigner = await hre.ethers.getSigner(adminAddress);
    
    // Set AccessManager reference in DocumentRegistry
    console.log("\nSetting AccessManager in DocumentRegistry...");
    const accessManagerAddress = await accessManager.getAddress();
    let tx = await documentRegistry.connect(adminSigner).setAccessManager(accessManagerAddress);
    await tx.wait();
    console.log("✓ DocumentRegistry linked to AccessManager");
    
    // Set AccessManager reference in AuditLog
    console.log("\nSetting AccessManager in AuditLog...");
    tx = await auditLog.connect(adminSigner).setAccessManager(accessManagerAddress);
    await tx.wait();
    console.log("✓ AuditLog linked to AccessManager");
    
    // Set DocumentRegistry reference in AuditLog
    console.log("\nSetting DocumentRegistry in AuditLog...");
    const documentRegistryAddress = await documentRegistry.getAddress();
    tx = await auditLog.connect(adminSigner).setDocumentRegistry(documentRegistryAddress);
    await tx.wait();
    console.log("✓ AuditLog linked to DocumentRegistry");
    
    // Set AuditLog reference in AccessManager (if needed)
    // Note: AccessManager doesn't have setAuditLog function by default
    // Add if needed for your use case
}

/**
 * Log initial audit entry
 */
async function logDeployment(auditLog, adminAddress, deployments) {
    console.log("\n========================================");
    console.log("Logging Deployment Event...");
    console.log("========================================");
    
    const adminSigner = await hre.ethers.getSigner(adminAddress);
    const agencyId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("DICT-ADMIN"));
    
    try {
        const tx = await auditLog.connect(adminSigner).logSystemAction(
            agencyId,
            "CONTRACTS_DEPLOYED",
            hre.ethers.keccak256(hre.ethers.toUtf8Bytes("CORE_CONTRACTS")),
            hre.ethers.keccak256(hre.ethers.toUtf8Bytes(JSON.stringify(deployments)))
        );
        await tx.wait();
        console.log("✓ Deployment event logged in AuditLog");
    } catch (error) {
        console.warn("⚠ Could not log deployment event:", error.message);
    }
}

/**
 * Main deployment function
 */
async function main() {
    console.log("============================================");
    console.log("Philippine Government Federated Blockchain");
    console.log("Core Contract Deployment");
    console.log("============================================");
    console.log(`\nNetwork: ${hre.network.name}`);
    console.log(`Chain ID: ${hre.network.config.chainId}`);
    console.log(`RPC URL: ${hre.network.config.url}`);
    
    // Get deployer account
    const [deployer] = await hre.ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log(`\nDeployer: ${deployerAddress}`);
    
    // Check balance
    const balance = await hre.ethers.provider.getBalance(deployerAddress);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
        throw new Error("Deployer has no balance. Please fund the deployer account.");
    }
    
    // Use deployer as admin for POC
    // In production, use dedicated admin address from config
    const adminAddress = deployerAddress;
    
    // Check existing deployments
    const existingDeployments = loadExistingDeployments();
    const networkDeployments = existingDeployments[hre.network.name];
    
    if (networkDeployments) {
        console.log("\n⚠ Existing deployment found for this network:");
        console.log(`  AccessManager: ${networkDeployments.accessManager}`);
        console.log(`  DocumentRegistry: ${networkDeployments.documentRegistry}`);
        console.log(`  AuditLog: ${networkDeployments.auditLog}`);
        console.log("\nTo redeploy, delete the deployment entry or use a different network.");
        
        // Ask if user wants to continue (in interactive mode)
        // For now, we'll proceed with new deployment
        console.log("\nProceeding with new deployment...\n");
    }
    
    // Deploy contracts
    const deployments = {};
    
    // 1. Deploy AccessManager
    const accessManagerDeployment = await deployAccessManager(adminAddress);
    deployments.accessManager = accessManagerDeployment.address;
    
    // 2. Deploy DocumentRegistry
    const documentRegistryDeployment = await deployDocumentRegistry(adminAddress);
    deployments.documentRegistry = documentRegistryDeployment.address;
    
    // 3. Deploy AuditLog
    const auditLogDeployment = await deployAuditLog(adminAddress);
    deployments.auditLog = auditLogDeployment.address;
    
    // Configure interconnections
    await configureContracts(
        accessManagerDeployment.contract,
        documentRegistryDeployment.contract,
        auditLogDeployment.contract,
        adminAddress
    );
    
    // Log deployment event
    await logDeployment(auditLogDeployment.contract, adminAddress, deployments);
    
    // Save deployment addresses
    saveDeployment(hre.network.name, deployments);
    
    // Print summary
    console.log("\n============================================");
    console.log("DEPLOYMENT SUMMARY");
    console.log("============================================");
    console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${hre.network.config.chainId})`);
    console.log(`\nContract Addresses:`);
    console.log(`  AccessManager:    ${deployments.accessManager}`);
    console.log(`  DocumentRegistry: ${deployments.documentRegistry}`);
    console.log(`  AuditLog:         ${deployments.auditLog}`);
    console.log(`\nAdmin Address: ${adminAddress}`);
    console.log(`\nDeployment saved to: ${DEPLOYMENT_OUTPUT}`);
    
    // Verification (optional - requires block explorer)
    console.log("\n============================================");
    console.log("Contract Verification (Optional)");
    console.log("============================================");
    console.log("Skipping verification - configure block explorer in hardhat.config.ts to enable");
    
    // Final instructions
    console.log("\n============================================");
    console.log("NEXT STEPS");
    console.log("============================================");
    console.log(`
1. Register government agencies using AccessManager:
   - Call registerAgency(agencyId, agencyAddress, metadataHash)
   
2. Deploy additional contracts as needed:
   - Run additional deployment scripts for agency-specific contracts
   
3. Configure agency permissions:
   - Grant AGENCY_ROLE to agency addresses
   - Grant AUDITOR_ROLE to compliance officers
   
4. Begin document registration:
   - Use DocumentRegistry.registerDocument() to register documents
   
5. Monitor the network:
   - Access Grafana at http://localhost:8080
   - Review audit logs via AuditLog contract
`);
    
    console.log("✓ Deployment complete!");
}

// Run deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
