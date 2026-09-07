import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import Image from "./Models/Image.js";

// Ensure local upload directory exists
const LOCAL_UPLOAD_DIR = "uploads/images";
fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });

// Configuration
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/uploadsDB";
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

const hasS3Config = Boolean(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  S3_BUCKET_NAME
);

const STORAGE_TYPE = process.env.STORAGE_TYPE || (hasS3Config ? "s3" : "local");

console.log(`📦 Storage engine initialized: [${STORAGE_TYPE.toUpperCase()}]`);

// MongoDB Connection
let isMongoConnected = false;
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    isMongoConnected = true;
    console.log(`✅ MongoDB connected successfully at ${MONGODB_URI}`);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });

mongoose.connection.on("disconnected", () => {
  isMongoConnected = false;
  console.warn("⚠️ MongoDB disconnected");
});
mongoose.connection.on("reconnected", () => {
  isMongoConnected = true;
  console.log("✅ MongoDB reconnected");
});

// AWS S3 Client
let s3Client = null;
if (hasS3Config) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  console.log(`☁️  AWS S3 Client ready (Bucket: ${S3_BUCKET_NAME}, Region: ${AWS_REGION})`);
} else if (STORAGE_TYPE === "s3") {
  console.warn("⚠️ S3 storage requested but AWS credentials or S3_BUCKET_NAME are missing in .env");
}

// Multer Storage Configuration
let storage;

if (STORAGE_TYPE === "s3" && s3Client) {
  storage = multerS3({
    s3: s3Client,
    bucket: S3_BUCKET_NAME,
    metadata: (req, file, cb) => {
      cb(null, {
        fieldName: file.fieldname,
        originalName: encodeURIComponent(file.originalname),
      });
    },
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueName = `${uuidv4()}${ext}`;
      cb(null, uniqueName);
    },
  });
} else {
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, LOCAL_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueName = `${uuidv4()}${ext}`;
      cb(null, uniqueName);
    },
  });
}

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max file size
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Endpoint: System Status & Config info
app.get("/api/config", (req, res) => {
  res.json({
    status: "OK",
    storageType: STORAGE_TYPE,
    bucket: S3_BUCKET_NAME || null,
    region: AWS_REGION,
    mongoConnected: isMongoConnected,
  });
});

// Endpoint: Multi-file Upload
app.post("/upload", upload.array("avatar", 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const imageRecords = req.files.map((file) => {
      const isS3 = Boolean(file.location && file.key);
      const key = isS3 ? file.key : file.filename;
      const url = isS3 ? file.location : `/uploads/images/${file.filename}`;

      return {
        key,
        url,
        filePath: url,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageType: isS3 ? "s3" : "local",
      };
    });

    let savedImages = [];
    if (mongoose.connection.readyState === 1) {
      savedImages = await Image.insertMany(imageRecords);
    } else {
      console.warn("MongoDB not connected; skipping database persistence");
      savedImages = imageRecords;
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        status: "OK",
        uploaded: savedImages.length,
        images: savedImages,
      });
    }

    return res.redirect("/?uploaded=" + savedImages.length);
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint: Stream image by ID (handles private S3 buckets or local disk)
app.get("/media/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).send("Database offline");
    }
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).send("Image not found");

    if (image.storageType === "s3" && s3Client) {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: image.key,
      });
      const data = await s3Client.send(command);
      res.setHeader("Content-Type", image.mimeType || "image/jpeg");
      return data.Body.pipe(res);
    } else {
      const localPath = path.resolve(LOCAL_UPLOAD_DIR, path.basename(image.key || image.filePath));
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
      return res.status(404).send("File not found on disk");
    }
  } catch (err) {
    console.error("Stream error:", err);
    res.status(500).send(err.message);
  }
});

// Endpoint: Get all images (Both /images and /api/images)
const getImagesHandler = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ status: "OK", images: [], note: "MongoDB is disconnected" });
    }
    const images = await Image.find().sort({ createdAt: -1 });
    return res.json({ status: "OK", images });
  } catch (err) {
    console.error("Fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
};

app.get("/images", getImagesHandler);
app.get("/api/images", getImagesHandler);

// Endpoint: Delete one or multiple images
const deleteImagesHandler = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid request: 'ids' must be a non-empty array" });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const images = await Image.find({ _id: { $in: ids } });
    if (!images.length) {
      return res.status(404).json({ error: "No images found for the provided IDs" });
    }

    const s3KeysToDelete = [];
    const localFilesToDelete = [];

    images.forEach((img) => {
      if (img.storageType === "s3" && img.key) {
        s3KeysToDelete.push({ Key: img.key });
      } else {
        const fileName = path.basename(img.key || img.filePath || "");
        if (fileName) {
          localFilesToDelete.push(path.join(LOCAL_UPLOAD_DIR, fileName));
        }
      }
    });

    if (s3KeysToDelete.length > 0 && s3Client) {
      try {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: S3_BUCKET_NAME,
          Delete: {
            Objects: s3KeysToDelete,
            Quiet: false,
          },
        });
        const s3Response = await s3Client.send(deleteCommand);
        console.log(`🗑️ Deleted ${s3Response.Deleted?.length || 0} objects from S3`);
      } catch (s3Err) {
        console.error("❌ Failed to delete objects from S3:", s3Err.message);
      }
    }

    localFilesToDelete.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error(`Error deleting local file ${filePath}:`, err);
        });
      }
    });

    const dbResult = await Image.deleteMany({ _id: { $in: ids } });

    return res.json({
      status: "OK",
      message: `${dbResult.deletedCount} image(s) deleted successfully`,
      deletedCount: dbResult.deletedCount,
    });
  } catch (err) {
    console.error("Delete error:", err);
    return res.status(500).json({ error: err.message });
  }
};

app.delete("/images", deleteImagesHandler);
app.delete("/api/images", deleteImagesHandler);

// Single image delete convenience endpoint
app.delete("/images/:id", async (req, res) => {
  req.body = { ids: [req.params.id] };
  return deleteImagesHandler(req, res);
});

// Fallback for legacy /images/<filename> static requests
app.get("/images/:filename", (req, res, next) => {
  const filePath = path.resolve(LOCAL_UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`🚀 Unified server is running on http://localhost:${PORT}`);
});
