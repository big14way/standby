// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice A Morpho oracle whose deployer sets the price. For the testnet demo market and the tests only.
contract DemoOracle {
    address public immutable OWNER;
    uint256 public price;

    constructor(uint256 price_) {
        OWNER = msg.sender;
        price = price_;
    }

    function setPrice(uint256 price_) external {
        require(msg.sender == OWNER, "not owner");
        price = price_;
    }
}
