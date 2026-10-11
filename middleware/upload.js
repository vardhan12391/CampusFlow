/**
 * middleware/upload.js
 * --------------------------------------------------------------------------
 * Multer handles `multipart/form-data` - the encoding a browser uses when a
 * <form> contains a file input.
 *
 * Flow:
 *   browser posts file  ->  multer writes it to /uploads  ->  controller
 *   receives `req.file` and stores only the PATH (e.g. "/uploads/abc.png")
 *   on the complaint document. The file itself stays on disk.
 *
 * We keep images out of MongoDB because binaries bloat the database; a simple
 * path string is enough (a cloud bucket would replace `diskStorage` later).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadsFolder = path.join(__dirname, '..', 'uploads');

// make sure the folder exists before Multer tries to write into it
if (!fs.existsSync(uploadsFolder)) {
  fs.mkdirSync(uploadsFolder, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadsFolder);
  },
  filename: (req, file, callback) => {
    // timestamp + random string = unique name, original extension kept
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extension}`;
    callback(null, uniqueName);
  },
});

// Accept images only - blocks people from uploading .html or .exe files.
function fileFilter(req, file, callback) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error('Only JPG, PNG, GIF or WEBP images are allowed.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max per image
});

module.exports = upload;
