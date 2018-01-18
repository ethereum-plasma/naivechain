# Simple plasma implementation

The Plasma chain is a proof-of-authority chain with a single operator.

## Prerequisite

1. Launch an Ethereum private chain as the root chain.
2. Deploy the [plasma smart contract](https://github.com/ethereum-plasma/PlasmaContract) manually.
3. Set the contract address at config file (config.js).
4. Create accounts on Ethereum for the operator (the miner in plasma chain) and other participants.

## Procedure

1. Deposit an ether on plasma contract.
2. Make transactions on plasma chain with each other.
3. Initiate a withdrawal on plasma contract.
4. Wait one week for other participants to challenge the withdrawal.
5. Successfully withdraw the money from plasma chain.

## Quick start
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
