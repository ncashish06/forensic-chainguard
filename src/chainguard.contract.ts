/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forensic Chainguard — Evidence Lifecycle Contract
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";

export type EvidenceStatus =
  | "CREATED"
  | "CHECKED_IN"
  | "TRANSFERRED"
  | "REMOVED";

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

interface CertInfo {
  subject?: string;
  issuer?: string;
}

interface BaseActionInput {
  performedBy?: string;
  role?: string;
  cert?: CertInfo;
  notes?: string;
}

interface CreateEvidenceInput extends BaseActionInput {
  evidenceId: string;
  caseIdHash: string;
  description?: string;
  imageHash?: string;
  imageFilename?: string;
  currentCustodian?: string;
  createdBy?: string;
}

interface CheckInInput extends BaseActionInput {
  evidenceId: string;
  custodian?: string;
}

interface TransferInput extends BaseActionInput {
  evidenceId: string;
  fromCustodian?: string;
  toCustodian: string;
}

interface RemoveInput extends BaseActionInput {
  evidenceId: string;
}

interface EvidenceEvent {
  evidenceId: string;
  eventType: EvidenceStatus;
  timestamp: number;
  performedBy: string;
  role: string;
  notes?: string;
  fromCustodian?: string;
  toCustodian?: string;
  imageHash?: string;
  imageFilename?: string;
  cert?: CertInfo;
  txId: string;
}

@Info({
  title: "ForensicChainguardContract",
  description:
    "Evidence lifecycle contract with role checks, events, and image hash tracking",
})
export class ForensicContract extends Contract {
  private evidenceKey(ctx: Context, evidenceId: string): string {
    return ctx.stub.createCompositeKey("EVIDENCE", [evidenceId]);
  }

  private evidenceEventKey(ctx: Context, evidenceId: string, txId: string) {
    // txId is a unique event id
    return ctx.stub.createCompositeKey("EVIDENCE_EVENT", [evidenceId, txId]);
  }

