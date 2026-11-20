// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IMorpho, Id, MarketParams} from "morpho-blue/src/interfaces/IMorpho.sol";

import {StandbyQueue} from "../StandbyQueue.sol";
import {DemoToken} from "./DemoToken.sol";

/// @notice One call anyone can make on the testnet demo market to watch a loop run. `tryIt()` mints 100 test
///         dollars and repays that much of the demo borrower's debt. Nothing else is done here: the Reactive
///         Network sees Morpho's `Repay` event and has the queue pay the lender at the front, a second or two
///         later, in a transaction the caller did not send. `outcome()` then shows that it happened.
/// @dev    Testnet only. It relies on the demo token being mintable by anyone.
contract TryIt {
    /// @notice Test dollars repaid per call.
    uint256 public constant AMOUNT = 100e18;

    IMorpho public immutable MORPHO;
    StandbyQueue public immutable QUEUE;
    Id public immutable ID;
    /// @notice The demo borrower whose debt each call repays a little of.
    address public immutable BORROWER;

    struct Try {
        address caller;
        uint64 blockNumber;
        uint64 loopsBefore;
        uint128 pendingBefore;
    }

    Try[] public tries;

    event Tried(address indexed caller, uint256 indexed index, uint256 blockNumber, uint256 lendersWaiting);

    /// @notice The queue is empty, so a repayment would have nobody to pay.
    error NobodyWaiting();

    constructor(IMorpho morpho_, StandbyQueue queue_, Id id_, address borrower_) {
        MORPHO = morpho_;
        QUEUE = queue_;
        ID = id_;
        BORROWER = borrower_;
    }

    /// @notice Repay 100 test dollars of the demo borrower's debt and leave the rest to the Reactive Network.
    /// @return index Pass it to `outcome` a few seconds later.
    function tryIt() external returns (uint256 index) {
        uint256 waiting = QUEUE.openTickets(ID);
        if (waiting == 0) revert NobodyWaiting();

        MarketParams memory mp = MORPHO.idToMarketParams(ID);
        DemoToken token = DemoToken(mp.loanToken);
        token.mint(address(this), AMOUNT);
        token.approve(address(MORPHO), AMOUNT);

        index = tries.length;
        tries.push(
            Try({
                caller: msg.sender,
                blockNumber: uint64(block.number),
                loopsBefore: QUEUE.loops(),
                // Bounded by the market's uint128 supply total.
                // forge-lint: disable-next-line(unsafe-typecast)
                pendingBefore: uint128(QUEUE.pendingAssets(ID))
            })
        );
        MORPHO.repay(mp, AMOUNT, 0, BORROWER, "");
        emit Tried(msg.sender, index, block.number, waiting);
    }

    /// @notice What the queue has done since try number `index`.
    /// @return callbacksSince Settlements delivered to the queue since the call (any cause).
    /// @return paidSince How much the amount waiting in the queue has fallen since the call.
    /// @return blocksSince Blocks since the call.
    function outcome(uint256 index)
        external
        view
        returns (uint256 callbacksSince, uint256 paidSince, uint256 blocksSince)
    {
        Try memory t = tries[index];
        callbacksSince = QUEUE.loops() - t.loopsBefore;
        uint256 pending = QUEUE.pendingAssets(ID);
        paidSince = t.pendingBefore > pending ? t.pendingBefore - pending : 0;
        blocksSince = block.number - t.blockNumber;
    }

    function tryCount() external view returns (uint256) {
        return tries.length;
    }
}
