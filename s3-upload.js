import dotenv from "dotenv";
dotenv.config();

import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { S3Client } from "@aws-sdk/client-s3";

const app = express();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
});

app.use(express.static("public"));

app.post("/upload", upload.array("avatar"), (req, res) => {
  return res.json({ status: "OK", uploaded: req.files.length });
});

app.listen(process.env.PORT, () =>
  console.log(`App is listening on port ${process.env.PORT}...`)
);