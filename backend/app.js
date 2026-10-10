import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("./.env", import.meta.url)) });

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Reuse the connection across requests, including Vercel cold starts.
let connectionPromise;
export const connectDB = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MongoDB connection is not configured.");
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    }).finally(() => {
      connectionPromise = undefined;
    });
  }
  await connectionPromise;
};

app.get("/api/health", async (req, res) => {
  try {
    await connectDB();
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({
      error: "Database unavailable. MONGO_URI aur MongoDB Atlas network access check karein."
    });
  }
});

app.use("/api", async (req, res, next) => {
  try {
    // Wait for the initial connection instead of rejecting the first submit.
    await connectDB();
    next();
  } catch {
    res.status(503).json({
      error: "Report save nahi hua: database unavailable. MONGO_URI aur MongoDB Atlas network access check karein."
    });
  }
});

// =================== SCHEMAS & MODELS ===================
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    employeeId: { type: String, required: true, unique: true },
    role: { type: String, default: "Operator" },
    faceDescriptor: { type: [Number], required: true }
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

const breakdownReportSchema = new mongoose.Schema(
  {
    reportDate: { type: String, required: true, index: true },
    shift: { type: String, required: true },
    totalDownTime: { type: Number, default: 0 },
    totalManPower: { type: Number, default: 0 },
    entries: { type: Array, default: [] }
  },
  { timestamps: true }
);

const BreakdownReport =
  mongoose.models.BreakdownReport || mongoose.model("BreakdownReport", breakdownReportSchema);

// =================== AUTH ROUTES ===================
// 1. Register / Update Face
app.post("/api/auth/register-face", async (req, res) => {
  try {
    const { name, employeeId, role, faceDescriptor } = req.body;
    if (!name || !employeeId || !faceDescriptor) {
      return res.status(400).json({ error: "Name, Employee ID, aur Face Scan zaroori hain." });
    }

    const existingUser = await User.findOne({ employeeId });
    if (existingUser) {
      existingUser.name = name;
      existingUser.role = role || existingUser.role;
      existingUser.faceDescriptor = faceDescriptor;
      await existingUser.save();
      return res.json({ message: "Employee face updated successfully!", user: existingUser });
    }

    const newUser = new User({ name, employeeId, role, faceDescriptor });
    await newUser.save();
    res.status(201).json({ message: "Employee registered successfully!", user: newUser });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Face Login (Euclidean Distance Match)
app.post("/api/auth/login-face", async (req, res) => {
  try {
    const { scannedDescriptor } = req.body;
    if (!scannedDescriptor || scannedDescriptor.length === 0) {
      return res.status(400).json({ error: "Face descriptor required." });
    }

    const users = await User.find({}).lean();
    if (users.length === 0) {
      return res.status(404).json({ error: "Koi registered employee nahi mila. Pehle register karein." });
    }

    let matchedUser = null;
    let minDistance = 1.0;
    const THRESHOLD = 0.52;

    users.forEach((user) => {
      if (!user.faceDescriptor || user.faceDescriptor.length !== scannedDescriptor.length) return;

      let distance = 0;
      for (let i = 0; i < scannedDescriptor.length; i++) {
        const diff = scannedDescriptor[i] - user.faceDescriptor[i];
        distance += diff * diff;
      }
      distance = Math.sqrt(distance);

      if (distance < minDistance) {
        minDistance = distance;
        matchedUser = user;
      }
    });

    if (minDistance <= THRESHOLD && matchedUser) {
      res.json({
        success: true,
        matchDistance: minDistance.toFixed(3),
        user: {
          name: matchedUser.name,
          employeeId: matchedUser.employeeId,
          role: matchedUser.role
        }
      });
    } else {
      res.status(401).json({
        success: false,
        error: "Face match nahi hua! Kripya sahi roshni me dobara scan karein."
      });
    }
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =================== REPORT ROUTES ===================
const reportPayload = (body) => {
  const { reportDate, shift, entries } = body;
  const date = new Date(`${reportDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate || '') || Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== reportDate || !shift ||
      !Array.isArray(entries) || !entries.length ||
      entries.some(entry => !entry || typeof entry.machineName !== 'string' || !entry.machineName.trim() ||
        !Number.isFinite(Number(entry.downTimeHours ?? 0)) || Number(entry.downTimeHours ?? 0) < 0 ||
        !Number.isFinite(Number(entry.manpowerUsed ?? 0)) || Number(entry.manpowerUsed ?? 0) < 0)) return null;
  return {
    reportDate, shift, entries,
    totalDownTime: Number(entries.reduce((sum, entry) => sum + Number(entry.downTimeHours || 0), 0).toFixed(2)),
    totalManPower: entries.reduce((sum, entry) => sum + Number(entry.manpowerUsed || 0), 0)
  };
};

// 3. Save Breakdown Report
app.post("/api/reports", async (req, res) => {
  try {
    const payload = reportPayload(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Valid date, shift, machine name aur non-negative downtime/manpower zaroori hain." });
    }
    const report = new BreakdownReport(payload);
    const saved = await report.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error("Save Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update an existing report without creating a second history record.
app.put("/api/reports/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid report ID." });
    }
    const payload = reportPayload(req.body);
    if (!payload) return res.status(400).json({ error: "Valid date, shift, machine name aur non-negative downtime/manpower zaroori hain." });
    const filter = { _id: req.params.id };
    if (req.body.expectedUpdatedAt) {
      const timestamp = new Date(req.body.expectedUpdatedAt);
      if (Number.isNaN(timestamp.getTime())) return res.status(400).json({ error: "Invalid report update timestamp." });
      filter.updatedAt = timestamp;
    }
    const updated = await BreakdownReport.findOneAndUpdate(filter, { $set: payload }, { new: true, runValidators: true });
    if (!updated) {
      const exists = await BreakdownReport.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ error: exists
        ? "Report kisi aur ne update ki hai. Draft safe hai; History refresh karke latest report check karein."
        : "Report nahi mili. Shayad delete ho chuki hai; aapka edit draft safe hai." });
    }
    res.json(updated);
  } catch (error) {
    console.error("Update Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Get Breakdown Reports
app.get("/api/reports", async (req, res) => {
  try {
    const { date } = req.query;
    const filter = date ? { reportDate: date } : {};
    const reports = await BreakdownReport.find(filter).sort({ reportDate: -1, createdAt: -1 }).lean();
    res.json(reports);
  } catch (error) {
    console.error("Fetch Reports Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Delete Report
app.delete("/api/reports/:id", async (req, res) => {
  try {
    await BreakdownReport.findByIdAndDelete(req.params.id);
    res.json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("Delete Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

export default app;
