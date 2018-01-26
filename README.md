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

1. Launch an Ethereum private chain as the root chain.
2. Deploy the [plasma smart contract](https://github.com/ethereum-plasma/PlasmaContract) on the root chain manually.
3. Set the contract address at config file (config.js).
4. Create accounts on Ethereum blockchain for the operator and participants.

## Run a plasma chain
```
npm install
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
