# Simple plasma implementation

Plasma consists of three major parts.
1. Plasma chain: A simple proof-of-authority chain where the actual transactions take place.
2. Plasma contract: A smart contract deployed on root chain which handles the deposits and withdrawals for the child chain (plasma chain).
3. Ethereum blockchain: The root chain which only records the block headers of the plasma chain.

The complete cycle of inteacting with plasma is made up of three stages.

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
4. Create accounts on Ethereum blockchain for the operator (the miner in plasma chain) and participants.

## Run a plasma chain
(set up two connected nodes and mine 1 block)
```
npm install
HTTP_PORT=3001 P2P_PORT=6001 npm start
HTTP_PORT=3002 P2P_PORT=6002 PEERS=ws://localhost:6001 npm start
curl -X POST http://localhost:3001/mineBlock
```

## HTTP API
### Block related
#### Get blockchain
```
curl http://localhost:3001/blocks
```
#### Mine blocks
```
curl -X POST http://localhost:3001/mineBlock
```

### Peer related
#### Query connected peers
```
curl http://localhost:3001/peers
```
#### Add peer
```
curl -H "Content-type:application/json" --data '{"peer" : "ws://localhost:6002"}' http://localhost:3001/addPeer
```

### Transaction related
#### Create raw transaction
```
curl -H "Content-type:application/json" --data '{"utxoBlkNum": 1, "utxoTxIdx": 0, "newOwner": "0x52A6d6c37648Fb1bCd3c641DF3DB35F12a87C4fc"}' http://localhost:3001/transaction/create
```
#### Sign raw transaction
```
curl -H "Content-type:application/json" --data '{"rawTx": "000000040052A6d6c37648Fb1bCd3c641DF3DB35F12a87C4fc", "address": "0x52A6d6c37648Fb1bCd3c641DF3DB35F12a87C4fc"}' http://localhost:3001/transaction/sign
```
#### Send raw transaction
```
curl -H "Content-type:application/json" --data '{"rawTx": "000000040052A6d6c37648Fb1bCd3c641DF3DB35F12a87C4fcf1f8f464d968978b7cc2b760204a9b584da8720f7fb09c072f15c5565a1986ff003f7aa1224757f0ba43f7914f6cd757b99cf2ae32431769d88336ed9fad25921c"}' http://localhost:3001/transaction/send
```

### Deposit related
#### Deposit
```
curl -H "Content-type:application/json" --data '{"address": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/deposit
```

### Withdrawal related
#### Create withdrawal
```
curl -H "Content-type:application/json" --data '{"blockNumber": 3, "txIndex": 1, "address": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/withdraw/create
```
#### Challenge withdrawal
```
curl -H "Content-type:application/json" --data '{"withdrawalId": 4000000000, "blockNumber": 4, "txIndex": 2, "address": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/withdraw/challenge
```
#### Finalize withdrawal
```
curl -H "Content-type:application/json" --data '{"address": "0xC973531975B1EE371164DCcB9529b89A7bCD1c4A"}' http://localhost:3001/withdraw/finalize
```
