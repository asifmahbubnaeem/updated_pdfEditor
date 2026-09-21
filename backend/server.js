// server.js

import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import path from "path";
import multer from "multer";
import cors from "cors";
import helmet from "helmet";
import { spawn, execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import http from "http";
import https from "https";
import { PDFDocument, degrees } from 'pdf-lib';
import archiver from "archiver";
import csv from "csv-parser";
import PdfPrinter from "pdfmake";

// Import new middleware and routes
import redis from './config/redis.js';
import { optionalAuth, authenticate } from './middleware/auth.js';
import { tieredRateLimiter } from './middleware/rateLimiter.js';
import { checkUsageLimit, checkFileSizeLimit } from './middleware/subscriptionCheck.js';
import { logUsage } from './services/usageTrackingService.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { startCleanupReaper } from './services/cleanupService.js';
import { getDeletedPages, getNumericOrder, getPageNumbers, reConstructMap, computeColumnWidths } from './utils/pdfHelpers.js';
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/payment.js';
import subscriptionRoutes from './routes/subscription.js';
import logger from './utils/logger.js';

const app = express();
const VENV = process.env.VIRTUAL_ENV ? process.env.VIRTUAL_ENV.replace(/\/?$/, "/") : "";

// Hard ceiling on upload size, applied before any per-tier size check runs.
// Matches the largest subscription tier limit (see middleware/subscriptionCheck.js)
// so tier enforcement still applies below this, but nobody can force the server
// to buffer/write an unbounded file to disk (or memory, for memoryStorage uploads).
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

const upload = multer({ dest: "uploads/", limits: { fileSize: MAX_UPLOAD_BYTES } });
const uploadDoc = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only .doc or .docx files are allowed"));
    }
    cb(null, true);
  },
});

const uploadImgage = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter : (req, file, cb) => {
    const mimeType = file.mimetype.toLowerCase();
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg' || mimeType === 'image/png') {
        // Accept the file
        cb(null, true);
    } else {
        // Reject the file and provide an error message
        cb(new Error('Invalid file type. Only JPG, JPEG, and PNG images are allowed.'), false);
    }
  },
});

// app.use("/api", convertRoutes);

const storage = multer.memoryStorage();
const uploadToDelete = multer({storage: storage, limits: { fileSize: MAX_UPLOAD_BYTES }});

const CLEANUP_TIME = 600000;

let useHttps = process.env.USE_HTTPS === "true";
let sslOptions = null;
if (useHttps) {
  try {
    sslOptions = {
      key: fs.readFileSync("server.key"),
      cert: fs.readFileSync("server.cert"),
    };
  } catch (e) {
    logger.warn("USE_HTTPS set but server.key/cert missing, falling back to HTTP");
    useHttps = false;
  }
}

const allowedOrigin = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:4173,http://localhost:80,http://localhost")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
    origin: allowedOrigin,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging - one structured line per request, with status and duration
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });
  next();
});

// Optional auth middleware - attaches user if token provided
app.use(optionalAuth);

// Auth routes (no auth required for registration/login)
app.use("/api/auth", authRoutes);

// Payment routes
app.use("/api/payment", paymentRoutes);

// Subscription routes
app.use("/api/subscription", subscriptionRoutes);

const fonts = {
    Roboto: {
      normal: "fonts/Roboto-Regular.ttf",
      bold: "fonts/Roboto-Medium.ttf",
      italics: "fonts/Roboto-Italic.ttf",
      bolditalics: "fonts/Roboto-MediumItalic.ttf",
    },
  };

// Rate limiting and usage checking middleware stack
const apiMiddleware = [
  tieredRateLimiter,
  checkUsageLimit,
  checkFileSizeLimit,
];

