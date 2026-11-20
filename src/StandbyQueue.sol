// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {IMorpho, Id, MarketParams, Market, Position} from "morpho-blue/src/interfaces/IMorpho.sol";
import {SharesMathLib} from "morpho-blue/src/libraries/SharesMathLib.sol";

/// @title StandbyQueue
/// @notice A first-in, first-out exit queue for lenders in a Morpho Blue market that has no liquidity left.
///         A lender authorises this contract on Morpho once and joins with an amount. Their position never
///         leaves Morpho. When liquidity returns, the Reactive Network calls `settle` and the queue withdraws
///         for the lenders at the front, straight to their own addresses.
/// @dev    Lives on the chain the market is on. Holds no lender funds, has no owner and no settable parameter.
///         `settle` accepts only the chain's callback proxy carrying the one reactive contract fixed at
///         deployment, and it re-reads the market's real liquidity, so a late or repeated callback pays nothing.
contract StandbyQueue is AbstractCallback {
    using SharesMathLib for uint256;

    /// @dev A ticket with `assets == 0` is closed: paid in full, cancelled, or voided.
    struct Ticket {
        address owner;
        uint128 assets;
    }

    /// @notice Why a ticket was closed without being paid in full.
    enum VoidReason {
        NoPosition,
        WithdrawFailed
    }

    error WrongFee(uint256 sent, uint256 required);
    error ZeroAssets();
    error UnknownMarket();
    error QueueNotAuthorized();
    error AlreadyQueued();
    error NothingSupplied();
    error NotQueued();
    error Reentered();
    /// @notice `join` on a market that can pay now needs gas for the payment. Send more.
    error NotEnoughGas();

    /// @notice A lender joined the queue.
    event Joined(Id indexed id, address indexed owner, uint256 ticket, uint256 assets);
    /// @notice A lender cancelled their ticket before it was paid in full.
    event Cancelled(Id indexed id, address indexed owner, uint256 ticket, uint256 assetsUnpaid);
    /// @notice The queue withdrew `assets` from Morpho to `owner`. `assetsLeft` is what the ticket still waits for.
    event Paid(Id indexed id, address indexed owner, uint256 ticket, uint256 assets, uint256 assetsLeft);
    /// @notice A ticket was closed because its owner could not be paid.
    event Voided(Id indexed id, address indexed owner, uint256 ticket, VoidReason reason);
    /// @notice The queue's state for a market changed. The reactive contract follows this event.
    /// @param more True when lenders are still waiting and liquidity is still there: the call stopped at its
    ///        per-call limit and another one should follow.
    event QueueState(Id indexed id, uint256 pendingAssets, uint256 openTickets, bool more);
    /// @notice One delivered callback. `originBlock` is the block of the event that caused it, on this chain,
    ///         so `settledBlock - originBlock` is the whole loop measured in this chain's blocks.
    event Loop(
        Id indexed id,
        uint256 originBlock,
        uint256 settledBlock,
        uint256 originTxHash,
        uint256 assetsPaid,
        uint256 tickets
    );

    /// @notice Tickets paid or voided per call, so one callback has a known gas ceiling.
    uint256 public constant MAX_SERVED_PER_CALL = 6;
    /// @notice Queue slots looked at per call, closed ones included.
    uint256 public constant MAX_STEPS_PER_CALL = 24;
    /// @notice Gas that must be left before the queue starts on another ticket.
    uint256 public constant MIN_GAS_PER_TICKET = 250_000;
    /// @notice Size of the on-chain latency record. The last bucket counts every loop that took longer.
    uint256 public constant LAG_BUCKETS = 64;

    IMorpho public immutable MORPHO;
    /// @notice Paid in the chain's native currency on `join`. It stays in this contract and pays for callbacks.
    uint256 public immutable JOIN_FEE;

    mapping(Id => Ticket[]) internal _tickets;
    /// @notice Index of the first ticket that may still be open.
    mapping(Id => uint256) public head;
    /// @notice A lender's open ticket in a market, as index + 1. Zero means none.
    mapping(Id => mapping(address => uint256)) public ticketOf;
    /// @notice Assets the open tickets of a market still wait for.
    mapping(Id => uint256) public pendingAssets;
    mapping(Id => uint256) public openTickets;

    /// @notice Delivered callbacks, and how many of them paid someone.
    uint64 public loops;
    uint64 public loopsThatPaid;
    /// @dev `_lag[n]` counts callbacks that landed `n` blocks after the event that caused them.
    uint32[LAG_BUCKETS] internal _lag;

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentered();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param callbackProxy_ The Reactive Network callback proxy on this chain.
    /// @param watcher_ The reactive contract allowed to trigger `settle`. It cannot be changed.
    /// @param morpho_ Morpho Blue on this chain.
    /// @param joinFee_ Native-currency fee per ticket, which funds the callbacks.
    constructor(IPayable callbackProxy_, address watcher_, IMorpho morpho_, uint256 joinFee_)
        payable
        AbstractCallback(callbackProxy_, watcher_)
    {
        MORPHO = morpho_;
        JOIN_FEE = joinFee_;
    }

    // ----------------------------------------------------------------------------------------------------------
    // Lenders
    // ----------------------------------------------------------------------------------------------------------

    /// @notice Join the exit queue of a market for `assets` of the loan token.
    /// @dev The caller must first call `MORPHO.setAuthorization(address(this), true)`. If the market has
    ///      liquidity now, the front of the queue (which may be the caller) is paid in this transaction.
    function join(Id id, uint256 assets) external payable nonReentrant returns (uint256 ticket) {
        if (msg.value != JOIN_FEE) revert WrongFee(msg.value, JOIN_FEE);
        if (assets == 0) revert ZeroAssets();
        MarketParams memory mp = MORPHO.idToMarketParams(id);
        if (mp.loanToken == address(0)) revert UnknownMarket();
        if (!MORPHO.isAuthorized(msg.sender, address(this))) revert QueueNotAuthorized();
        if (ticketOf[id][msg.sender] != 0) revert AlreadyQueued();

        MORPHO.accrueInterest(mp);
        Market memory m = MORPHO.market(id);
        uint256 supplied =
            MORPHO.position(id, msg.sender).supplyShares.toAssetsDown(m.totalSupplyAssets, m.totalSupplyShares);
        if (supplied == 0) revert NothingSupplied();
        if (assets > supplied) assets = supplied;

        Ticket[] storage q = _tickets[id];
        ticket = q.length;
        // `assets` is at most the lender's position, which is bounded by the market's uint128 total.
        // forge-lint: disable-next-line(unsafe-typecast)
        q.push(Ticket({owner: msg.sender, assets: uint128(assets)}));
        ticketOf[id][msg.sender] = ticket + 1;
        pendingAssets[id] += assets;
        openTickets[id] += 1;
        emit Joined(id, msg.sender, ticket, assets);

        // Strict: a join sent with too little gas to pay reverts instead of quietly skipping the payment,
        // so a wallet's gas estimate lands on the amount that lets a liquid market pay in this transaction.
        (,, bool more) = _settle(id, mp, true);
        emit QueueState(id, pendingAssets[id], openTickets[id], more);
    }

    /// @notice Cancel your ticket. Anything already paid stays paid.
    function cancel(Id id) external nonReentrant {
        uint256 slot = ticketOf[id][msg.sender];
        if (slot == 0) revert NotQueued();
        Ticket storage t = _tickets[id][slot - 1];
        uint256 unpaid = t.assets;
        _close(id, t, unpaid);
        emit Cancelled(id, msg.sender, slot - 1, unpaid);
        emit QueueState(id, pendingAssets[id], openTickets[id], false);
    }

    // ----------------------------------------------------------------------------------------------------------
    // Reactive Network
    // ----------------------------------------------------------------------------------------------------------

    /// @notice Pay the front of a market's queue from whatever liquidity the market has right now.
    /// @dev Called by the callback proxy. The proxy overwrites the first argument with the address of the
    ///      reactive contract that asked for the callback.
    /// @param originBlock Block, on this chain, of the event the reactive contract reacted to.
    /// @param originTxHash Hash of the transaction that emitted it.
    function settle(address reactive_, Id id, uint256 originBlock, uint256 originTxHash)
        external
        onlyServiceProvider
        onlyCallbackSender(reactive_)
        nonReentrant
    {
        (uint256 paid, uint256 served, bool more) = _settle(id, MORPHO.idToMarketParams(id), false);

        loops += 1;
        if (paid != 0) loopsThatPaid += 1;
        uint256 lag = block.number > originBlock ? block.number - originBlock : 0;
        _lag[lag < LAG_BUCKETS ? lag : LAG_BUCKETS - 1] += 1;

        emit Loop(id, originBlock, block.number, originTxHash, paid, served);
        if (served != 0) emit QueueState(id, pendingAssets[id], openTickets[id], more);
    }

    /// @notice Settle this contract's debt to the callback proxy from its own balance, if it has one.
    function coverDebt() external {
        _coverDebt();
    }

    // ----------------------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------------------

    /// @notice Number of tickets ever issued for a market.
    function ticketCount(Id id) external view returns (uint256) {
        return _tickets[id].length;
    }

    function ticketAt(Id id, uint256 ticket) external view returns (address owner, uint256 assets) {
        Ticket storage t = _tickets[id][ticket];
        return (t.owner, t.assets);
    }

    /// @notice The on-chain latency record: entry `n` counts callbacks that landed `n` blocks after their event.
    function lagHistogram() external view returns (uint32[LAG_BUCKETS] memory) {
        return _lag;
    }

    /// @notice Liquidity a market could pay out now, as of its last interest accrual.
    function liquidity(Id id) external view returns (uint256) {
        Market memory m = MORPHO.market(id);
        return m.totalSupplyAssets - m.totalBorrowAssets;
    }

    // ----------------------------------------------------------------------------------------------------------
    // Internals
    // ----------------------------------------------------------------------------------------------------------

    /// @dev Walks the queue from its head and withdraws for each open ticket until liquidity, tickets or the
    ///      per-call limits run out. A ticket that cannot be paid is voided so it cannot block the ones behind.
    ///      `strict` is set by `join`: there, running short of gas reverts. In a callback it stops the walk.
    function _settle(Id id, MarketParams memory mp, bool strict)
        internal
        returns (uint256 paid, uint256 served, bool more)
    {
        if (openTickets[id] == 0) return (0, 0, false);

        MORPHO.accrueInterest(mp);
        Market memory m = MORPHO.market(id);
        uint256 liquid = m.totalSupplyAssets - m.totalBorrowAssets;

        Ticket[] storage q = _tickets[id];
        uint256 h = head[id];
        uint256 end = q.length;
        uint256 steps;

        while (h < end && liquid != 0 && served < MAX_SERVED_PER_CALL && steps < MAX_STEPS_PER_CALL) {
            // A withdrawal that runs out of gas would look like a failed one and void the ticket. Stop
            // early instead; `more` then asks for another call.
            if (gasleft() < MIN_GAS_PER_TICKET) {
                if (strict) revert NotEnoughGas();
                break;
            }
            steps += 1;
            Ticket storage t = q[h];
            uint256 want = t.assets;
            if (want == 0) {
                h += 1;
                continue;
            }
            served += 1;
            address owner = t.owner;
            uint256 supplied =
                MORPHO.position(id, owner).supplyShares.toAssetsDown(m.totalSupplyAssets, m.totalSupplyShares);
            uint256 pay = want < liquid ? want : liquid;
            if (pay > supplied) pay = supplied;

            if (pay == 0) {
                _close(id, t, want);
                emit Voided(id, owner, h, VoidReason.NoPosition);
                h += 1;
                continue;
            }

            try MORPHO.withdraw(mp, pay, 0, owner, owner) returns (uint256, uint256 sharesBurned) {
                // Both are parts of the market's own uint128 totals, which Morpho has just reduced by them.
                // forge-lint: disable-next-line(unsafe-typecast)
                m.totalSupplyAssets -= uint128(pay);
                // forge-lint: disable-next-line(unsafe-typecast)
                m.totalSupplyShares -= uint128(sharesBurned);
                liquid -= pay;
                paid += pay;
                if (pay == want || pay == supplied) {
                    // Paid in full, or the position is now empty: nothing more this ticket could get.
                    _close(id, t, want);
                    emit Paid(id, owner, h, pay, 0);
                    h += 1;
                } else {
                    // Smaller than `want`, which was read from a uint128.
                    // forge-lint: disable-next-line(unsafe-typecast)
                    t.assets = uint128(want - pay);
                    pendingAssets[id] -= pay;
                    emit Paid(id, owner, h, pay, want - pay);
                }
            } catch {
                // Typically the owner revoked the authorisation. Their position is untouched.
                _close(id, t, want);
                emit Voided(id, owner, h, VoidReason.WithdrawFailed);
                h += 1;
            }
        }

        head[id] = h;
        more = liquid != 0 && openTickets[id] != 0;
    }

    function _close(Id id, Ticket storage t, uint256 unpaid) internal {
        ticketOf[id][t.owner] = 0;
        t.assets = 0;
        pendingAssets[id] -= unpaid;
        openTickets[id] -= 1;
    }
}
