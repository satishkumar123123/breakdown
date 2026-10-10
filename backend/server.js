import app, { connectDB } from "./app.js";

const PORT = process.env.PORT || 5000;

try {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
} catch {
  console.error("Backend start failed: check MONGO_URI in backend/.env and MongoDB Atlas network access.");
  process.exitCode = 1;
}
