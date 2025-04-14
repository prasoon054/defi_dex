// // simulate_arbitrage.js

// // Helper function to ensure that the artifact's bytecode is a proper string starting with "0x"
// function getBytecode(artifact) {
//   let bytecode;
//   if (artifact.data && artifact.data.bytecode && artifact.data.bytecode.object) {
//     bytecode = artifact.data.bytecode.object;
//   } else if (artifact.data && typeof artifact.data === "string") {
//     bytecode = artifact.data;
//   } else {
//     throw new Error("Cannot find deployable bytecode in the artifact.");
//   }
//   // Convert to string if necessary
//   if (typeof bytecode !== "string") {
//     bytecode = bytecode.toString();
//   }
//   // Ensure the bytecode is hex encoded
//   if (!bytecode.startsWith("0x")) {
//     bytecode = "0x" + bytecode;
//   }
//   return bytecode;
// }

// async function simulateArbitrage() {
//   try {
//     console.log("Starting arbitrage simulation with deployment of all contracts...");

//     // -------------------------------------------------------------------------
//     // Step 1: Load contract artifacts
//     // -------------------------------------------------------------------------
//     const dexArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/DEX.json'));
//     const tokenArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/TokenA.json'));
//     // TokenA and TokenB use the same source file (Token.sol) but are deployed separately.
//     const tokenBArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/TokenB.json'));
//     const arbitrageArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/Arbitrage.json'));
    
//     if (!dexArtifact || !tokenArtifact || !tokenBArtifact || !arbitrageArtifact) {
//       throw new Error("One or more contract artifacts could not be loaded. Please compile your contracts first.");
//     }
    
//     // -------------------------------------------------------------------------
//     // Step 2: Get accounts for deployment and actions.
//     // -------------------------------------------------------------------------
//     // Accounts:
//     // - deployer: account[0] (deploys tokens, DEX contracts, arbitrage)
//     // - LP1: account[1] (adds liquidity to DEX1)
//     // - LP2: account[2] (adds liquidity to DEX2)
//     // - arbitrageur: account[3] (executes arbitrage trades)
//     const accounts = await web3.eth.getAccounts();
//     if (accounts.length < 4) {
//       throw new Error("Need at least 4 accounts: deployer, two LPs, and arbitrageur.");
//     }
//     const deployer = accounts[0];
//     const lp1 = accounts[1];
//     const lp2 = accounts[2];
//     const arbitrageur = accounts[3];

//     // -------------------------------------------------------------------------
//     // Step 3: Deploy TokenA and TokenB contracts.
//     // -------------------------------------------------------------------------
//     // Use a sufficiently large initial supply (in wei)
//     const initialSupply = web3.utils.toWei("1000000", "ether"); // 1,000,000 tokens
    
//     console.log("Deploying TokenA...");
//     const tokenAContract = new web3.eth.Contract(tokenArtifact.abi);
//     const tokenAInstance = await tokenAContract.deploy({
//       data: getBytecode(tokenArtifact),
//       arguments: [initialSupply]
//     }).send({ from: deployer, gas: 3000000 });
//     console.log("TokenA deployed at:", tokenAInstance.options.address);

//     console.log("Deploying TokenB...");
//     const tokenBContract = new web3.eth.Contract(tokenBArtifact.abi);
//     const tokenBInstance = await tokenBContract.deploy({
//       data: getBytecode(tokenBArtifact),
//       arguments: [initialSupply]
//     }).send({ from: deployer, gas: 3000000 });
//     console.log("TokenB deployed at:", tokenBInstance.options.address);

//     // -------------------------------------------------------------------------
//     // Step 4: Deploy two DEX contracts (DEX1 and DEX2) using the Token addresses.
//     // -------------------------------------------------------------------------
//     console.log("Deploying DEX1...");
//     const dexContract = new web3.eth.Contract(dexArtifact.abi);
//     const dex1Instance = await dexContract.deploy({
//       data: getBytecode(dexArtifact),
//       arguments: [tokenAInstance.options.address, tokenBInstance.options.address]
//     }).send({ from: deployer, gas: 4000000 });
//     console.log("DEX1 deployed at:", dex1Instance.options.address);

