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

async function runTestCase(testCase, dexArtifact, tokenArtifact, tokenBArtifact, arbitrageArtifact) {
  const {
    testCaseName,
    dex1LiquAValue,
    dex1LiquBValue,
    dex2LiquAValue,
    dex2LiquBValue,
    capitalValue,
    minProfitValue,
    symbol
  } = testCase;
  console.log(`\n***** ${testCaseName} *****`);

  // -------------------------------------------------------------------------
  // Setup: Get accounts and deploy fresh contracts
  // -------------------------------------------------------------------------
  const accounts = await web3.eth.getAccounts();
  if (accounts.length < 7) {
    throw new Error("Need at least 7 accounts: deployer, multiple LPs, and arbitrageur.");
  }
  const deployer = accounts[0];
  const arbitrageur = accounts[6];

  // Deploy new Tokens.
  const initialSupply = web3.utils.toWei("1000000", "ether");

  console.log("Deploying TokenA...");
  const tokenAContract = new web3.eth.Contract(tokenArtifact.abi);
  const tokenAInstance = await tokenAContract
    .deploy({
      data: getBytecode(tokenArtifact),
      arguments: [initialSupply]
    })
    .send({ from: deployer, gas: 3000000 });
  console.log("TokenA deployed at:", tokenAInstance.options.address);

  console.log("Deploying TokenB...");
  const tokenBContract = new web3.eth.Contract(tokenBArtifact.abi);
  const tokenBInstance = await tokenBContract
    .deploy({
      data: getBytecode(tokenBArtifact),
      arguments: [initialSupply]
    })
    .send({ from: deployer, gas: 3000000 });
  console.log("TokenB deployed at:", tokenBInstance.options.address);

  // -------------------------------------------------------------------------
  // Deploy two DEX contracts.
  // -------------------------------------------------------------------------
  console.log("Deploying DEX1...");
  const dexContract = new web3.eth.Contract(dexArtifact.abi);
  const dex1Instance = await dexContract
    .deploy({
      data: getBytecode(dexArtifact),
      arguments: [tokenAInstance.options.address, tokenBInstance.options.address]
    })
    .send({ from: deployer, gas: 4000000 });
  console.log("DEX1 deployed at:", dex1Instance.options.address);

  console.log("Deploying DEX2...");
  const dex2Instance = await dexContract
    .deploy({
      data: getBytecode(dexArtifact),
      arguments: [tokenAInstance.options.address, tokenBInstance.options.address]
    })
    .send({ from: deployer, gas: 4000000 });
  console.log("DEX2 deployed at:", dex2Instance.options.address);

  // -------------------------------------------------------------------------
  // Add liquidity to DEXes using deployer account.
  // -------------------------------------------------------------------------
  // Convert liquidity parameters to wei.
  const dex1LiquA = web3.utils.toWei(dex1LiquAValue, "ether");
  const dex1LiquB = web3.utils.toWei(dex1LiquBValue, "ether");
  const dex2LiquA = web3.utils.toWei(dex2LiquAValue, "ether");
  const dex2LiquB = web3.utils.toWei(dex2LiquBValue, "ether");

  console.log(`Adding liquidity to DEXes:
  DEX1: ${dex1LiquAValue} TKA, ${dex1LiquBValue} TKB
  DEX2: ${dex2LiquAValue} TKA, ${dex2LiquBValue} TKB`);

  // Approve and deposit liquidity on DEX1.
  await tokenAInstance.methods.approve(dex1Instance.options.address, dex1LiquA).send({ from: deployer });
  await tokenBInstance.methods.approve(dex1Instance.options.address, dex1LiquB).send({ from: deployer });
  await dex1Instance.methods.depositLiquidity(dex1LiquA, dex1LiquB).send({ from: deployer, gas: 3000000 });

  // Approve and deposit liquidity on DEX2.
  await tokenAInstance.methods.approve(dex2Instance.options.address, dex2LiquA).send({ from: deployer });
  await tokenBInstance.methods.approve(dex2Instance.options.address, dex2LiquB).send({ from: deployer });
  await dex2Instance.methods.depositLiquidity(dex2LiquA, dex2LiquB).send({ from: deployer, gas: 3000000 });
  console.log("Liquidity added.");

  // -------------------------------------------------------------------------
  // Deploy the Arbitrage contract.
  // -------------------------------------------------------------------------
  console.log("Deploying Arbitrage contract...");
  const arbitrageContract = new web3.eth.Contract(arbitrageArtifact.abi);
  const arbitrageInstance = await arbitrageContract
    .deploy({
      data: getBytecode(arbitrageArtifact),
      arguments: [
        dex1Instance.options.address,
        dex2Instance.options.address,
        tokenAInstance.options.address,
        tokenBInstance.options.address
      ]
    })
    .send({ from: deployer, gas: 4000000 });
  console.log("Arbitrage contract deployed at:", arbitrageInstance.options.address);

  // -------------------------------------------------------------------------
  // Transfer capital to arbitrageur and set approval.
  // -------------------------------------------------------------------------
  const capital = web3.utils.toWei(capitalValue, "ether");
  if (symbol === "TKA") {
    await tokenAInstance.methods.transfer(arbitrageur, capital).send({ from: deployer });
    console.log(`Transferred ${capitalValue} TKA to arbitrageur.`);
  } else if (symbol === "TKB") {
    await tokenBInstance.methods.transfer(arbitrageur, capital).send({ from: deployer });
    console.log(`Transferred ${capitalValue} TKB to arbitrageur.`);
  } else {
    throw new Error("Invalid symbol passed");
  }

  // Display the initial balance for arbitrageur.
  let initialBalance;
  if (symbol === "TKA") {
    initialBalance = await tokenAInstance.methods.balanceOf(arbitrageur).call();
    console.log("Arbitrageur initial TKA balance:", web3.utils.fromWei(initialBalance, "ether"));
  } else {
    initialBalance = await tokenBInstance.methods.balanceOf(arbitrageur).call();
    console.log("Arbitrageur initial TKB balance:", web3.utils.fromWei(initialBalance, "ether"));
  }

  // Approve the Arbitrage contract to spend arbitrageur's capital.
  if (symbol === "TKA") {
    await tokenAInstance.methods.approve(arbitrageInstance.options.address, capital).send({ from: arbitrageur });
  } else {
    await tokenBInstance.methods.approve(arbitrageInstance.options.address, capital).send({ from: arbitrageur });
  }

  // -------------------------------------------------------------------------
  // Compute minProfit as: capital * (minProfitValue / 100)
  // -------------------------------------------------------------------------
  // Using BN arithmetic to handle the 18-decimal places.
  const BN = web3.utils.BN;
  const capitalBN = new BN(capital);
  const minProfitPercBN = new BN(web3.utils.toWei(minProfitValue, "ether")); // e.g., "0.05" becomes 5e16
  const divisor = new BN(web3.utils.toWei("100", "ether")); // "100" in 18-decimal precision.
  const minProfitBN = capitalBN.mul(minProfitPercBN).div(divisor);
  console.log("Computed minProfit:", web3.utils.fromWei(minProfitBN, "ether"));

  // -------------------------------------------------------------------------
  // Execute arbitrage based on the chosen symbol.
  // -------------------------------------------------------------------------
  console.log(`Executing arbitrage with ${symbol} capital ...`);
  try {
    let tx;
    if (symbol === "TKA") {
      tx = await arbitrageInstance.methods.arbitrageAtoBtoA(capital, minProfitBN)
        .send({ from: arbitrageur, gas: 3000000 });
    } else if (symbol === "TKB") {
      tx = await arbitrageInstance.methods.arbitrageBtoAtoB(capital, minProfitBN)
        .send({ from: arbitrageur, gas: 3000000 });
    }
    
    // Display final balance and profit.
    let finalBalance;
    if (symbol === "TKA") {
      finalBalance = await tokenAInstance.methods.balanceOf(arbitrageur).call();
      console.log("Final TKA balance:", web3.utils.fromWei(finalBalance, "ether"));
    } else {
      finalBalance = await tokenBInstance.methods.balanceOf(arbitrageur).call();
      console.log("Final TKB balance:", web3.utils.fromWei(finalBalance, "ether"));
    }
    const profitBN = new BN(finalBalance).sub(new BN(initialBalance));
    console.log("Profit in", symbol, ":", web3.utils.fromWei(profitBN, "ether"));
  } catch (error) {
    console.log(`Arbitrage with ${symbol} failed (insufficient profit).`);
    console.log("Error details:", error.message);
  }

  console.log("---------------------------------------------------");
}

