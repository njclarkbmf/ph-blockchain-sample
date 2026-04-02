// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AuditLog
 * @notice Immutable audit trail for compliance and inter-agency tracking
 *
 * COMPLIANCE NOTES:
 * - RA 10173 (Data Privacy Act): Audit logs must be immutable and tamper-evident
 * - DICT Guidelines: All system actions must be logged for COA audit
 * - COA Requirements: Audit trail retention minimum 10 years
 * - Ombudsman: Access granted for investigation purposes
 *
 * PORTABILITY:
 * - Standard EVM events (compatible with all EVM chains)
 * - No Besu-specific opcodes or precompiles
 * - Can migrate to Fabric EVM or Enterprise Besu seamlessly
 */
contract AuditLog is AccessControl, Pausable {

    // ============================================================================
    // ROLE DEFINITIONS
    // ============================================================================

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AGENCY_ROLE = keccak256("AGENCY_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant SYSTEM_ROLE = keccak256("SYSTEM_ROLE");

    // ============================================================================
    // DATA STRUCTURES
    // ============================================================================

    /**
     * @notice Audit log entry structure
     * @dev Immutable once written (append-only ledger)
     */
    struct LogEntry {
        bytes32 entryId;           // Unique entry identifier
        bytes32 agencyId;          // Agency performing the action
        address actor;             // Address of the actor
        string action;             // Action performed
        string resourceType;       // Type of resource affected
        bytes32 resourceId;        // ID of affected resource
        bytes32 hash;              // Hash of action details/evidence
        uint64 timestamp;          // Block timestamp
        uint256 blockNumber;       // Block number for verification
        bool isVerified;           // Verification status
    }

    /**
     * @notice Audit category for filtering
     */
    enum AuditCategory {
        DOCUMENT,      // Document-related actions
        ACCESS,        // Access control actions
        SYSTEM,        // System administration
        COMPLIANCE,    // Compliance-related actions
        SECURITY,      // Security events
        OTHER          // Miscellaneous
    }

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @dev Store log entries by ID
    mapping(bytes32 => LogEntry) private _entries;

    /// @dev Track entry IDs by agency for efficient querying
    mapping(bytes32 => bytes32[]) private _agencyLogs;

    /// @dev Track entry IDs by category
    mapping(AuditCategory => bytes32[]) private _categoryLogs;

    /// @dev All log entries in chronological order
    bytes32[] private _allLogs;

    /// @dev Entry counter
    uint256 private _entryCounter;

    /// @dev Reference to AccessManager for agency validation
    address private _accessManager;

    /// @dev Reference to DocumentRegistry for document validation
    address private _documentRegistry;

    // ============================================================================
    // EVENTS - Structured for compliance & inter-agency tracking
    // ============================================================================

    /// @notice Core audit event - all actions emit this
    /// @param agencyId Agency performing the action
    /// @param action Action performed (e.g., "DOCUMENT_REGISTERED", "ACCESS_GRANTED")
    /// @param timestamp Block timestamp
    /// @param hash Hash of action details for verification
    /// @param entryId Unique log entry ID
    /// @param actor Address of the actor
    /// @param resourceType Type of resource affected
    /// @param resourceId ID of affected resource
    event AuditEntry(
        bytes32 indexed agencyId,
        string indexed action,
        uint256 timestamp,
        bytes32 hash,
        bytes32 entryId,
        address indexed actor,
        string resourceType,
        bytes32 resourceId
    );

    /// @notice Emitted when audit log is queried by auditor
    /// @param auditorAddress Address of querying auditor
    /// @param timestamp Query timestamp
    /// @param hash Query parameters hash
    event AuditQuery(
        address indexed auditorAddress,
        uint256 timestamp,
        bytes32 hash
    );

    /// @notice Emitted when compliance report is generated
    /// @param agencyId Agency requesting report
    /// @param action "REPORT_GENERATED"
    /// @param timestamp Report generation timestamp
    /// @param hash Report hash
    event ComplianceReport(
        bytes32 indexed agencyId,
        string action,
        uint256 timestamp,
        bytes32 hash
    );

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address adminAddress) {
        require(adminAddress != address(0), "AuditLog: admin cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE, adminAddress);
        _grantRole(SYSTEM_ROLE, adminAddress);
    }

    // ============================================================================
    // AUDIT LOGGING FUNCTIONS
    // ============================================================================

    /**
     * @notice Internal core logging function - called by all specialized log functions
     * @param agencyId Agency performing the action
     * @param action Action performed
     * @param resourceType Type of resource (e.g., "DOCUMENT", "ACCESS")
     * @param resourceId ID of affected resource
     * @param detailsHash Hash of action details (off-chain storage pointer)
     * @param category Audit category for filtering
     * @return entryId Unique log entry identifier
     */
    function _logAction(
        bytes32 agencyId,
        string memory action,
        string memory resourceType,
        bytes32 resourceId,
        bytes32 detailsHash,
        AuditCategory category
    ) internal returns (bytes32 entryId) {
        _entryCounter++;
        entryId = keccak256(abi.encodePacked(
            agencyId,
            action,
            _entryCounter,
            block.timestamp,
            block.number
        ));

        LogEntry memory entry = LogEntry({
            entryId: entryId,
            agencyId: agencyId,
            actor: msg.sender,
            action: action,
            resourceType: resourceType,
            resourceId: resourceId,
            hash: detailsHash,
            timestamp: uint64(block.timestamp),
            blockNumber: block.number,
            isVerified: true
        });

        _entries[entryId] = entry;
        _agencyLogs[agencyId].push(entryId);
        _categoryLogs[category].push(entryId);
        _allLogs.push(entryId);

        emit AuditEntry(
            agencyId,
            action,
            block.timestamp,
            detailsHash,
            entryId,
            msg.sender,
            resourceType,
            resourceId
        );

        return entryId;
    }

    /**
     * @notice Log an action for audit trail (external entry point)
     * @param agencyId Agency performing the action
     * @param action Action performed
     * @param resourceType Type of resource (e.g., "DOCUMENT", "ACCESS")
     * @param resourceId ID of affected resource
     * @param detailsHash Hash of action details (off-chain storage pointer)
     * @param category Audit category for filtering
     *
     * COMPLIANCE:
     * - All inter-agency actions MUST be logged
     * - Logs are immutable (cannot be deleted per RA 10173)
     * - Details stored off-chain, only hash on-chain
     *
     * PORTABILITY: Standard EVM, no Besu-specific features
     *
     * @return entryId Unique log entry identifier
     */
    function logAction(
        bytes32 agencyId,
        string calldata action,
        string calldata resourceType,
        bytes32 resourceId,
        bytes32 detailsHash,
        AuditCategory category
    ) external whenNotPaused returns (bytes32 entryId) {
        require(bytes(action).length > 0, "AuditLog: action required");
        require(bytes(resourceType).length > 0, "AuditLog: resourceType required");
        return _logAction(agencyId, action, resourceType, resourceId, detailsHash, category);
    }

    /**
     * @notice Log document-related action (convenience function)
     * @param agencyId Agency identifier
     * @param action Action performed
     * @param documentId Document identifier
     * @param detailsHash Hash of action details
     *
     * @return entryId Log entry ID
     */
    function logDocumentAction(
        bytes32 agencyId,
        string calldata action,
        bytes32 documentId,
        bytes32 detailsHash
    ) external whenNotPaused returns (bytes32 entryId) {
        return _logAction(
            agencyId,
            action,
            "DOCUMENT",
            documentId,
            detailsHash,
            AuditCategory.DOCUMENT
        );
    }

    /**
     * @notice Log access control action
     * @param agencyId Agency identifier
     * @param action Action performed
     * @param targetAgencyId Target agency ID
     * @param detailsHash Hash of access details
     *
     * @return entryId Log entry ID
     */
    function logAccessAction(
        bytes32 agencyId,
        string calldata action,
        bytes32 targetAgencyId,
        bytes32 detailsHash
    ) external whenNotPaused returns (bytes32 entryId) {
        return _logAction(
            agencyId,
            action,
            "ACCESS",
            targetAgencyId,
            detailsHash,
            AuditCategory.ACCESS
        );
    }

    /**
     * @notice Log system administration action
     * @param agencyId Agency identifier
     * @param action Action performed
     * @param resourceId Affected resource ID
     * @param detailsHash Hash of action details
     *
     * @return entryId Log entry ID
     */
    function logSystemAction(
        bytes32 agencyId,
        string calldata action,
        bytes32 resourceId,
        bytes32 detailsHash
    ) external onlyRole(ADMIN_ROLE) whenNotPaused returns (bytes32 entryId) {
        return _logAction(
            agencyId,
            action,
            "SYSTEM",
            resourceId,
            detailsHash,
            AuditCategory.SYSTEM
        );
    }

    /**
     * @notice Log compliance-related action
     * @param agencyId Agency identifier
     * @param action Action performed
     * @param resourceId Affected resource ID
     * @param detailsHash Hash of compliance details
     *
     * @return entryId Log entry ID
     */
    function logComplianceAction(
        bytes32 agencyId,
        string calldata action,
        bytes32 resourceId,
        bytes32 detailsHash
    ) external whenNotPaused returns (bytes32 entryId) {
        return _logAction(
            agencyId,
            action,
            "COMPLIANCE",
            resourceId,
            detailsHash,
            AuditCategory.COMPLIANCE
        );
    }

    /**
     * @notice Log security event
     * @param agencyId Agency identifier
     * @param action Security action/event
     * @param resourceId Affected resource ID
     * @param detailsHash Hash of security details
     *
     * @return entryId Log entry ID
     */
    function logSecurityEvent(
        bytes32 agencyId,
        string calldata action,
        bytes32 resourceId,
        bytes32 detailsHash
    ) external whenNotPaused returns (bytes32 entryId) {
        return _logAction(
            agencyId,
            action,
            "SECURITY",
            resourceId,
            detailsHash,
            AuditCategory.SECURITY
        );
    }

    // ============================================================================
    // QUERY FUNCTIONS (Auditor Access)
    // ============================================================================

    /**
     * @notice Get log entry by ID
     * @param entryId Log entry identifier
     * @return LogEntry struct
     */
    function getEntry(bytes32 entryId) external view returns (LogEntry memory) {
        return _entries[entryId];
    }

    /**
     * @notice Get all log entries for an agency
     * @param agencyId Agency identifier
     * @return Array of entry IDs
     */
    function getAgencyLogs(bytes32 agencyId) external view returns (bytes32[] memory) {
        return _agencyLogs[agencyId];
    }

    /**
     * @notice Get log entries by category
     * @param category Audit category
     * @return Array of entry IDs
     */
    function getCategoryLogs(AuditCategory category) external view returns (bytes32[] memory) {
        return _categoryLogs[category];
    }

    /**
     * @notice Get log entries in time range
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @return Array of entry IDs
     */
    function getLogsByTimeRange(uint256 startTime, uint256 endTime)
        external
        view
        returns (bytes32[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < _allLogs.length; i++) {
            LogEntry memory entry = _entries[_allLogs[i]];
            if (entry.timestamp >= startTime && entry.timestamp <= endTime) {
                count++;
            }
        }

        bytes32[] memory result = new bytes32[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _allLogs.length; i++) {
            LogEntry memory entry = _entries[_allLogs[i]];
            if (entry.timestamp >= startTime && entry.timestamp <= endTime) {
                result[index] = entry.entryId;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get logs by action type
     * @param action Action string to filter
     * @return Array of entry IDs
     */
    function getLogsByAction(string calldata action) external view returns (bytes32[] memory) {
        bytes32[] memory allEntries = _allLogs;
        bytes32[] memory result = new bytes32[](allEntries.length);
        uint256 count = 0;

        for (uint256 i = 0; i < allEntries.length; i++) {
            LogEntry memory entry = _entries[allEntries[i]];
            if (keccak256(bytes(entry.action)) == keccak256(bytes(action))) {
                result[count] = entry.entryId;
                count++;
            }
        }

        bytes32[] memory trimmedResult = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            trimmedResult[i] = result[i];
        }

        return trimmedResult;
    }

    /**
     * @notice Get total log count
     * @return Total number of log entries
     */
    function getTotalLogCount() external view returns (uint256) {
        return _allLogs.length;
    }

    /**
     * @notice Get log count for agency
     * @param agencyId Agency identifier
     * @return Number of log entries for agency
     */
    function getAgencyLogCount(bytes32 agencyId) external view returns (uint256) {
        return _agencyLogs[agencyId].length;
    }

    // ============================================================================
    // COMPLIANCE FUNCTIONS
    // ============================================================================

    /**
     * @notice Generate compliance report hash (for off-chain report)
     * @param agencyId Agency requesting report
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @param reportHash Hash of the generated report (off-chain)
     *
     * COMPLIANCE: Report generation itself is logged for audit trail
     */
    function generateComplianceReport(
        bytes32 agencyId,
        uint256 startTime,
        uint256 endTime,
        bytes32 reportHash
    ) external onlyRole(AUDITOR_ROLE) whenNotPaused {
        emit ComplianceReport(agencyId, "REPORT_GENERATED", block.timestamp, reportHash);

        _logAction(
            agencyId,
            "COMPLIANCE_REPORT_GENERATED",
            "REPORT",
            keccak256(abi.encodePacked(startTime, endTime)),
            reportHash,
            AuditCategory.COMPLIANCE
        );
    }

    /**
     * @notice Query audit logs (logged for auditor accountability)
     * @param queryHash Hash of query parameters
     */
    function queryLogs(bytes32 queryHash) external onlyRole(AUDITOR_ROLE) {
        emit AuditQuery(msg.sender, block.timestamp, queryHash);
    }

    /**
     * @notice Verify log entry integrity
     * @param entryId Log entry ID
     * @return true if entry exists and is verified
     */
    function verifyEntry(bytes32 entryId) external view returns (bool) {
        LogEntry memory entry = _entries[entryId];
        return entry.entryId != bytes32(0) && entry.isVerified;
    }

    /**
     * @notice Get entry by block number (for blockchain verification)
     * @param blockNum Block number
     * @return LogEntry struct
     */
    function getEntryByBlock(uint256 blockNum) external view returns (LogEntry memory) {
        for (uint256 i = 0; i < _allLogs.length; i++) {
            LogEntry memory entry = _entries[_allLogs[i]];
            if (entry.blockNumber == blockNum) {
                return entry;
            }
        }
        return LogEntry({
            entryId: bytes32(0),
            agencyId: bytes32(0),
            actor: address(0),
            action: "",
            resourceType: "",
            resourceId: bytes32(0),
            hash: bytes32(0),
            timestamp: 0,
            blockNumber: 0,
            isVerified: false
        });
    }

    // ============================================================================
    // ADMINISTRATION FUNCTIONS
    // ============================================================================

    /**
     * @notice Set AccessManager contract reference
     * @param accessManagerAddress Address of AccessManager
     */
    function setAccessManager(address accessManagerAddress) external onlyRole(ADMIN_ROLE) {
        _accessManager = accessManagerAddress;
    }

    /**
     * @notice Set DocumentRegistry contract reference
     * @param documentRegistryAddress Address of DocumentRegistry
     */
    function setDocumentRegistry(address documentRegistryAddress) external onlyRole(ADMIN_ROLE) {
        _documentRegistry = documentRegistryAddress;
    }

    /**
     * @notice Get AccessManager address
     * @return AccessManager contract address
     */
    function getAccessManager() external view returns (address) {
        return _accessManager;
    }

    /**
     * @notice Get DocumentRegistry address
     * @return DocumentRegistry contract address
     */
    function getDocumentRegistry() external view returns (address) {
        return _documentRegistry;
    }

    /**
     * @notice Pause audit logging (emergency only)
     *
     * WARNING: Should only be used in extreme circumstances
     * Compliance impact: Audit trail gap must be documented
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause audit logging
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * @notice Get all log IDs (for export/sync)
     * @return Array of all log entry IDs
     */
    function getAllLogIds() external view returns (bytes32[] memory) {
        return _allLogs;
    }

    /**
     * @notice Get entries for specific resource
     * @param resourceType Resource type
     * @param resourceId Resource ID
     * @return Array of entry IDs
     */
    function getResourceLogs(string calldata resourceType, bytes32 resourceId)
        external
        view
        returns (bytes32[] memory)
    {
        bytes32[] memory allEntries = _allLogs;
        bytes32[] memory result = new bytes32[](allEntries.length);
        uint256 count = 0;

        for (uint256 i = 0; i < allEntries.length; i++) {
            LogEntry memory entry = _entries[allEntries[i]];
            if (
                keccak256(bytes(entry.resourceType)) == keccak256(bytes(resourceType)) &&
                entry.resourceId == resourceId
            ) {
                result[count] = entry.entryId;
                count++;
            }
        }

        bytes32[] memory trimmedResult = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            trimmedResult[i] = result[i];
        }

        return trimmedResult;
    }
}
