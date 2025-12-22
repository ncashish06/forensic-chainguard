const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const cors = require("cors");
const morgan = require("morgan");

const {
  createEvidenceOnChain,
  getEvidenceFromChain,
  getEvidenceEventsFromChain,
  submitEvidenceActionOnChain,
} = require("./fabricClient");

const app = express();
const PORT = 3000;

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use(express.static(FRONTEND_DIR)); // frontend static files
app.use("/images", express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniquePrefix = Date.now();
    const safeOriginalName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${uniquePrefix}-${safeOriginalName}`);
  },
});

const upload = multer({ storage });

// SHA-256 hash of evidence image
function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => reject(err));
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/evidence", upload.single("image"), async (req, res) => {
  try {
    const { evidenceId, caseId, description, role, userId } = req.body;
    const file = req.file;

    if (!evidenceId || !caseId) {
      return res.status(400).json({
        error: "evidenceId and caseId are required",
      });
    }

    if (!file) {
      return res.status(400).json({
        error: "Image file is required",
      });
    }

    const imagePath = file.path;
    const imageFilename = file.filename;

    const imageHash = await hashFileSha256(imagePath); // Hash of the image file
    const caseIdHash = crypto.createHash("sha256").update(caseId).digest("hex"); // Hash of caseId to store on chain (for privacy)
    const createdBy = userId || "demoUser"; // in real system, this would be cert identity

    // chaincode object
    const evidenceData = {
      evidenceId,
      caseIdHash,
      description: description || "",
      imageHash,
      imageFilename, // local image name with timestamp
      createdBy,
      role: role || "Unknown",
    };

    await createEvidenceOnChain(evidenceData); // submit to fabric network

    res.status(201).json({
      message: "Evidence created successfully",
      evidenceId,
      imageHash,
      imageFilename,
    });
  } catch (err) {
    console.error("Error in /api/evidence:", err);
    res.status(500).json({
      error: "Failed to create evidence",
      details: err.message,
    });
  }
});

/*
 * Reads from blockchain, recomputes local image hash, compares, and returns tamper info.
 */
app.get("/api/evidence/:id", async (req, res) => {
  const evidenceId = req.params.id;

  try {
    const evidence = await getEvidenceFromChain(evidenceId); // query ledger

    const hashOnChain = evidence.imageHash;
    const imageFilename = evidence.imageFilename;

    let hashLocal = null;
    let tampered = null;
    let imageExists = false;

    if (imageFilename) {
      const imagePath = path.join(UPLOADS_DIR, imageFilename);
      if (fs.existsSync(imagePath)) {
        imageExists = true;
        hashLocal = await hashFileSha256(imagePath);
        tampered = hashOnChain && hashLocal ? hashOnChain !== hashLocal : null;
      } else {
        imageExists = false;
        tampered = null;
      }
    }

    res.json({
      evidence,
      hashOnChain,
      hashLocal,
      imageExists,
      tampered,
      imageUrl: imageExists ? `/images/${imageFilename}` : null,
    });
  } catch (err) {
    console.error("Error in GET /api/evidence/:id", err);
    res.status(500).json({
      error: "Failed to fetch evidence",
      details: err.message,
    });
  }
});

app.post("/api/evidence/:id/action", async (req, res) => {
  const evidenceId = req.params.id;
  const {
    actionType,
    role,
    userId,
    custodian,
    fromCustodian,
    toCustodian,
    notes,
  } = req.body || {};

  if (!actionType) {
    return res.status(400).json({ error: "actionType is required" });
  }

  try {
    let txName;
    let payload;

    const performedBy = userId || "demoUser";

    switch (actionType) {
      case "CHECKIN":
        txName = "CheckInEvidence";
        payload = {
          evidenceId,
          custodian,
          performedBy,
          role,
          notes,
        };
        break;

      case "TRANSFER":
        txName = "TransferEvidence";
        if (!toCustodian) {
          return res
            .status(400)
            .json({ error: "toCustodian is required for TRANSFER" });
        }
        payload = {
          evidenceId,
          fromCustodian,
          toCustodian,
          performedBy,
          role,
          notes,
        };
        break;

      case "REMOVE":
        txName = "RemoveEvidence";
        payload = {
          evidenceId,
          performedBy,
          role,
          notes,
        };
        break;

      default:
        return res
          .status(400)
          .json({ error: `Unknown actionType '${actionType}'` });
    }

    await submitEvidenceActionOnChain(txName, payload);

    res.json({
      message: `Action ${actionType} applied to evidence '${evidenceId}'`,
    });
  } catch (err) {
    console.error("Error in POST /api/evidence/:id/action", err);
    res.status(500).json({
      error: "Failed to apply evidence action",
      details: err.message,
    });
  }
});

// Returns lifecycle events for the given evidence ID.
app.get("/api/evidence/:id/events", async (req, res) => {
  const evidenceId = req.params.id;

  try {
    const events = await getEvidenceEventsFromChain(evidenceId);
    res.json({ evidenceId, events });
  } catch (err) {
    console.error("Error in GET /api/evidence/:id/events", err);
    res.status(500).json({
      error: "Failed to fetch evidence events",
      details: err.message,
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
