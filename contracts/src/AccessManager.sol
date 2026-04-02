// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title AccessManager
 * @notice Role-based access control for Philippine Government Federated Blockchain
 * 
 * COMPLIANCE NOTES:
 * - RA 10173 (Data Privacy Act): No PII stored on-chain, only role assignments
 * - DICT Guidelines: Centralized role management with audit trail
 * - Agency roles: ADMIN (DICT), AGENCY (BIR/NBI/DOH), AUDITOR (COA/Ombudsman)
 * 
 * PORTABILITY:
 * - Uses standard OpenZeppelin AccessControl (compatible with Fabric EVM, Enterprise Besu)
 * - No Besu-specific calls - pure EVM implementation
 * - Can be migrated to any EVM-compatible permissioned network
 */
contract AccessManager is AccessControl, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============================================================================
    // ROLE DEFINITIONS
    // ============================================================================
    
    /// @dev ADMIN role - Department of Information and Communications Technology (DICT)
    /// Has full system control: can add/remove agencies, pause system, upgrade contracts
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    /// @dev AGENCY role - Government agencies (BIR, NBI, DOH, etc.)
    /// Can register documents, access shared records within their permission scope
    bytes32 public constant AGENCY_ROLE = keccak256("AGENCY_ROLE");
    
    /// @dev AUDITOR role - Commission on Audit (COA), Office of the Ombudsman
    /// Read-only access to all records for compliance auditing
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    
    /// @dev OPERATOR role - Network node operators
    /// Can perform operational tasks without full admin privileges
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ============================================================================
    // STATE VARIABLES
    // ============================================================================
    
    /// @dev Track registered agencies for compliance reporting
    EnumerableSet.AddressSet private _registeredAgencies;
    
    /// @dev Agency metadata mapping (agencyId => metadata hash)
    /// NOTE: Only store IPFS hash or off-chain pointer, never PII
    mapping(bytes32 => string) private _agencyMetadata;
    
    /// @dev Track suspended agencies (for compliance violations)
    mapping(address => bool) private _suspendedAgencies;

    // ============================================================================
    // EVENTS - Structured for compliance & inter-agency tracking
    // ============================================================================
    
    /// @notice Emitted when a new agency is registered
    /// @param agencyId Unique agency identifier (e.g., "BIR-001")
    /// @param agencyAddress Ethereum address of the agency
    /// @param timestamp Block timestamp
    /// @param hash Metadata hash for off-chain agency details
    event AgencyRegistered(
        bytes32 indexed agencyId,
        address indexed agencyAddress,
        uint256 timestamp,
        string hash
    );
    
    /// @notice Emitted when an agency is suspended
    /// @param agencyAddress Address of suspended agency
    /// @param reason Reason code for suspension
    /// @param timestamp Block timestamp
    event AgencySuspended(
        address indexed agencyAddress,
        string reason,
        uint256 timestamp
    );
    
    /// @notice Emitted when an agency is reactivated
    /// @param agencyAddress Address of reactivated agency
    /// @param timestamp Block timestamp
    event AgencyReactivated(
        address indexed agencyAddress,
        uint256 timestamp
    );
    
    /// @notice Emitted when role is granted
    /// @param agencyId Agency identifier
    /// @param role Role granted
    /// @param timestamp Block timestamp
    event RoleGranted(
        bytes32 indexed agencyId,
        bytes32 indexed role,
        uint256 timestamp
    );
    
    /// @notice Emitted when role is revoked
    /// @param agencyId Agency identifier
    /// @param role Role revoked
    /// @param timestamp Block timestamp
    event RoleRevoked(
        bytes32 indexed agencyId,
        bytes32 indexed role,
        uint256 timestamp
    );

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================
    
    constructor(address adminAddress) {
        require(adminAddress != address(0), "AccessManager: admin address cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _grantRole(ADMIN_ROLE, adminAddress);
    }

    // ============================================================================
    // AGENCY MANAGEMENT FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Register a new government agency
     * @param agencyId Unique agency identifier (e.g., keccak256("BIR-001"))
     * @param agencyAddress Ethereum address for the agency
     * @param metadataHash IPFS hash or off-chain pointer to agency details
     * 
     * COMPLIANCE: Only metadata hash stored, no PII on-chain (RA 10173)
     * PORTABILITY: Standard EVM function, no Besu-specific calls
     */
    function registerAgency(
        bytes32 agencyId,
        address agencyAddress,
        string calldata metadataHash
    ) external onlyRole(ADMIN_ROLE) whenNotPaused {
        require(agencyAddress != address(0), "AccessManager: zero address");
        require(!_registeredAgencies.contains(agencyAddress), "AccessManager: agency already registered");
        
        _registeredAgencies.add(agencyAddress);
        _agencyMetadata[agencyId] = metadataHash;
        _grantRole(AGENCY_ROLE, agencyAddress);
        
        emit AgencyRegistered(agencyId, agencyAddress, block.timestamp, metadataHash);
        emit RoleGranted(agencyId, AGENCY_ROLE, block.timestamp);
    }
    
    /**
     * @notice Suspend an agency for compliance violations
     * @param agencyAddress Address of agency to suspend
     * @param reason Reason code for suspension
     * 
     * COMPLIANCE: Required for DICT oversight and audit trail
     */
    function suspendAgency(address agencyAddress, string calldata reason) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(hasRole(AGENCY_ROLE, agencyAddress), "AccessManager: not an agency");
        require(!_suspendedAgencies[agencyAddress], "AccessManager: already suspended");
        
        _suspendedAgencies[agencyAddress] = true;
        emit AgencySuspended(agencyAddress, reason, block.timestamp);
    }
    
    /**
     * @notice Reactivate a suspended agency
     * @param agencyAddress Address of agency to reactivate
     */
    function reactivateAgency(address agencyAddress) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(_suspendedAgencies[agencyAddress], "AccessManager: not suspended");
        
        _suspendedAgencies[agencyAddress] = false;
        emit AgencyReactivated(agencyAddress, block.timestamp);
    }
    
    /**
     * @notice Remove an agency from the network
     * @param agencyAddress Address of agency to remove
     */
    function removeAgency(address agencyAddress) 
        external 
        onlyRole(ADMIN_ROLE) 
        whenNotPaused 
    {
        require(_registeredAgencies.contains(agencyAddress), "AccessManager: agency not registered");
        
        _registeredAgencies.remove(agencyAddress);
        _revokeRole(AGENCY_ROLE, agencyAddress);
        _suspendedAgencies[agencyAddress] = false;
    }

    // ============================================================================
    // ROLE MANAGEMENT FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Grant auditor role to compliance officer
     * @param auditorAddress Address of the auditor
     * @param agencyId Agency identifier for the auditor
     * 
     * PORTABILITY: Compatible with Fabric EVM chaincode
     */
    function grantAuditorRole(address auditorAddress, bytes32 agencyId) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(!hasRole(AUDITOR_ROLE, auditorAddress), "AccessManager: already auditor");
        _grantRole(AUDITOR_ROLE, auditorAddress);
        emit RoleGranted(agencyId, AUDITOR_ROLE, block.timestamp);
    }
    
    /**
     * @notice Grant operator role to network operator
     * @param operatorAddress Address of the operator
     * @param agencyId Agency identifier
     */
    function grantOperatorRole(address operatorAddress, bytes32 agencyId) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(!hasRole(OPERATOR_ROLE, operatorAddress), "AccessManager: already operator");
        _grantRole(OPERATOR_ROLE, operatorAddress);
        emit RoleGranted(agencyId, OPERATOR_ROLE, block.timestamp);
    }
    
    /**
     * @notice Revoke a role from an address
     * @param role Role to revoke
     * @param account Address to revoke role from
     * @param agencyId Agency identifier
     */
    function revokeRole(bytes32 role, address account, bytes32 agencyId) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        require(role != DEFAULT_ADMIN_ROLE, "AccessManager: cannot revoke admin");
        _revokeRole(role, account);
        emit RoleRevoked(agencyId, role, block.timestamp);
    }

    // ============================================================================
    // SYSTEM ADMINISTRATION FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Pause all contract operations (emergency shutdown)
     * 
     * COMPLIANCE: Required for incident response per DICT guidelines
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Resume contract operations after pause
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Check if an agency is registered
     * @param agencyAddress Address to check
     * @return true if registered
     */
    function isAgencyRegistered(address agencyAddress) external view returns (bool) {
        return _registeredAgencies.contains(agencyAddress);
    }
    
    /**
     * @notice Check if an agency is suspended
     * @param agencyAddress Address to check
     * @return true if suspended
     */
    function isAgencySuspended(address agencyAddress) external view returns (bool) {
        return _suspendedAgencies[agencyAddress];
    }
    
    /**
     * @notice Get agency metadata hash
     * @param agencyId Agency identifier
     * @return Metadata hash string
     */
    function getAgencyMetadata(bytes32 agencyId) external view returns (string memory) {
        return _agencyMetadata[agencyId];
    }
    
    /**
     * @notice Get total number of registered agencies
     * @return Count of registered agencies
     */
    function getRegisteredAgencyCount() external view returns (uint256) {
        return _registeredAgencies.length();
    }
    
    /**
     * @notice Get registered agency address at index
     * @param index Index in the set
     * @return Agency address
     */
    function getRegisteredAgency(uint256 index) external view returns (address) {
        return _registeredAgencies.at(index);
    }
    
    /**
     * @notice Validate agency can perform actions
     * @param agencyAddress Address to validate
     * @return true if agency is registered and not suspended
     */
    function isValidAgency(address agencyAddress) external view returns (bool) {
        return _registeredAgencies.contains(agencyAddress) && !_suspendedAgencies[agencyAddress];
    }
    
    /**
     * @notice Modifier to restrict function to valid agencies only
     */
    modifier onlyValidAgency() {
        require(
            _registeredAgencies.contains(msg.sender) && !_suspendedAgencies[msg.sender],
            "AccessManager: invalid or suspended agency"
        );
        _;
    }
}