//     console.log("Deploying DEX2...");
//     const dex2Instance = await dexContract.deploy({
//       data: getBytecode(dexArtifact),
//       arguments: [tokenAInstance.options.address, tokenBInstance.options.address]
//     }).send({ from: deployer, gas: 4000000 });
//     console.log("DEX2 deployed at:", dex2Instance.options.address);

//     // -------------------------------------------------------------------------
//     // Step 5: Deploy the Arbitrage contract.
//     // -------------------------------------------------------------------------
//     console.log("Deploying Arbitrage contract...");
//     const arbitrageContract = new web3.eth.Contract(arbitrageArtifact.abi);
//     const arbitrageInstance = await arbitrageContract.deploy({
//       data: getBytecode(arbitrageArtifact),
//       arguments: [
//         dex1Instance.options.address,
//         dex2Instance.options.address,
//         tokenAInstance.options.address,
//         tokenBInstance.options.address
//       ]
//     }).send({ from: deployer, gas: 4000000 });
//     console.log("Arbitrage deployed at:", arbitrageInstance.options.address);

//     // -------------------------------------------------------------------------
//     // Step 6: Distribute tokens to LP and arbitrageur accounts.
//     // -------------------------------------------------------------------------
//     const amountToTransfer = web3.utils.toWei("1000", "ether");
//     await tokenAInstance.methods.transfer(lp1, amountToTransfer).send({ from: deployer });
//     await tokenBInstance.methods.transfer(lp1, amountToTransfer).send({ from: deployer });
//     await tokenAInstance.methods.transfer(lp2, amountToTransfer).send({ from: deployer });
//     await tokenBInstance.methods.transfer(lp2, amountToTransfer).send({ from: deployer });
//     await tokenAInstance.methods.transfer(arbitrageur, amountToTransfer).send({ from: deployer });
//     await tokenBInstance.methods.transfer(arbitrageur, amountToTransfer).send({ from: deployer });
//     console.log("Tokens distributed to LPs and arbitrageur.");

//     // -------------------------------------------------------------------------
//     // Step 7: Setup liquidity to create a price imbalance.
//     // -------------------------------------------------------------------------
//     // For DEX1 (LP1): Deposit with a 1:2 ratio (100 TokenA, 200 TokenB)
//     // For DEX2 (LP2): Deposit with a 1:1 ratio (100 TokenA, 100 TokenB)
//     const depositDex1_A = "100";
//     const depositDex1_B = "200";
//     const depositDex2_A = "100";
//     const depositDex2_B = "100";

//     // Approve token transfers and deposit liquidity into DEX1.
//     await tokenAInstance.methods.approve(dex1Instance.options.address, depositDex1_A).send({ from: lp1 });
//     await tokenBInstance.methods.approve(dex1Instance.options.address, depositDex1_B).send({ from: lp1 });
//     await dex1Instance.methods.depositLiquidity(depositDex1_A, depositDex1_B).send({ from: lp1, gas: 3000000 });
//     console.log(`LP1 (${lp1}) deposited ${depositDex1_A} TokenA and ${depositDex1_B} TokenB into DEX1.`);

//     // Approve token transfers and deposit liquidity into DEX2.
//     await tokenAInstance.methods.approve(dex2Instance.options.address, depositDex2_A).send({ from: lp2 });
//     await tokenBInstance.methods.approve(dex2Instance.options.address, depositDex2_B).send({ from: lp2 });
//     await dex2Instance.methods.depositLiquidity(depositDex2_A, depositDex2_B).send({ from: lp2, gas: 3000000 });
//     console.log(`LP2 (${lp2}) deposited ${depositDex2_A} TokenA and ${depositDex2_B} TokenB into DEX2.`);

//     // With this setup:
//     // - DEX1's spot price (TokenA in terms of TokenB) = (200/100)*1e18 = 2e18.
//     // - DEX2's spot price = (100/100)*1e18 = 1e18.
//     // This price difference creates a profitable arbitrage opportunity.

