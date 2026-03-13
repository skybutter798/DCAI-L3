// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MerkleProof} from "./MerkleProof.sol";

interface IOperatorRegistry {
    function isActive(address operator) external view returns (bool);
}

/**
 * MerkleRewardDistributor (native token)
 *
 * Admin publishes a Merkle root per epoch.
 * Operators can claim (epochId, operator, amount) with Merkle proof.
 *
 * Notes:
 * - This pays in native token (tDCAI) via `call{value: amount}`.
 * - Fund the contract by sending native token to it.
 */
contract MerkleRewardDistributor {
    address public owner;
    IOperatorRegistry public registry;

    uint256 public dailyCapWei;
    mapping(uint256 dayId => uint256 spentWei) public dailySpentWei;

    struct Epoch {
        bytes32 merkleRoot;
        uint256 totalWei;
        uint256 dayId;
        bool exists;
    }

    // epochId => Epoch
    mapping(uint256 => Epoch) public epochs;

    // epochId => operator => claimed
    mapping(uint256 => mapping(address => bool)) public claimed;

    // optional per-operator daily caps
    mapping(address => uint256) public operatorDailyCapWei;
    mapping(uint256 dayId => mapping(address => uint256)) public operatorDailySpentWei;

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event RegistryChanged(address indexed oldRegistry, address indexed newRegistry);
    event DailyCapChanged(uint256 oldCapWei, uint256 newCapWei);
    event OperatorDailyCapChanged(address indexed operator, uint256 oldCapWei, uint256 newCapWei);

    event EpochPublished(uint256 indexed epochId, uint256 indexed dayId, bytes32 merkleRoot, uint256 totalWei);
    event Claimed(uint256 indexed epochId, address indexed operator, uint256 amountWei);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address _owner, address _registry, uint256 _dailyCapWei) {
        owner = _owner;
        registry = IOperatorRegistry(_registry);
        dailyCapWei = _dailyCapWei;
        emit OwnerChanged(address(0), _owner);
        emit RegistryChanged(address(0), _registry);
        emit DailyCapChanged(0, _dailyCapWei);
    }

    receive() external payable {}

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function setRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "ZERO_ADDR");
        emit RegistryChanged(address(registry), newRegistry);
        registry = IOperatorRegistry(newRegistry);
    }

    function setDailyCap(uint256 newCapWei) external onlyOwner {
        emit DailyCapChanged(dailyCapWei, newCapWei);
        dailyCapWei = newCapWei;
    }

    function setOperatorDailyCap(address operator, uint256 capWei) external onlyOwner {
        emit OperatorDailyCapChanged(operator, operatorDailyCapWei[operator], capWei);
        operatorDailyCapWei[operator] = capWei;
    }

    /**
     * @param epochId  unique id (e.g., YYYYMMDDHH or sequential)
     * @param dayId    UTC day id (e.g., YYYYMMDD)
     */
    function publishEpoch(uint256 epochId, uint256 dayId, bytes32 merkleRoot, uint256 totalWei) external onlyOwner {
        require(!epochs[epochId].exists, "EPOCH_EXISTS");
        require(dailySpentWei[dayId] + totalWei <= dailyCapWei, "DAILY_CAP_EXCEEDED");

        epochs[epochId] = Epoch({
            merkleRoot: merkleRoot,
            totalWei: totalWei,
            dayId: dayId,
            exists: true
        });

        dailySpentWei[dayId] += totalWei;

        emit EpochPublished(epochId, dayId, merkleRoot, totalWei);
    }

    function claim(uint256 epochId, address operator, uint256 amountWei, bytes32[] calldata proof) external {
        require(msg.sender == operator, "ONLY_OPERATOR");
        require(!claimed[epochId][operator], "ALREADY_CLAIMED");
        require(registry.isActive(operator), "OPERATOR_NOT_ACTIVE");

        Epoch memory e = epochs[epochId];
        require(e.exists, "EPOCH_NOT_FOUND");

        // Optional per-operator daily cap
        uint256 cap = operatorDailyCapWei[operator];
        if (cap > 0) {
            uint256 spent = operatorDailySpentWei[e.dayId][operator];
            require(spent + amountWei <= cap, "OPERATOR_DAILY_CAP_EXCEEDED");
            operatorDailySpentWei[e.dayId][operator] = spent + amountWei;
        }

        bytes32 leaf = keccak256(abi.encodePacked(epochId, operator, amountWei));
        require(MerkleProof.verify(proof, e.merkleRoot, leaf), "BAD_PROOF");

        claimed[epochId][operator] = true;

        (bool ok, ) = operator.call{value: amountWei}("");
        require(ok, "TRANSFER_FAILED");

        emit Claimed(epochId, operator, amountWei);
    }
}
