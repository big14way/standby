// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";

/// @title StandbyWatcher
/// @notice The reactive half of Standby. It runs on the Reactive Network and decides when the exit queue on
///         the market's chain should be settled.
/// @dev    It follows two things on the origin chain:
///         1. the queue's own `QueueState` event, to know which markets have lenders waiting;
///         2. for those markets only, the Morpho Blue events that put liquidity back: `Repay`, `Supply`
///            and `Liquidate`.
///         The Morpho subscriptions for a market are opened when its queue becomes non-empty and closed when
///         it empties, so a market nobody is waiting on costs nothing. When liquidity returns to a market
///         with a queue, the watcher asks for one callback to `StandbyQueue.settle`.
contract StandbyWatcher is AbstractReactive {
    error NotOwner();
    error QueueAlreadySet();
    error ZeroAddress();
    error WithdrawFailed();

    /// @notice What made the watcher ask for a callback.
    enum Cause {
        Repay,
        Supply,
        Liquidate,
        More
    }

    /// @notice The watcher saw liquidity return to a market with a queue and asked for a settlement.
    /// @param originBlock Block of the event on the origin chain.
    /// @param originTxHash Transaction that emitted it.
    /// @param assets Loan-token amount the event put back (zero for `More`).
    event SettlementRequested(
        uint256 indexed id, Cause indexed cause, uint256 originBlock, uint256 originTxHash, uint256 assets
    );
    /// @notice The watcher started or stopped following a market's Morpho events.
    event Watching(uint256 indexed id, bool watching);

    /// @dev keccak256("Repay(bytes32,address,address,uint256,uint256)")
    uint256 public constant REPAY_TOPIC = 0x52acb05cebbd3cd39715469f22afbf5a17496295ef3bc9bb5944056c63ccaa09;
    /// @dev keccak256("Supply(bytes32,address,address,uint256,uint256)")
    uint256 public constant SUPPLY_TOPIC = 0xedf8870433c83823eb071d3df1caa8d008f12f6440918c20d75a3602cda30fe0;
    /// @dev keccak256("Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)")
    uint256 public constant LIQUIDATE_TOPIC = 0xa4946ede45d0c6f06a0f5ce92c9ad3b4751452d2fe0e25010783bcab57a67e41;
    /// @dev keccak256("QueueState(bytes32,uint256,uint256,bool)")
    uint256 public constant QUEUE_STATE_TOPIC = 0xb1ac3aa5e6cca4ee10d72129a6c93f34d4d599b0ffa74d0ab16a0b0c8ba382de;

    /// @notice Gas given to one `settle` callback. The queue pays for what is used.
    uint64 public constant CALLBACK_GAS_LIMIT = 2_000_000;

    address public immutable OWNER;
    /// @notice Chain the market and the queue are on.
    uint256 public immutable ORIGIN_CHAIN_ID;
    /// @notice Morpho Blue on that chain.
    address public immutable MORPHO;

    /// @notice The exit queue on the origin chain. Set once.
    address public queue;
    /// @notice Open tickets per market, as last reported by the queue.
    mapping(uint256 => uint256) public waiting;
    /// @notice Whether the Morpho subscriptions for a market are open.
    mapping(uint256 => bool) public watching;
    /// @notice Callbacks asked for, in total.
    uint256 public requests;

    modifier onlyOwner() {
        if (msg.sender != OWNER) revert NotOwner();
        _;
    }

    constructor(uint256 originChainId_, address morpho_) payable {
        if (morpho_ == address(0)) revert ZeroAddress();
        OWNER = msg.sender;
        ORIGIN_CHAIN_ID = originChainId_;
        MORPHO = morpho_;
    }

    /// @notice Bind the queue and start following its state. The queue is deployed after this contract,
    ///         because it fixes this contract's address at construction.
    function setQueue(address queue_) external onlyOwner {
        if (queue != address(0)) revert QueueAlreadySet();
        if (queue_ == address(0)) revert ZeroAddress();
        queue = queue_;
        SYSTEM.subscribe(ORIGIN_CHAIN_ID, queue_, QUEUE_STATE_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    /// @inheritdoc IReactive
    /// @dev Never reverts on a log it does not care about: a revert is billed like any other reaction.
    function react(LogRecord calldata log_) external onlySystem {
        if (log_.chainId != ORIGIN_CHAIN_ID) return;

        if (log_.contractAddress == queue) {
            if (log_.topic0 == QUEUE_STATE_TOPIC && log_.opCode == 2) _onQueueState(log_);
            return;
        }
        if (log_.contractAddress != MORPHO) return;

        uint256 id = log_.topic1;
        if (waiting[id] == 0) return;

        Cause cause;
        if (log_.topic0 == REPAY_TOPIC) cause = Cause.Repay;
        else if (log_.topic0 == SUPPLY_TOPIC) cause = Cause.Supply;
        else if (log_.topic0 == LIQUIDATE_TOPIC) cause = Cause.Liquidate;
        else return;
        if (log_.opCode != 4 || log_.data.length < 32) return;

        // In all three events the first data word is the loan-token amount that came back.
        uint256 assets = abi.decode(log_.data[:32], (uint256));
        if (assets == 0) return;
        _requestSettle(id, cause, log_.blockNumber, log_.txHash, assets);
    }

    /// @notice Settle this contract's debt to the system contract from its own balance, if it has one.
    function coverDebt() external {
        _coverDebt();
    }

    /// @notice Take funds back out of the watcher.
    function withdraw(uint256 amount) external onlyOwner {
        (bool ok,) = payable(OWNER).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    function _onQueueState(LogRecord calldata log_) internal {
        if (log_.data.length < 96) return;
        uint256 id = log_.topic1;
        (, uint256 openTickets, bool more) = abi.decode(log_.data, (uint256, uint256, bool));
        waiting[id] = openTickets;

        if (openTickets != 0 && !watching[id]) {
            watching[id] = true;
            _subscribeMarket(id);
            emit Watching(id, true);
        } else if (openTickets == 0 && watching[id]) {
            watching[id] = false;
            _unsubscribeMarket(id);
            emit Watching(id, false);
        }

        if (more && openTickets != 0) _requestSettle(id, Cause.More, log_.blockNumber, log_.txHash, 0);
    }

    function _requestSettle(uint256 id, Cause cause, uint256 originBlock, uint256 originTxHash, uint256 assets)
        internal
    {
        requests += 1;
        emit SettlementRequested(id, cause, originBlock, originTxHash, assets);
        // The callback proxy replaces the first argument with this contract's address.
        bytes memory payload = abi.encodeWithSignature(
            "settle(address,bytes32,uint256,uint256)", address(0), bytes32(id), originBlock, originTxHash
        );
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: ORIGIN_CHAIN_ID, recipient: queue, gasLimit: CALLBACK_GAS_LIMIT, payload: payload
            })
        );
    }

    function _subscribeMarket(uint256 id) internal {
        SYSTEM.subscribe(ORIGIN_CHAIN_ID, MORPHO, REPAY_TOPIC, id, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(ORIGIN_CHAIN_ID, MORPHO, SUPPLY_TOPIC, id, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(ORIGIN_CHAIN_ID, MORPHO, LIQUIDATE_TOPIC, id, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function _unsubscribeMarket(uint256 id) internal {
        SYSTEM.unsubscribe(ORIGIN_CHAIN_ID, MORPHO, REPAY_TOPIC, id, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.unsubscribe(ORIGIN_CHAIN_ID, MORPHO, SUPPLY_TOPIC, id, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.unsubscribe(ORIGIN_CHAIN_ID, MORPHO, LIQUIDATE_TOPIC, id, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }
}