// -------- Encrypt PDF --------
app.post("/api/encrypt", upload.single("file"), authenticate, ...apiMiddleware, async (req, res, next) => {
  try {
    const password = req.body.password;
    const inputPath = req.file?.path;
    const outputPath = `encrypted_${Date.now()}.pdf`;
    const userId = req.userId; // Authentication required, so req.userId will always exist

    if (!inputPath || !password) {
      return res.status(400).json({ error: "File and password are required" });
    }

    // Use execFile with argument array to prevent shell injection
    execFile('qpdf', [
      '--encrypt',
      password,
      password,
      '256',
      '--',
      inputPath,
      outputPath
    ], async (err) => {
      if (err) {
        try { fs.unlinkSync(inputPath); } catch (_) {}
        logger.error("Encryption failed:", err);
        
        // Log failed usage
        if (userId) {
          await logUsage(userId, 'encrypt', req.file?.size || 0, false, req);
        }
        
        return res.status(500).json({ error: "Encryption failed" });
      }
      
      // Log successful usage
      if (userId) {
        await logUsage(userId, 'encrypt', req.file?.size || 0, true, req);
      }
      
      res.download(outputPath, "encrypted.pdf", (dlErr) => {
        try { fs.unlinkSync(inputPath); } catch (_) {}
        try { fs.unlinkSync(outputPath); } catch (_) {}
        if (dlErr) logger.error("Download error:", dlErr);
      });
    });
  } catch (error) {
    next(error);
  }
});

// -------- Decrypt PDF --------
app.post("/api/decrypt", upload.single("file"), authenticate, ...apiMiddleware, async (req, res, next) => {
  try {
    const password = req.body.password;
    const inputPath = req.file?.path;
    const outputPath = `decrypted_${Date.now()}.pdf`;
    const userId = req.userId; // Authentication required, so req.userId will always exist

    if (!inputPath || !password) {
      return res.status(400).json({ error: "File and password are required" });
    }

    // Use execFile with argument array to prevent shell injection
    execFile('qpdf', [
      `--password=${password}`,
      '--decrypt',
      inputPath,
      outputPath
    ], async (err) => {
      if (err) {
        try { fs.unlinkSync(inputPath); } catch (_) {}
        logger.error("Decryption failed:", err);
        
        // Log failed usage
        if (userId) {
          await logUsage(userId, 'decrypt', req.file?.size || 0, false, req);
        }
        
        return res.status(500).json({ error: "Decryption failed" });
      }
      
      // Log successful usage
      if (userId) {
        await logUsage(userId, 'decrypt', req.file?.size || 0, true, req);
      }
      
      res.download(outputPath, "decrypted.pdf", (dlErr) => {
        try { fs.unlinkSync(inputPath); } catch (_) {}
        try { fs.unlinkSync(outputPath); } catch (_) {}
        if (dlErr) logger.error("Download error:", dlErr);
      });
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/extract-images/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "images.zip", (err) => {
    if (err) logger.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      logger.error("Cleanup error:", cleanupErr);
    }
  });
});


app.post("/api/convert-pdf-docx", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {
  const inputPath = req.file.path;
  const outputPath = path.join("docx_converted", `${Date.now()}.docx`);
  fs.mkdirSync("docx_converted", { recursive: true });

  execFile(`${VENV}python3`, ['routes/convert_pdf_to_docx.py', inputPath, outputPath], (error, stdout, stderr) => {
    if (error) {
      logger.error(`Conversion error: ${stderr}`);
      return res.status(500).json({ error: "Conversion failed" });
    }

    res.download(outputPath, "converted.docx", (err) => {
      if (err) logger.error("Download error:", err);

      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath); // uncomment if you don’t want to keep docx
    });
   

  });
});


