async function simulateDEX() {
  try {
    console.log("Starting DEX simulation...");

    // 1. Load contract artifacts for DEX, TokenA, and TokenB.
    const dexArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/contracts/artifacts/DEX.json'));
    const tokenAArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/contracts/artifacts/TokenA.json'));
    const tokenBArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/contracts/artifacts/TokenB.json'));

    if (!dexArtifact || !tokenAArtifact || !tokenBArtifact) {
      throw new Error("Could not load one or more contract artifacts. Please compile your contracts first.");
    }
    const dexABI = dexArtifact.abi;
    const tokenAABI = tokenAArtifact.abi;
    const tokenBABI = tokenBArtifact.abi;

    // 2. Define deployed contract addresses.
    const dexAddress = "0x9bF88fAe8CF8BaB76041c1db6467E7b37b977dD7";       // DEX.sol deployed address
    const tokenAAddress = "0x3D42AD7A3AEFDf99038Cd61053913CFCA4944b95";   // TokenA deployed address
    const tokenBAddress = "0x417Bf7C9dc415FEEb693B6FE313d1186C692600F";   // TokenB deployed address
    const tokenADeployer = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";    // Account which deployed tokenA
    const tokenBDeployer = "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2";    // Account which deployed tokenB

    // 3. Create contract instances.
    const dexInstance = new web3.eth.Contract(dexABI, dexAddress);
    const tokenA = new web3.eth.Contract(tokenAABI, tokenAAddress);
    const tokenB = new web3.eth.Contract(tokenBABI, tokenBAddress);

    // 4. Get list of accounts.
    // Since tokens were minted only to the deployer, we use accounts[0] for every action.
    const accounts = await web3.eth.getAccounts();
    // const user = accounts[0];
    // console.log(accounts);
    for(let i=0; i<accounts.length; i++){
        let balA = await tokenA.methods.balanceOf(accounts[i]).call();
        if(balA > 0) continue;
        await tokenA.methods.transfer(accounts[i], 1e18.toString()).send( {from: tokenADeployer} );
    }
    for(let i=0; i<accounts.length; i++){
        let balB = await tokenB.methods.balanceOf(accounts[i]).call();
        if(balB > 0) continue;
        await tokenB.methods.transfer(accounts[i], 1e18.toString()).send( {from: tokenBDeployer} );
    }
    // for(let i=0; i<accounts.length; i++){
    //     let res = await tokenA.methods.balanceOf(accounts[i]).call();
    //     console.log(`Balance of Token A for ${accounts[i]} is: ${res}`);
    // }
    // for(let i=0; i<accounts.length; i++){
    //     let res = await tokenB.methods.balanceOf(accounts[i]).call();
    //     console.log(`Balance of Token B for ${accounts[i]} is: ${res}`);
    // }
    // try{
    //     let res = await tokenA.methods.balanceOf(tokenADeployer).call();
    //     console.log(`Balance of Token A for deployer is : ${res}`);
    // }
    // catch(e){
    //     console.log(`There was some error fetching balance: ${e}`);
    // }
    // try{
    //     let res = await tokenB.methods.balanceOf(tokenBDeployer).call();
    //     console.log(`Balance of Token B for deployer is : ${res}`);
    // }
    // catch(e){
    //     console.log(`There was some error fetching balance: ${e}`);
    // }
    const N = Math.floor(Math.random() * 50) + 50; // Number of transactions to simulate
    // const N = 0;

    // 5. Start simulation loop.
    for (let i = 0; i < N; i++) {
      console.log(`\n--- Transaction ${i + 1} ---`);
      // Randomly choose an action type: 0 = deposit, 1 = withdraw, 2 = swap
      let user = accounts[Math.floor(Math.random() * accounts.length)];
      console.log(`Using ${user} account for this action.`);
      const actionType = Math.floor(Math.random() * 3);

      if (actionType === 0) {
        // Deposit liquidity.
        console.log("Action Type: Deposit liquidity");

        // Retrieve current pool reserves.
        const reserves = await dexInstance.methods.getReserves().call();
        const reserveA = parseInt(reserves._reserveA);
        const reserveB = parseInt(reserves._reserveB);
        let depositA, depositB;

        if (reserveA === 0 && reserveB === 0) {
          // For the first deposit, choose arbitrary amounts.
          depositA = Math.floor(Math.random() * 101) + 50;
          depositB = Math.floor(Math.random() * 101) + 50;
        } else {
          // For subsequent deposits, preserve the ratio exactly:
          // depositA / depositB must equal reserveA / reserveB.
          // Try candidate depositA values until one yields an integer depositB.
          let foundCandidate = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            let candidate = Math.floor(Math.random() * 20) + 1;
            if ((candidate * reserveB) % reserveA === 0) {
              depositA = candidate;
              depositB = (candidate * reserveB) / reserveA;
              foundCandidate = true;
              break;
            }
          }
          if (!foundCandidate) {
            depositA = 1;
            depositB = (1 * reserveB) % reserveA === 0 ? (1 * reserveB) / reserveA : 1;
          }
        }

        // Approve token transfers and deposit.
        try {
          await tokenA.methods.approve(dexAddress, depositA.toString()).send({ from: user });
          await tokenB.methods.approve(dexAddress, depositB.toString()).send({ from: user });
          await dexInstance.methods.depositLiquidity(depositA.toString(), depositB.toString()).send({ from: user });
          console.log(`Deposit: ${user} deposited ${depositA} TokenA and ${depositB} TokenB.`);
        } catch (e) {
          console.log(`Deposit failed: ${e.message}`);
        }
      } else if (actionType === 1) {
        // Withdraw liquidity.
        console.log("Action Type: Withdraw liquidity");

        // Get LP token address from DEX.
        const lpTokenAddress = await dexInstance.methods.lpToken().call();
        // Minimal ABI for balanceOf.
        const lpTokenABI = [
          {
            constant: true,
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            type: "function"
          }
        ];
        const lpToken = new web3.eth.Contract(lpTokenABI, lpTokenAddress);
        let lpBalance = parseInt(await lpToken.methods.balanceOf(user).call());
        if (lpBalance > 0) {
          const withdrawAmount = Math.floor(Math.random() * lpBalance) + 1;
          try {
            await dexInstance.methods.withdrawLiquidity(withdrawAmount.toString()).send({ from: user });
            console.log(`Withdraw: ${user} withdrew ${withdrawAmount} LP tokens.`);
          } catch (e) {
            console.log(`Withdrawal failed: ${e.message}`);
          }
        } else {
          console.log("Withdrawal skipped: LP token balance is zero.");
        }
      } else {
        // Swap transaction.
        console.log("Action Type: Swap txn");

        // Verify the pool has liquidity.
        const reserves = await dexInstance.methods.getReserves().call();
        const reserveA = parseInt(reserves._reserveA);
        const reserveB = parseInt(reserves._reserveB);
        if (reserveA === 0 || reserveB === 0) {
          console.log("Swap skipped: Pool has no liquidity.");
          continue;
        }
        // Randomly choose swap direction: 0 = TokenA -> TokenB, 1 = TokenB -> TokenA.
        const swapType = Math.floor(Math.random() * 2);
        if (swapType === 0) {
          // Swap TokenA for TokenB.
          let balanceA = parseInt(await tokenA.methods.balanceOf(user).call());
          const maxSwap = Math.min(balanceA, Math.floor(reserveA * 0.1));
          if (maxSwap <= 0) {
            console.log("Swap (TokenA -> TokenB) skipped: insufficient balance or pool reserve.");
            continue;
          }
          const swapAmount = Math.floor(Math.random() * maxSwap) + 1;
          try {
            await tokenA.methods.approve(dexAddress, swapAmount.toString()).send({ from: user });
            await dexInstance.methods.swapTokenAForTokenB(swapAmount.toString()).send({ from: user });
            console.log(`Swap: ${user} swapped ${swapAmount} TokenA for TokenB.`);
          } catch (e) {
            console.log(`Swap (TokenA -> TokenB) failed: ${e.message}`);
          }
        } else {
          // Swap TokenB for TokenA.
          let balanceB = parseInt(await tokenB.methods.balanceOf(user).call());
          const maxSwap = Math.min(balanceB, Math.floor(reserveB * 0.1));
          if (maxSwap <= 0) {
            console.log("Swap (TokenB -> TokenA) skipped: insufficient balance or pool reserve.");
            continue;
          }
          const swapAmount = Math.floor(Math.random() * maxSwap) + 1;
          try {
            await tokenB.methods.approve(dexAddress, swapAmount.toString()).send({ from: user });
            await dexInstance.methods.swapTokenBForTokenA(swapAmount.toString()).send({ from: user });
            console.log(`Swap: ${user} swapped ${swapAmount} TokenB for TokenA.`);
          } catch (e) {
            console.log(`Swap (TokenB -> TokenA) failed: ${e.message}`);
          }
        }
      }

      // 7. After each transaction, print current pool metrics.
      try {
        const reserves = await dexInstance.methods.getReserves().call();
        const spotPrice = await dexInstance.methods.getSpotPriceAinB().call();
        console.log(`Current Pool Reserves: TokenA = ${reserves._reserveA}, TokenB = ${reserves._reserveB}`);
        console.log(`Spot Price (TokenA in terms of TokenB, scaled by 1e18): ${spotPrice}`);
      } catch (e) {
        console.log(`Error fetching pool metrics: ${e.message}`);
      }
    }

    console.log("\nDEX simulation complete.");
  } catch (error) {
    console.error("Error in simulation:", error);
  }
}

// Run the simulation
simulateDEX();
