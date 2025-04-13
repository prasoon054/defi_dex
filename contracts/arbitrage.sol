// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal interface for an ERC20 token.
interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

// Minimal interface for the DEX contract (using functions from your DEX.sol).
interface IDEX {
    function swapTokenAForTokenB(uint256 amountAIn) external;
    function swapTokenBForTokenA(uint256 amountBIn) external;
}

/// @title Arbitrage Contract
/// @notice This contract implements arbitrage between two DEXes. It supports both arbitrage directions:
///         A → B → A and B → A → B. The contract checks that the profit exceeds a provided minimum threshold
///         and returns both the original capital and the profit to the arbitrageur.
contract Arbitrage {
    // Addresses of the two DEX contracts.
    address public dex1;
    address public dex2;

    // References to token contracts.
    IERC20 public tokenA;
    IERC20 public tokenB;

    /// @notice Constructor sets up the arbitrage contract.
    /// @param _dex1 Address of the first DEX.
    /// @param _dex2 Address of the second DEX.
    /// @param _tokenA Address of TokenA.
    /// @param _tokenB Address of TokenB.
    constructor(
        address _dex1,
        address _dex2,
        address _tokenA,
        address _tokenB
    ) {
        dex1 = _dex1;
        dex2 = _dex2;
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);

        // Approve the DEX contracts to spend tokens from this contract.
        // Using a very high approval value for simplicity.
        tokenA.approve(dex1, type(uint256).max);
        tokenB.approve(dex1, type(uint256).max);
        tokenA.approve(dex2, type(uint256).max);
        tokenB.approve(dex2, type(uint256).max);
    }

    /// @notice Executes an arbitrage opportunity starting with TokenA.
    /// @param amountAIn The amount of TokenA the arbitrageur is willing to trade.
    /// @param minProfit The minimum profit (in TokenA) required to execute the arbitrage.
    /// @return finalA The total amount of TokenA returned (capital + profit).
    /// @return profit The profit (in TokenA) earned from the arbitrage.
    function arbitrageAtoBtoA(uint256 amountAIn, uint256 minProfit) external returns (uint256 finalA, uint256 profit) {
        // Pull TokenA from the arbitrageur.
        require(tokenA.transferFrom(msg.sender, address(this), amountAIn), "Arbitrage: Transfer of TokenA failed");

        // Execute first swap on DEX1: TokenA for TokenB.
        // Here, msg.sender for DEX1 is this contract (which now holds TokenA).
        IDEX(dex1).swapTokenAForTokenB(amountAIn);
        
        // Determine the obtained amount of TokenB.
        uint256 tokenBBalance = tokenB.balanceOf(address(this));
        require(tokenBBalance > 0, "Arbitrage: Swap on DEX1 did not return TokenB");

        // Execute second swap on DEX2: TokenB back to TokenA.
        IDEX(dex2).swapTokenBForTokenA(tokenBBalance);
        
        // Check the final TokenA balance in this contract.
        finalA = tokenA.balanceOf(address(this));
        require(finalA > amountAIn, "Arbitrage: No profit made in A→B→A direction");

        profit = finalA - amountAIn;
        require(profit >= minProfit, "Arbitrage: Profit does not meet minimum threshold");

        // Transfer the total TokenA (original capital + profit) back to the arbitrageur.
        require(tokenA.transfer(msg.sender, finalA), "Arbitrage: Transfer of TokenA back failed");
    }

    /// @notice Executes an arbitrage opportunity starting with TokenB.
    /// @param amountBIn The amount of TokenB the arbitrageur is willing to trade.
    /// @param minProfit The minimum profit (in TokenB) required to execute the arbitrage.
    /// @return finalB The total amount of TokenB returned (capital + profit).
    /// @return profit The profit (in TokenB) earned from the arbitrage.
    function arbitrageBtoAtoB(uint256 amountBIn, uint256 minProfit) external returns (uint256 finalB, uint256 profit) {
        // Pull TokenB from the arbitrageur.
        require(tokenB.transferFrom(msg.sender, address(this), amountBIn), "Arbitrage: Transfer of TokenB failed");

        // Execute first swap on DEX2: TokenB for TokenA.
        IDEX(dex2).swapTokenBForTokenA(amountBIn);

        // Determine the obtained amount of TokenA.
        uint256 tokenABalance = tokenA.balanceOf(address(this));
        require(tokenABalance > 0, "Arbitrage: Swap on DEX2 did not return TokenA");

        // Execute second swap on DEX1: TokenA back to TokenB.
        IDEX(dex1).swapTokenAForTokenB(tokenABalance);

        // Check the final TokenB balance in this contract.
        finalB = tokenB.balanceOf(address(this));
        require(finalB > amountBIn, "Arbitrage: No profit made in B→A→B direction");

        profit = finalB - amountBIn;
        require(profit >= minProfit, "Arbitrage: Profit does not meet minimum threshold");

        // Transfer the total TokenB (original capital + profit) back to the arbitrageur.
        require(tokenB.transfer(msg.sender, finalB), "Arbitrage: Transfer of TokenB back failed");
    }
}
