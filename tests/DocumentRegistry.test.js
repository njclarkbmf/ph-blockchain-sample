const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * DocumentRegistry Test Suite
 * 
 * Tests for the DocumentRegistry smart contract which handles
 * document hash registration for Philippine Government agencies.
 * 
 * COMPLIANCE:
 * - Tests verify RA 10173 compliance (only hashes stored, no PII)
 * - Tests verify DICT guidelines (proper access control)
 */

describe("DocumentRegistry", function () {
    let documentRegistry;
    let admin, agency1, agency2, auditor, unauthorized;

    // Role constants
    let ADMIN_ROLE, AGENCY_ROLE, AUDITOR_ROLE;

    // Agency IDs
    const AGENCY_ID_BIR = ethers.keccak256(ethers.toUtf8Bytes("BIR-001"));
    const AGENCY_ID_NBI = ethers.keccak256(ethers.toUtf8Bytes("NBI-001"));
    const AGENCY_ID_DOH = ethers.keccak256(ethers.toUtf8Bytes("DOH-001"));

    // Document hashes (simulating SHA-256 hashes)
    const DOC_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("document-content-1"));
    const DOC_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("document-content-2"));
    const DOC_HASH_3 = ethers.keccak256(ethers.toUtf8Bytes("document-content-3"));
    
    // Metadata hashes (IPFS pointers)
    const METADATA_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmDoc1"));
    const METADATA_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("ipfs://QmDoc2"));

    // Document types
    const DOC_TYPE_CERTIFICATE = 1;
    const DOC_TYPE_PERMIT = 2;
    const DOC_TYPE_LICENSE = 3;
    const DOC_TYPE_CLEARANCE = 4;
    const DOC_TYPE_REPORT = 5;
    const DOC_TYPE_CONTRACT = 6;
    const DOC_TYPE_OTHER = 99;

    beforeEach(async function () {
        // Get signers
        [admin, agency1, agency2, auditor, unauthorized] = await ethers.getSigners();

        // Deploy DocumentRegistry
        const DocumentRegistry = await ethers.getContractFactory("DocumentRegistry");
        documentRegistry = await DocumentRegistry.deploy(admin.address);
        await documentRegistry.waitForDeployment();

        // Get role constants
        ADMIN_ROLE = await documentRegistry.ADMIN_ROLE();
        AGENCY_ROLE = await documentRegistry.AGENCY_ROLE();
        AUDITOR_ROLE = await documentRegistry.AUDITOR_ROLE();

        // Grant agency roles
        await documentRegistry.connect(admin).grantRole(AGENCY_ROLE, agency1.address);
        await documentRegistry.connect(admin).grantRole(AGENCY_ROLE, agency2.address);
        await documentRegistry.connect(admin).grantRole(AUDITOR_ROLE, auditor.address);
    });

    describe("Deployment", function () {
        it("Should deploy with correct admin", async function () {
            expect(await documentRegistry.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
            expect(await documentRegistry.hasRole(AGENCY_ROLE, admin.address)).to.be.true;
        });

        it("Should have correct document type constants", async function () {
            expect(await documentRegistry.DOC_TYPE_CERTIFICATE()).to.equal(DOC_TYPE_CERTIFICATE);
            expect(await documentRegistry.DOC_TYPE_PERMIT()).to.equal(DOC_TYPE_PERMIT);
            expect(await documentRegistry.DOC_TYPE_LICENSE()).to.equal(DOC_TYPE_LICENSE);
            expect(await documentRegistry.DOC_TYPE_CLEARANCE()).to.equal(DOC_TYPE_CLEARANCE);
            expect(await documentRegistry.DOC_TYPE_REPORT()).to.equal(DOC_TYPE_REPORT);
            expect(await documentRegistry.DOC_TYPE_CONTRACT()).to.equal(DOC_TYPE_CONTRACT);
            expect(await documentRegistry.DOC_TYPE_OTHER()).to.equal(DOC_TYPE_OTHER);
        });
    });

    describe("Document Registration", function () {
        it("Should register a document", async function () {
            const tx = await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_1,
                METADATA_HASH_1,
                AGENCY_ID_BIR,
                DOC_TYPE_CERTIFICATE
            );
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = documentRegistry.interface.parseLog(event);
            expect(parsed?.args?.documentHash).to.equal(DOC_HASH_1);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_BIR);
            expect(parsed?.args?.action).to.equal("REGISTERED");

            // Verify document exists
            expect(await documentRegistry.documentExists(DOC_HASH_1)).to.be.true;
            expect(await documentRegistry.getDocumentCount()).to.equal(1);
        });

        it("Should reject registration from non-agency", async function () {
            await expect(
                documentRegistry.connect(unauthorized).registerDocument(
                    DOC_HASH_1,
                    METADATA_HASH_1,
                    AGENCY_ID_BIR,
                    DOC_TYPE_CERTIFICATE
                )
            ).to.be.reverted;
        });

        it("Should reject zero hash", async function () {
            await expect(
                documentRegistry.connect(agency1).registerDocument(
                    ethers.ZeroHash,
                    METADATA_HASH_1,
                    AGENCY_ID_BIR,
                    DOC_TYPE_CERTIFICATE
                )
            ).to.be.revertedWith("DocumentRegistry: zero hash");
        });

        it("Should reject duplicate hash", async function () {
            await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_1,
                METADATA_HASH_1,
                AGENCY_ID_BIR,
                DOC_TYPE_CERTIFICATE
            );

            await expect(
                documentRegistry.connect(agency2).registerDocument(
                    DOC_HASH_1,
                    METADATA_HASH_2,
                    AGENCY_ID_NBI,
                    DOC_TYPE_PERMIT
                )
            ).to.be.revertedWith("DocumentRegistry: duplicate hash");
        });

        it("Should reject invalid document type", async function () {
            await expect(
                documentRegistry.connect(agency1).registerDocument(
                    DOC_HASH_1,
                    METADATA_HASH_1,
                    AGENCY_ID_BIR,
                    0 // Invalid type
                )
            ).to.be.revertedWith("DocumentRegistry: invalid type");
        });

        it("Should generate unique document IDs", async function () {
            const tx1 = await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_1,
                METADATA_HASH_1,
                AGENCY_ID_BIR,
                DOC_TYPE_CERTIFICATE
            );
            
            const tx2 = await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_2,
                METADATA_HASH_2,
                AGENCY_ID_BIR,
                DOC_TYPE_PERMIT
            );

            // Get document IDs from events
            const receipt1 = await tx1.wait();
            const receipt2 = await tx2.wait();
            
            const event1 = receipt1.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });
            const event2 = receipt2.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });

            expect(event1?.args?.[0]).to.not.equal(event2?.args?.[0]);
        });
    });

    describe("Batch Registration", function () {
        it("Should register multiple documents in batch", async function () {
            const hashes = [DOC_HASH_1, DOC_HASH_2, DOC_HASH_3];
            const metadata = [METADATA_HASH_1, METADATA_HASH_2, METADATA_HASH_1];
            
            const tx = await documentRegistry.connect(agency1).batchRegisterDocuments(
                hashes,
                metadata,
                AGENCY_ID_BIR,
                DOC_TYPE_REPORT
            );
            
            const receipt = await tx.wait();
            
            // Count DocumentRegistered events
            const registerEvents = receipt.logs.filter(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });
            
            expect(registerEvents.length).to.equal(3);
            expect(await documentRegistry.getDocumentCount()).to.equal(3);
        });

        it("Should reject batch with mismatched array lengths", async function () {
            const hashes = [DOC_HASH_1, DOC_HASH_2];
            const metadata = [METADATA_HASH_1]; // Mismatched length
            
            await expect(
                documentRegistry.connect(agency1).batchRegisterDocuments(
                    hashes,
                    metadata,
                    AGENCY_ID_BIR,
                    DOC_TYPE_REPORT
                )
            ).to.be.revertedWith("DocumentRegistry: array length mismatch");
        });
    });

    describe("Document Access Control", function () {
        let documentId;

        beforeEach(async function () {
            const tx = await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_1,
                METADATA_HASH_1,
                AGENCY_ID_BIR,
                DOC_TYPE_CERTIFICATE
            );
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });
            documentId = event?.args?.[0];
        });

        it("Should grant access to another agency", async function () {
            const tx = await documentRegistry.connect(agency1).grantAccess(
                documentId,
                AGENCY_ID_NBI,
                true, // read access
                false // write access
            );
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "AccessGranted";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = documentRegistry.interface.parseLog(event);
            expect(parsed?.args?.documentId).to.equal(documentId);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_NBI);
            expect(parsed?.args?.action).to.equal("ACCESS_GRANTED");

            expect(await documentRegistry.hasReadAccess(documentId, AGENCY_ID_NBI)).to.be.true;
            expect(await documentRegistry.hasWriteAccess(documentId, AGENCY_ID_NBI)).to.be.false;
        });

        it("Should revoke access", async function () {
            await documentRegistry.connect(agency1).grantAccess(
                documentId,
                AGENCY_ID_NBI,
                true,
                true
            );

            const tx = await documentRegistry.connect(agency1).revokeAccess(documentId, AGENCY_ID_NBI);
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "AccessRevoked";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = documentRegistry.interface.parseLog(event);
            expect(parsed?.args?.documentId).to.equal(documentId);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_NBI);
            expect(parsed?.args?.action).to.equal("ACCESS_REVOKED");

            expect(await documentRegistry.hasReadAccess(documentId, AGENCY_ID_NBI)).to.be.false;
        });

        it("Should reject access grant from unauthorized agency", async function () {
            await expect(
                documentRegistry.connect(agency2).grantAccess(
                    documentId,
                    AGENCY_ID_NBI,
                    true,
                    false
                )
            ).to.be.reverted;
        });

        it("Owner should always have access", async function () {
            expect(await documentRegistry.hasReadAccess(documentId, AGENCY_ID_BIR)).to.be.true;
            expect(await documentRegistry.hasWriteAccess(documentId, AGENCY_ID_BIR)).to.be.true;
        });
    });

    describe("Document Lifecycle", function () {
        let documentId;

        beforeEach(async function () {
            const tx = await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_1,
                METADATA_HASH_1,
                AGENCY_ID_BIR,
                DOC_TYPE_CERTIFICATE
            );
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });
            documentId = event?.args?.[0];
        });

        it("Should update document with new version", async function () {
            const tx = await documentRegistry.connect(agency1).updateDocument(
                documentId,
                DOC_HASH_2,
                METADATA_HASH_2
            );
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentUpdated";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = documentRegistry.interface.parseLog(event);
            // The event emits the NEW document ID, not the old one
            expect(parsed?.args?.newVersion).to.equal(2);
            expect(parsed?.args?.action).to.equal("UPDATED");

            // Original should be inactive
            const originalDoc = await documentRegistry.getDocument(documentId);
            expect(originalDoc.isActive).to.be.false;
        });

        it("Should revoke document", async function () {
            const tx = await documentRegistry.connect(agency1).revokeDocument(
                documentId,
                ethers.keccak256(ethers.toUtf8Bytes("superseded"))
            );
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRevoked";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;
            const parsed = documentRegistry.interface.parseLog(event);
            expect(parsed?.args?.documentId).to.equal(documentId);
            expect(parsed?.args?.agencyId).to.equal(AGENCY_ID_BIR);
            expect(parsed?.args?.action).to.equal("REVOKED");

            const doc = await documentRegistry.getDocument(documentId);
            expect(doc.isActive).to.be.false;
        });

        it("Should reject update from unauthorized agency", async function () {
            await expect(
                documentRegistry.connect(agency2).updateDocument(
                    documentId,
                    DOC_HASH_2,
                    METADATA_HASH_2
                )
            ).to.be.reverted;
        });

        it("Should reject operations on inactive document", async function () {
            await documentRegistry.connect(agency1).revokeDocument(
                documentId,
                ethers.keccak256(ethers.toUtf8Bytes("superseded"))
            );

            await expect(
                documentRegistry.connect(agency1).grantAccess(
                    documentId,
                    AGENCY_ID_NBI,
                    true,
                    false
                )
            ).to.be.revertedWith("DocumentRegistry: document not active");
        });
    });

    describe("View Functions", function () {
        let documentId;

        beforeEach(async function () {
            const tx = await documentRegistry.connect(agency1).registerDocument(
                DOC_HASH_1,
                METADATA_HASH_1,
                AGENCY_ID_BIR,
                DOC_TYPE_CERTIFICATE
            );
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    return documentRegistry.interface.parseLog(log)?.name === "DocumentRegistered";
                } catch {
                    return false;
                }
            });
            documentId = event?.args?.[0];
        });

        it("Should get document by ID", async function () {
            const doc = await documentRegistry.getDocument(documentId);
            
            expect(doc.documentHash).to.equal(DOC_HASH_1);
            expect(doc.metadataHash).to.equal(METADATA_HASH_1);
            expect(doc.agencyId).to.equal(AGENCY_ID_BIR);
            expect(doc.documentType).to.equal(DOC_TYPE_CERTIFICATE);
            expect(doc.isActive).to.be.true;
            expect(doc.version).to.equal(1);
        });

        it("Should get document by hash", async function () {
            const doc = await documentRegistry.getDocumentByHash(DOC_HASH_1);
            expect(doc.documentHash).to.equal(DOC_HASH_1);
        });

        it("Should check document existence", async function () {
            expect(await documentRegistry.documentExists(DOC_HASH_1)).to.be.true;
            expect(await documentRegistry.documentExists(DOC_HASH_2)).to.be.false;
        });

        it("Should get access tag", async function () {
            const tag = await documentRegistry.getAccessTag(documentId, AGENCY_ID_BIR);
            expect(tag.hasReadAccess).to.be.true;
            expect(tag.hasWriteAccess).to.be.true;
        });
    });

    describe("Pause/Unpause", function () {
        it("Should pause contract", async function () {
            await documentRegistry.connect(admin).pause();
            expect(await documentRegistry.paused()).to.be.true;
        });

        it("Should reject registration when paused", async function () {
            await documentRegistry.connect(admin).pause();
            
            await expect(
                documentRegistry.connect(agency1).registerDocument(
                    DOC_HASH_1,
                    METADATA_HASH_1,
                    AGENCY_ID_BIR,
                    DOC_TYPE_CERTIFICATE
                )
            ).to.be.reverted;
        });

        it("Should unpause contract", async function () {
            await documentRegistry.connect(admin).pause();
            await documentRegistry.connect(admin).unpause();
            
            expect(await documentRegistry.paused()).to.be.false;
        });
    });

    describe("AccessManager Integration", function () {
        it("Should set AccessManager address", async function () {
            const accessManagerAddress = ethers.Wallet.createRandom().address;
            
            await documentRegistry.connect(admin).setAccessManager(accessManagerAddress);
            
            expect(await documentRegistry.getAccessManager()).to.equal(accessManagerAddress);
        });

        it("Should reject AccessManager set from non-admin", async function () {
            await expect(
                documentRegistry.connect(agency1).setAccessManager(admin.address)
            ).to.be.reverted;
        });
    });
});
