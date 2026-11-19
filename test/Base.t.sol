// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IMorpho, Id, MarketParams, Market, Position} from "morpho-blue/src/interfaces/IMorpho.sol";

import {StandbyQueue} from "../src/StandbyQueue.sol";
import {StandbyWatcher} from "../src/StandbyWatcher.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";
import {DemoOracle} from "../src/demo/DemoOracle.sol";
import {MockSystem, MockProxy} from "./mocks/MockReactive.sol";

/// @dev Everything the tests share: Morpho Blue and its interest-rate model exactly as deployed on Base
///      Sepolia, one market, the two Standby contracts, and a relay that plays the Reactive Network.
abstract contract BaseTest is Test {
    uint256 internal constant CHAIN = 84532;
    address internal constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    uint256 internal constant IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    uint256 internal constant JOIN_FEE = 0.0001 ether;
    uint256 internal constant LLTV = 0.86e18;
    address internal constant MORPHO_ADDR = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant IRM_ADDR = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    /// @dev Code hashes of the two contracts on Base Sepolia at block 60,829,004.
    bytes32 internal constant MORPHO_CODEHASH = 0xde5df0406e830f48506c94032a90a393b444b3de1cd5340d8c1a131a41189d3d;
    bytes32 internal constant IRM_CODEHASH = 0x9978b522abfe0f3b8279800375d833b9d9660ae4f6321a2efb1f1f98850a0cbe;

    IMorpho internal morpho;
    address internal irm;
    DemoToken internal usd;
    DemoToken internal eth;
    DemoOracle internal oracle;
    MarketParams internal mp;
    Id internal id;

    MockSystem internal system;
    MockProxy internal proxy;
    StandbyWatcher internal watcher;
    StandbyQueue internal queue;

    address internal morphoOwner = makeAddr("morphoOwner");
    address internal borrower = makeAddr("borrower");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal rival = makeAddr("rival");

    struct LoopSeen {
        uint256 originBlock;
        uint256 settledBlock;
        uint256 originTxHash;
        uint256 assetsPaid;
        uint256 tickets;
    }

    /// @dev `Loop` events seen by the relay, oldest first.
    LoopSeen[] internal loopsSeen;

    /// @dev Stands in for origin transaction hashes, which a local test does not have.
    uint256 internal _txCounter = 1000;
    /// @dev Blocks the relay lets pass between an event and the delivery of its callback.
    uint256 internal relayLagBlocks = 1;

    function setUp() public virtual {
        vm.etch(SYSTEM_ADDR, address(new MockSystem()).code);
        system = MockSystem(payable(SYSTEM_ADDR));
        proxy = new MockProxy();

        // The exact bytecode of Morpho Blue and of its AdaptiveCurveIrm as deployed on Base Sepolia, placed
        // at the addresses they have there. The rate model has Morpho's address built in, so the two fit.
        vm.etch(MORPHO_ADDR, vm.parseBytes(vm.trim(vm.readFile("test/fixtures/morpho-blue.hex"))));
        vm.etch(IRM_ADDR, vm.parseBytes(vm.trim(vm.readFile("test/fixtures/adaptive-curve-irm.hex"))));
        vm.store(MORPHO_ADDR, bytes32(0), bytes32(uint256(uint160(morphoOwner)))); // slot 0 is `owner`
        morpho = IMorpho(MORPHO_ADDR);
        irm = IRM_ADDR;
        usd = new DemoToken("Mock Dollar", "mUSD");
        eth = new DemoToken("Mock Ether", "mETH");
        oracle = new DemoOracle(3000e36);

        vm.startPrank(morphoOwner);
        morpho.enableIrm(irm);
        morpho.enableLltv(LLTV);
        vm.stopPrank();

        mp = MarketParams({
            loanToken: address(usd), collateralToken: address(eth), oracle: address(oracle), irm: irm, lltv: LLTV
        });
        morpho.createMarket(mp);
        id = Id.wrap(keccak256(abi.encode(mp)));

        watcher = new StandbyWatcher{value: 1 ether}(CHAIN, address(morpho));
        queue =
            new StandbyQueue{value: 0.1 ether}(IPayable(payable(address(proxy))), address(watcher), morpho, JOIN_FEE);
        watcher.setQueue(address(queue));

        vm.recordLogs();
    }

    // ----------------------------------------------------------------------------------------------------------
    // Market actions
    // ----------------------------------------------------------------------------------------------------------

    function _supply(address who, uint256 assets) internal {
        usd.mint(who, assets);
        vm.startPrank(who);
        usd.approve(address(morpho), assets);
        morpho.supply(mp, assets, 0, who, "");
        vm.stopPrank();
    }

    /// @dev Borrows everything the market has, which leaves it with no liquidity.
    function _borrowAll() internal returns (uint256 borrowed) {
        borrowed = _liquidity();
        uint256 collateral = borrowed / 2000; // 3000 per mETH at 86% covers 2580 per mETH
        eth.mint(borrower, collateral);
        vm.startPrank(borrower);
        eth.approve(address(morpho), collateral);
        morpho.supplyCollateral(mp, collateral, borrower, "");
        morpho.borrow(mp, borrowed, 0, borrower, borrower);
        vm.stopPrank();
    }

    function _repay(uint256 assets) internal {
        usd.mint(borrower, assets);
        vm.startPrank(borrower);
        usd.approve(address(morpho), assets);
        morpho.repay(mp, assets, 0, borrower, "");
        vm.stopPrank();
    }

    function _join(address who, uint256 assets) internal returns (uint256 ticket) {
        vm.deal(who, JOIN_FEE);
        vm.startPrank(who);
        if (!morpho.isAuthorized(who, address(queue))) morpho.setAuthorization(address(queue), true);
        ticket = queue.join{value: JOIN_FEE}(id, assets);
        vm.stopPrank();
    }

    function _liquidity() internal view returns (uint256) {
        Market memory m = morpho.market(id);
        return m.totalSupplyAssets - m.totalBorrowAssets;
    }

    function _suppliedShares(address who) internal view returns (uint256) {
        return morpho.position(id, who).supplyShares;
    }

    // ----------------------------------------------------------------------------------------------------------
    // The relay: what the Reactive Network does between the two chains
    // ----------------------------------------------------------------------------------------------------------

    /// @dev Takes every log recorded since the last call, hands the ones the watcher is subscribed to to
    ///      `react`, delivers the callbacks it asks for, and repeats until nothing more happens.
    /// @return delivered Number of callbacks delivered.
    function _relay() internal returns (uint256 delivered) {
        for (uint256 round; round < 16; round++) {
            Vm.Log[] memory logs = vm.getRecordedLogs();
            uint256 before = system.requestCount();
            uint256 originBlock = vm.getBlockNumber();
            for (uint256 i; i < logs.length; i++) {
                _noteLoop(logs[i]);
                if (!_subscribed(logs[i])) continue;
                vm.prank(SYSTEM_ADDR);
                watcher.react(_record(logs[i], originBlock));
            }
            uint256 afterCount = system.requestCount();
            if (afterCount == before) return delivered;

            vm.roll(vm.getBlockNumber() + relayLagBlocks);
            for (uint256 i = before; i < afterCount; i++) {
                ISystemContract.CallbackConfiguration_V_1_0 memory r = system.request(i);
                assertEq(r.chainId, CHAIN, "callback chain");
                assertEq(r.recipient, address(queue), "callback recipient");
                (bool ok,) = proxy.deliver(r.recipient, address(watcher), r.payload, r.gasLimit);
                assertTrue(ok, "callback reverted");
                delivered += 1;
            }
        }
        revert("relay did not settle");
    }

    /// @dev Keeps every `Loop` event the queue emits, since the relay consumes the recorded logs.
    function _noteLoop(Vm.Log memory l) internal {
        if (l.emitter != address(queue) || l.topics.length == 0 || l.topics[0] != StandbyQueue.Loop.selector) return;
        (uint256 origin, uint256 settled, uint256 txHash, uint256 paid, uint256 tickets) =
            abi.decode(l.data, (uint256, uint256, uint256, uint256, uint256));
        loopsSeen.push(LoopSeen(origin, settled, txHash, paid, tickets));
    }

    /// @dev Whether a log matches one of the watcher's open subscriptions, in either of the two shapes it uses.
    function _subscribed(Vm.Log memory l) internal view returns (bool) {
        if (l.topics.length == 0) return false;
        uint256 t0 = uint256(l.topics[0]);
        if (system.isSubscribed(address(watcher), CHAIN, l.emitter, t0, IGNORE, IGNORE, IGNORE)) return true;
        if (l.topics.length < 2) return false;
        return system.isSubscribed(address(watcher), CHAIN, l.emitter, t0, uint256(l.topics[1]), IGNORE, IGNORE);
    }

    function _record(Vm.Log memory l, uint256 originBlock) internal returns (IReactive.LogRecord memory r) {
        r.chainId = CHAIN;
        r.contractAddress = l.emitter;
        r.opCode = l.topics.length;
        if (l.topics.length > 0) r.topic0 = uint256(l.topics[0]);
        if (l.topics.length > 1) r.topic1 = uint256(l.topics[1]);
        if (l.topics.length > 2) r.topic2 = uint256(l.topics[2]);
        if (l.topics.length > 3) r.topic3 = uint256(l.topics[3]);
        r.data = l.data;
        r.blockNumber = originBlock;
        r.txHash = ++_txCounter;
    }

    /// @dev A hand-built `settle` payload, with the placeholder a reactive contract would send.
    function _settlePayload(uint256 originBlock) internal view returns (bytes memory) {
        return abi.encodeWithSignature(
            "settle(address,bytes32,uint256,uint256)", address(0), Id.unwrap(id), originBlock, uint256(1)
        );
    }
}
