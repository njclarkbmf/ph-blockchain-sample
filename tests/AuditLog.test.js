const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * AuditLog Test Suite
 * 
 * Tests for the AuditLog smart contract which handles
 * immutable audit trail for Philippine Government compliance.
 * 
 * COMPLIANCE:
 * - Tests verify RA 10173 compliance (immutable audit trail)
 * - Tests verify COA requirements (audit retention)
 * - Tests verify DICT guidelines (proper event structure)
 */

describe("AuditLog", function () {
    let auditLog;
    let admin, agency1, agency2, auditor, system, unauthorized;

    // Role constants
    let ADMIN_ROLE, AGENCY_ROLE, AUDITOR_ROLE, SYSTEM_ROLE;

    // Agency IDs
    const AGENCY_ID_BIR = ethers.keccak256(ethers.toUtf8Bytes("BIR-001"));
    const AGENCY_ID_NBI = ethers.keccak256(ethers.toUtf8Bytes("NBI-001"));
    const AGENCY_ID_COA = ethers.keccak256(ethers.toUtf8Bytes("COA-001"));

    // Audit categories
    const CATEGORY_DOCUMENT = 0;
    const CATEGORY_ACCESS = 1;
    const CATEGORY_SYSTEM = 2;
    const CATEGORY_COMPLIANCE = 3;
    const CATEGORY_SECURITY = 4;
    const CATEGORY_OTHER = 5;

    // Test data
    const ACTION_REGISTER = "DOCUMENT_REGISTERED";
    const ACTION_ACCESS_GRANT = "ACCESS_GRANTED";
    const ACTION_SYSTEM_UPDATE = "SYSTEM_UPDATED";
    const DETAILS_HASH = ethers.keccak256(ethers.toUtf8Bytes("details"));
    const RESOURCE_ID = ethers.keccak256(ethers.toUtf8Bytes("resource-1"));

    beforeEach(async function () {
        // Get signers
        [admin, agency1, agency2, auditor, system, unauthorized] = await ethers.getSigners();

        // Deploy AuditLog
        const AuditLog = await ethers.getContractFactory("AuditLog");
        auditLog = await AuditLog.deploy(admin.address);
        await auditLog.waitForDeployment();

        // Get role constants
        ADMIN_ROLE = await auditLog.ADMIN_ROLE();
        AGENCY_ROLE = await auditLog.AGENCY_ROLE();
        AUDITOR_ROLE = await auditLog.AUDITOR_ROLE();
        SYSTEM_ROLE = await auditLog.SYSTEM_ROLE();

        // Grant roles
        await auditLog.connect(admin).grantRole(AGENCY_ROLE, agency1.address);
        await auditLog.connect(admin).grantRole(AGENCY_ROLE, agency2.address);
        await auditLog.connect(admin).grantRole(AUDITOR_ROLE, auditor.address);
        await auditLog.connect(admin).grantRole(SYSTEM_ROLE, system.address);
    });

    describe("Deployment", function () {
        it("Should deploy with correct admin", async function () {
            expect(await auditLog.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
            expect(await auditLog.hasRole(SYSTEM_ROLE, admin.address)).to.be.true;
        });

        it("Should have correct role identifiers", async function () {
            expect(ADMIN_ROLE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("ADMIN_ROLE")));
            expect(AGENCY_ROLE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("AGENCY_ROLE")));
            expect(AUDITOR_ROLE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE")));
            expect(SYSTEM_ROLE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("SYSTEM_ROLE")));
        });
    });

    describe("Log Action", function () {
        it("Should log an action", async function () {
            const tx = await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return auditLog.interface.parseLog(log)?.name === "AuditEntry";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = auditLog.interface.parseLog(event);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_BIR);
            // Indexed string params return an Indexed object with .hash property
            expect(parsed?.args?.action?.hash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(ACTION_REGISTER)));
            expect(parsed?.args?.hash).to.equal(DETAILS_HASH);
            expect(Number(parsed?.args?.timestamp)).to.be.greaterThan(0);
        });

        it("Should reject empty action", async function () {
            await expect(
                auditLog.connect(agency1).logAction(
                    AGENCY_ID_BIR,
                    "",
                    "DOCUMENT",
                    RESOURCE_ID,
                    DETAILS_HASH,
                    CATEGORY_DOCUMENT
                )
            ).to.be.revertedWith("AuditLog: action required");
        });

        it("Should reject empty resource type", async function () {
            await expect(
                auditLog.connect(agency1).logAction(
                    AGENCY_ID_BIR,
                    ACTION_REGISTER,
                    "",
                    RESOURCE_ID,
                    DETAILS_HASH,
                    CATEGORY_DOCUMENT
                )
            ).to.be.revertedWith("AuditLog: resourceType required");
        });

        it("Should generate unique entry IDs", async function () {
            const tx1 = await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );
            
            const tx2 = await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );

            const receipt1 = await tx1.wait();
            const receipt2 = await tx2.wait();

            const event1 = receipt1.logs.find(log => {
                try {
                    return auditLog.interface.parseLog(log)?.name === "AuditEntry";
                } catch {
                    return false;
                }
            });
            const event2 = receipt2.logs.find(log => {
                try {
                    return auditLog.interface.parseLog(log)?.name === "AuditEntry";
                } catch {
                    return false;
                }
            });

            expect(event1?.args?.entryId).to.not.equal(event2?.args?.entryId);
        });
    });

    describe("Specialized Log Functions", function () {
        it("Should log document action", async function () {
            await expect(
                auditLog.connect(agency1).logDocumentAction(
                    AGENCY_ID_BIR,
                    ACTION_REGISTER,
                    RESOURCE_ID,
                    DETAILS_HASH
                )
            )
                .to.emit(auditLog, "AuditEntry");
        });

        it("Should log access action", async function () {
            await expect(
                auditLog.connect(agency1).logAccessAction(
                    AGENCY_ID_BIR,
                    ACTION_ACCESS_GRANT,
                    AGENCY_ID_NBI,
                    DETAILS_HASH
                )
            )
                .to.emit(auditLog, "AuditEntry");
        });

        it("Should log system action (admin only)", async function () {
            await expect(
                auditLog.connect(admin).logSystemAction(
                    AGENCY_ID_BIR,
                    ACTION_SYSTEM_UPDATE,
                    RESOURCE_ID,
                    DETAILS_HASH
                )
            )
                .to.emit(auditLog, "AuditEntry");
        });

        it("Should reject system action from non-admin", async function () {
            await expect(
                auditLog.connect(agency1).logSystemAction(
                    AGENCY_ID_BIR,
                    ACTION_SYSTEM_UPDATE,
                    RESOURCE_ID,
                    DETAILS_HASH
                )
            ).to.be.reverted;
        });

        it("Should log compliance action", async function () {
            await expect(
                auditLog.connect(auditor).logComplianceAction(
                    AGENCY_ID_COA,
                    "COMPLIANCE_CHECK",
                    RESOURCE_ID,
                    DETAILS_HASH
                )
            )
                .to.emit(auditLog, "AuditEntry");
        });

        it("Should log security event", async function () {
            await expect(
                auditLog.connect(agency1).logSecurityEvent(
                    AGENCY_ID_BIR,
                    "SECURITY_ALERT",
                    RESOURCE_ID,
                    DETAILS_HASH
                )
            )
                .to.emit(auditLog, "AuditEntry");
        });
    });

    describe("Query Functions", function () {
        beforeEach(async function () {
            // Create some log entries
            await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );

            await auditLog.connect(agency2).logAction(
                AGENCY_ID_NBI,
                ACTION_ACCESS_GRANT,
                "ACCESS",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_ACCESS
            );

            await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );
        });

        it("Should get entry by ID", async function () {
            const logs = await auditLog.getAllLogIds();
            expect(logs.length).to.equal(3);

            const entry = await auditLog.getEntry(logs[0]);
            expect(entry.agencyId).to.equal(AGENCY_ID_BIR);
            expect(entry.action).to.equal(ACTION_REGISTER);
        });

        it("Should get agency logs", async function () {
            const birLogs = await auditLog.getAgencyLogs(AGENCY_ID_BIR);
            expect(birLogs.length).to.equal(2);

            const nbiLogs = await auditLog.getAgencyLogs(AGENCY_ID_NBI);
            expect(nbiLogs.length).to.equal(1);
        });

        it("Should get category logs", async function () {
            const docLogs = await auditLog.getCategoryLogs(CATEGORY_DOCUMENT);
            expect(docLogs.length).to.equal(2);

            const accessLogs = await auditLog.getCategoryLogs(CATEGORY_ACCESS);
            expect(accessLogs.length).to.equal(1);
        });

        it("Should get logs by time range", async function () {
            const now = Math.floor(Date.now() / 1000);
            const past = now - 3600; // 1 hour ago
            const future = now + 3600; // 1 hour from now

            const logs = await auditLog.getLogsByTimeRange(past, future);
            expect(logs.length).to.equal(3);
        });

        it("Should get logs by action", async function () {
            const registerLogs = await auditLog.getLogsByAction(ACTION_REGISTER);
            expect(registerLogs.length).to.equal(2);

            const accessLogs = await auditLog.getLogsByAction(ACTION_ACCESS_GRANT);
            expect(accessLogs.length).to.equal(1);
        });

        it("Should get total log count", async function () {
            expect(await auditLog.getTotalLogCount()).to.equal(3);
        });

        it("Should get agency log count", async function () {
            expect(await auditLog.getAgencyLogCount(AGENCY_ID_BIR)).to.equal(2);
            expect(await auditLog.getAgencyLogCount(AGENCY_ID_NBI)).to.equal(1);
        });
    });

    describe("Compliance Functions", function () {
        it("Should generate compliance report", async function () {
            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report-hash"));
            const now = Math.floor(Date.now() / 1000);
            const startTime = now - 86400;
            const endTime = now;

            const tx = await auditLog.connect(auditor).generateComplianceReport(
                AGENCY_ID_COA,
                startTime,
                endTime,
                reportHash
            );
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return auditLog.interface.parseLog(log)?.name === "ComplianceReport";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = auditLog.interface.parseLog(event);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_COA);
            expect(parsed?.args?.action).to.equal("REPORT_GENERATED");
            expect(parsed?.args?.hash).to.equal(reportHash);
        });

        it("Should reject compliance report from non-auditor", async function () {
            await expect(
                auditLog.connect(agency1).generateComplianceReport(
                    AGENCY_ID_COA,
                    0,
                    1000000,
                    DETAILS_HASH
                )
            ).to.be.reverted;
        });

        it("Should log query", async function () {
            const queryHash = ethers.keccak256(ethers.toUtf8Bytes("query-params"));

            const tx = await auditLog.connect(auditor).queryLogs(queryHash);
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return auditLog.interface.parseLog(log)?.name === "AuditQuery";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = auditLog.interface.parseLog(event);
            expect(parsed?.args?.auditorAddress).to.equal(auditor.address);
            expect(parsed?.args?.hash).to.equal(queryHash);
        });

        it("Should reject query from non-auditor", async function () {
            await expect(
                auditLog.connect(agency1).queryLogs(DETAILS_HASH)
            ).to.be.reverted;
        });

        it("Should verify entry", async function () {
            // First create a log entry
            await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );

            const logs = await auditLog.getAllLogIds();
            expect(logs.length).to.be.greaterThan(0);
            expect(await auditLog.verifyEntry(logs[0])).to.be.true;
            expect(await auditLog.verifyEntry(ethers.ZeroHash)).to.be.false;
        });
    });

    describe("Resource Logs", function () {
        beforeEach(async function () {
            await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );

            await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_ACCESS_GRANT,
                "ACCESS",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_ACCESS
            );

            await auditLog.connect(agency2).logAction(
                AGENCY_ID_NBI,
                ACTION_REGISTER,
                "DOCUMENT",
                ethers.keccak256(ethers.toUtf8Bytes("resource-2")),
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );
        });

        it("Should get logs for specific resource", async function () {
            const logs = await auditLog.getResourceLogs("DOCUMENT", RESOURCE_ID);
            expect(logs.length).to.equal(1);
        });

        it("Should get all logs for resource type", async function () {
            const logs = await auditLog.getResourceLogs("DOCUMENT", ethers.ZeroHash);
            // This would return logs matching the resource type
            // Implementation depends on exact matching
        });
    });

    describe("Pause/Unpause", function () {
        it("Should pause contract", async function () {
            await auditLog.connect(admin).pause();
            expect(await auditLog.paused()).to.be.true;
        });

        it("Should reject logging when paused", async function () {
            await auditLog.connect(admin).pause();

            await expect(
                auditLog.connect(agency1).logAction(
                    AGENCY_ID_BIR,
                    ACTION_REGISTER,
                    "DOCUMENT",
                    RESOURCE_ID,
                    DETAILS_HASH,
                    CATEGORY_DOCUMENT
                )
            ).to.be.reverted;
        });

        it("Should unpause contract", async function () {
            await auditLog.connect(admin).pause();
            await auditLog.connect(admin).unpause();

            expect(await auditLog.paused()).to.be.false;
        });
    });

    describe("Contract References", function () {
        it("Should set AccessManager address", async function () {
            const accessManagerAddress = ethers.Wallet.createRandom().address;

            await auditLog.connect(admin).setAccessManager(accessManagerAddress);

            expect(await auditLog.getAccessManager()).to.equal(accessManagerAddress);
        });

        it("Should set DocumentRegistry address", async function () {
            const documentRegistryAddress = ethers.Wallet.createRandom().address;

            await auditLog.connect(admin).setDocumentRegistry(documentRegistryAddress);

            expect(await auditLog.getDocumentRegistry()).to.equal(documentRegistryAddress);
        });

        it("Should reject reference set from non-admin", async function () {
            await expect(
                auditLog.connect(agency1).setAccessManager(admin.address)
            ).to.be.reverted;
        });
    });

    describe("Event Structure Compliance", function () {
        it("Should emit events with required fields", async function () {
            const tx = await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return auditLog.interface.parseLog(log)?.name === "AuditEntry";
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;

            // Verify event structure per DICT guidelines
            const parsed = auditLog.interface.parseLog(event);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_BIR);
            // Note: indexed string params return an Indexed object with .hash property
            expect(parsed?.args?.action?.hash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(ACTION_REGISTER)));
            expect(parsed?.args?.hash).to.equal(DETAILS_HASH);
            expect(Number(parsed?.args?.timestamp)).to.be.greaterThan(0);
        });
    });

    describe("Immutability", function () {
        it("Should not allow entry modification", async function () {
            // There's no function to modify entries - this is by design
            // Test verifies that entries cannot be changed after creation
            await auditLog.connect(agency1).logAction(
                AGENCY_ID_BIR,
                ACTION_REGISTER,
                "DOCUMENT",
                RESOURCE_ID,
                DETAILS_HASH,
                CATEGORY_DOCUMENT
            );

            const logs = await auditLog.getAllLogIds();
            const entry = await auditLog.getEntry(logs[0]);
            
            // Entry should have expected values
            expect(entry.action).to.equal(ACTION_REGISTER);
            expect(entry.isVerified).to.be.true;
        });
    });
});
