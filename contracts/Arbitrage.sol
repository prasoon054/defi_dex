// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Minimal interface for an ERC20 token.
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

/// Extended interface for the DEX contract with spot price functions.
interface IDEX {
    function swapTokenAForTokenB(uint256 amountAIn) external;
    function swapTokenBForTokenA(uint256 amountBIn) external;
    
    // Functions to retrieve current spot prices.
    function getSpotPriceAinB() external view returns (uint256);
    function getSpotPriceBinA() external view returns (uint256);
}

/// @title Arbitrage Contract
/// @notice Implements arbitrage between two DEXes in both directions (A→B→A and B→A→B).
///         Before executing any swaps, it checks that the profit exceeds a minimum threshold
///         using the DEX spot prices. If not, the transaction reverts with a descriptive error.
///         Successful arbitrage execution is logged via events.
contract Arbitrage {
    // Addresses of the two DEX contracts.
    address public dex1;
    address public dex2;

    // References to token contracts.
    IERC20 public tokenA;
    IERC20 public tokenB;

    // --- Events ---
    /// @notice Emitted when an A→B→A arbitrage execution is successful.
    event ArbitrageExecutedAtoBtoA(address indexed trader, uint256 capital, uint256 profit);
    /// @notice Emitted when a B→A→B arbitrage execution is successful.
    event ArbitrageExecutedBtoAtoB(address indexed trader, uint256 capital, uint256 profit);

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

        // Approve both DEX contracts to spend tokens on behalf of this contract.
        // A very high approval value is used for simplicity.
        tokenA.approve(dex1, type(uint256).max);
        tokenB.approve(dex1, type(uint256).max);
        tokenA.approve(dex2, type(uint256).max);
        tokenB.approve(dex2, type(uint256).max);
    }

    /// @notice Executes an arbitrage opportunity starting with TokenA.
    ///         It simulates the expected return using spot price functions from both DEXes,
    ///         and only proceeds if the expected profit meets or exceeds the `minProfit`.
    /// @param amountAIn The amount of TokenA that the arbitrageur is willing to trade.
    /// @param minProfit The minimum profit (in TokenA) required to execute the arbitrage.
    /// @return finalA The total amount of TokenA returned (capital + profit).
    /// @return profit The profit (in TokenA) earned from the arbitrage.
    function arbitrageAtoBtoA(uint256 amountAIn, uint256 minProfit) external returns (uint256 finalA, uint256 profit) {
        // Retrieve the spot prices from the two DEXes.
        uint256 priceAinB_dex1 = IDEX(dex1).getSpotPriceAinB(); // TokenB per TokenA on DEX1, scaled by 1e18.
        uint256 priceBinA_dex2 = IDEX(dex2).getSpotPriceBinA(); // TokenA per TokenB on DEX2, scaled by 1e18.
        
        // Calculate the expected amount of TokenA after the full round (scaled by 1e36):
        // expectedFinalA = amountAIn * (priceAinB_dex1 * priceBinA_dex2) / 1e36.
        uint256 expectedFinalA = (amountAIn * (priceAinB_dex1 * priceBinA_dex2)) / 1e36;

        // Check that the simulated outcome is profitable.
        require(expectedFinalA > amountAIn, "Arbitrage: No profitable opportunity based on spot prices");
        require(expectedFinalA - amountAIn >= minProfit, "Arbitrage: Expected profit does not meet minimum threshold");

        // Pull TokenA from the arbitrageur.
        // (This requires that the arbitrageur has approved this contract to spend their TokenA.)
        require(tokenA.transferFrom(msg.sender, address(this), amountAIn), "Arbitrage: Transfer of TokenA failed");

        // Execute the first swap on DEX1: TokenA for TokenB.
        IDEX(dex1).swapTokenAForTokenB(amountAIn);
        
        // Get the TokenB balance after the swap.
        uint256 tokenBBalance = tokenB.balanceOf(address(this));
        require(tokenBBalance > 0, "Arbitrage: Swap on DEX1 did not return TokenB");

        // Execute the second swap on DEX2: TokenB back to TokenA.
        IDEX(dex2).swapTokenBForTokenA(tokenBBalance);
        
        // Check the final TokenA balance.
        finalA = tokenA.balanceOf(address(this));
        require(finalA > amountAIn, "Arbitrage: No profit made in A->B->A direction");

        profit = finalA - amountAIn;
        require(profit >= minProfit, "Arbitrage: Profit does not meet minimum threshold");

        // Transfer the total TokenA (capital + profit) back to the arbitrageur.
        require(tokenA.transfer(msg.sender, finalA), "Arbitrage: Transfer of TokenA back failed");

        // Emit an event to log successful arbitrage execution.
        emit ArbitrageExecutedAtoBtoA(msg.sender, amountAIn, profit);
    }

    /// @notice Executes an arbitrage opportunity starting with TokenB.
    ///         It simulates the expected return using the current spot prices from the two DEXes and
    ///         proceeds only if the simulated profit meets or exceeds the `minProfit`.
    /// @param amountBIn The amount of TokenB that the arbitrageur is willing to trade.
    /// @param minProfit The minimum profit (in TokenB) required to execute the arbitrage.
    /// @return finalB The total amount of TokenB returned (capital + profit).
    /// @return profit The profit (in TokenB) earned from the arbitrage.
    function arbitrageBtoAtoB(uint256 amountBIn, uint256 minProfit) external returns (uint256 finalB, uint256 profit) {
        // Retrieve the spot prices from the two DEXes.
        uint256 priceBinA_dex2 = IDEX(dex2).getSpotPriceBinA(); // TokenA per TokenB on DEX2, scaled by 1e18.
        uint256 priceAinB_dex1 = IDEX(dex1).getSpotPriceAinB();  // TokenB per TokenA on DEX1, scaled by 1e18.
        
        // Calculate the expected amount of TokenB after swapping:
        // expectedFinalB = amountBIn * (priceBinA_dex2 * priceAinB_dex1) / 1e36.
        uint256 expectedFinalB = (amountBIn * (priceBinA_dex2 * priceAinB_dex1)) / 1e36;
        require(expectedFinalB > amountBIn, "Arbitrage: No profitable opportunity based on spot prices");
        require(expectedFinalB - amountBIn >= minProfit, "Arbitrage: Expected profit does not meet minimum threshold");

        // Pull TokenB from the arbitrageur.
        require(tokenB.transferFrom(msg.sender, address(this), amountBIn), "Arbitrage: Transfer of TokenB failed");

        // Execute the first swap on DEX2: TokenB for TokenA.
        IDEX(dex2).swapTokenBForTokenA(amountBIn);

        // Get the TokenA balance after the swap.
        uint256 tokenABalance = tokenA.balanceOf(address(this));
        require(tokenABalance > 0, "Arbitrage: Swap on DEX2 did not return TokenA");

        // Execute the second swap on DEX1: TokenA back to TokenB.
        IDEX(dex1).swapTokenAForTokenB(tokenABalance);

        // Check the final TokenB balance.
        finalB = tokenB.balanceOf(address(this));
        require(finalB > amountBIn, "Arbitrage: No profit made in B->A->B direction");

        profit = finalB - amountBIn;
        require(profit >= minProfit, "Arbitrage: Profit does not meet minimum threshold");

        // Transfer the total TokenB (capital + profit) back to the arbitrageur.
        require(tokenB.transfer(msg.sender, finalB), "Arbitrage: Transfer of TokenB back failed");

        // Emit an event to log successful arbitrage execution.
        emit ArbitrageExecutedBtoAtoB(msg.sender, amountBIn, profit);
    }
}

