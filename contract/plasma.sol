pragma solidity ^0.4.19;

library MinHeapLib {
    struct Heap {
        uint256[] data;
    }

    function add(Heap storage _heap, uint256 value) internal {
        _heap.data.length += 1;
        uint index = _heap.data.length - 1;
        _heap.data[index] = value;

        // Fix the min heap if it is violated.
        while (index != 0 && _heap.data[index] < _heap.data[(index - 1) / 2]) {
            uint256 temp = _heap.data[index];
            _heap.data[index] = _heap.data[(index - 1) / 2];
            _heap.data[(index - 1) / 2] = temp;
            index = (index - 1) / 2;
        }
    }

    function peek(Heap storage _heap) view internal returns (uint256 value) {
        return _heap.data[0];
    }

    function pop(Heap storage _heap) internal returns (uint256 value) {
        uint256 root = _heap.data[0];
        _heap.data[0] = _heap.data[_heap.data.length - 1];
        _heap.data.length -= 1;
        heapify(_heap, 0);
        return root;
    }

    function heapify(Heap storage _heap, uint i) internal {
        uint left = 2 * i + 1;
        uint right = 2 * i + 2;
        uint smallest = i;
        if (left < _heap.data.length && _heap.data[left] < _heap.data[i]) {
            smallest = left;
        }
        if (right < _heap.data.length && _heap.data[right] < _heap.data[smallest]) {
            smallest = right;
        }
        if (smallest != i) {
            uint256 temp = _heap.data[i];
            _heap.data[i] = _heap.data[smallest];
            _heap.data[smallest] = temp;
            heapify(_heap, smallest);
        }
    }
}

