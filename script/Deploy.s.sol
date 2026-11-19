// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {IMorpho, Id, MarketParams} from "morpho-blue/src/interfaces/IMorpho.sol";

import {StandbyQueue} from "../src/StandbyQueue.sol";
import {StandbyWatcher} from "../src/StandbyWatcher.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";
import {DemoOracle} from "../src/demo/DemoOracle.sol";

/// @dev Addresses on Base Sepolia (84532), the chain the market and the queue are on.
library BaseSepolia {
    uint256 internal constant CHAIN_ID = 84532;
    address internal constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant ADAPTIVE_CURVE_IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    address internal constant CALLBACK_PROXY = 0x476F44b11F5C942c58f4c8E3d0300E5710743585;
}

// Deployment order, because the queue fixes the watcher's address at construction:
//   1. DeployWatcher   on Reactive Lasna
//   2. DeployQueue     on Base Sepolia   (WATCHER=<address from 1>)
//   3. On Reactive Lasna, bind the two with a plain transaction:
//        cast send $WATCHER "setQueue(address)" $QUEUE --rpc-url https://lasna-rpc.rnk.dev/ --private-key …
//      (a forge script cannot simulate this one locally: it calls Lasna's system contract)
//   4. SetupMarket     on Base Sepolia   (the demo market)

/// @notice Step 1, on Reactive Lasna. `WATCHER_FUNDS` (wei of lREACT, default 1) pays for reactions.
contract DeployWatcher is Script {
    function run() external {
        uint256 funds = vm.envOr("WATCHER_FUNDS", uint256(1 ether));
        vm.startBroadcast();
        StandbyWatcher watcher = new StandbyWatcher{value: funds}(BaseSepolia.CHAIN_ID, BaseSepolia.MORPHO);
        vm.stopBroadcast();
        console2.log("StandbyWatcher (Lasna):", address(watcher));
    }
}

/// @notice Step 2, on Base Sepolia. `QUEUE_FUNDS` (wei of ETH, default 0.01) pays for callbacks until join
///         fees do. `JOIN_FEE` defaults to 0.00002 ETH.
contract DeployQueue is Script {
    function run() external {
        address watcher = vm.envAddress("WATCHER");
        uint256 funds = vm.envOr("QUEUE_FUNDS", uint256(0.01 ether));
        uint256 joinFee = vm.envOr("JOIN_FEE", uint256(0.00002 ether));
        vm.startBroadcast();
        StandbyQueue queue = new StandbyQueue{value: funds}(
            IPayable(payable(BaseSepolia.CALLBACK_PROXY)), watcher, IMorpho(BaseSepolia.MORPHO), joinFee
        );
        vm.stopBroadcast();
        console2.log("StandbyQueue (Base Sepolia):", address(queue));
    }
}

/// @notice Step 4, on Base Sepolia: a market of our own on the real Morpho Blue, with test tokens, an oracle
///         we set, the real AdaptiveCurveIrm and an 86% LLTV.
contract SetupMarket is Script {
    function run() external {
        vm.startBroadcast();
        DemoToken usd = new DemoToken("Standby Dollar", "sbUSD");
        DemoToken eth = new DemoToken("Standby Ether", "sbETH");
        DemoOracle oracle = new DemoOracle(3000e36);
        MarketParams memory mp = MarketParams({
            loanToken: address(usd),
            collateralToken: address(eth),
            oracle: address(oracle),
            irm: BaseSepolia.ADAPTIVE_CURVE_IRM,
            lltv: 0.86e18
        });
        IMorpho(BaseSepolia.MORPHO).createMarket(mp);
        vm.stopBroadcast();

        console2.log("Loan token sbUSD:      ", address(usd));
        console2.log("Collateral token sbETH:", address(eth));
        console2.log("Oracle:                ", address(oracle));
        console2.log("Market id:");
        console2.logBytes32(keccak256(abi.encode(mp)));
    }
}
