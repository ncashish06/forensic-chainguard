/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * RBAC:
 * - Update X.509 certs with attribute `role`
 * - Verify allowed roles in state-changing transactions
 */

import { Context } from "fabric-contract-api";

export type Role =
  | "evidence_collector"
  | "custodian"
  | "lab_analyst"
  | "auditor"
  | "admin";

const ROLE_ATTR = "role";

export function getClientIdentity(ctx: Context) {
  const cid = ctx.clientIdentity;
  return {
    mspId: cid.getMSPID(),
    id: cid.getID(),
    role: cid.getAttributeValue(ROLE_ATTR) as Role | undefined,
  };
}

export function requireRole(ctx: Context, allowed: Role[]) {
  const { role } = getClientIdentity(ctx);
  if (!role || !allowed.includes(role)) {
    throw new Error(`Permission denied. Required role: ${allowed.join(", ")}`);
  }
}