//     // -------------------------------------------------------------------------
//     // Step 8: Execute a profitable arbitrage scenario.
//     // -------------------------------------------------------------------------
//     // For arbitrageAtoBtoA, expectedFinalA = amountAIn * (priceAinB_dex1 * priceBinA_dex2) / 1e36.
//     // With the numbers above, in an ideal scenario, the output would be about double the TokenA input.
//     const amountAIn_profitable = "10"; // Starting with 10 TokenA.
//     const minProfit_profitable = "1";    // Expecting at least 5 TokenA profit.
    
//     console.log("\n--- Executing profitable arbitrage (TokenA -> TokenB -> TokenA) ---");
//     try {
//       const tx1 = await arbitrageInstance.methods.arbitrageAtoBtoA(amountAIn_profitable, minProfit_profitable)
//         .send({ from: arbitrageur, gas: 3000000 });
      
//       // Capture the event (if emitted)
//       const event = tx1.events && tx1.events.ArbitrageExecutedAtoBtoA;
//       if (event && event.returnValues) {
//         console.log("Profitable arbitrage executed!");
//         console.log("Capital used (TokenA):", event.returnValues.capital);
//         console.log("Profit earned (TokenA):", event.returnValues.profit);
//       } else {
//         console.log("Profitable arbitrage executed; please verify contract balances for profit.");
//       }
//     } catch (error) {
//       console.error("Error during profitable arbitrage:", error.message);
//     }

//     // -------------------------------------------------------------------------
//     // Step 9: Execute an arbitrage that fails due to an excessive minimum profit.
//     // -------------------------------------------------------------------------
//     const amountAIn_failed = "10";
//     const minProfit_failed = "11"; // Too high – expecting at least 11 TokenA profit.

//     console.log("\n--- Executing failing arbitrage (insufficient profit) ---");
//     try {
//       await arbitrageInstance.methods.arbitrageAtoBtoA(amountAIn_failed, minProfit_failed)
//         .send({ from: arbitrageur, gas: 3000000 });
//       console.error("Error: The arbitrage executed when it was expected to fail due to insufficient profit.");
//     } catch (error) {
//       console.log("Expected failure: Arbitrage did not execute due to insufficient profit.");
//       console.log("Error message:", error.message);
//     }

//     console.log("\nArbitrage simulation complete.");

//   } catch (err) {
//     console.error("Error in simulation:", err.message);
//   }
// }

// // Run the simulation.
// simulateArbitrage();



// simulate_arbitrage.js

