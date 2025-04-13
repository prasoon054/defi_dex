// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LPToken is ERC20 {
    // The address that deployed the DEX is allowed to mint/burn LP tokens.
    address public dex;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        dex = msg.sender;
    }

    /// @notice Mint LP tokens – callable only by the DEX contract.
    /// @param account The recipient of the minted tokens.
    /// @param amount The number of tokens to mint.
    function mint(address account, uint256 amount) external {
        require(msg.sender == dex, "LPToken: Only DEX can mint");
        _mint(account, amount);
    }

    /// @notice Burn LP tokens – callable only by the DEX contract.
    /// @param account The account whose tokens will be burned.
    /// @param amount The number of tokens to burn.
    function burnFrom(address account, uint256 amount) external {
        require(msg.sender == dex, "LPToken: Only DEX can burn");
        _burn(account, amount);
    }
}
