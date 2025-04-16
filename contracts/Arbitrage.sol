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

/// Extended interface for the DEX contract with reserve and swap functions.
interface IDEX {
    /// @notice Swaps TokenA for TokenB.
    function swapTokenAForTokenB(uint256 amountAIn) external;
    
    /// @notice Swaps TokenB for TokenA.
    function swapTokenBForTokenA(uint256 amountBIn) external;
    
    /// @notice Returns the spot price for swapping TokenA to TokenB.
    /// Note: This function might be used for quick estimates but the simulation
    /// below uses actual reserves.
    function getSpotPriceAinB() external view returns (uint256);
    
    /// @notice Returns the spot price for swapping TokenB to TokenA.
    function getSpotPriceBinA() external view returns (uint256);
    
    /// @notice Returns the current reserves of TokenA and TokenB held by the DEX.
    /// These values are needed for simulating swaps correctly.
    function getReserves() external view returns (uint256 reserveA, uint256 reserveB);
}

/// @title Arbitrage Contract
/// @notice Implements arbitrage between two DEXes in both directions (A→B→A and B→A→B).
///         Before executing any swaps, it checks that the simulated profit (using the constant-product formula
///         with fees) exceeds a given minimum threshold. If not, the transaction reverts with a descriptive error.
///         Successful arbitrage execution is logged via events.
contract Arbitrage {
    // Addresses of the two DEX contracts.
    address public dex1;
    address public dex2;

    // References to token contracts.
    IERC20 public tokenA;
    IERC20 public tokenB;

    // Fee constants for a 0.3% fee.
    uint256 private constant FEE_NUMERATOR = 997;
    uint256 private constant FEE_DENOMINATOR = 1000;

    // --- Events ---
    event ArbitrageExecutedAtoBtoA(address indexed trader, uint256 capital, uint256 profit);
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
        require(_dex1 != address(0) && _dex2 != address(0) && _tokenA != address(0) && _tokenB != address(0), "Invalid addresses");
        dex1 = _dex1;
        dex2 = _dex2;
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);

        // Approve both DEX contracts to spend tokens on behalf of this contract.
        tokenA.approve(dex1, type(uint256).max);
        tokenB.approve(dex1, type(uint256).max);
        tokenA.approve(dex2, type(uint256).max);
        tokenB.approve(dex2, type(uint256).max);
    }

    /// @notice Helper function that simulates a swap using the constant product formula with fee.
    /// @param amountIn The amount being swapped.
    /// @param reserveIn The reserve amount for the input token.
    /// @param reserveOut The reserve amount for the output token.
    /// @return amountOut The simulated amount received after the swap.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountOut) {
        uint256 amountInWithFee = (amountIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
        amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
    }

    /// @notice Executes an arbitrage opportunity starting with TokenA using route A→B→A.
    ///         It simulates the expected return by reading reserves from both DEXes using the constant product formula.
    ///         The swap is only executed if the simulation indicates that the expected profit meets or exceeds `minProfit`.
    /// @param amountAIn The amount of TokenA that the arbitrageur is willing to trade.
    /// @param minProfit The minimum profit (in TokenA) required to execute the arbitrage.
    /// @return finalA The total amount of TokenA returned (capital + profit).
    /// @return profit The profit (in TokenA) earned from the arbitrage.
    function arbitrageAtoBtoA(uint256 amountAIn, uint256 minProfit) external returns (uint256 finalA, uint256 profit) {
        require(amountAIn > 0, "Capital must be > 0");

        // Retrieve reserves from DEX1 and DEX2.
        (uint256 reserveA1, uint256 reserveB1) = IDEX(dex1).getReserves();
        (uint256 reserveA2, uint256 reserveB2) = IDEX(dex2).getReserves();

        // Simulate the first swap on DEX1: TokenA → TokenB.
        uint256 simulatedTokenB = getAmountOut(amountAIn, reserveA1, reserveB1);

        // Simulate the second swap on DEX2: TokenB → TokenA.
        uint256 simulatedFinalA = getAmountOut(simulatedTokenB, reserveB2, reserveA2);

        // Check that the simulated outcome is profitable.
        require(simulatedFinalA > amountAIn, "Arbitrage: No profitable opportunity based on simulation");
        require(simulatedFinalA - amountAIn >= minProfit, "Arbitrage: Expected profit does not meet minimum threshold");

        // Pull TokenA from the arbitrageur.
        require(tokenA.transferFrom(msg.sender, address(this), amountAIn), "Arbitrage: Transfer of TokenA failed");

        // Execute the first swap on DEX1: TokenA for TokenB.
        IDEX(dex1).swapTokenAForTokenB(amountAIn);

        // Verify TokenB balance after the first swap.
        uint256 tokenBBalance = tokenB.balanceOf(address(this));
        require(tokenBBalance > 0, "Arbitrage: Swap on DEX1 did not return TokenB");

        // Execute the second swap on DEX2: TokenB for TokenA.
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

    /// @notice Executes an arbitrage opportunity starting with TokenB using route B→A→B.
    ///         It simulates the expected return by reading reserves from both DEXes using the constant product formula.
    ///         The swap is only executed if the simulation indicates that the expected profit meets or exceeds `minProfit`.
    /// @param amountBIn The amount of TokenB that the arbitrageur is willing to trade.
    /// @param minProfit The minimum profit (in TokenB) required to execute the arbitrage.
    /// @return finalB The total amount of TokenB returned (capital + profit).
    /// @return profit The profit (in TokenB) earned from the arbitrage.
    function arbitrageBtoAtoB(uint256 amountBIn, uint256 minProfit) external returns (uint256 finalB, uint256 profit) {
    require(amountBIn > 0, "Capital must be > 0");

    // Retrieve reserves in the reversed order:
    // Now use DEX1 for the first swap (B → A)
    (uint256 reserveA1, uint256 reserveB1) = IDEX(dex1).getReserves();
    // And use DEX2 for the second swap (A → B)
    (uint256 reserveA2, uint256 reserveB2) = IDEX(dex2).getReserves();

    // Simulate the first swap on DEX1: TokenB → TokenA.
    uint256 simulatedTokenA = getAmountOut(amountBIn, reserveB1, reserveA1);
    // Simulate the second swap on DEX2: TokenA → TokenB.
    uint256 simulatedFinalB = getAmountOut(simulatedTokenA, reserveA2, reserveB2);

    // Check that the simulated outcome is profitable.
    require(simulatedFinalB > amountBIn, "Arbitrage: No profitable opportunity based on simulation");
    require(simulatedFinalB - amountBIn >= minProfit, "Arbitrage: Expected profit does not meet minimum threshold");

    // Pull TokenB from the arbitrageur.
    require(tokenB.transferFrom(msg.sender, address(this), amountBIn), "Arbitrage: Transfer of TokenB failed");

    // Execute the first swap on DEX1: TokenB for TokenA.
    IDEX(dex1).swapTokenBForTokenA(amountBIn);

    // Verify TokenA balance after the first swap.
    uint256 tokenABalance = tokenA.balanceOf(address(this));
    require(tokenABalance > 0, "Arbitrage: Swap on DEX1 did not return TokenA");

    // Execute the second swap on DEX2: TokenA for TokenB.
    IDEX(dex2).swapTokenAForTokenB(tokenABalance);

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
