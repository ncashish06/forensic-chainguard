/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * JSON objects for transaction arguments (draft)
 * Can be passed as a single JSON string argument in CLI
 */

export type CreateEvidenceInput = {
  evidenceId: string; // Unique key per channel (plaintext key)
  caseId: string; // Sensitive; will be AES-encrypted before storage
  description?: string;
  location?: string;
};

export type CheckoutInput = {
  evidenceId: string;
  notes?: string;
};

export type TransferInput = {
  evidenceId: string;
  newCustodian: string; // MSPID:Subject
  notes?: string;
};

export type CheckinInput = {
  evidenceId: string;
  location?: string;
  notes?: string;
};

export type RemoveInput = {
  evidenceId: string;
  reason?: string; // For audit
};
