# Simple plasma implementation

### Quick start
(set up two connected nodes and mine 1 block)
```
npm install
HTTP_PORT=3001 P2P_PORT=6001 npm start
HTTP_PORT=3002 P2P_PORT=6002 PEERS=ws://localhost:6001 npm start
curl -H "Content-type:application/json" --data '{"sig" : "sig1"}' http://localhost:3001/mineBlock
```

### HTTP API
##### Get blockchain
```
curl http://localhost:3001/blocks
```
##### Create transactions
(utxoBlkNum being 0 indicates that this is a deposit transaction.)
```
curl -H "Content-type:application/json" --data '{"utxoBlkNum" : "0", "utxoTxIdx": "0", "newOwner": "owner1", "sig": "siga"}' http://localhost:3001/transact
```
(Create a regular transaction by specificing the block number and transaction index.)
```
curl -H "Content-type:application/json" --data '{"utxoBlkNum" : "2", "utxoTxIdx": "64", "newOwner": "owner3", "sig": "siga"}' http://localhost:3001/transact
```
##### Create block
```
curl -H "Content-type:application/json" --data '{"sig" : "sig1"}' http://localhost:3001/mineBlock
```
##### Add peer
```
curl -H "Content-type:application/json" --data '{"peer" : "ws://localhost:6002"}' http://localhost:3001/addPeer
```
#### Query connected peers
```
curl http://localhost:3001/peers
```
