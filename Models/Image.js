import mongoose from "mongoose";

const { Schema } = mongoose;

const ImageSchema = new Schema(
  {
    // Storage identifier key (S3 object key or filename on disk)
    key: {
      type: String,
      required: true,
      index: true,
    },
    // Direct URL or relative path for viewing the image
    url: {
      type: String,
      required: true,
    },
    // Backwards compatibility field
    filePath: {
      type: String,
    },
    // Original filename before upload
    originalName: {
      type: String,
      default: "Unnamed",
    },
    // MIME type (image/png, image/jpeg, etc.)
    mimeType: {
      type: String,
      default: "image/jpeg",
    },
    // File size in bytes
    size: {
      type: Number,
      default: 0,
    },
    // Storage engine used: 's3' or 'local'
    storageType: {
      type: String,
      enum: ["s3", "local"],
      default: "s3",
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Fallback hook to ensure filePath matches url/key if not provided
ImageSchema.pre("save", function (next) {
  if (!this.filePath) {
    this.filePath = this.url || this.key;
  }
  next();
});

export default mongoose.model("Image", ImageSchema);