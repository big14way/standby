// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @dev Stands in for the Reactive system contract at 0x8888…8888. It records what a reactive contract
///      asks for, so a test can check the subscriptions and deliver the callbacks itself.
contract MockSystem {
    struct Sub {
        uint256 chainId;
        address origin;
        uint256 topic0;
        uint256 topic1;
        uint256 topic2;
        uint256 topic3;
    }

    mapping(bytes32 => bool) public active;
    uint256 public activeCount;
    ISystemContract.CallbackConfiguration_V_1_0[] internal _requests;

    function subscribe(uint256 c, address a, uint256 t0, uint256 t1, uint256 t2, uint256 t3) external {
        bytes32 k = keccak256(abi.encode(msg.sender, c, a, t0, t1, t2, t3));
        if (!active[k]) {
            active[k] = true;
            activeCount += 1;
        }
    }

    function unsubscribe(uint256 c, address a, uint256 t0, uint256 t1, uint256 t2, uint256 t3) external {
        bytes32 k = keccak256(abi.encode(msg.sender, c, a, t0, t1, t2, t3));
        if (active[k]) {
            active[k] = false;
            activeCount -= 1;
        }
    }

    function isSubscribed(address who, uint256 c, address a, uint256 t0, uint256 t1, uint256 t2, uint256 t3)
        external
        view
        returns (bool)
    {
        return active[keccak256(abi.encode(who, c, a, t0, t1, t2, t3))];
    }

    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory cfg) external {
        _requests.push(cfg);
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function request(uint256 i) external view returns (ISystemContract.CallbackConfiguration_V_1_0 memory) {
        return _requests[i];
    }

    function debt(address) external pure returns (uint256) {
        return 0;
    }

    receive() external payable {}
}

/// @dev Stands in for a destination chain's callback proxy: it writes the reactive contract's address over
///      the first argument of the payload, as the real proxy does, and makes the call.
contract MockProxy {
    function deliver(address recipient, address reactive, bytes memory payload, uint256 gasLimit)
        external
        returns (bool ok, bytes memory ret)
    {
        assembly {
            mstore(add(payload, 36), reactive)
        }
        (ok, ret) = recipient.call{gas: gasLimit}(payload);
    }

    function debt(address) external pure returns (uint256) {
        return 0;
    }

    receive() external payable {}
}