app.get("/api/extract-tables/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`table-extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "tables.zip", (err) => {
    if (err) logger.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`table-extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      logger.error("Cleanup error:", cleanupErr);
    }
  });
});

app.get("/api/img-to-tbl-data/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`image-extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "tables.zip", (err) => {
    if (err) logger.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`image-extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      logger.error("Cleanup error:", cleanupErr);
    }
  });
});

app.post("/api/img-to-tbl-data", uploadImgage.single("file"), authenticate, ...apiMiddleware, async (req, res) => {

  try{
    if(!req.file){
      return res.status(400).json({message: "No Image uploaded."})
    }

    let inputPath = path.resolve(req.file.path);

    const ext = path.extname(req.file.originalname) || (req.body.mime_type);
    const safeInputPath = inputPath + ext;
    fs.renameSync(inputPath, safeInputPath);
    inputPath = safeInputPath;

    const outputDir = path.resolve("image-extracted", path.parse(req.file.filename).name);
    logger.info("inputPath = ",inputPath)
    logger.info("outputPath = ",outputDir)

    const convertionFormat = req.body.format;
    const outputPath = path.join("extracted-table", `${Date.now()}.${convertionFormat}`);

    if(!fs.existsSync(outputDir))
      fs.mkdirSync(outputDir, { recursive: true });

    const pythonScript = 'routes/from_ai.py';
    // const args = [pythonScript, inputPath, outputDir, convertionFormat];
    const args = ['routes/from_ai.py', inputPath, outputDir, convertionFormat];

    const process = spawn(`${VENV}python3`, args);

    process.stdout.on('data', (data) => {
      logger.info(`Print statement from python script=${pythonScript} : ${data.toString()}`)
    });

    process.stderr.on('data', (data) => {
      logger.info(`Error statement from python script=${pythonScript} : ${data.toString()}`);
    });

    process.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: "Failed to extract tables" });
      }

      const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(convertionFormat));

      if (files.length === 0) {
        return res.status(400).json({ error: "No Tables found in the PDF" });
      }

      const zipPath = path.resolve(`${outputDir}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(output);
      files.forEach((file) => {
        archive.file(path.join(outputDir, file), { name: file });
      });
      archive.finalize();

      output.on("close", () => {
        res.json({
          message: "Tables extracted successfully",
          tablesCount: files.length,
          downloadUrl: `/api/img-to-tbl-data/download/${path.parse(req.file.filename).name}`,
        });
      });
    })
  }catch(err){
      logger.error("Table Extraction action error: ",err);
      res.status(500).json({error: "Failed to extract table action."})
  }

});


app.get("/api/img-to-txt-data/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "text.zip", (err) => {
    if (err) logger.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      logger.error("Cleanup error:", cleanupErr);
    }
  });
});

