// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LPToken.sol";

contract DEX {
    IERC20 public tokenA;
    IERC20 public tokenB;
    LPToken public lpToken;

    // Internal reserve tracking for tokenA and tokenB
    uint256 public reserveA;
    uint256 public reserveB;

    // Swap fee: 0.3% fee (using a fee factor of 997/1000)
    uint256 private constant FEE_NUMERATOR = 997;
    uint256 private constant FEE_DENOMINATOR = 1000;

    /// @notice Initialize the DEX with the addresses of TokenA and TokenB.
    /// @param _tokenA The address of TokenA.
    /// @param _tokenB The address of TokenB.
    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        // Deploy the LP token and store its instance.
        lpToken = new LPToken("DEX LP Token", "DLP");
    }

    /// @notice Deposit liquidity into the pool.
    /// @param amountA The amount of TokenA to deposit.
    /// @param amountB The amount of TokenB to deposit.
    /// Requirements:
    /// - If the pool already has liquidity, deposits must preserve the current ratio.
    function depositLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "DEX: Amounts must be greater than zero");

        // If liquidity already exists, enforce the deposit ratio equals the current pool ratio.
        if (reserveA > 0 || reserveB > 0) {
            require(reserveA / reserveB == amountA / amountB, "DEX: Deposit must preserve pool ratio");
        }

        // Transfer tokens from LP into this contract (user must approve beforehand)
        require(tokenA.transferFrom(msg.sender, address(this), amountA), "DEX: Transfer of TokenA failed");
        require(tokenB.transferFrom(msg.sender, address(this), amountB), "DEX: Transfer of TokenB failed");

        uint256 liquidity;
        uint256 totalSupply = lpToken.totalSupply();
        if (totalSupply == 0) {
            // For the first deposit, mint liquidity tokens based on the geometric mean.
            liquidity = sqrt(amountA * amountB);
        }
        else {
            // For subsequent deposits, mint LP tokens proportional to existing reserves.
            // Calculate liquidity tokens based on TokenA and TokenB deposits.
            uint256 liquidityA = (amountA * totalSupply) / reserveA;
            uint256 liquidityB = (amountB * totalSupply) / reserveB;
            // Here we expect both calculations to result in the same amount if the ratio is preserved.
            require(liquidityA == liquidityB, "DEX: Liquidity calculations mismatch");
            liquidity = liquidityA;
        }
        require(liquidity > 0, "DEX: Insufficient liquidity minted");

        // Mint LP tokens to the liquidity provider.
        lpToken.mint(msg.sender, liquidity);

        // Update the pool’s reserves.
        reserveA += amountA;
        reserveB += amountB;
    }

    /// @notice Withdraw liquidity from the pool.
    /// @param lpAmount The amount of LP tokens to redeem.
    function withdrawLiquidity(uint256 lpAmount) external {
        require(lpAmount > 0, "DEX: LP amount must be greater than zero");
        uint256 totalSupply = lpToken.totalSupply();
        require(totalSupply > 0, "DEX: No liquidity available");

        // Calculate amounts to return proportionally from the reserves.
        uint256 amountA = (lpAmount * reserveA) / totalSupply;
        uint256 amountB = (lpAmount * reserveB) / totalSupply;
        require(amountA > 0 && amountB > 0, "DEX: Withdraw amounts are zero");

        // Burn the LP tokens from the user.
        lpToken.burnFrom(msg.sender, lpAmount);

        // Update reserves.
        reserveA -= amountA;
        reserveB -= amountB;

        // Transfer tokens back to the user. Removed require 
        tokenA.transfer(msg.sender, amountA);
        tokenB.transfer(msg.sender, amountB);
    }

    /// @notice Swap an exact amount of TokenA for as many TokenB as possible.
    /// @param amountAIn The amount of TokenA the trader is swapping.
    function swapTokenAForTokenB(uint256 amountAIn) external {
        require(amountAIn > 0, "DEX: Input amount must be greater than zero");
        require(tokenA.transferFrom(msg.sender, address(this), amountAIn), "DEX: Transfer of TokenA failed");

        // Apply fee on input.
        uint256 amountInWithFee = (amountAIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
        // Calculate TokenB output using the constant product formula.
        // Formula: amountBOut = (amountInWithFee * reserveB) / (reserveA + amountInWithFee)
        uint256 numerator = amountInWithFee * reserveB;
        uint256 denominator = reserveA + amountInWithFee;
        uint256 amountBOut = numerator / denominator;
        require(amountBOut > 0, "DEX: Insufficient output amount");

        // Update reserves; note that the fee remains in the pool.
        reserveA += amountAIn;
        reserveB -= amountBOut;

        require(tokenB.transfer(msg.sender, amountBOut), "DEX: Transfer of TokenB failed");
    }

    /// @notice Swap an exact amount of TokenB for as many TokenA as possible.
    /// @param amountBIn The amount of TokenB the trader is swapping.
    function swapTokenBForTokenA(uint256 amountBIn) external {
        require(amountBIn > 0, "DEX: Input amount must be greater than zero");
        require(tokenB.transferFrom(msg.sender, address(this), amountBIn), "DEX: Transfer of TokenB failed");

        uint256 amountInWithFee = (amountBIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
        uint256 numerator = amountInWithFee * reserveA;
        uint256 denominator = reserveB + amountInWithFee;
        uint256 amountAOut = numerator / denominator;
        require(amountAOut > 0, "DEX: Insufficient output amount");

        reserveB += amountBIn;
        reserveA -= amountAOut;

        require(tokenA.transfer(msg.sender, amountAOut), "DEX: Transfer of TokenA failed");
    }

    /// @notice Returns the spot price of TokenA in terms of TokenB.
    /// @return The price scaled by 1e18.
    function getSpotPriceAinB() external view returns (uint256) {
        require(reserveA > 0, "DEX: No TokenA reserve");
        return (reserveB * 1e18) / reserveA;
    }

    /// @notice Returns the spot price of TokenB in terms of TokenA.
    /// @return The price scaled by 1e18.
    function getSpotPriceBinA() external view returns (uint256) {
        require(reserveB > 0, "DEX: No TokenB reserve");
        return (reserveA * 1e18) / reserveB;
    }

    /// @notice Returns the current reserves of TokenA and TokenB in the pool.
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }

    /// @dev Internal function: computes the square root of y using the Babylonian method.
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        }
        else if (y != 0) {
            z = 1;
        }
    }
}
