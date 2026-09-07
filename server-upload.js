import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import Image from "./Models/Image.js"; // note: .js extension required in ESM
import path from "path";
import fs from "fs";

mongoose
  .connect("mongodb://127.0.0.1:27017/uploadsDB")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const connection = mongoose.connection;
connection.on("error", console.error.bind(console, "MongoDB error:"));
connection.once("open", () => {
  console.log("✅ Connected to MongoDB");
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/images");
  },
  filename: async (req, file, cb) => {
    try {
      const ext = path.extname(file.originalname);
      const id = uuidv4();
      const fileName = `${id}${ext}`;
      const filePath = `images/${fileName}`;

      // Save filePath in MongoDB
      await Image.create({ filePath });

      cb(null, fileName);
    } catch (err) {
      cb(err);
    }
  },
});

const upload = multer({ storage });
const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use(express.static("uploads"));

app.post("/upload", upload.array("avatar"), (req, res) => {
  return res.redirect("/");
});

app.get("/images", (req, res) => {
  Image.find().then((images) => {
    return res.json({ status: "OK", images });
  });
});

// curl -X DELETE http://localhost:3001/images/68bc64f41a956b4050313540 - command to delete - use terminal
// DELETE multiple images
app.delete("/images", async (req, res) => {
  try {
    const { ids } = req.body; // expects { "ids": ["id1", "id2", "id3"] }

    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids must be an array" });
    }

    // Find the images first
    const images = await Image.find({ _id: { $in: ids } });

    if (!images.length) {
      return res
        .status(404)
        .json({ error: "No images found for provided IDs" });
    }

    // Delete from DB
    await Image.deleteMany({ _id: { $in: ids } });

    // Delete files from filesystem
    images.forEach((img) => {
      const filePath = path.join("uploads", path.basename(img.filePath));
      fs.unlink(filePath, (err) => {
        if (err) console.error("File deletion error:", err);
      });
    });

    res.json({ status: "OK", message: "Images deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("🚀 App is listening on port 3001..."));
