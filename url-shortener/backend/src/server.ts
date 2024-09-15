import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import urlRoutes from "./routes/urlRoutes";
import dotenv from "dotenv";

const app = express();
dotenv.config();

const { PORT, MONGO_URI } = process.env;

app.use(cors());
app.use(express.json());

if (!PORT || !MONGO_URI) {
  console.log("Please define PORT and MONGO_URI in .env");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.use("/", urlRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
