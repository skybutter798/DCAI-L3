// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Simple staking gate for API-key applications.
/// Users lock native tDCAI (ETH) into this contract to qualify for a tier.
/// Tier is later used off-chain to approve/issue an API key with matching rate limits.
contract ApiKeyStake {
    enum Tier {
        None,
        Basic,
        Pro,
        Ultra
    }

    uint256 public immutable basicRequiredWei;
    uint256 public immutable proRequiredWei;
    uint256 public immutable ultraRequiredWei;
    uint256 public immutable cooldownSeconds;

    mapping(address => Tier) public tierOf;
    mapping(address => uint256) public stakeWeiOf;
    mapping(address => uint256) public unstakeRequestedAt;

    event Staked(address indexed user, Tier tier, uint256 amountWei);
    event UnstakeRequested(address indexed user, uint256 at);
    event Withdrawn(address indexed user, uint256 amountWei);

    error InvalidTier();
    error AlreadyStaked();
    error WrongAmount();
    error NoStake();
    error CooldownNotPassed();

    constructor(
        uint256 _basicRequiredWei,
        uint256 _proRequiredWei,
        uint256 _ultraRequiredWei,
        uint256 _cooldownSeconds
    ) {
        require(_basicRequiredWei > 0 && _proRequiredWei > _basicRequiredWei && _ultraRequiredWei > _proRequiredWei, "bad tiers");
        basicRequiredWei = _basicRequiredWei;
        proRequiredWei = _proRequiredWei;
        ultraRequiredWei = _ultraRequiredWei;
        cooldownSeconds = _cooldownSeconds;
    }

    function requiredWei(Tier t) public view returns (uint256) {
        if (t == Tier.Basic) return basicRequiredWei;
        if (t == Tier.Pro) return proRequiredWei;
        if (t == Tier.Ultra) return ultraRequiredWei;
        return 0;
    }

    function stake(uint8 tier_) external payable {
        if (tier_ < uint8(Tier.Basic) || tier_ > uint8(Tier.Ultra)) revert InvalidTier();
        if (stakeWeiOf[msg.sender] != 0) revert AlreadyStaked();

        Tier t = Tier(tier_);
        uint256 need = requiredWei(t);
        if (msg.value != need) revert WrongAmount();

        stakeWeiOf[msg.sender] = msg.value;
        tierOf[msg.sender] = t;
        unstakeRequestedAt[msg.sender] = 0;

        emit Staked(msg.sender, t, msg.value);
    }

    function requestUnstake() external {
        if (stakeWeiOf[msg.sender] == 0) revert NoStake();
        unstakeRequestedAt[msg.sender] = block.timestamp;
        emit UnstakeRequested(msg.sender, block.timestamp);
    }

    function withdraw() external {
        uint256 amt = stakeWeiOf[msg.sender];
        if (amt == 0) revert NoStake();
        uint256 t0 = unstakeRequestedAt[msg.sender];
        if (t0 == 0 || block.timestamp < t0 + cooldownSeconds) revert CooldownNotPassed();

        // effects
        stakeWeiOf[msg.sender] = 0;
        tierOf[msg.sender] = Tier.None;
        unstakeRequestedAt[msg.sender] = 0;

        // interaction
        (bool ok, ) = msg.sender.call{ value: amt }("");
        require(ok, "transfer failed");

        emit Withdrawn(msg.sender, amt);
    }

    function getStake(address user) external view returns (Tier tier, uint256 stakeWei, uint256 requestedAt) {
        return (tierOf[user], stakeWeiOf[user], unstakeRequestedAt[user]);
    }
}
