import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    employeeId: { type: String, required: true, unique: true },
    role: { type: String, default: "Operator" },
    faceDescriptor: { type: [Number], required: true }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);