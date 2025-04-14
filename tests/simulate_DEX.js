async function simulateDEX() {
  try {
    console.log("Starting DEX simulation...");

    // Load contract artifacts for DEX, TokenA, and TokenB.
    const dexArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/contracts/artifacts/DEX.json'));
    const tokenAArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/contracts/artifacts/TokenA.json'));
    const tokenBArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'browser/contracts/artifacts/TokenB.json'));

    if (!dexArtifact || !tokenAArtifact || !tokenBArtifact) {
      throw new Error("Could not load one or more contract artifacts. Please compile your contracts first.");
    }
    const dexABI = dexArtifact.abi;
    const tokenAABI = tokenAArtifact.abi;
    const tokenBABI = tokenBArtifact.abi;

    // Define deployed contract addresses.
    const dexAddress = "0xf8e81D47203A594245E36C48e151709F0C19fBe8";       // DEX.sol deployed address
    const tokenAAddress = "0xd9145CCE52D386f254917e481eB44e9943F39138";   // TokenA deployed address
    const tokenBAddress = "0xd8b934580fcE35a11B58C6D73aDeE468a2833fa8";   // TokenB deployed address
    const tokenDeployer = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";    // Token deployer account

    // Create contract instances.
    const dexInstance = new web3.eth.Contract(dexABI, dexAddress);
    const tokenA = new web3.eth.Contract(tokenAABI, tokenAAddress);
    const tokenB = new web3.eth.Contract(tokenBABI, tokenBAddress);

    // Get list of accounts.
    // Since tokens were minted only to the deployer, we use accounts[0] for every action.
    const accounts = await web3.eth.getAccounts();
    const lpUsers = accounts.slice(0, 5);
    const traderUsers = accounts.slice(5, 13);
    // const user = accounts[0];
    // console.log(accounts);
    for (let user of accounts) {
      if(user === tokenDeployer) continue;
      await tokenA.methods.transfer(user, 1e18.toString()).send( {from: tokenDeployer } );
      await tokenB.methods.transfer(user, 1e18.toString()).send( {from: tokenDeployer } );
    }
    const N = 100; // Number of transactions to simulate
    const metrics = [];
    let cumulativeVolumeA = 0;
    let cumulativeVolumeB = 0;
    let cumulativeFees = 0;
    // Start simulation loop.
    for (let i = 0; i < N; i++) {
      console.log(`\n--- Transaction ${i + 1} ---`);
      const timestamp = i+1;
      const user = (Math.random() < 0.33 ? traderUsers[Math.floor(Math.random() * traderUsers.length)] : lpUsers[Math.floor(Math.random() * lpUsers.length)]);
      // Randomly choose an action type: 0 = deposit, 1 = withdraw, 2 = swap
      console.log(`Using ${user} account for this action.`);
      // Trader can only swap tokens
      const actionType = traderUsers.includes(user)?2:Math.floor(Math.random() * 3);
      // Retrieve current pool reserves.
      const reserves = await dexInstance.methods.getReserves().call();
      const reserveA = parseInt(reserves._reserveA);
      const reserveB = parseInt(reserves._reserveB);
      let spotPrice = 0;
      let slippage = 0;
      try {
        spotPrice = parseInt(await dexInstance.methods.getSpotPriceAinB().call()) / 1e18;
      }
      catch(e) {
        spotPrice = 0;
      }
      if (actionType === 0 && lpUsers.includes(user)) {
        // Deposit liquidity.
        console.log("Action Type: Deposit liquidity");

        let depositA, depositB;

        if (reserveA === 0 && reserveB === 0) {
          // For the first deposit, choose arbitrary amounts.
          depositA = Math.floor(Math.random() * 101) + 50;
          depositB = Math.floor(Math.random() * 101) + 50;
        }
        else {
          // Maintain reserve ratio exactly.
          const useDivision = Math.random() < 0.6; // 60% chance to divide
          let divided = false;
          if (useDivision) {
            // Pick a random divisor (2 to 10)
            const primeBelow20 = [2, 3, 5, 7, 11, 13, 17, 19];
            for (let i = 0; i < primeBelow20.length; i++) {
              let divisor = primeBelow20[i];
              // Only divide if both reserves are divisible
              if (reserveA % divisor === 0 && reserveB % divisor === 0) {
                depositA = reserveA / divisor;
                depositB = reserveB / divisor;
                divided = true;
                break;
              }
            }
            if (!divided) {
              // Fallback to safe multiplication
              const scale = Math.floor(Math.random() * 5) + 1;
              depositA = reserveA * scale;
              depositB = reserveB * scale;
            }
          }
          else {
            // Use multiplication with small scale to avoid overflow
            const scale = Math.floor(Math.random() * 5) + 1;
            depositA = reserveA * scale;
            depositB = reserveB * scale;
          }
        }

        // Approve token transfers and deposit.
        try {
          await tokenA.methods.approve(dexAddress, depositA).send({ from: user });
          await tokenB.methods.approve(dexAddress, depositB).send({ from: user });
          await dexInstance.methods.depositLiquidity(depositA, depositB).send({ from: user });
          console.log(`Deposit: ${user} deposited ${depositA} TokenA and ${depositB} TokenB.`);
        }
        catch (e) {
          console.log(`Deposit failed: ${e.message}`);
        }
      }
      else if (actionType === 1 && lpUsers.includes(user)) {
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
          },
          {
            constant: false,
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" }
            ],
            name: "approve",
            outputs: [{ name: "", type: "bool" }],
            type: "function"
          }
        ];
        const lpToken = new web3.eth.Contract(lpTokenABI, lpTokenAddress);
        let lpBalance = parseInt(await lpToken.methods.balanceOf(user).call());
        if (lpBalance > 0) {
          const withdrawAmount = Math.floor(Math.random() * lpBalance) + 1;
          try {
            await lpToken.methods.approve(dexAddress, withdrawAmount).send( { from: user } );
            await dexInstance.methods.withdrawLiquidity(withdrawAmount).send({ from: user });
            console.log(`Withdraw: ${user} withdrew ${withdrawAmount} LP tokens.`);
          }
          catch (e) {
            console.log(`Withdrawal failed: ${e.message}`);
          }
        }
        else {
          console.log("Withdrawal skipped: LP token balance is zero.");
        }
        // console.log("--LPToken balances--");
        // for(let i=0; i<lpUsers.length; i++){
        //   let balanceLP = parseInt(await lpToken.methods.balanceOf(lpUsers[i]).call());
        //   console.log(`${lpUsers[i]} has LPToken balance of ${balanceLP}`);
        // }
      }
      else if (actionType === 2) {
        // Swap transaction.
        console.log("Action Type: Swap txn");
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
          const expectedPrice = parseInt(await dexInstance.methods.getSpotPriceAinB().call());
          const beforeB = parseInt(await tokenB.methods.balanceOf(user).call());
          console.log(`Before B: ${beforeB}`);
          try {
            await tokenA.methods.approve(dexAddress, swapAmount).send({ from: user });
            await dexInstance.methods.swapTokenAForTokenB(swapAmount).send({ from: user });
            console.log(`Swap: ${user} swapped ${swapAmount} TokenA for TokenB.`);
          }
          catch (e) {
            console.log(`Swap (TokenA -> TokenB) failed: ${e.message}`);
          }
          const afterB = parseInt(await tokenB.methods.balanceOf(user).call());
          console.log(`After B: ${afterB}`);
          const received = afterB - beforeB;
          console.log(received);
          console.log(expectedPrice);
          const actualPrice = (received * 1e18) / swapAmount;
          slippage = ((actualPrice - expectedPrice) / expectedPrice) * 1e-16;
          cumulativeVolumeA += swapAmount;
          cumulativeFees += swapAmount * 0.003;
        }
        else {
          // Swap TokenB for TokenA.
          let balanceB = parseInt(await tokenB.methods.balanceOf(user).call());
          const maxSwap = Math.min(balanceB, Math.floor(reserveB * 0.1));
          if (maxSwap <= 0) {
            console.log("Swap (TokenB -> TokenA) skipped: insufficient balance or pool reserve.");
            continue;
          }
          const swapAmount = Math.floor(Math.random() * maxSwap) + 1;
          const expectedPrice = parseInt(await dexInstance.methods.getSpotPriceBinA().call());
          const beforeA = parseInt(await tokenA.methods.balanceOf(user).call());
          console.log(`Before A: ${beforeA}`);
          try {
            await tokenB.methods.approve(dexAddress, swapAmount).send({ from: user });
            await dexInstance.methods.swapTokenBForTokenA(swapAmount).send({ from: user });
            console.log(`Swap: ${user} swapped ${swapAmount} TokenB for TokenA.`);
          }
          catch (e) {
            console.log(`Swap (TokenB -> TokenA) failed: ${e.message}`);
          }
          const afterA = parseInt(await tokenA.methods.balanceOf(user).call());
          console.log(`After A: ${afterA}`);
          const received = afterA - beforeA;
          console.log(received);
          console.log(expectedPrice);
          const actualPrice = (received * 1e18) / swapAmount;
          slippage = ((actualPrice - expectedPrice) / expectedPrice) * 100;
          cumulativeVolumeB += swapAmount;
          cumulativeFees += swapAmount * 0.003;
        }
      }

      // After each transaction, print current pool metrics.
      try {
        const reserves = await dexInstance.methods.getReserves().call();
        const spotPrice = await dexInstance.methods.getSpotPriceAinB().call();
        const TVL = parseInt(reserves._reserveA) + parseInt(reserves._reserveB);
        const lpTokenAddress = await dexInstance.methods.lpToken().call();
        const lpTokenABI = [
          {
            constant: true,
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            type: "function"
          },
          {
            constant: false,
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" }
            ],
            name: "approve",
            outputs: [{ name: "", type: "bool" }],
            type: "function"
          }
        ];
        const lpToken = new web3.eth.Contract(lpTokenABI, lpTokenAddress);
        const lpHoldings = {};
        for (let lp of lpUsers) {
          // let lpBalance = parseInt(await lpToken.methods.balanceOf(user).call());
          lpHoldings[lp] = parseInt(await lpToken.methods.balanceOf(lp).call());
        }
        metrics.push({
          timestamp,
          TVL, // Total value locked
          spotPrice, // Same as reserve ratio
          slippage, // Slippage
          lpHoldings, // LP Token Distribution
          cumulativeVolumeA, // Swap volume of token A
          cumulativeVolumeB, // Swap volume of token B
          cumulativeFees // Fee accumulation
        });
        console.log(`Current Pool Reserves: TokenA = ${reserves._reserveA}, TokenB = ${reserves._reserveB}`);
        console.log(`Spot Price (TokenA in terms of TokenB, scaled by 1e18): ${spotPrice}`);
      }
      catch (e) {
        console.log(`Error fetching pool metrics: ${e.message}`);
      }
    }
    console.log("\nDEX simulation complete.");
    console.log(metrics);
  }
  catch (error) {
    console.error("Error in simulation:", error);
  }
}

// Run the simulation
simulateDEX();
