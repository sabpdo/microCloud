import { CacheManifest, ManifestGenerator, CachedResource } from "./cache/manifest-generator";
import { MemoryCache } from "./cache";
import { fetchFromOrigin, OriginFetchResult } from "./cache/origin-fallback";


interface PeerInfo {
    peerID: string;
    lastSeen: number;        // timestamp
    bandwidth: number;       // Mbps
    uptime: number;          // seconds
    availableStorage: number; // MB
    reputation: number;      // float
    cacheManifest: CacheManifest;
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
    private connectionStartTime!: number;
    private connectionEndTime!: number;
    private isConnected!: boolean;

    private chunkIndex: Map<string, PriorityQueue>;
    private uptime: number;

    private cache: MemoryCache<CachedResource>;
    private manifestGen: ManifestGenerator;
    private cacheManifest!: CacheManifest;

    private weights: Weights;

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

        this.uptime = 0;
        this.chunkIndex = new Map();
        this.cache = new MemoryCache();
        this.manifestGen = new ManifestGenerator(peerID, this.cache);

        this.weights = weights;
        
        this.startUptimeTracking();
        this.startRebalancingCycle();
    }

    public async getManifest(): Promise<void> {
        this.cacheManifest = await this.manifestGen.generateManifest();
    }

    // reputation decay over time?
    // only bandwidth, uptime, upload success rate
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
            this.getManifest();
            this.autoFetchResources();
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
                                 cacheManifest: this.cacheManifest,
                                 object: this,
                                }
        return info;
    }

    public addPeer(peer:Peer): void {
        const newPeerInfo:PeerInfo = peer.getPeerInfo();
        this.peerIndex.set(peer.peerID, newPeerInfo);
        for(const resource of newPeerInfo.cacheManifest.resources){
            if(this.chunkIndex.has(resource.resourceHash)){
                this.chunkIndex.get(resource.resourceHash)?.insert(newPeerInfo.reputation, peer.peerID);
            }
            else {
                let pq:PriorityQueue = new PriorityQueue();
                pq.insert(newPeerInfo.reputation, peer.peerID);
                this.chunkIndex.set(resource.resourceHash, pq);
            }
        }
    }

    public updateConnections(): void {
        const now = Date.now();
        const TIMEOUT_THRESHOLD = 30000; // 30 seconds
        
        // temporary verification of connectedness (should use heartbeat)
        for (const [peerID, info] of this.peerIndex.entries()) {
            if (now - info.lastSeen > TIMEOUT_THRESHOLD) {
                this.peerIndex.delete(peerID);
                for(const resource of info.cacheManifest.resources){
                    if(this.chunkIndex.has(resource.resourceHash)){
                        let pq = this.chunkIndex.get(resource.resourceHash)!;
                        pq.deletePeer(peerID);
                    }
                }
            }
        }
        
        this.uptime = this.updateUptime();
    }

    public async requestResource(resourceHash: string): Promise<CachedResource | null> {
        const DEFAULT_MAX_RETRIES = 3;
        const DEFAULT_TIMEOUT = 3000;

        // We already have the resource
        if (this.cache.has(resourceHash)) {
            const cached = this.cache.get(resourceHash)!;
            return cached;
        }

        // No peer has the resource
        if (!this.chunkIndex.has(resourceHash)) {
            console.log(`No peers have resource ${resourceHash}, requesting from origin`);
            const resource = await this.defaultToOrigin(""); // path?
            this.cache.set(resourceHash, resource);
            return resource
        }

        // Getting resource from peers
        for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
            try {
                const peerQueue = this.chunkIndex.get(resourceHash)!;
                
                if (peerQueue.getSize() == 0) {
                    this.chunkIndex.delete(resourceHash)
                    const resource = await this.defaultToOrigin(""); // path?
                    this.cache.set(resourceHash, resource);
                    return resource
                }

                const peerID = peerQueue.get_max();
                const peerInfo = this.peerIndex.get(peerID);
                
                if (!peerInfo) {
                    peerQueue.delete_max(); // Remove invalid peer
                    continue;
                }

                console.log(`Attempt ${attempt + 1}: Requesting ${resourceHash} from peer ${peerID}`);

                const resource = await this.requestWithTimeout(
                    () => peerInfo.object.grantChunk(resourceHash),
                    DEFAULT_TIMEOUT
                );

                if (resource) {
                    this.cache.set(resourceHash, resource);
                    peerInfo.object.recordSuccessfulUpload();
                    console.log(`Successfully received ${resourceHash} from peer ${peerID}`);
                    return resource;
                } else {
                    throw new Error('Peer returned null/undefined');
                }

            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error);

                const peerQueue = this.chunkIndex.get(resourceHash)!;
                const peerID = peerQueue.get_max();
                const peerInfo = this.peerIndex.get(peerID)!;
                peerInfo?.object.recordFailedTransfer();
                
                if (attempt < DEFAULT_MAX_RETRIES - 1) {
                    peerQueue.delete_max();
                }
            }
        }

        // All peer attempts failed, fall back to origin
        console.log(`All peer requests failed for ${resourceHash}, falling back to origin`);
        const resource = await this.defaultToOrigin(""); // path?
        this.cache.set(resourceHash, resource);
        return resource
    }

    private async defaultToOrigin(path:string): Promise<CachedResource>{
        const result:OriginFetchResult = await fetchFromOrigin(path);
        return {
            content:result.content,
            mimeType: result.mimeType,
            timestamp: Math.floor(Date.now() / 1000),
        }
    }

    private async requestWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
        return Promise.race([
            fn(),
            new Promise<T>((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
            )
        ]);
    }

    public async grantChunk(resourceHash:string): Promise<CachedResource | null> {
        try {
            const resource = this.cache.get(resourceHash);
            
            if (!resource) {
                console.warn(`Peer ${this.peerID} does not have resource ${resourceHash}`);
                return null;
            }
            console.log(`Peer ${this.peerID} granted chunk ${resourceHash}`);
            return resource;

        } catch (error) {
            console.error(`Error granting chunk ${resourceHash}:`, error);
            return null;
        }
    }

    public recordSuccessfulUpload(): void {
        this.successfulUploads++;
    }

    public recordFailedTransfer(): void {
        this.failedTransfers++;
    }

    private async autoFetchResources(): Promise<void> {
        const availableResources = Array.from(this.chunkIndex.keys());
        const missingResources = availableResources.filter(hash => !this.cache.has(hash));
        
        if (missingResources.length === 0) {
            return;
        }

        // Sort by the max reputation of peers who have each resource
        const prioritized = missingResources
            .map(hash => ({
                hash,
                maxReputation: this.getMaxReputationForResource(hash)
            }))
            .sort((a, b) => b.maxReputation - a.maxReputation)[0]

        try {
            const resource = await this.requestResource(prioritized.hash);
                
            if (resource) {
                console.log(`Auto-fetched resource ${prioritized.hash}`);
            }
        } catch (error) {
            console.log(`Auto-fetch failed for ${prioritized.hash}:`, error);
        }
    }

    private getMaxReputationForResource(resourceHash: string): number {
        const queue = this.chunkIndex.get(resourceHash);
        if (!queue || queue.getSize() == 0) {
            return 0;
        }
        
        const topPeerID = queue.get_max();
        const peerInfo = this.peerIndex.get(topPeerID);
        return peerInfo?.reputation ?? 0;
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
        this.size = 0;
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

    public getSize(): number {
        return this.size;
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
