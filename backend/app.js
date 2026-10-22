import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { reportPayload, validMonth } from './reportPayload.js';

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

// One durable marker closes a calendar month for every device. Reports stay intact.
const monthArchiveSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  archivedAt: { type: Date, required: true }
});
const MonthArchive = mongoose.models.MonthArchive || mongoose.model('MonthArchive', monthArchiveSchema);

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
// 3. Save Breakdown Report
app.post("/api/reports", async (req, res) => {
  try {
    const payload = reportPayload(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Har row mein valid date, machine name aur non-negative downtime/manpower chahiye. Ek save mein sab dates same month ki honi chahiye." });
    }
    if (await MonthArchive.exists({ _id: payload.reportDate.slice(0, 7) })) {
      return res.status(409).json({ error: 'Yeh month History mein save ho chuka hai. Main page refresh karein; saved report ko History se edit kar sakte hain.' });
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
    const original = await BreakdownReport.findById(req.params.id).lean();
    if (!original) return res.status(404).json({ error: 'Report nahi mili. Aapka edit draft safe hai.' });
    if (original.reportDate.slice(0, 7) !== payload.reportDate.slice(0, 7)) {
      return res.status(400).json({ error: 'Report ki dates usi month mein rakhein. Dusre month ke liye new entry banayein.' });
    }
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
    const filter = date ? { $or: [{ 'entries.entryDate': date }, { reportDate: date, entries: { $elemMatch: { entryDate: null } } }] } : {};
    const reports = await BreakdownReport.find(filter).sort({ reportDate: -1, createdAt: -1 }).lean();
    if (req.query.view === 'monthly') {
      const archives = await MonthArchive.find({}).lean();
      return res.json({ reports, archivedMonths: archives.map(archive => archive._id) });
    }
    res.json(reports);
  } catch (error) {
    console.error("Fetch Reports Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Closing a month never copies or deletes reports. Repeating the request is safe.
app.post('/api/report-months/:month/archive', async (req, res) => {
  try {
    const { month } = req.params;
    if (!validMonth(month)) return res.status(400).json({ error: 'Valid month (YYYY-MM) required.' });
    const exists = await BreakdownReport.exists({ reportDate: { $regex: `^${month}-` } });
    if (!exists) return res.status(400).json({ error: 'Is month mein koi saved breakdown nahi hai. Pehle daily entries save karein.' });
    let archive;
    try {
      archive = await MonthArchive.findOneAndUpdate({ _id: month },
        { $setOnInsert: { archivedAt: new Date() } }, { upsert: true, new: true, runValidators: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      archive = await MonthArchive.findById(month);
    }
    res.json({ month, archivedAt: archive.archivedAt });
  } catch (error) {
    console.error('Archive Month Error:', error);
    res.status(500).json({ error: 'Month History mein save nahi hua. Dobara try karein.' });
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

