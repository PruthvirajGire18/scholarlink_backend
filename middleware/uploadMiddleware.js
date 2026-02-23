import multer from "multer";

const MAX_FILE_SIZE_MB = 5;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Only PDF/JPEG/PNG files are allowed"));
  }
  cb(null, true);
}

const uploadDocument = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  }
});

export { uploadDocument };
