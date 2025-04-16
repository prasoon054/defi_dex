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
    const dexArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'contracts/artifacts/DEX.json'));
    const tokenArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'contracts/artifacts/TokenA.json'));
    // TokenA and TokenB use the same source file (Token.sol) but are deployed separately.
    const tokenBArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'contracts/artifacts/TokenB.json'));
    const arbitrageArtifact = JSON.parse(await remix.call('fileManager', 'getFile', 'contracts/artifacts/Arbitrage.json'));
    
    if (!dexArtifact || !tokenArtifact || !tokenBArtifact || !arbitrageArtifact) {
      throw new Error("One or more contract artifacts could not be loaded. Please compile your contracts first.");
    }
    
    // -------------------------------------------------------------------------
    // Step 2: Get accounts for deployment and actions.
    // -------------------------------------------------------------------------
    // We now require at least 7 accounts:
    // - deployer: accounts[0]
    // - LP1: accounts[1]
    // - LP2: accounts[2]
    // - LP3: accounts[3]
    // - LP4: accounts[4]
    // - LP5: accounts[5]
    // - arbitrageur: accounts[6]
    const accounts = await web3.eth.getAccounts();
    if (accounts.length < 7) {
      throw new Error("Need at least 7 accounts: deployer, 5 LPs, and arbitrageur.");
    }
    const deployer = accounts[0];
    const lp1 = accounts[1];
    const lp2 = accounts[2];
    const lp3 = accounts[3];
    const lp4 = accounts[4];
    const lp5 = accounts[5];
    const arbitrageur = accounts[6];

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
    // Send to LP1..LP5
    for (let i = 1; i <= 5; i++) {
      await tokenAInstance.methods.transfer(accounts[i], amountToTransfer).send({ from: deployer });
      await tokenBInstance.methods.transfer(accounts[i], amountToTransfer).send({ from: deployer });
    }
    // Send to arbitrageur (accounts[6])
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
    // For DEX1, we will have LP1, LP2, and LP3 deposit liquidity with a ratio of 1:2.
    // For DEX2, LP4 and LP5 will deposit liquidity with a ratio of 1:1.
    const depositA1 = "100";
    const depositB1 = "200";
    const depositA2 = "100";
    const depositB2 = "200";
    const depositA3 = "100";
    const depositB3 = "200";

    const depositA4 = "100";
    const depositB4 = "100";
    const depositA5 = "100";
    const depositB5 = "100";

    // LP1 deposits into DEX1.
    await tokenAInstance.methods.approve(dex1Instance.options.address, depositA1).send({ from: lp1 });
    await tokenBInstance.methods.approve(dex1Instance.options.address, depositB1).send({ from: lp1 });
    await dex1Instance.methods.depositLiquidity(depositA1, depositB1).send({ from: lp1, gas: 3000000 });
    console.log(`LP1 (${lp1}) deposited ${depositA1} TokenA and ${depositB1} TokenB into DEX1.`);

    // LP2 deposits into DEX1.
    await tokenAInstance.methods.approve(dex1Instance.options.address, depositA2).send({ from: lp2 });
    await tokenBInstance.methods.approve(dex1Instance.options.address, depositB2).send({ from: lp2 });
    await dex1Instance.methods.depositLiquidity(depositA2, depositB2).send({ from: lp2, gas: 3000000 });
    console.log(`LP2 (${lp2}) deposited ${depositA2} TokenA and ${depositB2} TokenB into DEX1.`);

    // LP3 deposits into DEX1.
    await tokenAInstance.methods.approve(dex1Instance.options.address, depositA3).send({ from: lp3 });
    await tokenBInstance.methods.approve(dex1Instance.options.address, depositB3).send({ from: lp3 });
    await dex1Instance.methods.depositLiquidity(depositA3, depositB3).send({ from: lp3, gas: 3000000 });
    console.log(`LP3 (${lp3}) deposited ${depositA3} TokenA and ${depositB3} TokenB into DEX1.`);

    // LP4 deposits into DEX2.
    await tokenAInstance.methods.approve(dex2Instance.options.address, depositA4).send({ from: lp4 });
    await tokenBInstance.methods.approve(dex2Instance.options.address, depositB4).send({ from: lp4 });
    await dex2Instance.methods.depositLiquidity(depositA4, depositB4).send({ from: lp4, gas: 3000000 });
    console.log(`LP4 (${lp4}) deposited ${depositA4} TokenA and ${depositB4} TokenB into DEX2.`);

    // LP5 deposits into DEX2.
    await tokenAInstance.methods.approve(dex2Instance.options.address, depositA5).send({ from: lp5 });
    await tokenBInstance.methods.approve(dex2Instance.options.address, depositB5).send({ from: lp5 });
    await dex2Instance.methods.depositLiquidity(depositA5, depositB5).send({ from: lp5, gas: 3000000 });
    console.log(`LP5 (${lp5}) deposited ${depositA5} TokenA and ${depositB5} TokenB into DEX2.`);

    console.log("Liquidity setup complete.");
    console.log("DEX1's spot price (TokenA in TokenB): ~" + await dex1Instance.methods.getSpotPriceAinB().call());
    console.log("DEX2's spot price (TokenA in TokenB): ~" + await dex2Instance.methods.getSpotPriceAinB().call());
    // This should create a price imbalance (for example, DEX1 might be ~2e18 and DEX2 ~1e18).

    // -------------------------------------------------------------------------
    // Testcase 1: Successful arbitrage on TokenA (A->B->A)
    // -------------------------------------------------------------------------
    const amountAIn_profitable = "10"; // Starting with 10 TokenA.
    const minProfitA_success = "1";      // Set minimum profit to 1 TokenA.
    
    console.log("\n--- Testcase 1: Executing profitable arbitrage (TokenA -> TokenB -> TokenA) ---");
    try {
      const tx1 = await arbitrageInstance.methods.arbitrageAtoBtoA(amountAIn_profitable, minProfitA_success)
        .send({ from: arbitrageur, gas: 3000000 });
      
      const event = tx1.events && tx1.events.ArbitrageExecutedAtoBtoA;
      if (event && event.returnValues) {
        console.log("Testcase 1 SUCCESS: Profitable arbitrage executed!");
        console.log("Capital used (TokenA):", event.returnValues.capital);
        console.log("Profit earned (TokenA):", event.returnValues.profit);
      } else {
        console.log("Testcase 1 SUCCESS: Profitable arbitrage executed; please verify balances.");
      }
    } catch (error) {
      console.error("Testcase 1 FAILED:", error.message);
    }

    // -------------------------------------------------------------------------
    // Testcase 2: Failing arbitrage on TokenA (A->B->A with excessive min profit)
    // -------------------------------------------------------------------------
    const amountAIn_failed = "10";
    const minProfitA_fail = "11"; // Too high – expecting failure.
    
    console.log("\n--- Testcase 2: Executing failing arbitrage (TokenA -> TokenB -> TokenA) ---");
    try {
      await arbitrageInstance.methods.arbitrageAtoBtoA(amountAIn_failed, minProfitA_fail)
        .send({ from: arbitrageur, gas: 3000000 });
      console.error("Testcase 2 FAILED: Arbitrage executed when it was expected to fail.");
    } catch (error) {
      console.log("Testcase 2 SUCCESS: Expected failure - arbitrage did not execute due to insufficient profit.");
      console.log("Error message:", error.message);
    }

    // -------------------------------------------------------------------------
    // Testcase 3: Successful arbitrage on TokenB (B->A->B)
    // -------------------------------------------------------------------------
    const amountBIn_profitable = "10"; // Starting with 10 TokenB.
    const minProfitB_success = "1";      // Set minimum profit to 1 TokenB.
    
    console.log("\n--- Testcase 3: Executing profitable arbitrage (TokenB -> TokenA -> TokenB) ---");
    try {
      const tx3 = await arbitrageInstance.methods.arbitrageBtoAtoB(amountBIn_profitable, minProfitB_success)
        .send({ from: arbitrageur, gas: 3000000 });
      
      const event = tx3.events && tx3.events.ArbitrageExecutedBtoAtoB;
      if (event && event.returnValues) {
        console.log("Testcase 3 SUCCESS: Profitable arbitrage executed!");
        console.log("Capital used (TokenB):", event.returnValues.capital);
        console.log("Profit earned (TokenB):", event.returnValues.profit);
      } else {
        console.log("Testcase 3 SUCCESS: Profitable arbitrage executed; please verify balances.");
      }
    } catch (error) {
      console.error("Testcase 3 FAILED:", error.message);
    }

    // -------------------------------------------------------------------------
    // Testcase 4: Failing arbitrage on TokenB (B->A->B with excessive min profit)
    // -------------------------------------------------------------------------
    const amountBIn_failed = "10";
    const minProfitB_fail = "11"; // Too high – expecting failure.
    
    console.log("\n--- Testcase 4: Executing failing arbitrage (TokenB -> TokenA -> TokenB) ---");
    try {
      await arbitrageInstance.methods.arbitrageBtoAtoB(amountBIn_failed, minProfitB_fail)
        .send({ from: arbitrageur, gas: 3000000 });
      console.error("Testcase 4 FAILED: Arbitrage executed when it was expected to fail.");
    } catch (error) {
      console.log("Testcase 4 SUCCESS: Expected failure - arbitrage did not execute due to insufficient profit.");
      console.log("Error message:", error.message);
    }

    console.log("\nArbitrage simulation complete.");
  } catch (err) {
    console.error("Error in simulation:", err.message);
  }
}

// Run the simulation.
simulateArbitrage();
