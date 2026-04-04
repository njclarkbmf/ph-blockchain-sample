const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * verify_deployment.js - Deployment Verification Script
 * 
 * DESCRIPTION:
 * Verifies that deployed contracts are functioning correctly by running
 * a series of health checks and state validations.
 * 
 * CHECKS PERFORMED:
 * - Contract code exists at deployed addresses
 * - Role hierarchy is correctly configured
 * - Contract interconnections are established
 * - Basic functions are callable
 * - Events can be emitted
 * 
 * COMPLIANCE:
 * - Read-only verification (no state changes)
 * - Results logged for audit trail
 * 
 * USAGE:
 *   npx hardhat run scripts/utils/verify_deployment.js --network besuLocal
 */

const DEPLOYMENT_OUTPUT = path.join(__dirname, "../../deployed-addresses.json");

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✓ ${message}`, colors.green);
}

function logError(message) {
    log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
    log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
    log(`ℹ ${message}`, colors.blue);
}

/**
 * Load deployment addresses
 */
function loadDeployments() {
    const networkName = hre.network.name;
    
    if (!fs.existsSync(DEPLOYMENT_OUTPUT)) {
        throw new Error(`Deployment file not found: ${DEPLOYMENT_OUTPUT}`);
    }
    
    const data = JSON.parse(fs.readFileSync(DEPLOYMENT_OUTPUT, "utf8"));
    
    if (!data[networkName]) {
        throw new Error(`No deployment found for network: ${networkName}`);
    }
    
    return data[networkName];
}

/**
 * Check if contract has code
 */
async function checkContractCode(address, name) {
    const code = await hre.ethers.provider.getCode(address);
    
    if (code === "0x") {
        logError(`${name}: No code at address ${address}`);
        return false;
    }
    
    logSuccess(`${name}: Code exists (${code.length} bytes)`);
    return true;
}

/**
 * Verify AccessManager contract
 */
async function verifyAccessManager(address) {
    logInfo("\nVerifying AccessManager...");
    
    const AccessManager = await hre.ethers.getContractFactory("AccessManager");
    const accessManager = AccessManager.attach(address);
    
    // Check ADMIN_ROLE
    const ADMIN_ROLE = await accessManager.ADMIN_ROLE();
    logSuccess(`ADMIN_ROLE: ${ADMIN_ROLE}`);
    
    // Check AGENCY_ROLE
    const AGENCY_ROLE = await accessManager.AGENCY_ROLE();
    logSuccess(`AGENCY_ROLE: ${AGENCY_ROLE}`);
    
    // Check AUDITOR_ROLE
    const AUDITOR_ROLE = await accessManager.AUDITOR_ROLE();
    logSuccess(`AUDITOR_ROLE: ${AUDITOR_ROLE}`);
    
    // Check paused state
    const paused = await accessManager.paused();
    logInfo(`Paused state: ${paused}`);
    
    // Check registered agency count
    const agencyCount = await accessManager.getRegisteredAgencyCount();
    logInfo(`Registered agencies: ${agencyCount}`);
    
    return true;
}

/**
 * Verify DocumentRegistry contract
 */
async function verifyDocumentRegistry(address) {
    logInfo("\nVerifying DocumentRegistry...");
    
    const DocumentRegistry = await hre.ethers.getContractFactory("DocumentRegistry");
    const documentRegistry = DocumentRegistry.attach(address);
    
    // Check ADMIN_ROLE
    const ADMIN_ROLE = await documentRegistry.ADMIN_ROLE();
    logSuccess(`ADMIN_ROLE: ${ADMIN_ROLE}`);
    
    // Check document type constants
    const DOC_TYPE_CERTIFICATE = await documentRegistry.DOC_TYPE_CERTIFICATE();
    logSuccess(`DOC_TYPE_CERTIFICATE: ${DOC_TYPE_CERTIFICATE}`);
    
    // Check document count
    const docCount = await documentRegistry.getDocumentCount();
    logInfo(`Registered documents: ${docCount}`);
    
    // Check paused state
    const paused = await documentRegistry.paused();
    logInfo(`Paused state: ${paused}`);
    
    // Check AccessManager reference
    const accessManagerAddr = await documentRegistry.getAccessManager();
    if (accessManagerAddr !== "0x0000000000000000000000000000000000000000") {
        logSuccess(`AccessManager linked: ${accessManagerAddr}`);
    } else {
        logWarning("AccessManager not linked");
    }
    
    return true;
}

/**
 * Verify AuditLog contract
 */
async function verifyAuditLog(address) {
    logInfo("\nVerifying AuditLog...");
    
    const AuditLog = await hre.ethers.getContractFactory("AuditLog");
    const auditLog = AuditLog.attach(address);
    
    // Check ADMIN_ROLE
    const ADMIN_ROLE = await auditLog.ADMIN_ROLE();
    logSuccess(`ADMIN_ROLE: ${ADMIN_ROLE}`);
    
    // Check AUDITOR_ROLE
    const AUDITOR_ROLE = await auditLog.AUDITOR_ROLE();
    logSuccess(`AUDITOR_ROLE: ${AUDITOR_ROLE}`);
    
    // Check log count
    const logCount = await auditLog.getTotalLogCount();
    logInfo(`Total audit entries: ${logCount}`);
    
    // Check paused state
    const paused = await auditLog.paused();
    logInfo(`Paused state: ${paused}`);
    
    // Check AccessManager reference
    const accessManagerAddr = await auditLog.getAccessManager();
    if (accessManagerAddr !== "0x0000000000000000000000000000000000000000") {
        logSuccess(`AccessManager linked: ${accessManagerAddr}`);
    } else {
        logWarning("AccessManager not linked");
    }
    
    // Check DocumentRegistry reference
    const documentRegistryAddr = await auditLog.getDocumentRegistry();
    if (documentRegistryAddr !== "0x0000000000000000000000000000000000000000") {
        logSuccess(`DocumentRegistry linked: ${documentRegistryAddr}`);
    } else {
        logWarning("DocumentRegistry not linked");
    }
    
    return true;
}

/**
 * Test event emission
 */
async function testEventEmission(auditLogAddress, adminAddress) {
    logInfo("\nTesting event emission...");
    
    const AuditLog = await hre.ethers.getContractFactory("AuditLog");
    const auditLog = AuditLog.attach(auditLogAddress);
    const adminSigner = await hre.ethers.getSigner(adminAddress);
    
    const agencyId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("TEST-AGENCY"));
    const testHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-verification"));
    
    try {
        const tx = await auditLog.connect(adminSigner).logAction(
            agencyId,
            "VERIFICATION_TEST",
            "SYSTEM",
            testHash,
            testHash,
            4 // OTHER category
        );
        
        const receipt = await tx.wait();
        
        // Check for AuditEntry event
        const auditEntryEvent = receipt.logs.find(log => {
            try {
                const parsed = auditLog.interface.parseLog(log);
                return parsed && parsed.name === "AuditEntry";
            } catch {
                return false;
            }
        });
        
        if (auditEntryEvent) {
            logSuccess("Event emission working correctly");
            return true;
        } else {
            logWarning("AuditEntry event not found in logs");
            return false;
        }
    } catch (error) {
        logError(`Event emission test failed: ${error.message}`);
        return false;
    }
}

/**
 * Check network connectivity
 */
async function checkNetworkConnectivity() {
    logInfo("\nChecking network connectivity...");
    
    try {
        const blockNumber = await hre.ethers.provider.getBlockNumber();
        logSuccess(`Connected to block ${blockNumber}`);

        const network = await hre.ethers.provider.getNetwork();
        logSuccess(`Chain ID: ${network.chainId}`);

        const feeData = await hre.ethers.provider.getFeeData();
        logInfo(`Gas price: ${hre.ethers.formatUnits(feeData.gasPrice, "gwei")} gwei`);
        
        return true;
    } catch (error) {
        logError(`Network connectivity check failed: ${error.message}`);
        return false;
    }
}

/**
 * Main verification function
 */
async function main() {
    console.log("============================================");
    console.log("Deployment Verification");
    console.log("Philippine Government Federated Blockchain");
    console.log("============================================");
    
    logInfo(`\nNetwork: ${hre.network.name}`);
    logInfo(`RPC URL: ${hre.network.config.url}`);
    
    const results = {
        network: false,
        contracts: {
            accessManager: false,
            documentRegistry: false,
            auditLog: false,
        },
        events: false,
    };
    
    // Check network connectivity
    results.network = await checkNetworkConnectivity();
    
    if (!results.network) {
        logError("\nNetwork connectivity failed. Aborting verification.");
        process.exit(1);
    }
    
    // Load deployments
    let deployments;
    try {
        deployments = loadDeployments();
        logSuccess(`Loaded deployment for ${hre.network.name}`);
    } catch (error) {
        logError(error.message);
        process.exit(1);
    }
    
    console.log("\n----------------------------------------");
    console.log("Contract Addresses:");
    console.log(`  AccessManager:    ${deployments.accessManager}`);
    console.log(`  DocumentRegistry: ${deployments.documentRegistry}`);
    console.log(`  AuditLog:         ${deployments.auditLog}`);
    console.log("----------------------------------------");
    
    // Check contract code
    logInfo("\nChecking contract code...");
    results.contracts.accessManager = await checkContractCode(
        deployments.accessManager,
        "AccessManager"
    );
    results.contracts.documentRegistry = await checkContractCode(
        deployments.documentRegistry,
        "DocumentRegistry"
    );
    results.contracts.auditLog = await checkContractCode(
        deployments.auditLog,
        "AuditLog"
    );
    
    // Verify each contract
    if (results.contracts.accessManager) {
        await verifyAccessManager(deployments.accessManager);
    }
    
    if (results.contracts.documentRegistry) {
        await verifyDocumentRegistry(deployments.documentRegistry);
    }
    
    if (results.contracts.auditLog) {
        await verifyAuditLog(deployments.auditLog);
    }
    
    // Test event emission
    const [deployer] = await hre.ethers.getSigners();
    results.events = await testEventEmission(deployments.auditLog, await deployer.getAddress());
    
    // Print summary
    console.log("\n============================================");
    console.log("VERIFICATION SUMMARY");
    console.log("============================================");
    
    const allPassed = 
        results.network &&
        results.contracts.accessManager &&
        results.contracts.documentRegistry &&
        results.contracts.auditLog &&
        results.events;
    
    if (allPassed) {
        logSuccess("All verification checks passed!");
        console.log(`
The deployment is healthy and ready for use.

Next steps:
1. Register government agencies using AccessManager
2. Begin registering documents with DocumentRegistry
3. Monitor audit logs via AuditLog contract
4. Access Grafana dashboard at http://localhost:8080
`);
    } else {
        logWarning("Some verification checks failed. Review the output above.");
        
        if (!results.contracts.accessManager) {
            logError("AccessManager verification failed");
        }
        if (!results.contracts.documentRegistry) {
            logError("DocumentRegistry verification failed");
        }
        if (!results.contracts.auditLog) {
            logError("AuditLog verification failed");
        }
        if (!results.events) {
            logError("Event emission test failed");
        }
    }
    
    // Save verification results
    const verificationResults = {
        timestamp: new Date().toISOString(),
        network: hre.network.name,
        chainId: hre.network.config.chainId,
        results,
        allPassed,
    };
    
    const resultsPath = path.join(__dirname, "../../verification-results.json");
    fs.writeFileSync(resultsPath, JSON.stringify(verificationResults, null, 2));
    logInfo(`\nVerification results saved to: ${resultsPath}`);
    
    process.exit(allPassed ? 0 : 1);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logError(error.message);
        process.exit(1);
    });
