// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {Id} from "morpho-blue/src/interfaces/IMorpho.sol";

import {StandbyQueue} from "../src/StandbyQueue.sol";
import {StandbyWatcher} from "../src/StandbyWatcher.sol";
import {BaseTest} from "./Base.t.sol";

/// @dev The reactive contract on its own: what it subscribes to, what it ignores, what it asks for.
contract WatcherTest is BaseTest {
    uint256 internal marketId;

    function setUp() public override {
        super.setUp();
        marketId = uint256(Id.unwrap(id));
        _supply(alice, 60_000e18);
        _supply(bob, 40_000e18);
        _borrowAll();
    }

    function test_topicsMatchTheEventSignatures() public view {
        assertEq(watcher.REPAY_TOPIC(), uint256(keccak256("Repay(bytes32,address,address,uint256,uint256)")));
        assertEq(watcher.SUPPLY_TOPIC(), uint256(keccak256("Supply(bytes32,address,address,uint256,uint256)")));
        assertEq(
            watcher.LIQUIDATE_TOPIC(),
            uint256(keccak256("Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)"))
        );
        assertEq(watcher.QUEUE_STATE_TOPIC(), uint256(StandbyQueue.QueueState.selector));
    }

    function test_setQueue_onlyOnce_onlyOwner() public {
        vm.expectRevert(StandbyWatcher.QueueAlreadySet.selector);
        watcher.setQueue(address(1));

        StandbyWatcher fresh = new StandbyWatcher(CHAIN, address(morpho));
        vm.prank(rival);
        vm.expectRevert(StandbyWatcher.NotOwner.selector);
        fresh.setQueue(address(queue));
        vm.expectRevert(StandbyWatcher.ZeroAddress.selector);
        fresh.setQueue(address(0));
    }

    function test_followsOnlyTheQueueUntilSomeoneWaits() public {
        // After deployment: one subscription, to the queue's own state.
        assertEq(system.activeCount(), 1);
        assertTrue(
            system.isSubscribed(
                address(watcher), CHAIN, address(queue), watcher.QUEUE_STATE_TOPIC(), IGNORE, IGNORE, IGNORE
            )
        );

        // A lender joins: the three Morpho subscriptions for that market open.
        _join(alice, 30_000e18);
        _relay();
        assertEq(system.activeCount(), 4);
        assertTrue(watcher.watching(marketId));
        assertEq(watcher.waiting(marketId), 1);
        assertTrue(
            system.isSubscribed(
                address(watcher), CHAIN, address(morpho), watcher.REPAY_TOPIC(), marketId, IGNORE, IGNORE
            )
        );
        assertTrue(
            system.isSubscribed(
                address(watcher), CHAIN, address(morpho), watcher.SUPPLY_TOPIC(), marketId, IGNORE, IGNORE
            )
        );
        assertTrue(
            system.isSubscribed(
                address(watcher), CHAIN, address(morpho), watcher.LIQUIDATE_TOPIC(), marketId, IGNORE, IGNORE
            )
        );

        // She is paid in full: they close again.
        _repay(30_000e18);
        _relay();
        assertEq(system.activeCount(), 1);
        assertFalse(watcher.watching(marketId));
        assertEq(watcher.waiting(marketId), 0);
    }

    function test_cancellingAlsoClosesTheSubscriptions() public {
        _join(alice, 30_000e18);
        _relay();
        vm.prank(alice);
        queue.cancel(id);
        _relay();
        assertEq(system.activeCount(), 1);
    }

    function test_repaymentWithNobodyWaiting_asksForNothing() public {
        _repay(10_000e18);
        assertEq(_relay(), 0);
        assertEq(watcher.requests(), 0);
        assertEq(system.requestCount(), 0);
    }

    function test_react_onlyTheSystemContract() public {
        IReactive.LogRecord memory l;
        vm.prank(rival);
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, rival, SYSTEM_ADDR));
        watcher.react(l);
    }

    function test_react_ignoresWhatItShouldNotActOn() public {
        _join(alice, 30_000e18);
        _relay();
        uint256 before = watcher.requests();

        IReactive.LogRecord memory l = _repayLog(5_000e18);

        // Another chain.
        l.chainId = 1;
        _react(l);
        // Another contract.
        l = _repayLog(5_000e18);
        l.contractAddress = rival;
        _react(l);
        // A market nobody is waiting on.
        l = _repayLog(5_000e18);
        l.topic1 = 12345;
        _react(l);
        // A Morpho event that does not put liquidity back.
        l = _repayLog(5_000e18);
        l.topic0 = uint256(keccak256("Borrow(bytes32,address,address,address,uint256,uint256)"));
        _react(l);
        // A zero amount.
        l = _repayLog(0);
        _react(l);
        // The wrong number of topics for the event.
        l = _repayLog(5_000e18);
        l.opCode = 3;
        _react(l);
        // No data.
        l = _repayLog(5_000e18);
        l.data = "";
        _react(l);

        assertEq(watcher.requests(), before, "none of these may ask for a callback");

        // The genuine one does.
        _react(_repayLog(5_000e18));
        assertEq(watcher.requests(), before + 1);
    }

    function test_callbackRequest_isAddressedToTheQueueWithAPlaceholder() public {
        _join(alice, 30_000e18);
        _relay();
        IReactive.LogRecord memory l = _repayLog(5_000e18);
        l.blockNumber = 777;
        l.txHash = 0xabc;
        _react(l);

        ISystemContract.CallbackConfiguration_V_1_0 memory r = system.request(system.requestCount() - 1);
        assertEq(r.chainId, CHAIN);
        assertEq(r.recipient, address(queue));
        assertEq(r.gasLimit, watcher.CALLBACK_GAS_LIMIT());
        assertEq(
            r.payload,
            abi.encodeWithSignature(
                "settle(address,bytes32,uint256,uint256)", address(0), Id.unwrap(id), uint256(777), uint256(0xabc)
            )
        );
    }

    function test_queueStateFromAnotherContract_isNotBelieved() public {
        // Someone emits a look-alike QueueState from their own contract on the origin chain. The watcher
        // only reads the event from the queue it was bound to.
        IReactive.LogRecord memory l;
        l.chainId = CHAIN;
        l.contractAddress = rival;
        l.topic0 = watcher.QUEUE_STATE_TOPIC();
        l.topic1 = marketId;
        l.opCode = 2;
        l.data = abi.encode(uint256(1e18), uint256(1), true);
        _react(l);
        assertEq(watcher.waiting(marketId), 0);
        assertFalse(watcher.watching(marketId));
        assertEq(watcher.requests(), 0);
    }

    function test_ownerCanTakeFundsBack() public {
        uint256 before = address(this).balance;
        watcher.withdraw(0.4 ether);
        assertEq(address(this).balance, before + 0.4 ether);
        vm.prank(rival);
        vm.expectRevert(StandbyWatcher.NotOwner.selector);
        watcher.withdraw(0.1 ether);
    }

    receive() external payable {}

    function _react(IReactive.LogRecord memory l) internal {
        vm.prank(SYSTEM_ADDR);
        watcher.react(l);
    }

    function _repayLog(uint256 assets) internal view returns (IReactive.LogRecord memory l) {
        l.chainId = CHAIN;
        l.contractAddress = address(morpho);
        l.topic0 = watcher.REPAY_TOPIC();
        l.topic1 = marketId;
        l.topic2 = uint256(uint160(borrower));
        l.topic3 = uint256(uint160(borrower));
        l.opCode = 4;
        l.data = abi.encode(assets, assets);
        l.blockNumber = 1;
        l.txHash = 1;
    }
}
