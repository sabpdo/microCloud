
interface PeerInfo {
    peerID: string;
    lastSeen: number;        // timestamp
    bandwidth: number;       // Mbps
    uptime: number;          // seconds
    availableStorage: number; // MB
    reputation: number;      // float
    resources: Set<string>;     // depends on chunk imp
    object: Peer
}

interface Weights {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    g: number;
}

export class Peer {
    // Peer indiv data
    public readonly peerID: string;
    private peerIndex: Map<string, PeerInfo>;
    public role: string;
    private readonly UPDATE_CYCLE_INTERVAL = 10000;

    // Peer interaction data
    private successfulUploads: number;
    private integrityVerifications: number;
    private failedTransfers: number;
    private anchorTreshould: number;

    // Device data
    private bandwidth: number;
    private availableStorage: number;
    private batteryPercentage: number;
    private connectionStartTime: number;
    private connectionEndTime: number;
    private isConnected: boolean;

    private resources: Set<string>;
    private chunkIndex: Map<string, PriorityQueue>;
    private uptime: number;

    private weights: Weights;

    // add to constructor how many total chunks there are?
    public constructor(
        peerID: string,
        initialBandwidth: number,
        initialStorage: number,
        initialBattery: number,
        weights: Weights,
        anchorThreshold: number,
    ) {
        this.peerID = peerID;
        this.peerIndex = new Map();
        this.role = 'transient';

        this.successfulUploads = 0;
        this.integrityVerifications = 0;
        this.failedTransfers = 0;
        this.anchorTreshould = anchorThreshold;

        this.bandwidth = initialBandwidth;
        this.availableStorage = initialStorage;
        this.batteryPercentage = initialBattery;

        this.resources = new Set();
        this.uptime = 0;
        this.chunkIndex = new Map();

        this.weights = weights;
        
        this.startUptimeTracking();
        this.startRebalancingCycle();
    }

    // reputation decay over time?
    public getReputation(): number {
        return this.weights.a * this.successfulUploads + 
                this.weights.b * this.integrityVerifications +
                this.weights.c * this.failedTransfers + 
                this.weights.d * this.bandwidth + 
                this.weights.e * this.uptime +
                this.weights.f * this.availableStorage +
                this.weights.g * this.batteryPercentage;
    }

    public updateRole(): void {
        const score = this.getReputation();
        if(score >= this.anchorTreshould) {
            this.role = "anchor";
        }
        else {
            this.role = "transient";
        }
    }

    public startRebalancingCycle(): void {
        setInterval(() => {
            this.updateRole();
            this.updateConnections();
            this.requestChunk();
        }, this.UPDATE_CYCLE_INTERVAL);
    }

    public startUptimeTracking(): void {
        this.connectionStartTime = Date.now();
        this.isConnected = true;
    }

    public stopUptimeTracking(): void {
        if (this.isConnected) {
            this.connectionEndTime = Date.now();
            this.isConnected = false;
        }
    }

    public updateUptime(): number {
        if (this.isConnected) {
            this.connectionEndTime = Date.now();
            const currentSession = (this.connectionEndTime - this.connectionStartTime) / 1000;
            this.uptime = currentSession;
        }
        return this.uptime;
    }

    public getPeerInfo(): PeerInfo {
        const info: PeerInfo = { peerID: this.peerID,
                                 lastSeen: this.connectionEndTime / 1000,
                                 bandwidth: this.bandwidth,
                                 uptime: this.uptime,
                                 availableStorage: this.availableStorage,
                                 reputation: this.getReputation(),
                                 resources: this.resources,
                                 object: this,
                                }
        return info;
    }

    public addPeer(peer:Peer): void {
        const newPeerInfo:PeerInfo = peer.getPeerInfo();
        this.peerIndex.set(peer.peerID, newPeerInfo);
        for(const chunkID of newPeerInfo.resources){
            if(this.chunkIndex.has(chunkID)){
                this.chunkIndex.get(chunkID)?.insert(newPeerInfo.reputation, peer.peerID);
            }
            else {
                let pq:PriorityQueue = new PriorityQueue();
                pq.insert(newPeerInfo.reputation, peer.peerID);
                this.chunkIndex.set(chunkID, pq);
            }
        }
    }

