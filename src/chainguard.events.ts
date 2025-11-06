/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * Event definitions for lifecycle notifications (draft)
 * Always emit hashes: never raw caseId
 */

export const EVENTS = {
  CREATED: "evidence.created",
  CHECKED_OUT: "evidence.checked_out",
  TRANSFERRED: "evidence.transferred",
  CHECKED_IN: "evidence.checked_in",
  REMOVED: "evidence.removed",
} as const;

export type EvidenceEventPayload = {
  evidenceId: string; // world-state key
  caseIdHash: string; // hash; not raw caseId
  actor: string; // MSPID:ID
  timestamp: number;
};
