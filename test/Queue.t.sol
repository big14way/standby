// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Id, Market} from "morpho-blue/src/interfaces/IMorpho.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";

import {StandbyQueue} from "../src/StandbyQueue.sol";
import {BaseTest} from "./Base.t.sol";

/// @dev The queue on its own: who may join, what a ticket is, and who may settle it.
contract QueueTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _supply(alice, 60_000e18);
        _supply(bob, 40_000e18);
    }

    function test_fixturesAreTheCodeDeployedOnBaseSepolia() public view {
        assertEq(MORPHO_ADDR.codehash, MORPHO_CODEHASH);
        assertEq(IRM_ADDR.codehash, IRM_CODEHASH);
    }

    // ---- joining ----

    function test_join_needsTheFee() public {
        _borrowAll();
        vm.startPrank(alice);
        morpho.setAuthorization(address(queue), true);
        vm.expectRevert(abi.encodeWithSelector(StandbyQueue.WrongFee.selector, 0, JOIN_FEE));
        queue.join(id, 1e18);
    }

    function test_join_needsMorphoAuthorisation() public {
        _borrowAll();
        vm.deal(alice, JOIN_FEE);
        vm.prank(alice);
        vm.expectRevert(StandbyQueue.QueueNotAuthorized.selector);
        queue.join{value: JOIN_FEE}(id, 1e18);
    }

    function test_join_needsAPosition() public {
        _borrowAll();
        vm.deal(carol, JOIN_FEE);
        vm.startPrank(carol);
        morpho.setAuthorization(address(queue), true);
        vm.expectRevert(StandbyQueue.NothingSupplied.selector);
        queue.join{value: JOIN_FEE}(id, 1e18);
    }

    function test_join_rejectsZeroAndUnknownMarket() public {
        vm.deal(alice, 2 * JOIN_FEE);
        vm.startPrank(alice);
        morpho.setAuthorization(address(queue), true);
        vm.expectRevert(StandbyQueue.ZeroAssets.selector);
        queue.join{value: JOIN_FEE}(id, 0);
        vm.expectRevert(StandbyQueue.UnknownMarket.selector);
        queue.join{value: JOIN_FEE}(Id.wrap(bytes32(uint256(1))), 1e18);
    }

    function test_join_oneOpenTicketPerLender() public {
        _borrowAll();
        _join(alice, 10_000e18);
        vm.deal(alice, JOIN_FEE);
        vm.prank(alice);
        vm.expectRevert(StandbyQueue.AlreadyQueued.selector);
        queue.join{value: JOIN_FEE}(id, 10_000e18);
    }

    function test_join_isCappedAtThePosition() public {
        _borrowAll();
        uint256 ticket = _join(alice, 1_000_000e18);
        (address owner, uint256 assets) = queue.ticketAt(id, ticket);
        assertEq(owner, alice);
        assertEq(assets, 60_000e18);
        assertEq(queue.pendingAssets(id), 60_000e18);
        assertEq(queue.openTickets(id), 1);
        assertEq(queue.ticketOf(id, alice), ticket + 1);
    }

    function test_join_paysOnTheSpotWhenTheMarketIsLiquid() public {
        // Nothing borrowed: all 100,000 is liquid, so joining is simply a withdrawal.
        _join(alice, 25_000e18);
        assertEq(usd.balanceOf(alice), 25_000e18);
        assertEq(queue.openTickets(id), 0);
        assertEq(queue.pendingAssets(id), 0);
        assertEq(queue.ticketOf(id, alice), 0);
    }

    function test_join_withTooLittleGasToPay_revertsRatherThanSkippingThePayment() public {
        // A wallet's gas estimate is the least gas at which the call does not revert. If a join that is short
        // of gas simply skipped the payment, that estimate would land on the skipping path and a liquid
        // market would never pay on the spot. So it reverts, and the estimate lands on the paying path.
        vm.deal(alice, 2 * JOIN_FEE);
        vm.startPrank(alice);
        morpho.setAuthorization(address(queue), true);
        vm.expectRevert(StandbyQueue.NotEnoughGas.selector);
        queue.join{value: JOIN_FEE, gas: 300_000}(id, 25_000e18);

        // With room for the payment it goes through and pays.
        queue.join{value: JOIN_FEE, gas: 600_000}(id, 25_000e18);
        vm.stopPrank();
        assertEq(usd.balanceOf(alice), 25_000e18);
        assertEq(queue.openTickets(id), 0);
    }

    function test_join_onAFullyBorrowedMarket_needsNoGasForAPayment() public {
        // Nothing to pay, so the gas guard does not apply and a modest gas limit is enough.
        _borrowAll();
        vm.deal(alice, JOIN_FEE);
        vm.startPrank(alice);
        morpho.setAuthorization(address(queue), true);
        queue.join{value: JOIN_FEE, gas: 300_000}(id, 25_000e18);
        vm.stopPrank();
        assertEq(queue.openTickets(id), 1);
    }

    function test_join_feeStaysInTheQueueToPayForCallbacks() public {
        _borrowAll();
        uint256 before = address(queue).balance;
        _join(alice, 1e18);
        assertEq(address(queue).balance, before + JOIN_FEE);
    }

    // ---- cancelling ----

    function test_cancel_closesTheTicket() public {
        _borrowAll();
        _join(alice, 10_000e18);
        _join(bob, 5_000e18);
        vm.prank(alice);
        queue.cancel(id);
        assertEq(queue.openTickets(id), 1);
        assertEq(queue.pendingAssets(id), 5_000e18);
        assertEq(queue.ticketOf(id, alice), 0);
        // Alice can queue again, now behind Bob.
        uint256 again = _join(alice, 10_000e18);
        assertEq(again, 2);
    }

    function test_cancel_needsATicket() public {
        vm.prank(alice);
        vm.expectRevert(StandbyQueue.NotQueued.selector);
        queue.cancel(id);
    }

    // ---- who may settle ----

    function test_settle_refusesADirectCall() public {
        _borrowAll();
        _join(alice, 10_000e18);
        _repay(10_000e18);
        // Anyone but the callback proxy: refused, even though liquidity is there and the argument names the watcher.
        vm.prank(rival);
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, rival, address(proxy)));
        queue.settle(address(watcher), id, 1, 1);
        assertEq(usd.balanceOf(alice), 0);
    }

    function test_settle_refusesAnotherReactiveContract() public {
        _borrowAll();
        _join(alice, 10_000e18);
        _repay(10_000e18);
        // The real proxy, but carrying a different reactive contract's address.
        (bool ok, bytes memory ret) = proxy.deliver(address(queue), rival, _settlePayload(1), 2_000_000);
        assertFalse(ok);
        assertEq(ret, abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, rival, address(watcher)));
        assertEq(usd.balanceOf(alice), 0);
    }

    function test_settle_withNobodyWaitingDoesNothing() public {
        (bool ok,) = proxy.deliver(address(queue), address(watcher), _settlePayload(1), 2_000_000);
        assertTrue(ok);
        assertEq(queue.loops(), 1);
        assertEq(queue.loopsThatPaid(), 0);
    }

    function test_queueHasNoOwnerAndHoldsNoLoanTokens() public {
        _borrowAll();
        _join(alice, 10_000e18);
        _repay(10_000e18);
        _relay();
        assertEq(usd.balanceOf(address(queue)), 0);
        assertEq(usd.balanceOf(alice), 10_000e18);
    }
}
