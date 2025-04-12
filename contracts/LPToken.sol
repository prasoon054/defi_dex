// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol";

contract LPToken is ERC20 {
    address public minter;

    constructor() ERC20("LP Token", "LPT") {
        // The deployer (initially) is the minter.
        minter = msg.sender;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "LPToken: Not authorized");
        _;
    }

    // Allow the minter to be updated (e.g., to the DEX contract).
    function setMinter(address newMinter) external onlyMinter {
        require(newMinter != address(0), "LPToken: Invalid address");
        minter = newMinter;
    }
    
    function mint(address account, uint256 amount) external onlyMinter {
        _mint(account, amount);
    }
    
    function burn(address account, uint256 amount) external onlyMinter {
        _burn(account, amount);
    }
}
