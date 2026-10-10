import mongoose from "mongoose";

const breakdownEntrySchema = new mongoose.Schema({
  machineId: { type: String, default: "" },
  machineName: { type: String, default: "" },
  bdNo: { type: String, default: "" },
  breakdownDetails: { type: String, default: "" },
  rootCause: { type: String, default: "" },
  correctiveAction: { type: String, default: "" },
  startTime: { type: String, default: "" },
  endTime: { type: String, default: "" },
  downTimeHours: { type: Number, default: 0 },
  manpowerUsed: { type: Number, default: 0 },
  sparesUsed: { type: String, default: "" }
});

const reportSchema = new mongoose.Schema(
  {
    reportDate: { type: String, required: true, index: true },
    shift: { type: String, required: true },
    entries: [breakdownEntrySchema],
    totalDownTime: { type: Number, default: 0 },
    totalManPower: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// OverwriteModelError aur buffering safe export
const BreakdownReport =
  mongoose.models.BreakdownReport || mongoose.model("BreakdownReport", reportSchema);

export default BreakdownReport;