// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @notice A second reactive contract that asks the Reactive Network to call `settle` on a queue it has nothing
///         to do with. It exists to show, on testnet, that the queue refuses: the callback proxy stamps the
///         callback with the address of the contract that asked for it, and the queue only accepts its own
///         watcher's.
contract Impostor is AbstractReactive {
    address public immutable OWNER;

    constructor() payable {
        OWNER = msg.sender;
    }

    /// @notice Ask for `settle(address,bytes32,uint256,uint256)` on `queue`, exactly as the real watcher would.
    function poke(uint256 chainId, address queue, bytes32 id, uint64 gasLimit) external {
        require(msg.sender == OWNER, "owner only");
        bytes memory payload = abi.encodeWithSignature(
            "settle(address,bytes32,uint256,uint256)", address(0), id, block.number, uint256(0)
        );
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: chainId, recipient: queue, gasLimit: gasLimit, payload: payload
            })
        );
    }

    /// @dev Subscribed to nothing, so never called.
    function react(IReactive.LogRecord calldata) external onlySystem {}

    function withdraw() external {
        require(msg.sender == OWNER, "owner only");
        _coverDebt();
        (bool ok,) = OWNER.call{value: address(this).balance}("");
        require(ok, "transfer failed");
    }
}