  private async put<T>(ctx: Context, key: string, value: T) {
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(value)));
  }

  private async get<T>(ctx: Context, key: string): Promise<T | undefined> {
    const b = await ctx.stub.getState(key);
    if (!b || b.length === 0) return undefined;
    return JSON.parse(b.toString()) as T;
  }

  private now(ctx: Context): number {
    const ts = ctx.stub.getTxTimestamp();
    return Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1e6);
  }

  private assertRole(role: string | undefined, allowed: string[]): void {
    if (!role) {
      throw new Error(
        `ACCESS_DENIED: missing role; allowed roles: ${allowed.join(", ")}`
      );
    }
    if (!allowed.includes(role)) {
      throw new Error(
        `ACCESS_DENIED: role '${role}' not allowed; allowed roles: ${allowed.join(
          ", "
        )}`
      );
    }
  }

  private async appendEvent(
    ctx: Context,
    evidenceId: string,
    event: Omit<EvidenceEvent, "evidenceId" | "txId">
  ) {
    const txId = ctx.stub.getTxID();
    const key = this.evidenceEventKey(ctx, evidenceId, txId);
    const fullEvent: EvidenceEvent = {
      evidenceId,
      txId,
      ...event,
    };
    await this.put(ctx, key, fullEvent);
  }

  // Read operations
  @Transaction(false)
  @Returns("string")
  public async GetEvidence(ctx: Context, evidenceId: string): Promise<string> {
    const key = this.evidenceKey(ctx, evidenceId);
    const rec = await this.get<EvidenceRecord>(ctx, key);
    if (!rec) throw new Error(`NOT_FOUND: evidence '${evidenceId}'`);
    return JSON.stringify(rec);
  }

  @Transaction(false)
  @Returns("string")
  public async GetEvidenceHistory(
    ctx: Context,
    evidenceId: string
  ): Promise<string> {
    const key = this.evidenceKey(ctx, evidenceId);
    const iter = await ctx.stub.getHistoryForKey(key);

    const out: Array<{
      txId: string;
      timestamp: number;
      isDelete: boolean;
      value?: EvidenceRecord;
    }> = [];
    for (let res = await iter.next(); !res.done; res = await iter.next()) {
      const r = res.value;
      const ts =
        Number(r.timestamp?.seconds) * 1000 +
        Math.floor((r.timestamp?.nanos ?? 0) / 1e6);
      const value = r.isDelete
        ? undefined
        : (JSON.parse(r.value.toString()) as EvidenceRecord);
      out.push({ txId: r.txId, timestamp: ts, isDelete: r.isDelete, value });
    }
    await iter.close();

    return JSON.stringify(out);
  }

  @Transaction(false)
  @Returns("string")
  public async GetEvidenceEvents(
    ctx: Context,
    evidenceId: string
  ): Promise<string> {
    const iter = await ctx.stub.getStateByPartialCompositeKey(
      "EVIDENCE_EVENT",
      [evidenceId]
    );

    const events: EvidenceEvent[] = [];
    for (let res = await iter.next(); !res.done; res = await iter.next()) {
      const value = JSON.parse(res.value.value.toString()) as EvidenceEvent;
      events.push(value);
    }
    await iter.close();

    events.sort((a, b) => a.timestamp - b.timestamp);
    return JSON.stringify(events);
  }

  // Write operations
  @Transaction()
  public async CreateEvidence(ctx: Context, inputJson: string): Promise<void> {
    const input = JSON.parse(inputJson) as CreateEvidenceInput;

    if (!input?.evidenceId || !input?.caseIdHash) {
      throw new Error(
        "VALIDATION_ERROR: evidenceId and caseIdHash are required"
      );
    }

    // RBAC
    this.assertRole(input.role, ["ForensicTechnician", "EvidenceManager"]);

    const key = this.evidenceKey(ctx, input.evidenceId);
    const exists = await this.get<EvidenceRecord>(ctx, key);
    if (exists) throw new Error(`ALREADY_EXISTS: '${input.evidenceId}'`);

    const now = this.now(ctx);
    const createdBy = input.performedBy || input.createdBy || "unknown";

    const rec: EvidenceRecord = {
      evidenceId: input.evidenceId,
      caseIdHash: input.caseIdHash,
      description: input.description,
      status: "CREATED",
      imageHash: input.imageHash,
      imageFilename: input.imageFilename,
      createdBy,
      role: input.role || "Unknown",
      currentCustodian: input.currentCustodian || createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await this.put(ctx, key, rec);

    await this.appendEvent(ctx, input.evidenceId, {
      eventType: "CREATED",
      timestamp: now,
      performedBy: createdBy,
      role: rec.role,
      notes: input.notes || rec.description,
      imageHash: input.imageHash,
      imageFilename: input.imageFilename,
      cert: input.cert,
    });
  }

  // Check in evidence (e.g., back into storage or lab).
  @Transaction()
  public async CheckInEvidence(ctx: Context, inputJson: string): Promise<void> {
    const input = JSON.parse(inputJson) as CheckInInput;

    if (!input?.evidenceId) {
      throw new Error("VALIDATION_ERROR: evidenceId is required");
    }

    this.assertRole(input.role, ["ForensicTechnician", "EvidenceManager"]);

    const key = this.evidenceKey(ctx, input.evidenceId);
    const rec = await this.get<EvidenceRecord>(ctx, key);
    if (!rec) throw new Error(`NOT_FOUND: evidence '${input.evidenceId}'`);
    if (rec.status === "REMOVED") {
      throw new Error(`INVALID_STATE: evidence '${input.evidenceId}' removed`);
    }

    const now = this.now(ctx);
    const performedBy = input.performedBy || "unknown";

    rec.status = "CHECKED_IN";
    rec.currentCustodian =
      input.custodian || rec.currentCustodian || performedBy;
    rec.role = input.role || rec.role;
    rec.updatedAt = now;

    await this.put(ctx, key, rec);

    await this.appendEvent(ctx, input.evidenceId, {
      eventType: "CHECKED_IN",
      timestamp: now,
      performedBy,
      role: rec.role,
      notes: input.notes,
      toCustodian: rec.currentCustodian,
      cert: input.cert,
    });
  }

  // Transfer evidence between custodians
  @Transaction()
  public async TransferEvidence(
    ctx: Context,
    inputJson: string
  ): Promise<void> {
    const input = JSON.parse(inputJson) as TransferInput;

    if (!input?.evidenceId || !input?.toCustodian) {
      throw new Error(
        "VALIDATION_ERROR: evidenceId and toCustodian are required"
      );
    }

    // Only EvidenceManager can transfer
    this.assertRole(input.role, ["EvidenceManager"]);

    const key = this.evidenceKey(ctx, input.evidenceId);
    const rec = await this.get<EvidenceRecord>(ctx, key);
    if (!rec) throw new Error(`NOT_FOUND: evidence '${input.evidenceId}'`);
    if (rec.status === "REMOVED") {
      throw new Error(`INVALID_STATE: evidence '${input.evidenceId}' removed`);
    }

    const now = this.now(ctx);
    const performedBy = input.performedBy || "unknown";
    const fromCustodian =
      input.fromCustodian || rec.currentCustodian || "unknown";

    rec.status = "TRANSFERRED";
    rec.currentCustodian = input.toCustodian;
    rec.role = input.role || rec.role;
    rec.updatedAt = now;

    await this.put(ctx, key, rec);

    await this.appendEvent(ctx, input.evidenceId, {
      eventType: "TRANSFERRED",
      timestamp: now,
      performedBy,
      role: rec.role,
      fromCustodian,
      toCustodian: input.toCustodian,
      notes: input.notes,
      cert: input.cert,
    });
  }

  // Mark evidence as removed (e.g., destroyed or archived off-chain)
  @Transaction()
  public async RemoveEvidence(ctx: Context, inputJson: string): Promise<void> {
    const input = JSON.parse(inputJson) as RemoveInput;

    if (!input?.evidenceId) {
      throw new Error("VALIDATION_ERROR: evidenceId is required");
    }

    this.assertRole(input.role, ["EvidenceManager"]);

    const key = this.evidenceKey(ctx, input.evidenceId);
    const rec = await this.get<EvidenceRecord>(ctx, key);
    if (!rec) throw new Error(`NOT_FOUND: evidence '${input.evidenceId}'`);

    const now = this.now(ctx);
    const performedBy = input.performedBy || "unknown";

    rec.status = "REMOVED";
    rec.role = input.role || rec.role;
    rec.updatedAt = now;

    await this.put(ctx, key, rec);

    await this.appendEvent(ctx, input.evidenceId, {
      eventType: "REMOVED",
      timestamp: now,
      performedBy,
      role: rec.role,
      notes: input.notes,
      cert: input.cert,
    });
  }
}
