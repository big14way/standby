// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Id, Market} from "morpho-blue/src/interfaces/IMorpho.sol";

import {BaseTest} from "./Base.t.sol";

/// @dev The whole loop: an event on Morpho, the watcher's reaction, the callback, the payout.
///      Every log the watcher sees here is one the real Morpho or the real queue emitted.
contract LoopTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _supply(alice, 60_000e18);
        _supply(bob, 40_000e18);
        _borrowAll();
        assertEq(_liquidity(), 0, "market should start with no liquidity");
    }

    function test_repay_paysTheFrontOfTheQueueFirst() public {
        _join(alice, 30_000e18);
        _join(bob, 20_000e18);
        assertEq(_relay(), 0, "nothing to settle yet");

        // 35,000 comes back: Alice in full, Bob the remaining 5,000.
        _repay(35_000e18);
        assertEq(_relay(), 1);

        assertEq(usd.balanceOf(alice), 30_000e18);
        assertEq(usd.balanceOf(bob), 5_000e18);
        assertEq(queue.openTickets(id), 1);
        assertEq(queue.pendingAssets(id), 15_000e18);
        assertEq(_liquidity(), 0);
        (, uint256 bobLeft) = queue.ticketAt(id, 1);
        assertEq(bobLeft, 15_000e18);

        // The rest of Bob's ticket is paid by the next repayment.
        _repay(15_000e18);
        assertEq(_relay(), 1);
        assertEq(usd.balanceOf(bob), 20_000e18);
        assertEq(queue.openTickets(id), 0);
        assertEq(queue.pendingAssets(id), 0);
    }

    function test_supplyByAThirdParty_alsoSettles() public {
        _join(alice, 30_000e18);
        _relay();
        _supply(carol, 12_000e18);
        assertEq(_relay(), 1);
        assertEq(usd.balanceOf(alice), 12_000e18);
        assertEq(queue.pendingAssets(id), 18_000e18);
    }

    function test_liquidation_alsoSettles() public {
        _join(alice, 30_000e18);
        _relay();

        // The collateral falls far enough for the borrower to be liquidated.
        oracle.setPrice(1500e36);
        usd.mint(rival, 100_000e18);
        vm.startPrank(rival);
        usd.approve(address(morpho), type(uint256).max);
        (, uint256 repaid) = morpho.liquidate(mp, borrower, 10e18, 0, "");
        vm.stopPrank();
        assertGt(repaid, 0);

        assertEq(_relay(), 1);
        assertEq(usd.balanceOf(alice), repaid < 30_000e18 ? repaid : 30_000e18);
    }

    function test_lateCallback_paysNothingAndChangesNothing() public {
        _join(alice, 30_000e18);
        _relay();
        _repay(10_000e18);

        // Bob is not in the queue. He withdraws the repaid liquidity himself before the callback lands.
        vm.prank(bob);
        morpho.withdraw(mp, 10_000e18, 0, bob, bob);

        assertEq(_relay(), 1, "the callback is still delivered");
        assertEq(usd.balanceOf(alice), 0);
        assertEq(queue.openTickets(id), 1);
        assertEq(queue.pendingAssets(id), 30_000e18);
        assertEq(queue.loops(), 1);
        assertEq(queue.loopsThatPaid(), 0);
    }

    function test_revokedAuthorisation_isVoidedAndTheNextLenderIsPaid() public {
        _join(alice, 30_000e18);
        _join(bob, 20_000e18);
        _relay();
        uint256 aliceShares = _suppliedShares(alice);

        vm.prank(alice);
        morpho.setAuthorization(address(queue), false);

        _repay(20_000e18);
        _relay();

        assertEq(usd.balanceOf(alice), 0);
        assertEq(_suppliedShares(alice), aliceShares, "a voided lender's position is untouched");
        assertEq(queue.ticketOf(id, alice), 0);
        assertEq(usd.balanceOf(bob), 20_000e18);
        assertEq(queue.openTickets(id), 0);
    }

    function test_lenderWhoAlreadyLeftMorpho_isVoided() public {
        _supply(carol, 10_000e18); // liquid again by 10,000
        // Alice joins while liquid and is paid 10,000 of 60,000 on the spot; 50,000 stays queued.
        _join(alice, 60_000e18);
        assertEq(usd.balanceOf(alice), 10_000e18);
        _join(bob, 5_000e18);
        _relay();

        // 50,000 comes back and Alice takes it herself, straight from Morpho, before the callback.
        _repay(55_000e18);
        uint256 aliceShares = _suppliedShares(alice);
        vm.prank(alice);
        morpho.withdraw(mp, 0, aliceShares, alice, alice);

        _relay();
        assertEq(queue.ticketOf(id, alice), 0, "her ticket is closed");
        assertEq(usd.balanceOf(bob), 5_000e18, "and Bob, behind her, is paid");
        assertEq(queue.openTickets(id), 0);
    }

    function test_longQueue_isSettledOverSeveralCallbacks() public {
        // Ten lenders with 1,000 each join. One callback serves six tickets, so the queue reports that
        // more is due and the watcher asks again.
        address[10] memory lenders;
        for (uint256 i; i < 10; i++) {
            lenders[i] = makeAddr(string.concat("lender", vm.toString(i)));
            _supply(lenders[i], 1_000e18);
        }
        // The new supply is liquid: borrow it out again so everyone has to wait.
        uint256 freshLiquidity = _liquidity();
        vm.prank(borrower);
        morpho.borrow(mp, freshLiquidity, 0, borrower, borrower);
        for (uint256 i; i < 10; i++) {
            _join(lenders[i], 1_000e18);
        }
        _relay();

        _repay(10_000e18);
        assertEq(_relay(), 2, "six tickets, then four");
        for (uint256 i; i < 10; i++) {
            assertEq(usd.balanceOf(lenders[i]), 1_000e18);
        }
        assertEq(queue.openTickets(id), 0);
        assertEq(queue.loops(), 2);
    }

    function test_fullCallback_fitsTheGasItIsGiven() public {
        // Six lenders, the most one callback serves, each paid in full.
        address[6] memory lenders;
        for (uint256 i; i < 6; i++) {
            lenders[i] = makeAddr(string.concat("six", vm.toString(i)));
            _supply(lenders[i], 1_000e18);
        }
        uint256 freshLiquidity = _liquidity();
        vm.prank(borrower);
        morpho.borrow(mp, freshLiquidity, 0, borrower, borrower);
        for (uint256 i; i < 6; i++) {
            _join(lenders[i], 1_000e18);
        }
        _relay();
        _repay(6_000e18);
        vm.getRecordedLogs();

        uint256 limit = watcher.CALLBACK_GAS_LIMIT();
        uint256 before = gasleft();
        (bool ok,) = proxy.deliver(address(queue), address(watcher), _settlePayload(1), limit);
        uint256 used = before - gasleft();
        assertTrue(ok);
        assertEq(queue.openTickets(id), 0);
        emit log_named_uint("gas used by a six-ticket settlement", used);
        // Leave room for the proxy's own accounting, which the real network takes out of the same limit.
        assertLt(used, limit / 2);
    }

    function test_callbackShortOfGas_voidsNobody() public {
        _join(alice, 30_000e18);
        _join(bob, 20_000e18);
        _relay();
        _repay(50_000e18);
        vm.getRecordedLogs();

        // Too little gas to finish even one withdrawal safely. The call may fail as a whole, but it must
        // never close a ticket that could have been paid.
        proxy.deliver(address(queue), address(watcher), _settlePayload(1), 200_000);
        assertEq(queue.ticketOf(id, alice), 1);
        assertEq(queue.ticketOf(id, bob), 2);
        assertEq(queue.openTickets(id), 2);

        // With normal gas the same callback pays both.
        (bool ok,) = proxy.deliver(address(queue), address(watcher), _settlePayload(1), 2_000_000);
        assertTrue(ok);
        assertEq(usd.balanceOf(alice), 30_000e18);
        assertEq(usd.balanceOf(bob), 20_000e18);
    }

    function test_interestAccrues_andTheQueuePaysNoMoreThanAsked() public {
        _join(alice, 30_000e18);
        _relay();
        // A month at full utilisation: the real rate model raises the rate and the debt grows.
        vm.warp(vm.getBlockTimestamp() + 30 days);
        vm.roll(vm.getBlockNumber() + 1_000);
        _repay(40_000e18);
        _relay();
        assertEq(usd.balanceOf(alice), 30_000e18, "a ticket is for a fixed amount");
        assertEq(queue.openTickets(id), 0);
        assertGt(_liquidity(), 0, "the rest of the repayment stays in the market");
    }

    function test_loopEvent_carriesTheOriginBlock_andTheLatencyIsRecordedOnChain() public {
        _join(alice, 30_000e18);
        _relay();

        relayLagBlocks = 7; // 7 blocks of 200 ms on Base Sepolia is 1.4 s
        uint256 originBlock = vm.getBlockNumber();
        _repay(10_000e18);

        _relay();

        assertEq(loopsSeen.length, 1, "one Loop event");
        assertEq(loopsSeen[0].originBlock, originBlock);
        assertEq(loopsSeen[0].settledBlock, originBlock + 7);
        assertEq(loopsSeen[0].assetsPaid, 10_000e18);
        assertEq(loopsSeen[0].tickets, 1);

        uint32[64] memory lag = queue.lagHistogram();
        assertEq(lag[7], 1);
        assertEq(queue.loops(), 1);
        assertEq(queue.loopsThatPaid(), 1);
    }

    function test_veryLateCallback_landsInTheLastBucket() public {
        _join(alice, 30_000e18);
        _relay();
        relayLagBlocks = 500;
        _repay(1_000e18);
        _relay();
        assertEq(queue.lagHistogram()[63], 1);
    }

    /// @dev Any mix of ticket sizes and repayments: lenders are paid strictly in order, nobody is paid
    ///      more than they asked for, and the queue's totals always match its tickets.
    function testFuzz_fifoAndAccounting(uint96 a, uint96 b, uint96 c, uint96 r1, uint96 r2) public {
        _supply(carol, 50_000e18);
        eth.mint(borrower, 1_000e18);
        uint256 freshLiquidity = _liquidity();
        vm.startPrank(borrower);
        eth.approve(address(morpho), 1_000e18);
        morpho.supplyCollateral(mp, 1_000e18, borrower, "");
        morpho.borrow(mp, freshLiquidity, 0, borrower, borrower);
        vm.stopPrank();

        uint256 wantA = bound(a, 1, 60_000e18);
        uint256 wantB = bound(b, 1, 40_000e18);
        uint256 wantC = bound(c, 1, 50_000e18);
        _join(alice, wantA);
        _join(bob, wantB);
        _join(carol, wantC);
        _relay();

        uint256[2] memory repays = [bound(r1, 1, 80_000e18), bound(r2, 1, 70_000e18)];
        for (uint256 i; i < 2; i++) {
            _repay(repays[i]);
            _relay();

            uint256 gotA = usd.balanceOf(alice);
            uint256 gotB = usd.balanceOf(bob);
            uint256 gotC = usd.balanceOf(carol);
            assertLe(gotA, wantA);
            assertLe(gotB, wantB);
            assertLe(gotC, wantC);
            // Strict order: nobody behind is paid while someone in front still waits.
            if (gotB > 0) assertEq(gotA, wantA, "Bob paid before Alice was whole");
            if (gotC > 0) assertEq(gotB, wantB, "Carol paid before Bob was whole");
            // Totals match the tickets.
            assertEq(queue.pendingAssets(id), (wantA - gotA) + (wantB - gotB) + (wantC - gotC));
            // The queue never leaves liquidity unused while someone waits.
            if (queue.openTickets(id) != 0) assertEq(_liquidity(), 0, "liquidity left with lenders waiting");
            assertEq(usd.balanceOf(address(queue)), 0);
        }
    }
}
