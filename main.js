'use strict';
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var block = require("./block");
var tx = require("./transaction");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2,
    RESPONSE_TRANSACTION: 3
};

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(block.getBlocks())));
    app.post('/mineBlock', (req, res) => {
        var newBlock = block.generateNextBlock(req.body.sig);
        try {
            block.addBlock(newBlock);
            broadcast(responseLatestMsg());
        } catch (e) {
            console.log(e);
        }
        res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.post('/transact', (req, res) => {
        var newTx = tx.createTransaction(req.body);
        try {
            tx.addTransactionToPool(newTx);
            broadcast(responseTxMsg(newTx));
        } catch (e) {
            console.log(e);
        }
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);
};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
            case MessageType.RESPONSE_TRANSACTION:
                handleTransactionResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = block.getLatestBlock();
    if (latestBlockReceived.blockHeader.blockNumber > latestBlockHeld.blockHeader.blockNumber) {
        console.log('Blockchain possibly behind. We got: ' +
        latestBlockHeld.blockHeader.blockNumber + ' Peer got: ' +
        latestBlockReceived.blockHeader.blockNumber);
        if (block.calculateHashForBlock(latestBlockHeld) === latestBlockReceived.blockHeader.previousHash) {
            console.log("We can append the received block to our chain");
            try {
                block.addBlock(latestBlockReceived);
                broadcast(responseLatestMsg());
            } catch (e) {
                console.log(e);
            }
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            try {
                block.replaceChain(receivedBlocks);
                broadcast(responseLatestMsg());
            } catch (e) {
                console.log(e);
            }
        }
    } else {
        console.log('Received blockchain is not longer than received blockchain. Do nothing');
    }
};

var handleTransactionResponse = (message) => {
    var receivedTx = tx.createTransaction(JSON.parse(message.data));
    if (!tx.hasTransactionInPool(receivedTx)) {
        try {
            tx.addTransactionToPool(receivedTx);
            broadcast(responseTxMsg(receivedTx));
        } catch (e) {
            console.log(e);
        }
    } else {
        console.log('Received transaction is already in pool. Do nothing');
    }
};

var queryChainLengthMsg = () => ({
    'type': MessageType.QUERY_LATEST
});
var queryAllMsg = () => ({
    'type': MessageType.QUERY_ALL
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([block.getLatestBlock()])
});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify(block.getBlocks())
});
var responseTxMsg = (tx) => ({
    'type': MessageType.RESPONSE_TRANSACTION,
    'data': JSON.stringify(tx)
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