// Helper function to ensure that the artifact's bytecode is a proper string starting with "0x"
function getBytecode(artifact) {
    let bytecode;
    if (artifact.data && artifact.data.bytecode && artifact.data.bytecode.object) {
      bytecode = artifact.data.bytecode.object;
    } else if (artifact.data && typeof artifact.data === "string") {
      bytecode = artifact.data;
    } else {
      throw new Error("Cannot find deployable bytecode in the artifact.");
    }
    // Convert to string if necessary
    if (typeof bytecode !== "string") {
      bytecode = bytecode.toString();
    }
    // Ensure the bytecode is hex encoded
    if (!bytecode.startsWith("0x")) {
      bytecode = "0x" + bytecode;
    }
    return bytecode;
  }
  
  async function simulateArbitrage() {
    try {
      console.log("Starting arbitrage simulation with deployment of all contracts...");
  
      // -------------------------------------------------------------------------
      // Step 1: Load contract artifacts
      // -------------------------------------------------------------------------
      const dexArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/DEX.json'));
      const tokenArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/TokenA.json'));
      // TokenA and TokenB use the same source file (Token.sol) but are deployed separately.
      const tokenBArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/TokenB.json'));
      const arbitrageArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'DEFI_DEX/artifacts/Arbitrage.json'));
      
      if (!dexArtifact || !tokenArtifact || !tokenBArtifact || !arbitrageArtifact) {
        throw new Error("One or more contract artifacts could not be loaded. Please compile your contracts first.");
      }
      
      // -------------------------------------------------------------------------
      // Step 2: Get accounts for deployment and actions.
      // -------------------------------------------------------------------------
      // Accounts:
      // - deployer: account[0] (deploys tokens, DEX contracts, arbitrage)
      // - LP1: account[1] (adds liquidity to DEX1)
      // - LP2: account[2] (adds liquidity to DEX2)
      // - arbitrageur: account[3] (executes arbitrage trades)
      const accounts = await web3.eth.getAccounts();
      if (accounts.length < 4) {
        throw new Error("Need at least 4 accounts: deployer, two LPs, and arbitrageur.");
      }
      const deployer = accounts[0];
      const lp1 = accounts[1];
      const lp2 = accounts[2];
      const arbitrageur = accounts[3];
  
      // -------------------------------------------------------------------------
      // Step 3: Deploy TokenA and TokenB contracts.
      // -------------------------------------------------------------------------
      const initialSupply = web3.utils.toWei("1000000", "ether"); // 1,000,000 tokens
      
      console.log("Deploying TokenA...");
      const tokenAContract = new web3.eth.Contract(tokenArtifact.abi);
      const tokenAInstance = await tokenAContract.deploy({
        data: getBytecode(tokenArtifact),
        arguments: [initialSupply]
      }).send({ from: deployer, gas: 3000000 });
      console.log("TokenA deployed at:", tokenAInstance.options.address);
  
      console.log("Deploying TokenB...");
      const tokenBContract = new web3.eth.Contract(tokenBArtifact.abi);
      const tokenBInstance = await tokenBContract.deploy({
        data: getBytecode(tokenBArtifact),
        arguments: [initialSupply]
      }).send({ from: deployer, gas: 3000000 });
      console.log("TokenB deployed at:", tokenBInstance.options.address);
  
      // -------------------------------------------------------------------------
      // Step 4: Deploy two DEX contracts (DEX1 and DEX2)
      // -------------------------------------------------------------------------
      console.log("Deploying DEX1...");
      const dexContract = new web3.eth.Contract(dexArtifact.abi);
      const dex1Instance = await dexContract.deploy({
        data: getBytecode(dexArtifact),
        arguments: [tokenAInstance.options.address, tokenBInstance.options.address]
      }).send({ from: deployer, gas: 4000000 });
      console.log("DEX1 deployed at:", dex1Instance.options.address);
  
      console.log("Deploying DEX2...");
      const dex2Instance = await dexContract.deploy({
        data: getBytecode(dexArtifact),
        arguments: [tokenAInstance.options.address, tokenBInstance.options.address]
      }).send({ from: deployer, gas: 4000000 });
      console.log("DEX2 deployed at:", dex2Instance.options.address);
  
      // -------------------------------------------------------------------------
      // Step 5: Deploy the Arbitrage contract.
      // -------------------------------------------------------------------------
      console.log("Deploying Arbitrage contract...");
      const arbitrageContract = new web3.eth.Contract(arbitrageArtifact.abi);
      const arbitrageInstance = await arbitrageContract.deploy({
        data: getBytecode(arbitrageArtifact),
        arguments: [
          dex1Instance.options.address,
          dex2Instance.options.address,
          tokenAInstance.options.address,
          tokenBInstance.options.address
        ]
      }).send({ from: deployer, gas: 4000000 });
      console.log("Arbitrage deployed at:", arbitrageInstance.options.address);
  
      // -------------------------------------------------------------------------
      // Step 6: Distribute tokens to LP and arbitrageur accounts.
      // -------------------------------------------------------------------------
      const amountToTransfer = web3.utils.toWei("1000", "ether");
      await tokenAInstance.methods.transfer(lp1, amountToTransfer).send({ from: deployer });
      await tokenBInstance.methods.transfer(lp1, amountToTransfer).send({ from: deployer });
      await tokenAInstance.methods.transfer(lp2, amountToTransfer).send({ from: deployer });
      await tokenBInstance.methods.transfer(lp2, amountToTransfer).send({ from: deployer });
      await tokenAInstance.methods.transfer(arbitrageur, amountToTransfer).send({ from: deployer });
      await tokenBInstance.methods.transfer(arbitrageur, amountToTransfer).send({ from: deployer });
      console.log("Tokens distributed to LPs and arbitrageur.");
  
      // -------------------------------------------------------------------------
      // STEP 6.5: Approve the Arbitrage contract to spend tokens on behalf of the arbitrageur.
      // -------------------------------------------------------------------------
      await tokenAInstance.methods.approve(arbitrageInstance.options.address, web3.utils.toWei("1000", "ether")).send({ from: arbitrageur });
      await tokenBInstance.methods.approve(arbitrageInstance.options.address, web3.utils.toWei("1000", "ether")).send({ from: arbitrageur });
      console.log("Arbitrage contract approved by arbitrageur.");
  
      // -------------------------------------------------------------------------
      // Step 7: Setup liquidity to create a price imbalance.
      // -------------------------------------------------------------------------
      // For DEX1 (LP1): Deposit 100 TokenA and 200 TokenB.
      // For DEX2 (LP2): Deposit 100 TokenA and 100 TokenB.
      const depositDex1_A = "100";
      const depositDex1_B = "200";
      const depositDex2_A = "100";
      const depositDex2_B = "100";
  
      await tokenAInstance.methods.approve(dex1Instance.options.address, depositDex1_A).send({ from: lp1 });
      await tokenBInstance.methods.approve(dex1Instance.options.address, depositDex1_B).send({ from: lp1 });
      await dex1Instance.methods.depositLiquidity(depositDex1_A, depositDex1_B).send({ from: lp1, gas: 3000000 });
      console.log(`LP1 (${lp1}) deposited ${depositDex1_A} TokenA and ${depositDex1_B} TokenB into DEX1.`);
  
      await tokenAInstance.methods.approve(dex2Instance.options.address, depositDex2_A).send({ from: lp2 });
      await tokenBInstance.methods.approve(dex2Instance.options.address, depositDex2_B).send({ from: lp2 });
      await dex2Instance.methods.depositLiquidity(depositDex2_A, depositDex2_B).send({ from: lp2, gas: 3000000 });
      console.log(`LP2 (${lp2}) deposited ${depositDex2_A} TokenA and ${depositDex2_B} TokenB into DEX2.`);
  
      // With this setup:
      // - DEX1's spot price (TokenA in TokenB) = (200/100)*1e18 = 2e18.
      // - DEX2's spot price = (100/100)*1e18 = 1e18.
      // This price difference creates a profitable arbitrage opportunity.
  
      // -------------------------------------------------------------------------
      // Step 8: Execute a profitable arbitrage scenario.
      // -------------------------------------------------------------------------
      const amountAIn_profitable = "10"; // Starting with 10 TokenA.
      const minProfit_profitable = "1";   // Set minimum profit to 1 TokenA.
      
      console.log("\n--- Executing profitable arbitrage (TokenA -> TokenB -> TokenA) ---");
      try {
        const tx1 = await arbitrageInstance.methods.arbitrageAtoBtoA(amountAIn_profitable, minProfit_profitable)
          .send({ from: arbitrageur, gas: 3000000 });
        
        const event = tx1.events && tx1.events.ArbitrageExecutedAtoBtoA;
        if (event && event.returnValues) {
          console.log("Profitable arbitrage executed!");
          console.log("Capital used (TokenA):", event.returnValues.capital);
          console.log("Profit earned (TokenA):", event.returnValues.profit);
        } else {
          console.log("Profitable arbitrage executed; please verify contract balances for profit.");
        }
      } catch (error) {
        console.error("Error during profitable arbitrage:", error.message);
      }
  
      // -------------------------------------------------------------------------
      // Step 9: Execute an arbitrage that fails due to an excessive minimum profit.
      // -------------------------------------------------------------------------
      const amountAIn_failed = "10";
      const minProfit_failed = "11"; // Too high – expecting failure.
      
      console.log("\n--- Executing failing arbitrage (insufficient profit) ---");
      try {
        await arbitrageInstance.methods.arbitrageAtoBtoA(amountAIn_failed, minProfit_failed)
          .send({ from: arbitrageur, gas: 3000000 });
        console.error("Error: The arbitrage executed when it was expected to fail due to insufficient profit.");
      } catch (error) {
        console.log("Expected failure: Arbitrage did not execute due to insufficient profit.");
        console.log("Error message:", error.message);
      }
  
      console.log("\nArbitrage simulation complete.");
    } catch (err) {
      console.error("Error in simulation:", err.message);
    }
  }
  
  // Run the simulation.
  simulateArbitrage();
  