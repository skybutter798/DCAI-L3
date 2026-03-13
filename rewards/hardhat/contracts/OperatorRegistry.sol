// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * OperatorRegistry
 * - Admin-managed allowlist for operators
 * - Operators must be ACTIVE to claim rewards
 */
contract OperatorRegistry {
    enum Status { NONE, ACTIVE, SUSPENDED, BANNED }

    address public owner;

    mapping(address => Status) public status;
    mapping(address => bytes32) public metadataHash; // optional off-chain metadata pointer

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event OperatorStatusChanged(address indexed operator, Status oldStatus, Status newStatus);
    event OperatorMetadataHashSet(address indexed operator, bytes32 metadataHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address _owner) {
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function setOperatorStatus(address operator, Status newStatus) external onlyOwner {
        Status old = status[operator];
        status[operator] = newStatus;
        emit OperatorStatusChanged(operator, old, newStatus);
    }

    function setOperatorMetadataHash(address operator, bytes32 _metadataHash) external onlyOwner {
        metadataHash[operator] = _metadataHash;
        emit OperatorMetadataHashSet(operator, _metadataHash);
    }

    function isActive(address operator) external view returns (bool) {
        return status[operator] == Status.ACTIVE;
    }
}
