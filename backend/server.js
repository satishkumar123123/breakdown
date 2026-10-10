import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// =================== MONGOOSE CONNECTION (BUFFER TIMEOUT FIX) ===================
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds me cluster response verify karega
      socketTimeoutMS: 45000
    });
    console.log("MongoDB connected successfully!");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
};

connectDB();

// Global Database Connection Middleware: Request buffer me atak kar crash na ho
app.use((req, res, next) => {
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Database cluster se abhi connect nahi hua hai. 2-3 second baad retry karein."
    });
  }
  next();
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
// 3. Save Breakdown Report
app.post("/api/reports", async (req, res) => {
  try {
    const { reportDate, shift, entries, totalDownTime, totalManPower } = req.body;
    const report = new BreakdownReport({
      reportDate,
      shift,
      entries: entries || [],
      totalDownTime: Number(totalDownTime) || 0,
      totalManPower: Number(totalManPower) || 0
    });
    const saved = await report.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error("Save Report Error:", error);
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});