# Forensic Chainguard
### A Blockchain-Based Chain of Custody System for Digital Forensic Evidence

---

## Project Description

**Forensic Chainguard** is a blockchain-powered system designed to securely manage the lifecycle of forensic evidence — from collection to transfer, analysis, and final storage.  
Traditional chain-of-custody processes rely heavily on manual records and centralized databases, which can be vulnerable to tampering or human error.

This project uses **Hyperledger Fabric** to ensure that every interaction with an evidence item is **immutable, auditable, and cryptographically verifiable**.  
Each action (check-in, check-out, transfer, or removal) is recorded on the blockchain through a smart contract, providing full traceability and integrity.

At this stage, the smart contract defines the structure and logic interfaces for managing evidence records. The goal is to establish the foundation for our later prototype implementation.

---

## Current Milestone — Smart Contract Draft

This repository currently contains the **draft version** of the chaincode (smart contract).

It includes:
- Core contract file with transaction method signatures (`chainguard.contract.ts`)
- Role-Based Access Control (RBAC) helper (`access.control.ts`)
- Event definitions (`chainguard.events.ts`)
- Data types and transaction input models (`chainguard.types.ts`)
- Project build configuration (`package.json`, `tsconfig.json`)
- *No backend or UI components yet — those will be added in later milestones.*

---

## Architecture Overview

The contract defines a set of key operations that mirror the lifecycle of forensic evidence:

| Transaction | Purpose |
|--------------|----------|
| `CreateEvidence` | Register new evidence; encrypt sensitive fields; emit creation event |
| `CheckOutEvidence` | Allow authorized custodian or analyst to check out evidence |
| `TransferEvidence` | Record hand-off between custodians |
| `CheckInEvidence` | Return evidence to storage; update location/status |
| `RemoveEvidence` | Mark evidence as removed (soft delete, audit preserved) |
| `GetEvidence` | Retrieve current state of evidence record |
| `GetEvidenceHistory` | Retrieve complete audit trail from blockchain |

Each operation will later enforce:
- **Role-based permissions** using Fabric certificate attributes  
- **AES encryption** for sensitive identifiers (e.g., case ID)  
- **Binary storage (protobuf)** for tamper resistance  
- **Event emission** for traceability and integration with monitoring tools  

---

## Dependencies & Setup Instructions

### Prerequisites
- **Node.js** v16 or higher  
- **npm** (or **yarn**)  
- **Hyperledger Fabric 2.x** development environment (e.g., Fabric test network)  

### Steps

1.  **Clone this repository**
    ```bash
    git clone https://github.com/harshithananjyala/cse540-forensic-chainguard.git
    cd forensic-chainguard
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Build TypeScript code**
    ```bash
    npm run build
    ```

4.  **(Optional) Package the chaincode (for deployment)**
    ```bash
    peer lifecycle chaincode package forensic-chainguard.tar.gz \
      --path dist \
      --lang node \
      --label forensic-chainguard_1
    ```

5.  **(Optional) Install & approve (example commands; adapt to your network)**
    ```bash
    # On org peer
    peer lifecycle chaincode install forensic-chainguard.tar.gz
    
    # Query installed to get PACKAGE_ID
    peer lifecycle chaincode queryinstalled
    
    # Approve (replace <PACKAGE_ID>, channel name, and sequence)
    peer lifecycle chaincode approveformyorg \
      --channelID mychannel \
      --name chainguard \
      --version 1.0 \
      --package-id <PACKAGE_ID> \
      --sequence 1
      
    # Commit
    peer lifecycle chaincode commit \
      --channelID mychannel \
      --name chainguard \
      --version 1.0 \
      --sequence 1 \
      --peerAddresses localhost:7051 \
      --orderer localhost:7050
    ```

6.  **(Optional) Invoke a draft method (will return a draft error by design)**
    ```bash
    peer chaincode invoke -C mychannel -n chainguard -c \
      '{"function":"CreateEvidence","Args":["{\"evidenceId\":\"EV123\",\"caseId\":\"CASE45\"}"]}'
    
    # Expected: "DRAFT: Not implemented"
    ```

**Note:** Deployment commands above are placeholders to show intent; final scripts will be provided in the implementation phase.

## How to Use (Draft Stage)
At this milestone, only the function signatures and comments are available — not full implementations.

The chaincode exports one main contract: `ForensicChainguardContract`

Future usage (via Fabric CLI or SDK) will follow the pattern shown in Step 6 above, passing a single JSON string as the transaction argument for simplicity.

## Next Steps
- Implement full logic for lifecycle transactions
- Integrate AES encryption and transient data handling
- Enforce RBAC using certificate attributes
- Add querying (composite keys) and emission of events

## Authors / Contributors
- **Kruthi Tirunagari** - Blockchain & Security Specialist
- **Ashish Nadadur Chakravarthi** - Blockchain & Smart Contract Developer
- **Shashank Gadipally** - System Admin
- **Sree Sai Harshitha Nanjyala** - Frontend & Smart Contract Developer
- **Sri Sai Chetana Reddy Janagan** - Testing & Validation

## License
This project is released under the Apache-2.0 License.

## Summary
Forensic Chainguard lays the groundwork for a trustworthy, tamper-proof evidence management system that combines cryptographic security with the transparency of blockchain.

This draft represents the first technical milestone — defining the foundation for what will become a fully working Hyperledger Fabric application in later stages.