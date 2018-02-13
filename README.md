# Simple plasma implementation

Plasma consists of three major parts.
1. Plasma chain: A simple proof-of-authority chain where the actual transactions take place.
2. Plasma contract: A smart contract deployed on root chain which handles the deposits and withdrawals for the child chain (plasma chain).
3. Ethereum blockchain: The root chain which only records the block headers of the plasma chain.

The complete cycle of interacting with plasma is made up of three stages.

### Deposit

Participants deposit to the plasma contract on the root chain. Then the operator at the plasma chain will construct a deposit transaction according to the contract event when building a new block.

### Transact

Participants could transact with each other on the plasma chain without notifying the root chain. Only when every block is created by the operator, it will submit the block header to the plasma contract on the root chain.

### Withdraw

A withdrawal is initiated by calling the plasma contract. After creating a withdrawal, user needs to wait 7 days for other participants to challenge it. If anyone could prove the given withdrawal that has been spent later on the plasma chain, the withdrawal will be canceled. Otherwise, after 7 days and without any other withdrawals with higher priority, user could withdraw his funds back to the root chain.

## Prerequisite

1. [Truffle](http://truffleframework.com/): An Ethereum development framework which helps us compiling, deploying, and interacting with smart contract.
2. Testrpc: A test Ethereum RPC client for fast development. Here, we use [ganache-cli](https://github.com/trufflesuite/ganache-cli). If you prefer a GUI version, you could replace it with [ganache](http://truffleframework.com/ganache/). Note that you could also launch an Ethereum private chain (geth) to replace testrpc.

## Run
1. Install dependency.
```
npm install
```
2. Run a testrpc.
```
ganache-cli
```
Testrpc will generate ten default accounts for us. For convenience, you could specify a HD wallet mnemonic to get fixed addresses. For example:
```
ganache-cli -m pink two example move shop length clean crop cheese tent strike field
```
The corresponding initial addresses are:
```
(0) 0x0bf5f0f213b0b752858e9352fd6081f5d730dc17
(1) 0x87dbd8ab1bd9d4fce07db12743594a5f456435ff
(2) 0x3b0ba3134ac12cc065d4dba498a60cba5ef16098
(3) 0x6c7f749d0e21aa6478af8e7adc362a8bf76be826
(4) 0x9a404f89ad853e592d7b48242b4745c17a8ee852
(5) 0x34d5e94fc3e7ecac3859a03176cb57534f30b71c
(6) 0x8c0e1d37680a03eeb4c85880ffe1edf61ffa76f4
(7) 0x6017db4acdfed284da94485d715a0f758048ac0b
(8) 0x239ddceb1d7cebf07435a52f569b86f310af9cad
(9) 0x1166d1f78f44c79e8e3f0d74419940e521790d7c
```
3. Compile contracts
```
truffle compile
```
4. Deploy contracts
```
truffle migrate
```
If you need to deploy contracts on this testrpc again, don't forget to add the `--reset` argument.

5. Set the contract configuration (config.js).
    1. After deploying contracts, fill in the `PlasmaChainManager` contract address.
    2. Choose one of the initial addresses as the operator address, for example, `0x87dbd8ab1bd9d4fce07db12743594a5f456435ff`.
6. Run the plasma chain.
```
HTTP_PORT=3001 npm start
```

## HTTP API
### Block related
#### Get blockchain
Get the whole blockchain.
##### Parameter
None
##### Sample
```
curl http://localhost:3001/blocks
```
#### Mine blocks
Miner mines a new block.
##### Parameter
None
##### Sample
```
curl -X POST http://localhost:3001/mineBlock
```

### Transaction related
#### Create a transaction
Create a transaction to other participants. User could specify at most two UTXOs to spend. Also note that the units used in field `amount` is ether.
##### Parameter
|Name|Type|Required|Description|
|---|---|---|---|
|blkNum1|Integer|Yes|First UTXO position|
|txIndex1|Integer|Yes|First UTXO position|
|oIndex1|Integer|Yes|First UTXO position|
|blkNum2|Integer|No|Second UTXO position|
|txIndex2|Integer|No|Second UTXO position|
|oIndex2|Integer|No|Second UTXO position|
|newOwner|Address|Yes|Transfer funds to whom|
|amount|Decimal|Yes|How much ether (in ether)|
|from|Address|Yes|Transfer funds from whom|
##### Sample
```
curl -H "Content-type:application/json" --data '{"from": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A", "blkNum1": 4, "txIndex1": 1, "oIndex": 0, "newOwner": "0x52A6d6c37648Fb1bCd3c641DF3DB35F12a87C4fc", "amount": 0.05}' http://localhost:3001/transact
```

### Deposit related
#### Deposit
Deposit funds to Plasma smart contract.
##### Parameter
|Name|Type|Required|Description|
|---|---|---|---|
|address|Address|Yes|Deposit from whom|
|amount|Integer|Yes|How much funds to deposit|
##### Sample
```
curl -H "Content-type:application/json" --data '{"address": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A", "amount": 0.2}' http://localhost:3001/deposit
```

### Withdrawal related
#### Create withdrawal
Create a new withdrawal.
##### Parameter
|Name|Type|Required|Description|
|---|---|---|---|
|blkNum|Integer|Yes|The position of the UTXO user wants to withdraw|
|txIndex|Integer|Yes|The position of the UTXO user wants to withdraw|
|oIndex|Integer|Yes|The position of the UTXO user wants to withdraw|
|from|Address|Yes|The owner of the UTXO|
##### Sample
```
curl -H "Content-type:application/json" --data '{"blkNum": 3, "txIndex": 1, "oIndex": 0, "from": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/withdraw/create
```
#### Challenge withdrawal
Create a withdrawal challenge.
##### Parameter
|Name|Type|Required|Description|
|---|---|---|---|
|withdrawalId|Integer|Yes|The withdrawal ID user wants to challenge|
|blkNum|Integer|Yes|The position of the UTXO user wants to challenge|
|txIndex|Integer|Yes|The position of the UTXO user wants to challenge|
|oIndex|Integer|Yes|The position of the UTXO user wants to challenge|
|from|Address|Yes|The owner of the UTXO|
```
curl -H "Content-type:application/json" --data '{"withdrawalId": 4000000000, "blkNum": 4, "txIndex": 2, "oIndex": 1, "from": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/withdraw/challenge
```
#### Finalize withdrawal
Finalize withdrawals manually.
##### Parameter
|Name|Type|Required|Description|
|---|---|---|---|
|from|Address|Yes|Who initiates the withdrawal finalization|
##### Sample
```
curl -H "Content-type:application/json" --data '{"from": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/withdraw/finalize
```