app.post("/api/img-to-txt-data", uploadImgage.single("file"), authenticate, ...apiMiddleware, async (req, res) => {

  try{
    if(!req.file){
      return res.status(400).json({message: "No Image uploaded."})
    }

    let inputPath = path.resolve(req.file.path);

    const ext = path.extname(req.file.originalname) || (req.body.mime_type);
    const safeInputPath = inputPath + ext;
    fs.renameSync(inputPath, safeInputPath);
    inputPath = safeInputPath;

    const outputDir = path.resolve("extracted", path.parse(req.file.filename).name);
    logger.info("inputPath = ",inputPath)
    logger.info("outputPath = ",outputDir)

    const convertionFormat = req.body.format;
    // const outputPath = path.join("extracted", `${Date.now()}.${convertionFormat}`);

    if(!fs.existsSync(outputDir))
      fs.mkdirSync(outputDir, { recursive: true });

    const pythonScript = 'routes/from_ai_text_extract.py';
    // const args = [pythonScript, inputPath, outputDir, convertionFormat];
    const args = ['routes/from_ai_text_extract.py', inputPath, outputDir, convertionFormat];

    const process = spawn(`${VENV}python3`, args);

    process.stdout.on('data', (data) => {
      logger.info(`Print statement from python script=${pythonScript} : ${data.toString()}`)
    });

    process.stderr.on('data', (data) => {
      logger.info(`Error statement from python script=${pythonScript} : ${data.toString()}`);
    });

    process.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: "Failed to extract text" });
      }

      const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(convertionFormat));

      if (files.length === 0) {
        return res.status(400).json({ error: "No text found in the PDF" });
      }

      const zipPath = path.resolve(`${outputDir}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(output);
      files.forEach((file) => {
        archive.file(path.join(outputDir, file), { name: file });
      });
      archive.finalize();

      output.on("close", () => {
        res.json({
          message: "Text extracted successfully",
          tablesCount: files.length,
          downloadUrl: `/api/img-to-txt-data/download/${path.parse(req.file.filename).name}`,
        });
      });
    })
  }catch(err){
      logger.error("Text Extraction action error: ",err);
      res.status(500).json({error: "Failed to extract text action."})
  }

});


app.post("/api/extract-tables", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {
  try{
    if(!req.file){
      return res.status(400).json({message: "No PDF uploaded."})
    }

    const inputPath = path.resolve(req.file.path);
    const outputDir = path.resolve("table-extracted", path.parse(req.file.filename).name);

    const convertionFormat = req.body.format;
    const outputPath = path.join("extracted-table", `${Date.now()}.${convertionFormat}`);

    

    if(!fs.existsSync(outputDir))
      fs.mkdirSync(outputDir, { recursive: true });

    const pythonScript = 'routes/extract_tables_from_pdf.py';
    // const args = [pythonScript, inputPath, outputDir, convertionFormat];
    const args = ['routes/extract_tables_from_pdf.py', inputPath, outputDir, convertionFormat];

    const process = spawn(`${VENV}python3`, args);

    process.stdout.on('data', (data) => {
      logger.info(`Print statement from python script=${pythonScript} : ${data.toString()}`)
    });

    process.stderr.on('data', (data) => {
      logger.info(`Error statement from python script=${pythonScript} : ${data.toString()}`);
    });

    process.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: "Failed to extract tables" });
      }

      const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(convertionFormat));

      if (files.length === 0) {
        return res.status(400).json({ error: "No Tables found in the PDF" });
      }

      const zipPath = path.resolve(`${outputDir}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(output);
      files.forEach((file) => {
        archive.file(path.join(outputDir, file), { name: file });
      });
      archive.finalize();

      output.on("close", () => {
        res.json({
          message: "Tables extracted successfully",
          tablesCount: files.length,
          downloadUrl: `/api/extract-tables/download/${path.parse(req.file.filename).name}`,
        });
      });
    })

  }catch(err){
      logger.error("Table Extraction action error: ",err);
      res.status(500).json({error: "Failed to extract table action."})
  }

});


function csvToPdf(inputCsv, outputPdf) {

  const printer = new PdfPrinter(fonts);

  const rows = [];

  try{
      fs.createReadStream(inputCsv)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
        .on("end", () => {
          const headers = Object.keys(rows[0]);
          const body = [headers, ...rows.map((r) => headers.map((h) => r[h]))];

          const docDefinition = {
            content: [
              { text: "CSV to PDF", style: "header" },
              {
                table: {
                  headerRows: 1,
                  widths: headers.map(() => "*"), // auto width
                  body,
                },
              },
            ],
            styles: {
              header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
            },
          };
          const pdfDoc = printer.createPdfKitDocument(docDefinition);
          pdfDoc.pipe(fs.createWriteStream(outputPdf));
          pdfDoc.end();
        });
      }catch(err){
        logger.error("Failed inside csvToPdf function: ",err);
        res.status(500).json({error: "Failed inside csvToPdf function."})
      }
  }


function csvToArray(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        const headers = Object.keys(results[0]);
        const rows = results.map((row) => headers.map((h) => row[h] || ""));
        resolve([headers, ...rows]);
      })
      .on("error", reject);
  });
}

