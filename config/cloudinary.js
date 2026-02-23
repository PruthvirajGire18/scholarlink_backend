import { v2 as cloudinary } from "cloudinary";

function getCloudinaryEnv() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  };
}

function ensureCloudinaryConfigured() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  const isConfigured = Boolean(cloudName) && Boolean(apiKey) && Boolean(apiSecret);

  if (!isConfigured) {
    throw new Error("Cloudinary is not configured. Add CLOUDINARY_* values in server/.env.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
}

export function uploadBufferToCloudinary(buffer, options = {}) {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || process.env.CLOUDINARY_FOLDER || "scholarlink/documents",
        public_id: options.publicId,
        resource_type: "auto"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes
        });
      }
    );

    uploadStream.end(buffer);
  });
}

export default cloudinary;
