import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

// Cloudflare R2 is S3-compatible, so we use AWS SDK
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!BUCKET_NAME || !process.env.R2_ACCOUNT_ID) {
  console.warn('R2 storage not configured. File uploads will use local storage.');
}

export const storageService = {
  /**
   * Upload a file to R2 storage
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} fileName - Original file name
   * @param {string} userId - User ID for organizing files
   * @param {string} contentType - MIME type (default: application/pdf)
   * @returns {Promise<string>} - File key/path in storage
   */
  async uploadFile(fileBuffer, fileName, userId, contentType = 'application/pdf') {
    if (!BUCKET_NAME) {
      throw new Error('R2 storage not configured');
    }

    // Sanitize filename
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${userId}/${Date.now()}-${sanitizedFileName}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      // Metadata for tracking
      Metadata: {
        userId: userId,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      await s3Client.send(command);
      return key;
    } catch (error) {
      console.error('R2 upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  },

  /**
   * Get a signed URL for downloading a file
   * @param {string} key - File key/path
   * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
   * @returns {Promise<string>} - Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    if (!BUCKET_NAME) {
      throw new Error('R2 storage not configured');
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  },

  /**
   * Delete a file from R2 storage
   * @param {string} key - File key/path
   * @returns {Promise<void>}
   */
  async deleteFile(key) {
    if (!BUCKET_NAME) {
      throw new Error('R2 storage not configured');
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      await s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  },

  /**
   * Check if a file exists
   * @param {string} key - File key/path
   * @returns {Promise<boolean>}
   */
  async fileExists(key) {
    if (!BUCKET_NAME) {
      return false;
    }

    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      await s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  },

  /**
   * Get public URL for a file (if using custom domain)
   * @param {string} key - File key/path
   * @returns {string} - Public URL
   */
  getPublicUrl(key) {
    if (process.env.R2_PUBLIC_URL) {
      return `${process.env.R2_PUBLIC_URL}/${key}`;
    }
    // Fallback to R2 default URL format
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`;
  },

  /**
   * Upload multiple files (for batch operations)
   * @param {Array<{buffer: Buffer, fileName: string}>} files - Array of file objects
   * @param {string} userId - User ID
   * @returns {Promise<Array<string>>} - Array of file keys
   */
  async uploadMultipleFiles(files, userId) {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file.buffer, file.fileName, userId, file.contentType)
    );
    return Promise.all(uploadPromises);
  },

  /**
   * Delete multiple files
   * @param {Array<string>} keys - Array of file keys
   * @returns {Promise<void>}
   */
  async deleteMultipleFiles(keys) {
    const deletePromises = keys.map((key) => this.deleteFile(key));
    await Promise.all(deletePromises);
  },
};

export default storageService;