const csvToPdf2 = (inputCsv, outputPdf) => {
  return new Promise(async (resolve, reject) => {
    try {
      const printer = new PdfPrinter(fonts);
      const csvArray = await csvToArray(inputCsv);
      const colWidths = computeColumnWidths(csvArray);

      const docDefinition = {
        pageOrientation: "landscape",
        content: [
          {
            table: {
              headerRows: 1,
              widths: colWidths,
              body: csvArray,
            },
            layout: {
              fillColor: (rowIndex) => (rowIndex === 0 ? "#eeeeee" : null),
            },
          },
        ],
        defaultStyle: {
          fontSize: 8,
          noWrap: false,
        },
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const stream = fs.createWriteStream(outputPdf);

      pdfDoc.pipe(stream);
      pdfDoc.end();

      stream.on("finish", () => resolve(outputPdf));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
};


app.get("/api/csv-to-pdf/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`csv-to-pdf/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "Files.zip", (err) => {
    if (err) logger.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`csv-to-pdf/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      logger.error("Cleanup error:", cleanupErr);
    }
  });
});


app.post("/api/csv-to-pdf", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV uploaded" });
    }

    const inputPath = path.resolve(req.file.path);
    const outputDir = path.resolve("csv-to-pdf", path.parse(req.file.filename).name);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPdfPath = `${outputDir}/newPdf.pdf`;
    await csvToPdf2(inputPath, outputPdfPath);  // ✅ wait until PDF is written

    // Create ZIP
    const zipPath = path.resolve(`${outputDir}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.file(outputPdfPath, { name: "newPdf.pdf" });
    await archive.finalize();

    res.json({
      message: "CSV file converted to PDF successfully",
      downloadUrl: `/api/csv-to-pdf/download/${path.parse(req.file.filename).name}`,
    });

  } catch (err) {
    logger.error("CSV to PDF conversion error: ", err);
    res.status(500).json({ error: "Failed to convert from CSV to PDF." });
  }
});


app.post("/api/extract-images", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No PDF uploaded" });
    }

    const inputPath = path.resolve(req.file.path);
    const outputDir = path.resolve("extracted", path.parse(req.file.filename).name);

    if (!fs.existsSync(outputDir))
      fs.mkdirSync(outputDir, { recursive: true });

    const process = spawn("pdfimages", [
      "-png",
      inputPath,
      path.join(outputDir, "img"),
    ]);

    process.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: "Failed to extract images" });
      }

      const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".png"));

      if (files.length === 0) {
        return res.status(400).json({ error: "No images found in PDF" });
      }

      const zipPath = path.resolve(`${outputDir}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(output);
      files.forEach((file) => {
        archive.file(path.join(outputDir, file), { name: file });
      });
      archive.finalize();

      output.on("close", () => {
        res.json({
          message: "Images extracted successfully",
          imageCount: files.length,
          downloadUrl: `/api/extract-images/download/${path.parse(req.file.filename).name}`,
        });
      });

    });

  }catch(err){
      logger.error("Image Extraction action error: ",err);
      res.status(500).json({error: "Failed to extract image action."})
  } 

});

app.post("/api/compress-pdf", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Please provide a PDF file." });
    }

    const inputPath = req.file.path;
    const ALLOWED_COMPRESS_QUALITIES = ['screen', 'ebook', 'printer', 'prepress', 'default'];
    const compress_quality = ALLOWED_COMPRESS_QUALITIES.includes(req.body.compress_quality)
      ? req.body.compress_quality
      : 'ebook';
    const outputPath = `compressed_${Date.now()}.pdf`;

    // execFile with an argument array - no shell involved, so nothing here can
    // be used for command injection even though inputPath/compress_quality
    // originate from request data.
    execFile('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=/${compress_quality}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ],
      (err) => {
          if(err) {
            try { fs.unlinkSync(inputPath); } catch (_) {}
            return res.status(500).json({error: "Compression failed."});
          }

          res.download(outputPath, "compressed.pdf", (dlErr) => {
              try { fs.unlinkSync(inputPath); } catch (_) {}
              try { fs.unlinkSync(outputPath); } catch (_) {}
              if (dlErr) logger.error("Download error:", dlErr);
          });
      });
  } catch (error) {
    logger.error("Compress PDF error:", error);
    res.status(500).json({ error: "Failed to compress PDF" });
  }
});

app.post("/api/delete-pages", uploadToDelete.single("file"), authenticate, ...apiMiddleware, async(req, res) =>{

    try{

      if(!req.file){
        return res.status(400).json({error: "Please upload a file"});
      }

      const inputPath = req.file.path;
      const outputDir = path.join(process.cwd(), "delete_action");
      const outputPath = path.join(outputDir,`delete_update_${Date.now()}.pdf`);

      const existingPdfBytes = await req.file.buffer;//arrayBuffer();
      const deletedPages = getDeletedPages(req.body.deleted_page_no);
      logger.info(deletedPages);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const newPdf = await PDFDocument.create();

      const pageCount = pdfDoc.getPageCount();
      logger.info(pageCount);

      for(let i=0; i<pageCount; i++)
      {
        const pg_num = i+1;
        if (!deletedPages.includes(pg_num)){
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
          newPdf.addPage(copiedPage);
        }
      }

      const pdfBytes = await newPdf.save();

      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
      fs.writeFileSync(outputPath, pdfBytes);

      res.download(outputPath, outputPath, (err) => {
            if(err)logger.info("Error downloading updated (with deleted page) pdf file: ",outputPath);
            try { fs.unlinkSync(outputPath); } catch (_) {}
        });
      logger.info("downloaded updated (with deleted pages) pdf");

    }catch(err){
      logger.error("Detele action error: ",err);
      res.status(500).json({error: "Failed to perform delete action."})
    }
});

app.post("/api/page-del-rotation", uploadToDelete.single("file"), authenticate, ...apiMiddleware, async (req, res) => {

    try{

      if(!req.file){
        return res.status(400).json({error: "No input file found"});
      }
        const inputPath = req.file.path;
        const outputDir = path.join(process.cwd(), "rotation_action");
        const outputPath = path.join(outputDir,`rotation_update_${Date.now()}.pdf`);


        const rotationInfo =  reConstructMap(req.body.rotationInfo);
        const deletedPageNo =  getPageNumbers(req.body.deletedPage);

        const existingPdfBytes = await req.file.buffer;
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const newPdf = await PDFDocument.create();

        const pageCount = pdfDoc.getPageCount();

        for(let i=0; i<pageCount; i++)
        {
          let pg_num = i+1;
          if(!deletedPageNo.includes(pg_num)){
            const [copiedPage] = await newPdf.copyPages(pdfDoc,[i]);

            if(rotationInfo.has(pg_num))
              copiedPage.setRotation(degrees(rotationInfo.get(pg_num)));
            newPdf.addPage(copiedPage);
          }

        }

        const pdfBytes = await newPdf.save();


        if(!fs.existsSync(outputDir))
          fs.mkdirSync(outputDir);
        fs.writeFileSync(outputPath, pdfBytes);


        res.download(outputPath, outputPath, (err) => {
            if(err)
              logger.info("Error downloading pdf file ", outputPath);
            try { fs.unlinkSync(outputPath); } catch (_) {}
        });
        logger.info("Download successful.")

    }catch(err){
      logger.error("Rotation delete action error: ",err);
      res.status(500).json({error: "Failed to process rotation/delete update."})
    }

});

app.post("/api/page-rearrange", uploadToDelete.single("file"), authenticate, ...apiMiddleware, async (req, res) => {

  try{

    if(!req.file){
      return res.status(400).json({error: "No input file found"});
    }

    const inputPath = req.file.path;
    const outputDir = path.join(process.cwd(), "reorder_action");
    const outputPath = path.join(outputDir,`reorder_update_${Date.now()}.pdf`);

    const pageOrder = getNumericOrder(req.body.newPageOrder);
    const existingPdfBytes = await req.file.buffer;
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(
        pdfDoc,
        pageOrder.map((n) => n - 1) // convert to 0-based index
    );

    copiedPages.forEach((page) => newPdf.addPage(page));
    const pdfBytes = await newPdf.save();

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
      fs.writeFileSync(outputPath, pdfBytes);

    res.download(outputPath, outputPath, (err) => {
          if(err)logger.info("Error downloading reordered pdf file: ",outputPath);
          fs.unlinkSync(outputPath);
      });
    logger.info("downloaded reordered updated pdf");

  }catch(err){
    logger.error("Re-arrange action error: ", err);
    res.status(500).json({error: "Failed to re-arrange action"});
  }

});

app.post("/api/convert-img", upload.single("file"), authenticate, ...apiMiddleware, async(req, res) =>{

  try{
    if(!req.file){
      return res.status(400).json({error: "Please upload a file"});
      if(!(req.path.toLowerCase().endsWith('.jpg') || req.path.toLowerCase().endsWith('.jpeg') || req.path.toLowerCase().endsWith('.png')))
      {
          return res.status(400).json({error: "Please upload a valid image file (.jpg/.jpeg/png)"});
      }
    }

    const inputPath = req.file.path;
    const outputDir = path.join(process.cwd(), "converted_img");
    const outputPath = path.join(outputDir,`converted_img_${Date.now()}.pdf`);
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const imageBytes = await fsp.readFile(req.file.path);
    let image;
    logger.info(inputPath)

    if (req.body.fileType === 'jpg')
      image = await pdfDoc.embedJpg(imageBytes);
    if (req.body.fileType === 'png')
      image = await pdfDoc.embedPng(imageBytes);

    let scale_val = 1.0;
    if(image.width>550 || image.height>800)
    {
        scale_val = 0.5;
    }
    const imageDims = image.scale(scale_val);

    // logger.info("imageDim: w, h", imageDims.width, imageDims.height);
    // logger.info("page: w, h", page.getWidth(), page.getHeight());

    page.drawImage(image, {
        x: page.getWidth() / 2 - imageDims.width / 2,
        y: page.getHeight() / 2 - imageDims.height / 2,
        width: imageDims.width,
        height: imageDims.height,
    });

    const pdfBytes = await pdfDoc.save();
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    fs.writeFileSync(outputPath, pdfBytes);

    res.download(outputPath, outputPath, (err) => {
      if(err)logger.info("Error downloading img to pdf converted file: ",outputPath);
      fs.unlinkSync(outputPath);
    });
    logger.info("downloaded image");

  }catch(err){
    logger.error("Image to Pdf conversion error: ",err);
    res.status(500).json({error: "Failed to convert from image to pdf."})

  }


});

app.post("/api/merge-pdfs", upload.array("pdfs"), authenticate, ...apiMiddleware, async (req, res) =>{

  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: "Please upload at least two PDF files" });
    }

    
    const mergedPdf = await PDFDocument.create();
    
    for (let file of req.files) {
      const fileBuffer = fs.readFileSync(file.path);
      const pdf =  await PDFDocument.load(fileBuffer);

      // logger.info(pdf.getPageCount());
      const pageIndices = Array.from({ length: pdf.getPageCount() }, (_, i) => i);
      const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
      await copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();

    const outputDir = path.join(process.cwd(), "merged");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // Unique file name
    const outputFile = path.join(outputDir, `merged_${Date.now()}.pdf`);
    fs.writeFileSync(outputFile, mergedPdfBytes);

    // Cleanup uploaded files
    req.files.forEach((file) => fs.unlinkSync(file.path));

    res.download(outputFile, "merged.pdf", (err) => {
      if (err) logger.error("Download error:", err);
      // Delete merged file after sending
      fs.unlinkSync(outputFile);
    });
    // res.download(outputFile);
    logger.info("downloaded")

  } catch (err) {
    logger.error("Merge error:", err);
    res.status(500).json({ error: "Failed to merge PDF files" });
  }
  
});


app.post("/api/convert", uploadDoc.single("file"), authenticate, ...apiMiddleware, async (req, res, next) => {
  const inputPath = req.file.path;

  // uploadDoc's fileFilter already restricts mimetype to .doc/.docx, but the
  // extension itself comes from the client-supplied originalname, so it must
  // still be validated before being used to build a filesystem path.
  const rawExt = path.extname(req.file.originalname).toLowerCase();
  const ext = ['.doc', '.docx'].includes(rawExt) ? rawExt : ".docx";
  const safeInputPath = inputPath + ext;
  fs.renameSync(inputPath, safeInputPath);

  const outputDir = path.join(process.cwd(), "converted");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
  // execFile with an argument array - avoids the shell entirely, so a crafted
  // filename/extension can't be used to inject additional shell commands
  // (the previous exec()-with-string-interpolation version was vulnerable to this).
  execFile('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, safeInputPath], (err) => {
    if (err) {
      logger.error("DOC to PDF conversion failed:", err);
      return res.status(500).json({ error: "Conversion failed" });
    }

    
    const files = fs.readdirSync(outputDir);
      logger.info("Files in converted/:", files);

      // Try to find the most recent file
      const pdfs = files.filter((f) => f.endsWith(".pdf"));
      if (pdfs.length === 0) {
        return res.status(500).json({ error: "Output PDF not found" });
      }

      const latestPdf = pdfs
          .map((f) => ({
            name: f,
            time: fs.statSync(path.join(outputDir, f)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time)[0].name;

      const outputPath = path.join(outputDir, latestPdf);
      logger.info("Sending:", outputPath);

    res.download(outputPath, (downloadErr) => {
      if (downloadErr) {
        logger.error("Download error:", downloadErr);
        res.status(500).json({ error: "Download failed" });
      }

      //Clean up
      const now = Date.now();
      const allPdfs = fs.readdirSync(outputDir)
      .map(f => path.join(outputDir, f))
      .filter(f => f.endsWith(".pdf"));

      const validPdfs = [];
      allPdfs.forEach(f=>{
        const stats = fs.statSync(f);

        if (now - stats.mtimeMs > CLEANUP_TIME){

          fs.unlinkSync(f);
          logger.info(`Deleted expired file: ${path.basename(f)}`);
        }
        else{
          validPdfs.push(f);
        }
      });
      // End of clean up
    });
  });
});

// Usage stats endpoint
app.get("/api/usage/stats", optionalAuth, async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.json({
        daily: { used: 0, limit: 10 },
        monthly: { used: 0, limit: 0 },
        tier: 'free',
      });
    }

    const { getUserUsageStats } = await import('./services/usageTrackingService.js');
    const stats = await getUserUsageStats(req.userId);
    
    res.json({
      ...stats,
      tier: req.user?.subscription_tier || 'free',
    });
  } catch (error) {
    next(error);
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Only bind a port and start the background cleanup reaper when this file is
// run directly (`node server.js`) - not when it's imported (e.g. by tests),
// so test suites can exercise `app` with supertest-style requests without
// opening a real socket or leaving an interval running.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const PORT = process.env.PORT || 3000;
  const server = useHttps && sslOptions
    ? https.createServer(sslOptions, app)
    : http.createServer(app);
  const protocol = useHttps && sslOptions ? "https" : "http";
  server.listen(PORT, () => {
    logger.info(`Backend running on ${protocol}://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Database: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
    logger.info(`Redis: ${process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL ? 'Connected' : 'Not configured'}`);
  });

  startCleanupReaper();
}

export default app;