async function simulateArbitrage() {
  try {
    console.log("Starting arbitrage simulation with fresh deployment per test case...");

    // -------------------------------------------------------------------------
    // Step 1: Load contract artifacts.
    // -------------------------------------------------------------------------
    const dexArtifact = JSON.parse(
      await remix.call("fileManager", "getFile", "contracts/artifacts/DEX.json")
    );
    const tokenArtifact = JSON.parse(
      await remix.call("fileManager", "getFile", "contracts/artifacts/TokenA.json")
    );
    const tokenBArtifact = JSON.parse(
      await remix.call("fileManager", "getFile", "contracts/artifacts/TokenB.json")
    );
    const arbitrageArtifact = JSON.parse(
      await remix.call("fileManager", "getFile", "contracts/artifacts/Arbitrage.json")
    );
    if (!dexArtifact || !tokenArtifact || !tokenBArtifact || !arbitrageArtifact) {
      throw new Error("One or more contract artifacts could not be loaded. Please compile your contracts first.");
    }

    // -------------------------------------------------------------------------
    // Step 2: Ensure there are enough accounts.
    // -------------------------------------------------------------------------
    const accounts = await web3.eth.getAccounts();
    if (accounts.length < 7) {
      throw new Error("Need at least 7 accounts: deployer, LPs, and arbitrageur.");
    }
    console.log("Deployer address:", accounts[0]);

    // -------------------------------------------------------------------------
    // Step 3: Define test cases.
    // -------------------------------------------------------------------------
    const testCases = [
      {
        testCaseName: "Test Case 1: Profitable arbitrage with Token A",
        dex1LiquAValue: "520",
        dex1LiquBValue: "2717",
        dex2LiquAValue: "1000",
        dex2LiquBValue: "500",
        capitalValue: "5",
        minProfitValue: "0.05", // 0.05%
        symbol: "TKA"
      },
      {
        testCaseName: "Test Case 2: Profitable arbitrage with Token B",
        dex1LiquAValue: "1000",
        dex1LiquBValue: "2000",
        dex2LiquAValue: "1000",
        dex2LiquBValue: "2100",
        capitalValue: "5",
        minProfitValue: "0.0005", // 0.0005%
        symbol: "TKB"
      },
      {
        testCaseName: "Test Case 3: Failed arbitrage with Token A (no profit)",
        dex1LiquAValue: "1000",
        dex1LiquBValue: "1000",
        dex2LiquAValue: "1000",
        dex2LiquBValue: "1000",
        capitalValue: "5",
        minProfitValue: "0.05",
        symbol: "TKA"
      },
      {
        testCaseName: "Test Case 4: Failed arbitrage with Token B (no profit)",
        dex1LiquAValue: "1000",
        dex1LiquBValue: "1000",
        dex2LiquAValue: "1000",
        dex2LiquBValue: "1000",
        capitalValue: "5",
        minProfitValue: "0.0005",
        symbol: "TKB"
      }
    ];

    // -------------------------------------------------------------------------
    // Step 4: Execute test cases sequentially.
    // -------------------------------------------------------------------------
    for (const testCase of testCases) {
      await runTestCase(testCase, dexArtifact, tokenArtifact, tokenBArtifact, arbitrageArtifact);
    }

    console.log("\nArbitrage simulation complete.");
  } catch (err) {
    console.error("Error in simulation:", err.message);
  }
}

// Run the simulation.
simulateArbitrage();
