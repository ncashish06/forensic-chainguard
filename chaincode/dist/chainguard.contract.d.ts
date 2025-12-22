import { Context, Contract } from "fabric-contract-api";
export type EvidenceStatus = "CREATED" | "CHECKED_IN" | "TRANSFERRED" | "REMOVED";
export interface EvidenceRecord {
    evidenceId: string;
    caseIdHash: string;
    description?: string;
    status: EvidenceStatus;
    imageHash?: string;
    imageFilename?: string;
    createdBy: string;
    role: string;
    currentCustodian?: string;
    createdAt: number;
    updatedAt: number;
}
export declare class ForensicContract extends Contract {
    private evidenceKey;
    private evidenceEventKey;
    private put;
    private get;
    private now;
    private assertRole;
    private appendEvent;
    GetEvidence(ctx: Context, evidenceId: string): Promise<string>;
    GetEvidenceHistory(ctx: Context, evidenceId: string): Promise<string>;
    GetEvidenceEvents(ctx: Context, evidenceId: string): Promise<string>;
    /**
     * Create a new evidence record.
     *
     * inputJson (stringified JSON) should look like:
     * {
     *   "evidenceId": "test1",
     *   "caseIdHash": "...",
     *   "description": "mobile phone",
     *   "imageHash": "sha256...",
     *   "imageFilename": "1234-phone.png",
     *   "createdBy": "alice",        // from your backend -> performedBy
     *   "role": "ForensicTechnician",
     *   "cert": { "subject": "...", "issuer": "DemoCA" } // optional
     * }
     *
     * Your backend already sends: evidenceId, caseIdHash, description,
     * imageHash, imageFilename, createdBy, role.
     */
    CreateEvidence(ctx: Context, inputJson: string): Promise<void>;
    /**
     * Check in evidence (e.g., back into storage or lab).
     *
     * inputJson:
     * {
     *   "evidenceId": "test1",
     *   "custodian": "Lab A",
     *   "performedBy": "alice",
     *   "role": "ForensicTechnician",
     *   "notes": "Returned to lab fridge"
     * }
     */
    CheckInEvidence(ctx: Context, inputJson: string): Promise<void>;
    /**
     * Transfer evidence between custodians.
     *
     * inputJson:
     * {
     *   "evidenceId": "test1",
     *   "fromCustodian": "Lab A",
     *   "toCustodian": "Courtroom",
     *   "performedBy": "bob",
     *   "role": "EvidenceManager",
     *   "notes": "Transported for hearing"
     * }
     */
    TransferEvidence(ctx: Context, inputJson: string): Promise<void>;
    /**
     * Mark evidence as removed (e.g., destroyed or archived off-chain).
     *
     * inputJson:
     * {
     *   "evidenceId": "test1",
     *   "performedBy": "bob",
     *   "role": "EvidenceManager",
     *   "notes": "Disposed after retention period"
     * }
     */
    RemoveEvidence(ctx: Context, inputJson: string): Promise<void>;
}