    public updateConnections(): void {
        // verify connections in hash map are still connected
        const now = Date.now();
        const TIMEOUT_THRESHOLD = 30000; // 30 seconds
        
        // temporary verification of connectedness (should use heartbeat)
        for (const [peerID, info] of this.peerIndex.entries()) {
            if (now - info.lastSeen > TIMEOUT_THRESHOLD) {
                this.peerIndex.delete(peerID);
                for(const chunkID in info.resources){
                    if(this.chunkIndex.has(chunkID)){
                        let pq = this.chunkIndex.get(chunkID)!;
                        pq.deletePeer(peerID);
                    }
                }
            }
        }
        
        this.uptime = this.updateUptime();
    }

    public async requestChunk(): Promise<void> {
        // await chunk (timelimit + numretries before finding other peer?)
        let currChunk = "";
        const chunksArray = Array.from(this.chunkIndex.keys());
        const randomIndex = Math.floor(Math.random() * chunksArray.length);
        currChunk = chunksArray[randomIndex];
        if (this.resources.has(currChunk)) {
            this.requestChunk();
        }
        else {
            let peerID = this.chunkIndex.get(currChunk)!.get_max();
            await this.peerIndex.get(peerID)!.object.grantChunk(currChunk);
        }
    }

    public async grantChunk(chunkID:string): Promise<Chunk> {
        return false;
    }

    // update anchor threshold? heartbeat?

}


interface QueueNode {
    key: number
    peerID: string
}

class PriorityQueue {
    private arr: QueueNode[] // peerIDs
    private size: number;
    public constructor() {
        this.arr = [{key:Infinity,peerID:""}];
    }

    private parent(i:number):number {
        return Math.floor(i / 2);
    }

    private lChild(i:number):number {
        return 2 * i;
    }

    private rChild(i:number):number {
        return 2 * i + 1;
    }

    public insert(key:number, peerID:string):void {
        this.size += 1;
        this.arr[this.size] = {key:key, peerID:peerID};
        this.heapify_up(this.size);
    }

    public updateValue(peerID:string, newKey:number):void {
        let nodeInd = 1;
        while(this.arr[nodeInd].peerID != peerID){
            nodeInd += 1;
        }
        const pastKey = this.arr[nodeInd].key;
        this.arr[nodeInd].key = newKey;
        if(newKey < pastKey) {
            this.heapify_down(nodeInd);
        }
        if(newKey > pastKey) {
            this.heapify_up(nodeInd);
        }
    }

    public deletePeer(peerID:string):void {
        let nodeInd = 1;
        while(this.arr[nodeInd].peerID != peerID){
            nodeInd += 1;
        }
        this.swap(nodeInd, this.size);
        this.size -= 1;
        this.heapify_down(nodeInd);
    }

    public delete_max():string {
        this.swap(1, this.size);
        this.size -= 1;
        this.heapify_down(1);
        return this.arr[this.size+1].peerID;
    }

    public get_max():string {
        return this.arr[1].peerID;
    }

    private heapify_up(xind: number):void {
        const pind = this.parent(xind);
        if(this.arr[xind].key > this.arr[pind].key) {
            this.swap(xind,pind);
            this.heapify_up(pind);
        }
    }

    private heapify_down(xind: number): void{
        const lind = this.lChild(xind);
        const rind = this.rChild(xind);
        let curr = xind;

        if(lind <= this.size && this.arr[lind].key > this.arr[xind].key){
            curr = lind;
        }
        if(rind <= this.size && this.arr[rind].key > this.arr[xind].key){
            curr = rind;
        }
        if(curr > xind){
            this.swap(curr,xind);
            this.heapify_down(curr);
        }
    }

    private swap(i1:number, i2:number):void {
        const temp: QueueNode = this.arr[i1]
        this.arr[i1] = this.arr[i2];
        this.arr[i2] = temp;
    }
}
