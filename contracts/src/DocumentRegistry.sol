// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

/**
 * @title DocumentRegistry
 * @notice Immutable document hash registry for inter-agency document tracking
 * 
 * COMPLIANCE NOTES:
 * - RA 10173 (Data Privacy Act): Only document hashes stored, NEVER original documents or PII
 * - DICT Guidelines: All documents must have agency tags for access control
 * - Audit trail: Every registration emits structured events for COA auditing
 * 
 * PORTABILITY:
 * - Standard EVM implementation, no Besu-specific opcodes
 * - Compatible with Hyperledger Fabric EVM chaincode
 * - Can migrate to Enterprise Besu with CA-based identity
 */
contract DocumentRegistry is AccessControl, Pausable {
    using EnumerableMap for EnumerableMap.Bytes32ToUintMap;

    // ============================================================================
    // ROLE DEFINITIONS (mirrored from AccessManager for standalone deployment)
    // ============================================================================
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AGENCY_ROLE = keccak256("AGENCY_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    
    // Document type classifications per DICT records management
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    // ============================================================================
    // DATA STRUCTURES
    // ============================================================================
    
    /**
     * @notice Document record structure
     * @dev Stored on-chain: hash, metadata hash, agency tags, timestamps
     * NEVER store: document content, PII, sensitive data
     */
    struct DocumentRecord {
        bytes32 documentHash;      // SHA-256 or Keccak-256 of original document
        bytes32 metadataHash;      // Hash of off-chain metadata (IPFS pointer)
        bytes32 agencyId;          // Registering agency identifier
        address agencyAddress;     // Agency's Ethereum address
        uint64 timestamp;          // Registration timestamp
        uint32 documentType;       // Document type code (per DICT classification)
        bool isActive;             // Document status (can be revoked)
        uint256 version;           // Version number for updates
    }
    
    /**
     * @notice Agency access tag for document sharing
     * @dev Defines which agencies can access a document
     */
    struct AccessTag {
        bytes32 agencyId;
        uint64 grantedAt;
        bool hasReadAccess;
        bool hasWriteAccess;
    }

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================
    
    /// @dev Map document hash to document ID
    mapping(bytes32 => bytes32) private _documentIndex;
    
    /// @dev Store document records by ID
    mapping(bytes32 => DocumentRecord) private _documents;
    
    /// @dev Track document access tags per document
    mapping(bytes32 => mapping(bytes32 => AccessTag)) private _accessTags;
    
    /// @dev Track which agencies have access to each document
    mapping(bytes32 => EnumerableMap.Bytes32ToUintMap) private _documentAgencies;
    
    /// @dev Document counter for unique IDs
    uint256 private _documentCounter;
    
    /// @dev Reference to AccessManager contract (optional, for integrated deployment)
    address private _accessManager;

    // ============================================================================
    // CONSTANTS
    // ============================================================================
    
    /// @dev Document type codes (per DICT records classification)
    uint32 public constant DOC_TYPE_CERTIFICATE = 1;
    uint32 public constant DOC_TYPE_PERMIT = 2;
    uint32 public constant DOC_TYPE_LICENSE = 3;
    uint32 public constant DOC_TYPE_CLEARANCE = 4;
    uint32 public constant DOC_TYPE_REPORT = 5;
    uint32 public constant DOC_TYPE_CONTRACT = 6;
    uint32 public constant DOC_TYPE_OTHER = 99;

    // ============================================================================
    // EVENTS - Structured for compliance & inter-agency tracking
    // ============================================================================
    
    /// @notice Emitted when a document is registered
    /// @param documentId Unique document identifier
    /// @param documentHash SHA-256/Keccak hash of the document
    /// @param agencyId Registering agency identifier
    /// @param action "REGISTERED"
    /// @param timestamp Block timestamp
    /// @param hash Alias for documentHash (compatibility standard)
    event DocumentRegistered(
        bytes32 indexed documentId,
        bytes32 indexed documentHash,
        bytes32 indexed agencyId,
        string action,
        uint256 timestamp,
        bytes32 hash
    );
    
    /// @notice Emitted when document access is granted to an agency
    /// @param documentId Document identifier
    /// @param agencyId Agency granted access
    /// @param action "ACCESS_GRANTED"
    /// @param timestamp Block timestamp
    event AccessGranted(
        bytes32 indexed documentId,
        bytes32 indexed agencyId,
        string action,
        uint256 timestamp
    );
    
    /// @notice Emitted when document access is revoked
    /// @param documentId Document identifier
    /// @param agencyId Agency access revoked
    /// @param action "ACCESS_REVOKED"
    /// @param timestamp Block timestamp
    event AccessRevoked(
        bytes32 indexed documentId,
        bytes32 indexed agencyId,
        string action,
        uint256 timestamp
    );
    
    /// @notice Emitted when document is revoked/superseded
    /// @param documentId Document identifier
    /// @param agencyId Revoking agency
    /// @param action "REVOKED"
    /// @param timestamp Block timestamp
    event DocumentRevoked(
        bytes32 indexed documentId,
        bytes32 indexed agencyId,
        string action,
        uint256 timestamp
    );
    
    /// @notice Emitted when document is updated (new version)
    /// @param documentId Document identifier
    /// @param newVersion New version number
    /// @param action "UPDATED"
    /// @param timestamp Block timestamp
    event DocumentUpdated(
        bytes32 indexed documentId,
        uint256 newVersion,
        string action,
        uint256 timestamp
    );

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================
    
    constructor(address adminAddress) {
        require(adminAddress != address(0), "DocumentRegistry: admin cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE, adminAddress);
        _grantRole(AGENCY_ROLE, adminAddress);
    }

    // ============================================================================
    // DOCUMENT REGISTRATION FUNCTIONS
    // ============================================================================

    /**
     * @notice Internal core document registration function
     * @return documentId Unique identifier for the registered document
     */
    function _registerDocument(
        bytes32 documentHash,
        bytes32 metadataHash,
        bytes32 agencyId,
        uint32 documentType
    ) internal returns (bytes32 documentId) {
        _documentCounter++;
        documentId = keccak256(abi.encodePacked(documentHash, _documentCounter, block.timestamp));

        _documentIndex[documentHash] = documentId;
        _documents[documentId] = DocumentRecord({
            documentHash: documentHash,
            metadataHash: metadataHash,
            agencyId: agencyId,
            agencyAddress: msg.sender,
            timestamp: uint64(block.timestamp),
            documentType: documentType,
            isActive: true,
            version: 1
        });

        _accessTags[documentId][agencyId] = AccessTag({
            agencyId: agencyId,
            grantedAt: uint64(block.timestamp),
            hasReadAccess: true,
            hasWriteAccess: true
        });

        emit DocumentRegistered(
            documentId,
            documentHash,
            agencyId,
            "REGISTERED",
            block.timestamp,
            documentHash
        );

        return documentId;
    }

    /**
     * @notice Register a new document hash
     * @param documentHash SHA-256 or Keccak-256 hash of the original document
     * @param metadataHash Hash of off-chain metadata (IPFS CID or storage pointer)
     * @param agencyId Unique agency identifier
     * @param documentType Document type code (see constants)
     *
     * COMPLIANCE:
     * - Only hashes stored on-chain (RA 10173)
     * - Original document must be stored off-chain in secure government storage
     *
     * PORTABILITY: Standard EVM, no Besu-specific features
     *
     * @return documentId Unique identifier for the registered document
     */
    function registerDocument(
        bytes32 documentHash,
        bytes32 metadataHash,
        bytes32 agencyId,
        uint32 documentType
    ) external onlyRole(AGENCY_ROLE) whenNotPaused returns (bytes32 documentId) {
        require(documentHash != bytes32(0), "DocumentRegistry: zero hash");
        require(_documentIndex[documentHash] == bytes32(0), "DocumentRegistry: duplicate hash");
        require(documentType > 0, "DocumentRegistry: invalid type");
        return _registerDocument(documentHash, metadataHash, agencyId, documentType);
    }

    /**
     * @notice Batch register multiple documents (gas efficient)
     * @param documentHashes Array of document hashes
     * @param metadataHashes Array of metadata hashes
     * @param agencyId Agency identifier
     * @param documentType Document type code
     *
     * @return documentIds Array of generated document IDs
     */
    function batchRegisterDocuments(
        bytes32[] calldata documentHashes,
        bytes32[] calldata metadataHashes,
        bytes32 agencyId,
        uint32 documentType
    ) external onlyRole(AGENCY_ROLE) whenNotPaused returns (bytes32[] memory documentIds) {
        require(
            documentHashes.length == metadataHashes.length,
            "DocumentRegistry: array length mismatch"
        );

        documentIds = new bytes32[](documentHashes.length);

        for (uint256 i = 0; i < documentHashes.length; i++) {
            require(documentHashes[i] != bytes32(0), "DocumentRegistry: zero hash");
            require(_documentIndex[documentHashes[i]] == bytes32(0), "DocumentRegistry: duplicate hash");
            require(documentType > 0, "DocumentRegistry: invalid type");
            documentIds[i] = _registerDocument(
                documentHashes[i],
                metadataHashes[i],
                agencyId,
                documentType
            );
        }

        return documentIds;
    }

    // ============================================================================
    // ACCESS CONTROL FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Grant document access to another agency
     * @param documentId Document identifier
     * @param targetAgencyId Agency to grant access to
     * @param readAccess Grant read access
     * @param writeAccess Grant write access (for amendments)
     *
     * COMPLIANCE: Inter-agency sharing must be logged for audit trail
     */
    function grantAccess(
        bytes32 documentId,
        bytes32 targetAgencyId,
        bool readAccess,
        bool writeAccess
    ) external whenNotPaused {
        DocumentRecord storage doc = _documents[documentId];
        require(doc.isActive, "DocumentRegistry: document not active");
        require(
            doc.agencyAddress == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "DocumentRegistry: not authorized"
        );

        _accessTags[documentId][targetAgencyId] = AccessTag({
            agencyId: targetAgencyId,
            grantedAt: uint64(block.timestamp),
            hasReadAccess: readAccess,
            hasWriteAccess: writeAccess
        });

        emit AccessGranted(documentId, targetAgencyId, "ACCESS_GRANTED", block.timestamp);
    }

    /**
     * @notice Revoke document access from an agency
     * @param documentId Document identifier
     * @param targetAgencyId Agency to revoke access from
     */
    function revokeAccess(bytes32 documentId, bytes32 targetAgencyId) external whenNotPaused {
        DocumentRecord storage doc = _documents[documentId];
        require(doc.isActive, "DocumentRegistry: document not active");
        require(
            doc.agencyAddress == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "DocumentRegistry: not authorized"
        );

        delete _accessTags[documentId][targetAgencyId];
        emit AccessRevoked(documentId, targetAgencyId, "ACCESS_REVOKED", block.timestamp);
    }
    
    /**
     * @notice Check if agency has read access to document
     * @param documentId Document identifier
     * @param agencyId Agency to check
     * @return true if has read access
     */
    function hasReadAccess(bytes32 documentId, bytes32 agencyId) external view returns (bool) {
        DocumentRecord storage doc = _documents[documentId];
        if (doc.agencyId == agencyId) return true;
        return _accessTags[documentId][agencyId].hasReadAccess;
    }
    
    /**
     * @notice Check if agency has write access to document
     * @param documentId Document identifier
     * @param agencyId Agency to check
     * @return true if has write access
     */
    function hasWriteAccess(bytes32 documentId, bytes32 agencyId) external view returns (bool) {
        if (_documents[documentId].agencyId == agencyId) return true;
        return _accessTags[documentId][agencyId].hasWriteAccess;
    }

    // ============================================================================
    // DOCUMENT LIFECYCLE FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Update document with new version (supersedes previous)
     * @param documentId Original document identifier
     * @param newDocumentHash Hash of updated document
     * @param newMetadataHash Hash of new metadata
     * 
     * @return newDocumentId ID of the new version
     */
    function updateDocument(
        bytes32 documentId,
        bytes32 newDocumentHash,
        bytes32 newMetadataHash
    ) external onlyRole(AGENCY_ROLE) whenNotPaused returns (bytes32 newDocumentId) {
        DocumentRecord storage doc = _documents[documentId];
        require(doc.isActive, "DocumentRegistry: document not active");
        require(
            doc.agencyAddress == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "DocumentRegistry: not authorized"
        );
        
        // Mark old version as inactive
        doc.isActive = false;
        
        // Register new version
        _documentCounter++;
        newDocumentId = keccak256(abi.encodePacked(newDocumentHash, _documentCounter, block.timestamp));
        
        _documentIndex[newDocumentHash] = newDocumentId;
        _documents[newDocumentId] = DocumentRecord({
            documentHash: newDocumentHash,
            metadataHash: newMetadataHash,
            agencyId: doc.agencyId,
            agencyAddress: msg.sender,
            timestamp: uint64(block.timestamp),
            documentType: doc.documentType,
            isActive: true,
            version: doc.version + 1
        });
        
        // Copy access tags to new version
        _accessTags[newDocumentId][doc.agencyId] = AccessTag({
            agencyId: doc.agencyId,
            grantedAt: uint64(block.timestamp),
            hasReadAccess: true,
            hasWriteAccess: true
        });
        
        emit DocumentUpdated(newDocumentId, doc.version + 1, "UPDATED", block.timestamp);
        
        return newDocumentId;
    }
    
    /**
     * @notice Revoke a document (e.g., superseded, invalidated)
     * @param documentId Document identifier
     */
    function revokeDocument(bytes32 documentId, bytes32 /* reason */) external whenNotPaused {
        DocumentRecord storage doc = _documents[documentId];
        require(doc.isActive, "DocumentRegistry: document not active");
        require(
            doc.agencyAddress == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
            "DocumentRegistry: not authorized"
        );
        
        doc.isActive = false;
        emit DocumentRevoked(documentId, doc.agencyId, "REVOKED", block.timestamp);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Get document record by ID
     * @param documentId Document identifier
     * @return DocumentRecord struct
     */
    function getDocument(bytes32 documentId) external view returns (DocumentRecord memory) {
        return _documents[documentId];
    }
    
    /**
     * @notice Get document by hash
     * @param documentHash Document hash
     * @return DocumentRecord struct
     */
    function getDocumentByHash(bytes32 documentHash) external view returns (DocumentRecord memory) {
        bytes32 documentId = _documentIndex[documentHash];
        return _documents[documentId];
    }
    
    /**
     * @notice Check if document hash exists
     * @param documentHash Document hash
     * @return true if exists
     */
    function documentExists(bytes32 documentHash) external view returns (bool) {
        return _documentIndex[documentHash] != bytes32(0);
    }
    
    /**
     * @notice Get document count
     * @return Total registered documents
     */
    function getDocumentCount() external view returns (uint256) {
        return _documentCounter;
    }
    
    /**
     * @notice Get access tag for agency on document
     * @param documentId Document identifier
     * @param agencyId Agency identifier
     * @return AccessTag struct
     */
    function getAccessTag(bytes32 documentId, bytes32 agencyId) external view returns (AccessTag memory) {
        return _accessTags[documentId][agencyId];
    }
    
    /**
     * @notice Set AccessManager contract reference
     * @param accessManagerAddress Address of AccessManager contract
     */
    function setAccessManager(address accessManagerAddress) external onlyRole(ADMIN_ROLE) {
        _accessManager = accessManagerAddress;
    }
    
    /**
     * @notice Get AccessManager contract address
     * @return Address of AccessManager
     */
    function getAccessManager() external view returns (address) {
        return _accessManager;
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Get caller's agency ID (placeholder for integration)
     * @dev In production, integrate with AccessManager or identity system
     * @return Agency ID bytes32
     */
    function _getCallerAgencyId() internal view returns (bytes32) {
        // TODO: Integrate with AccessManager.getAgencyId(msg.sender)
        // For now, derive from address (placeholder)
        return keccak256(abi.encodePacked(msg.sender));
    }
    
    /**
     * @notice Pause contract operations
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause contract operations
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}