contract PlasmaChainManager {
    using MinHeapLib for MinHeapLib.Heap;

    bytes constant PersonalMessagePrefixBytes = "\x19Ethereum Signed Message:\n68";
    uint32 constant blockNumberLength = 4;
    uint32 constant previousHashLength = 32;
    uint32 constant merkleRootLength = 32;
    uint32 constant sigRLength = 32;
    uint32 constant sigSLength = 32;
    uint32 constant sigVLength = 1;
    uint32 constant blockHeaderLength = 133;
    uint32 constant transactionLength = 90;

    struct BlockHeader {
        uint32 blockNumber;
        bytes32 previousHash;
        bytes32 merkleRoot;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    struct DepositRecord {
        uint32 n;
        uint32 ctr;
    }

    enum WithdrawStatus {
        Created,
        Challenged,
        Complete
    }

    struct WithdrawRecord {
        uint32 blockNumber;
        uint32 txIndex;
        address beneficiary;
        WithdrawStatus status;
        uint256 timeStarted;
        uint256 timeEnded;
    }

    address public owner;
    uint32 public lastBlockNumber;
    uint32 public depositCounter;
    mapping(address => bool) public operators;
    mapping(uint256 => BlockHeader) public headers;
    mapping(address => DepositRecord[]) public depositRecords;
    mapping(uint256 => WithdrawRecord) public withdrawRecords;
    MinHeapLib.Heap exits;

    function PlasmaChainManager() public {
        owner = msg.sender;
        lastBlockNumber = 0;
        depositCounter = 0;
    }

    function extract32(bytes data, uint pos)
        pure
        internal
        returns (bytes32 result)
    {
        for (uint256 i = 0; i < 32; i++) {
            result ^= (bytes32(0xff00000000000000000000000000000000000000000000000000000000000000)&data[i+pos])>>(i*8);
        }
    }

    function extract20(bytes data, uint pos)
        pure
        internal
        returns (bytes20 result)
    {
        for (uint256 i = 0; i < 20; i++) {
            result ^= (bytes20(0xff00000000000000000000000000000000000000)&data[i+pos])>>(i*8);
        }
    }

    function extract4(bytes data, uint pos)
        pure
        internal
        returns (bytes4 result)
    {
        for (uint256 i = 0; i < 4; i++) {
            result ^= (bytes4(0xff000000)&data[i+pos])>>(i*8);
        }
    }

    function extract1(bytes data, uint pos)
        pure
        internal
        returns (bytes1 result)
    {
        for (uint256 i = 0; i < 1; i++) {
            result ^= (bytes1(0xff)&data[i+pos])>>(i*8);
        }
    }

    function setOperator(address operator, bool status)
        public
        returns (bool success)
    {
        require(msg.sender == owner);
        operators[operator] = status;
        return true;
    }

    event HeaderSubmittedEvent(address signer, uint32 blockNumber);

    function submitBlockHeader(bytes header) public returns (bool success) {
        require(operators[msg.sender]);
        require(header.length == blockHeaderLength);
        uint32 blockNumber = uint32(extract4(header, 0));
        bytes32 previousHash = extract32(header, 4);
        bytes32 merkleRoot = extract32(header, 36);
        bytes32 sigR = extract32(header, 68);
        bytes32 sigS = extract32(header, 100);
        uint8 sigV = uint8(extract1(header, 132));

        // Check the block number.
        require(blockNumber == lastBlockNumber + 1);

        // Check the signature.
        bytes32 blockHash = keccak256(PersonalMessagePrefixBytes, blockNumber,
            previousHash, merkleRoot);
        if (sigV < 27) {
            sigV += 27;
        }
        address signer = ecrecover(blockHash, sigV, sigR, sigS);
        require(msg.sender == signer);

        // Append the new header.
        BlockHeader memory newHeader = BlockHeader({
            blockNumber: blockNumber,
            previousHash: previousHash,
            merkleRoot: merkleRoot,
            r: sigR,
            s: sigS,
            v: sigV
        });
        headers[blockNumber] = newHeader;

        // Increment the block number by 1 and reset the deposit counter.
        lastBlockNumber += 1;
        depositCounter = 0;
        HeaderSubmittedEvent(signer, blockNumber);
        return true;
    }

    event DepositEvent(address from, uint256 amount, uint32 indexed n, uint32 ctr);

    function deposit() payable public returns (bool success) {
        require(msg.value == 1 ether);
        require(depositCounter < 63);

        DepositRecord memory newDeposit = DepositRecord({
            n: lastBlockNumber,
            ctr: depositCounter
        });
        depositRecords[msg.sender].push(newDeposit);
        depositCounter += 1;
        DepositEvent(msg.sender, msg.value, newDeposit.n, newDeposit.ctr);
        return true;
    }

    event WithdrawalStartedEvent(uint256 withdrawalId);

    function startWithdrawal(
        uint32 blockNumber,
        uint32 txIndex,
        bytes targetTx,
        bytes proof
    )
        public
        returns (uint256 withdrawalId)
    {
        BlockHeader memory header = headers[blockNumber];
        require(header.blockNumber > 0);
        require(targetTx.length == transactionLength);

        // Check if the target transaction is in the block.
        require(isValidProof(header.merkleRoot, targetTx, proof));

        // Check if the transaction owner is the sender.
        address txOwner = address(extract20(targetTx, 5));
        require(txOwner == msg.sender);

        // Check if the withdrawal exists.
        withdrawalId = uint256(blockNumber) * 1000000000 + uint256(txIndex) * 10000;
        WithdrawRecord storage record = withdrawRecords[withdrawalId];
        require(record.blockNumber == 0);

        // Construct a new withdrawal and add its ID to the heap.
        record.blockNumber = blockNumber;
        record.txIndex = txIndex;
        record.beneficiary = txOwner;
        record.status = WithdrawStatus.Created;
        record.timeStarted = now;
        exits.add(withdrawalId);

        WithdrawalStartedEvent(withdrawalId);
        return withdrawalId;
    }

    event WithdrawalChallengedEvent(uint256 withdrawalId);

    function challengeWithdrawal(
        uint256 withdrawalId,
        uint32 blockNumber,
        uint32 txIndex,
        bytes targetTx,
        bytes proof
    )
        public
        returns (bool success)
    {
        BlockHeader memory header = headers[blockNumber];
        require(header.blockNumber > 0);
        require(targetTx.length == transactionLength);

        // Check if the transaction is in the block.
        require(isValidProof(header.merkleRoot, targetTx, proof));

        // Check if the withdrawal exists.
        WithdrawRecord storage record = withdrawRecords[withdrawalId];
        require(record.blockNumber > 0);

        uint32 utxoBlockNumber = uint32(extract4(targetTx, 0));
        uint32 utxoTxIndex = uint32(extract1(targetTx, 4));

        // The transaction spends the given withdrawal on plasma chain.
        if (record.blockNumber == utxoBlockNumber && record.txIndex == utxoTxIndex) {
            record.timeEnded = now;
            record.status = WithdrawStatus.Challenged;
            WithdrawalChallengedEvent(withdrawalId);
            return true;
        }

        return false;
    }

    event WithdrawalCompleteEvent(uint256 withdrawalId, uint32 indexed n,
        uint32 blockNumber, uint32 txIndex);

    function finalizeWithdrawal() public returns (bool success) {
        uint256 withdrawalId = exits.peek();

        WithdrawRecord storage record = withdrawRecords[withdrawalId];

        // If the top most withdrawal is challenged, just pop it and do nothing.
        if (record.status == WithdrawStatus.Challenged) {
            exits.pop();
            return false;
        }

        require(record.blockNumber > 0);
        require(record.status == WithdrawStatus.Created);
        // require(now >= record.timeStarted + (7 days));
        require(now >= record.timeStarted + 1 minutes);

        exits.pop();
        record.timeEnded = now;
        record.status = WithdrawStatus.Complete;
        record.beneficiary.transfer(1 ether);
        WithdrawalCompleteEvent(withdrawalId, lastBlockNumber,
            record.blockNumber, record.txIndex);
        return true;
    }

    function isValidProof(bytes32 root, bytes target, bytes proof)
        pure
        internal
        returns (bool valid)
    {
        bytes32 hash = sha256(target);
        for (uint i = 0; i < proof.length; i += 33) {
            uint8 flag = uint8(extract1(proof, i));
            bytes32 sibling = extract32(proof, i + 1);
            if (flag == 0) {
                hash = sha256(sibling, hash);
            } else if (flag == 1) {
                hash = sha256(hash, sibling);
            }
        }
        return hash == root;
    }
}
