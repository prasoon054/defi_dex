// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol";
import "./LPToken.sol"; // Make sure this path is correct relative to your project structure.

contract DEX {
    IERC20 public tokenA;
    IERC20 public tokenB;
    LPToken public lpToken;

    // Internal pool reserves of tokenA and tokenB.
    uint256 public reserveA;
    uint256 public reserveB;

    // Constants for the swap fee (0.3% fee: 980/1000).
    uint256 public constant FEE_NUMERATOR = 980;
    uint256 public constant FEE_DENOMINATOR = 1000;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpTokensMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpTokensBurned);
    event Swap(address indexed trader, address inputToken, uint256 inputAmount, address outputToken, uint256 outputAmount);

    /**
     * @dev The constructor initializes the DEX with the two ERC-20 token addresses.
     * It also deploys a new LPToken contract and sets the DEX contract as its minter.
     */
    constructor(address _tokenA, address _tokenB) {
        require(_tokenA != address(0) && _tokenB != address(0), "DEX: Invalid token addresses");
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);

        // Deploy the LP token and update its minter to this DEX contract.
        lpToken = new LPToken();
        lpToken.setMinter(address(this));
    }

    /**
     * @notice Add liquidity to the pool.
     * @param amountA The amount of tokenA to deposit.
     * @param amountB The amount of tokenB to deposit.
     * @return lpTokensMinted The number of LP tokens minted for the provider.
     *
     * - The first liquidity provider sets the initial ratio.
     * - Subsequent deposits must preserve the ratio.
     * - The provider must approve this contract for token transfers beforehand.
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external returns (uint256 lpTokensMinted) {
        require(amountA > 0 && amountB > 0, "DEX: Amounts must be > 0");

        // Transfer tokens from the liquidity provider to the DEX.
        require(tokenA.transferFrom(msg.sender, address(this), amountA), "DEX: Transfer tokenA failed");
        require(tokenB.transferFrom(msg.sender, address(this), amountB), "DEX: Transfer tokenB failed");

        if (lpToken.totalSupply() == 0) {
            // First liquidity provider: set the initial ratio and mint LP tokens based on sqrt(amountA * amountB)
            lpTokensMinted = sqrt(amountA * amountB);
            require(lpTokensMinted > 0, "DEX: Insufficient liquidity provided");
        } else {
            // Subsequent deposits must be proportional to the current reserves.
            uint256 expectedAmountB = (amountA * reserveB) / reserveA;
            require(amountB == expectedAmountB, "DEX: Deposit amounts must preserve pool ratio");

            lpTokensMinted = (lpToken.totalSupply() * amountA) / reserveA;
        }

        // Update the internal reserves.
        reserveA += amountA;
        reserveB += amountB;

        // Mint LP tokens to the liquidity provider.
        lpToken.mint(msg.sender, lpTokensMinted);
        emit LiquidityAdded(msg.sender, amountA, amountB, lpTokensMinted);
    }

    /**
     * @notice Remove liquidity from the pool by burning LP tokens.
     * @param lpTokenAmount The number of LP tokens to burn.
     * @return amountA The amount of tokenA withdrawn.
     * @return amountB The amount of tokenB withdrawn.
     */
    function removeLiquidity(uint256 lpTokenAmount) external returns (uint256 amountA, uint256 amountB) {
        require(lpTokenAmount > 0, "DEX: Amount must be > 0");
        require(lpToken.balanceOf(msg.sender) >= lpTokenAmount, "DEX: Insufficient LP tokens");

        uint256 totalLP = lpToken.totalSupply();

        // Calculate the withdrawal amounts based on the share of the pool.
        amountA = (reserveA * lpTokenAmount) / totalLP;
        amountB = (reserveB * lpTokenAmount) / totalLP;
        require(amountA > 0 && amountB > 0, "DEX: Withdrawal amount too low");

        // Update reserves before transfers.
        reserveA -= amountA;
        reserveB -= amountB;

        // Burn the LP tokens.
        lpToken.burn(msg.sender, lpTokenAmount);

        // Transfer tokenA and tokenB to the provider.
        require(tokenA.transfer(msg.sender, amountA), "DEX: Transfer tokenA failed");
        require(tokenB.transfer(msg.sender, amountB), "DEX: Transfer tokenB failed");

        emit LiquidityRemoved(msg.sender, amountA, amountB, lpTokenAmount);
    }

    /**
     * @notice Swap tokenA for tokenB.
     * @param amountAIn The amount of tokenA to swap.
     * @return amountBOut The amount of tokenB received.
     */
    function swapAForB(uint256 amountAIn) external returns (uint256 amountBOut) {
        require(amountAIn > 0, "DEX: Amount must be > 0");

        // Transfer tokenA from the trader to the DEX.
        require(tokenA.transferFrom(msg.sender, address(this), amountAIn), "DEX: Transfer tokenA failed");

        // Apply swap fee.
        uint256 amountInWithFee = amountAIn * FEE_NUMERATOR;
        // Calculate output amount with constant product formula: 
        // amountBOut = (amountInWithFee * reserveB) / (reserveA * FEE_DENOMINATOR + amountInWithFee)
        amountBOut = (amountInWithFee * reserveB) / (reserveA * FEE_DENOMINATOR + amountInWithFee);
        require(amountBOut > 0, "DEX: Output amount zero");

        // Update reserves.
        reserveA += amountAIn;
        reserveB -= amountBOut;

        // Transfer tokenB to the trader.
        require(tokenB.transfer(msg.sender, amountBOut), "DEX: Transfer tokenB failed");

        emit Swap(msg.sender, address(tokenA), amountAIn, address(tokenB), amountBOut);
    }

    /**
     * @notice Swap tokenB for tokenA.
     * @param amountBIn The amount of tokenB to swap.
     * @return amountAOut The amount of tokenA received.
     */
    function swapBForA(uint256 amountBIn) external returns (uint256 amountAOut) {
        require(amountBIn > 0, "DEX: Amount must be > 0");

        require(tokenB.transferFrom(msg.sender, address(this), amountBIn), "DEX: Transfer tokenB failed");

        uint256 amountInWithFee = amountBIn * FEE_NUMERATOR;
        amountAOut = (amountInWithFee * reserveA) / (reserveB * FEE_DENOMINATOR + amountInWithFee);
        require(amountAOut > 0, "DEX: Output amount zero");

        reserveB += amountBIn;
        reserveA -= amountAOut;

        require(tokenA.transfer(msg.sender, amountAOut), "DEX: Transfer tokenA failed");

        emit Swap(msg.sender, address(tokenB), amountBIn, address(tokenA), amountAOut);
    }

    /**
     * @notice Returns the current pool reserves of tokenA and tokenB.
     */
    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }

    /**
     * @notice Returns the spot price of tokenA in terms of tokenB.
     * @dev Computed as (reserveB/reserveA) with a precision multiplier.
     */
    function getSpotPriceAtoB() external view returns (uint256 price) {
        require(reserveA > 0, "DEX: No liquidity");
        price = (reserveB * 1e18) / reserveA;
    }

    /**
     * @notice Returns the spot price of tokenB in terms of tokenA.
     */
    function getSpotPriceBtoA() external view returns (uint256 price) {
        require(reserveB > 0, "DEX: No liquidity");
        price = (reserveA * 1e18) / reserveB;
    }

    /**
     * @dev Internal function to compute square roots using the Babylonian method.
     */
    function sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
