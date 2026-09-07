# Cloud Media Hub (AWS S3 + MongoDB)

A modern, high-performance distributed media storage and management application built with **Node.js**, **Express**, **AWS S3**, **MongoDB**, and **Vanilla HTML5/CSS/JavaScript**.

---

## 🌟 Key Features

- ☁️ **AWS S3 Object Storage**: Direct streaming uploads with UUID-based key protection and multi-file batch deletion.
- 🗄️ **MongoDB Catalog**: Full metadata indexing (file size, MIME type, direct S3 URL, storage provider, timestamps).
- 🔄 **Zero-Buffer Streaming**: Uses `multer-s3` backpressure streaming to prevent server RAM exhaustion during large multi-file uploads.
- 🛡️ **Streaming Proxy (`/media/:id`)**: Server-side S3 stream proxy that allows instant image preview even under private bucket access policies.
- ⚙️ **Dual-Engine Toggle**: Run in `STORAGE_TYPE=s3` mode for production cloud storage or `STORAGE_TYPE=local` for offline development and testing.
- 🎨 **Modern Glassmorphic UI**:
  - Drag-and-drop file upload with staged preview thumbnails.
  - Multi-select batch deletion.
  - One-click copy image link.
  - Lightbox full-resolution image preview.
  - Live toast notification feedback.

---

## 📖 Documentation & Architecture

For full technical design, architectural justification, and design diagrams:
👉 **Read the complete [ARCHITECTURE.md](file:///Users/pshah/Documents/AWS-S3/ARCHITECTURE.md)**

- **HLD (High-Level Design)**: System architecture, multi-layer topology, data flow diagrams.
- **LLD (Low-Level Design)**: Data schema dictionary, sequence diagrams, and REST API contracts.
- **Architectural Justification**: In-depth comparison of S3 vs GridFS vs Local Disk storage.
- **Future Roadmap**: Authenticated uploads/downloads, S3 Presigned URLs, CloudFront CDN, and image thumbnail lambda triggers.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **MongoDB** (running locally or via MongoDB Atlas)
- **AWS Account** with an active S3 bucket

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```
Example `.env`:
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=your-bucket-name
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/uploadsDB
STORAGE_TYPE=s3
```

### 3. Start MongoDB (macOS)
```bash
brew services start mongodb-community@7.0
```

### 4. Install Dependencies & Start Server
```bash
# Install dependencies
pnpm install # or npm install

# Start in development mode (nodemon auto-reload)
npm run dev

# Or standard production start
npm start
```

### 5. Open in Browser
Visit **[http://localhost:3001](http://localhost:3001)**.

---

## 📡 REST API Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload multi-part image files (`avatar` field) |
| `GET` | `/images` | Fetch list of all images sorted newest first |
| `GET` | `/media/:id` | Stream binary image from S3 or local disk |
| `DELETE` | `/images` | Batch delete images by array of IDs: `{"ids": ["id1", "id2"]}` |
| `DELETE` | `/images/:id`| Convenience route to delete a single image |
| `GET` | `/api/config` | Retrieve active storage engine and database health |

---

## 🔒 Security Practices Included
- `.env` and `node_modules/` are strictly excluded from git tracking via `.gitignore`.
- Uploaded files are renamed to cryptographically random UUIDv4 names, preventing path traversal and file collision attacks.
- Strict MIME validation rejects non-image binaries before S3 upload begins.
