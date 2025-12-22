const path = require("path");
const fs = require("fs");
const { Gateway, Wallets } = require("fabric-network");

const CHANNEL_NAME = "forensic-chainguard";
const CHAINCODE_NAME = "chainguard";
const MSP_ID = "Org1MSP";
const USER_ID = "User1"; // identity name in wallet

const ccpPath = path.join(__dirname, "config", "connection-org1.json");
const walletPath = path.join(__dirname, "config", "wallet");

async function ensureIdentityInWallet() {
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  const existing = await wallet.get(USER_ID);
  if (existing) {
    return wallet;
  }

  const userFolder = path.join(walletPath, USER_ID);
  const certPath = path.join(userFolder, "cert.pem");
  const keyPath = path.join(userFolder, "key.pem");

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      `cert.pem or key.pem not found in ${userFolder}. ` +
        "Make sure you copied them from User1@org1.example.com/msp."
    );
  }
  const cert = fs.readFileSync(certPath).toString();
  const key = fs.readFileSync(keyPath).toString();

  const identity = {
    credentials: {
      certificate: cert,
      privateKey: key,
    },
    mspId: MSP_ID,
    type: "X.509",
  };

  await wallet.put(USER_ID, identity);
  console.log(`Success: Added identity "${USER_ID}" to wallet`);

  return wallet;
}

async function getGateway() {
  const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
  const wallet = await ensureIdentityInWallet();

  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: USER_ID,
    discovery: { enabled: true, asLocalhost: true },
  });

  return gateway;
}

async function withContract(fn) {
  const gateway = await getGateway();
  try {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);
    return await fn(contract);
  } finally {
    gateway.disconnect();
  }
}

// Create evidence on the ledger
async function createEvidenceOnChain(evidenceData) {
  return withContract(async (contract) => {
    const payload = JSON.stringify(evidenceData);
    const result = await contract.submitTransaction("CreateEvidence", payload);
    return result.toString();
  });
}

// Get a single evidence record by its ID
async function getEvidenceFromChain(evidenceId) {
  return withContract(async (contract) => {
    const result = await contract.evaluateTransaction(
      "GetEvidence",
      evidenceId
    );
    if (!result || !result.length) {
      throw new Error(`Evidence ${evidenceId} not found on chain`);
    }
    return JSON.parse(result.toString());
  });
}

async function getEvidenceHistoryFromChain(evidenceId) {
  return withContract(async (contract) => {
    const result = await contract.evaluateTransaction(
      "GetEvidenceHistory",
      evidenceId
    );
    return JSON.parse(result.toString());
  });
}

async function getEvidenceEventsFromChain(evidenceId) {
  return withContract(async (contract) => {
    const result = await contract.evaluateTransaction(
      "GetEvidenceEvents",
      evidenceId
    );
    if (!result || !result.length) {
      return [];
    }
    return JSON.parse(result.toString());
  });
}

async function submitEvidenceActionOnChain(actionName, payloadObj) {
  return withContract(async (contract) => {
    const payload = JSON.stringify(payloadObj);
    const result = await contract.submitTransaction(actionName, payload);
    return result.toString();
  });
}

module.exports = {
  createEvidenceOnChain,
  getEvidenceFromChain,
  getEvidenceHistoryFromChain,
  getEvidenceEventsFromChain,
  submitEvidenceActionOnChain,
};
