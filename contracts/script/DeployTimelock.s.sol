// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * Deploys an OpenZeppelin TimelockController to sit in front of a Safe (or any
 * multisig) as the GlowFunFactory_V3's `owner()` and/or a token's factory-recorded
 * `creator`. This does NOT touch the factory or any token — it only creates the
 * timelock contract. Wiring it up is a separate, explicit step you take from the
 * app's Security Center (Platform-wide tab -> "Transfer factory ownership", or
 * a token's Security page -> "Move <TOKEN>'s creator role"), once you've verified
 * the deployed address below.
 *
 * Why bother once you already have a Safe? A Safe stops a single stolen key from
 * acting alone. A timelock adds the other half: even a FULLY-APPROVED admin action
 * (a mint, a blacklist, a fee change) has to sit publicly on-chain for MIN_DELAY
 * seconds before it can execute — the window that lets you or your community catch
 * and react to something malicious before it lands, not after.
 *
 * Usage (see docs/SECURITY.md for the full walkthrough):
 *
 *   export PRIVATE_KEY=0x...                       # deployer key (pays gas only — becomes admin only if you don't renounce)
 *   export MIN_DELAY_SECONDS=86400                  # 24h; use 172800 for 48h, etc.
 *   export SAFE_ADDRESS=0xYourSafeAddress           # your Gnosis Safe (or other multisig)
 *
 *   forge script contracts/script/DeployTimelock.s.sol:DeployTimelock \
 *     --rpc-url https://rpc.mainnet.arc.io --broadcast --verify -vvvv
 *
 * The Safe is set as BOTH proposer and executor, so only the Safe (through its own
 * signer threshold) can queue or run a timelocked action — the deployer key has no
 * standing power once ADMIN_ROLE is renounced (this script renounces it for you,
 * matching OpenZeppelin's own recommended pattern; the Safe itself becomes admin
 * of its own timelock roles via TimelockController's constructor `admin` param).
 */
contract DeployTimelock is Script {
    function run() external returns (TimelockController timelock) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        uint256 minDelay = vm.envOr("MIN_DELAY_SECONDS", uint256(86400)); // default 24h
        address safe = vm.envAddress("SAFE_ADDRESS");

        require(safe != address(0), "SAFE_ADDRESS not set");
        require(minDelay >= 3600, "MIN_DELAY_SECONDS too short — use at least 1 hour");

        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = safe;

        vm.startBroadcast(deployerKey);
        // admin = safe itself, so the deployer key retains no standing control at all —
        // the Safe can grant/revoke TimelockController roles to itself going forward.
        timelock = new TimelockController(minDelay, proposers, executors, safe);
        vm.stopBroadcast();

        console.log("TimelockController deployed at:", address(timelock));
        console.log("Minimum delay (seconds):       ", minDelay);
        console.log("Proposer / executor / admin:   ", safe);
        console.log("");
        console.log("Next steps:");
        console.log("1. Verify this address on the explorer before trusting it.");
        console.log("2. From the Security Center's Platform-wide tab, connect the CURRENT");
        console.log("   factory owner wallet and transfer ownership to this address.");
        console.log("3. Per token, from that token's Security page, connect the CURRENT");
        console.log("   factory-recorded creator wallet and transfer the creator role to");
        console.log("   this address (this does NOT affect mint/pause/blacklist, which stay");
        console.log("   with the token's immutable creator forever).");
        console.log("4. From now on, queue an admin action through the Safe (schedule()),");
        console.log("   wait out the delay, then execute() it — also through the Safe.");
    }
}
