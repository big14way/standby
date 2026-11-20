// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {TryIt} from "../src/demo/TryIt.sol";
import {BaseTest} from "./Base.t.sol";

/// @dev The public demo contract: one call by anyone runs a whole loop.
contract TryItTest is BaseTest {
    TryIt internal tryIt;

    function setUp() public override {
        super.setUp();
        _supply(alice, 100_000e18);
        _borrowAll();
        tryIt = new TryIt(morpho, queue, id, borrower);
    }

    function test_anyoneCanRunALoop() public {
        _join(alice, 30_000e18);
        _relay();

        vm.prank(rival);
        uint256 index = tryIt.tryIt();
        assertEq(index, 0);
        assertEq(usd.balanceOf(alice), 0, "nothing is paid in the caller's own transaction");

        _relay();
        assertEq(usd.balanceOf(alice), 100e18, "the callback paid the lender at the front");
        (uint256 callbacks, uint256 paid,) = tryIt.outcome(index);
        assertEq(callbacks, 1);
        assertEq(paid, 100e18);
        assertEq(usd.balanceOf(address(tryIt)), 0, "the demo contract keeps nothing");
        assertEq(tryIt.tryCount(), 1);
    }

    function test_refusesWhenNobodyIsWaiting() public {
        vm.expectRevert(TryIt.NobodyWaiting.selector);
        tryIt.tryIt();
    }
}
