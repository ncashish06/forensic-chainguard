"use strict";
/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forensic Chainguard — Evidence Lifecycle Contract
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForensicContract = void 0;
const fabric_contract_api_1 = require("fabric-contract-api");
// --- Contract ----------------------------------------------------------
let ForensicContract = class ForensicContract extends fabric_contract_api_1.Contract {
    // ------------- helpers: keys / state / time -------------------------
    evidenceKey(ctx, evidenceId) {
        return ctx.stub.createCompositeKey("EVIDENCE", [evidenceId]);
    }
    evidenceEventKey(ctx, evidenceId, txId) {
        // We use txId as a unique event id.
        return ctx.stub.createCompositeKey("EVIDENCE_EVENT", [evidenceId, txId]);
    }
    async put(ctx, key, value) {
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(value)));
    }
    async get(ctx, key) {
        const b = await ctx.stub.getState(key);
        if (!b || b.length === 0)
            return undefined;
        return JSON.parse(b.toString());
    }
    now(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        return Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1e6);
    }
    // ------------- helpers: auth / events -------------------------------
    assertRole(role, allowed) {
        if (!role) {
            throw new Error(`ACCESS_DENIED: missing role; allowed roles: ${allowed.join(", ")}`);
        }
        if (!allowed.includes(role)) {
            throw new Error(`ACCESS_DENIED: role '${role}' not allowed; allowed roles: ${allowed.join(", ")}`);
        }
    }
    async appendEvent(ctx, evidenceId, event) {
        const txId = ctx.stub.getTxID();
        const key = this.evidenceEventKey(ctx, evidenceId, txId);
        const fullEvent = Object.assign({ evidenceId,
            txId }, event);
        await this.put(ctx, key, fullEvent);
    }
    // ------------- READ METHODS -----------------------------------------
    async GetEvidence(ctx, evidenceId) {
        const key = this.evidenceKey(ctx, evidenceId);
        const rec = await this.get(ctx, key);
        if (!rec)
            throw new Error(`NOT_FOUND: evidence '${evidenceId}'`);
        return JSON.stringify(rec);
    }
    async GetEvidenceHistory(ctx, evidenceId) {
        var _a, _b, _c;
        const key = this.evidenceKey(ctx, evidenceId);
        const iter = await ctx.stub.getHistoryForKey(key);
        const out = [];
        for (let res = await iter.next(); !res.done; res = await iter.next()) {
            const r = res.value;
            const ts = Number((_a = r.timestamp) === null || _a === void 0 ? void 0 : _a.seconds) * 1000 +
                Math.floor(((_c = (_b = r.timestamp) === null || _b === void 0 ? void 0 : _b.nanos) !== null && _c !== void 0 ? _c : 0) / 1e6);
            const value = r.isDelete
                ? undefined
                : JSON.parse(r.value.toString());
            out.push({ txId: r.txId, timestamp: ts, isDelete: r.isDelete, value });
        }
        await iter.close();
        return JSON.stringify(out);
    }
    async GetEvidenceEvents(ctx, evidenceId) {
        const iter = await ctx.stub.getStateByPartialCompositeKey("EVIDENCE_EVENT", [evidenceId]);
        const events = [];
        for (let res = await iter.next(); !res.done; res = await iter.next()) {
            const value = JSON.parse(res.value.value.toString());
            events.push(value);
        }
        await iter.close();
        // sort by timestamp just to be nice
        events.sort((a, b) => a.timestamp - b.timestamp);
        return JSON.stringify(events);
    }
    // ------------- WRITE METHODS ----------------------------------------
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
    async CreateEvidence(ctx, inputJson) {
        const input = JSON.parse(inputJson);
        if (!(input === null || input === void 0 ? void 0 : input.evidenceId) || !(input === null || input === void 0 ? void 0 : input.caseIdHash)) {
            throw new Error("VALIDATION_ERROR: evidenceId and caseIdHash are required");
        }
        // simple role-based authorization
        this.assertRole(input.role, ["ForensicTechnician", "EvidenceManager"]);
        const key = this.evidenceKey(ctx, input.evidenceId);
        const exists = await this.get(ctx, key);
        if (exists)
            throw new Error(`ALREADY_EXISTS: '${input.evidenceId}'`);
        const now = this.now(ctx);
        const createdBy = input.performedBy || input.createdBy || "unknown";
        const rec = {
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
    async CheckInEvidence(ctx, inputJson) {
        const input = JSON.parse(inputJson);
        if (!(input === null || input === void 0 ? void 0 : input.evidenceId)) {
            throw new Error("VALIDATION_ERROR: evidenceId is required");
        }
        this.assertRole(input.role, ["ForensicTechnician", "EvidenceManager"]);
        const key = this.evidenceKey(ctx, input.evidenceId);
        const rec = await this.get(ctx, key);
        if (!rec)
            throw new Error(`NOT_FOUND: evidence '${input.evidenceId}'`);
        if (rec.status === "REMOVED") {
            throw new Error(`INVALID_STATE: evidence '${input.evidenceId}' removed`);
        }
        const now = this.now(ctx);
        const performedBy = input.performedBy || "unknown";
        rec.status = "CHECKED_IN";
        rec.currentCustodian = input.custodian || rec.currentCustodian || performedBy;
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
    async TransferEvidence(ctx, inputJson) {
        const input = JSON.parse(inputJson);
        if (!(input === null || input === void 0 ? void 0 : input.evidenceId) || !(input === null || input === void 0 ? void 0 : input.toCustodian)) {
            throw new Error("VALIDATION_ERROR: evidenceId and toCustodian are required");
        }
        // Only EvidenceManager can transfer in this simple demo
        this.assertRole(input.role, ["EvidenceManager"]);
        const key = this.evidenceKey(ctx, input.evidenceId);
        const rec = await this.get(ctx, key);
        if (!rec)
            throw new Error(`NOT_FOUND: evidence '${input.evidenceId}'`);
        if (rec.status === "REMOVED") {
            throw new Error(`INVALID_STATE: evidence '${input.evidenceId}' removed`);
        }
        const now = this.now(ctx);
        const performedBy = input.performedBy || "unknown";
        const fromCustodian = input.fromCustodian || rec.currentCustodian || "unknown";
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
    async RemoveEvidence(ctx, inputJson) {
        const input = JSON.parse(inputJson);
        if (!(input === null || input === void 0 ? void 0 : input.evidenceId)) {
            throw new Error("VALIDATION_ERROR: evidenceId is required");
        }
        this.assertRole(input.role, ["EvidenceManager"]);
        const key = this.evidenceKey(ctx, input.evidenceId);
        const rec = await this.get(ctx, key);
        if (!rec)
            throw new Error(`NOT_FOUND: evidence '${input.evidenceId}'`);
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
};
exports.ForensicContract = ForensicContract;
__decorate([
    (0, fabric_contract_api_1.Transaction)(false),
    (0, fabric_contract_api_1.Returns)("string"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "GetEvidence", null);
__decorate([
    (0, fabric_contract_api_1.Transaction)(false),
    (0, fabric_contract_api_1.Returns)("string"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "GetEvidenceHistory", null);
__decorate([
    (0, fabric_contract_api_1.Transaction)(false),
    (0, fabric_contract_api_1.Returns)("string"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "GetEvidenceEvents", null);
__decorate([
    (0, fabric_contract_api_1.Transaction)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "CreateEvidence", null);
__decorate([
    (0, fabric_contract_api_1.Transaction)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "CheckInEvidence", null);
__decorate([
    (0, fabric_contract_api_1.Transaction)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "TransferEvidence", null);
__decorate([
    (0, fabric_contract_api_1.Transaction)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [fabric_contract_api_1.Context, String]),
    __metadata("design:returntype", Promise)
], ForensicContract.prototype, "RemoveEvidence", null);
exports.ForensicContract = ForensicContract = __decorate([
    (0, fabric_contract_api_1.Info)({
        title: "ForensicChainguardContract",
        description: "Evidence lifecycle contract with role checks, events, and image hash tracking",
    })
], ForensicContract);
