// server.js

import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import path from "path";
import multer from "multer";
import cors from "cors";
import helmet from "helmet";
import { exec, spawn, execFile } from "child_process";
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
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/payment.js';
import subscriptionRoutes from './routes/subscription.js';

const app = express();
const VENV = process.env.VIRTUAL_ENV ? process.env.VIRTUAL_ENV.replace(/\/?$/, "/") : "";
const upload = multer({ dest: "uploads/" });
const uploadDoc = multer({
  dest: "uploads/",
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
const uploadToDelete = multer({storage: storage});

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
    console.warn("USE_HTTPS set but server.key/cert missing, falling back to HTTP");
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
        console.error("Encryption failed:", err);
        
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
        if (dlErr) console.error("Download error:", dlErr);
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
        console.error("Decryption failed:", err);
        
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
        if (dlErr) console.error("Download error:", dlErr);
      });
    });
  } catch (error) {
    next(error);
  }
});

function getDeletedPages(deletedPagesAsStr){

  let arr = deletedPagesAsStr.trim().split(',');
  // const numArr = arr.map(Number);
  const numArr=[];

  arr.forEach(item => {
    if(item.includes('-'))
    {
      const [startStr, endStr] = item.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);

      for(let i=start; i<=end; i++)
        numArr.push(i);
    }
    else{
      numArr.push(parseInt(item.trim(),10));
    }

  });
  return numArr;
}


app.get("/api/extract-images/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "images.zip", (err) => {
    if (err) console.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  });
});


app.post("/api/convert-pdf-docx", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {
  const inputPath = req.file.path;
  const outputPath = path.join("docx_converted", `${Date.now()}.docx`);
  fs.mkdirSync("docx_converted", { recursive: true });

  const command = `${VENV}python3 routes/convert_pdf_to_docx.py "${inputPath}" "${outputPath}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Conversion error: ${stderr}`);
      return res.status(500).json({ error: "Conversion failed" });
    }

    res.download(outputPath, "converted.docx", (err) => {
      if (err) console.error("Download error:", err);

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
    if (err) console.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`table-extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  });
});

app.get("/api/img-to-tbl-data/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`image-extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "tables.zip", (err) => {
    if (err) console.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`image-extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
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
    console.log("inputPath = ",inputPath)
    console.log("outputPath = ",outputDir)

    const convertionFormat = req.body.format;
    const outputPath = path.join("extracted-table", `${Date.now()}.${convertionFormat}`);

    if(!fs.existsSync(outputDir))
      fs.mkdirSync(outputDir, { recursive: true });

    const pythonScript = 'routes/from_ai.py';
    // const args = [pythonScript, inputPath, outputDir, convertionFormat];
    const args = ['routes/from_ai.py', inputPath, outputDir, convertionFormat];

    const command = `${VENV}python3 routes/from_ai.py ${inputPath} ${outputDir} ${convertionFormat}`;
    // console.log(command)
    const process = spawn(`${VENV}python3`, args);

    process.stdout.on('data', (data) => {
      console.log(`Print statement from python script=${pythonScript} : ${data.toString()}`)
    });

    process.stderr.on('data', (data) => {
      console.log(`Error statement from python script=${pythonScript} : ${data.toString()}`);
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
      console.error("Table Extraction action error: ",err);
      res.status(500).json({error: "Failed to extract table action."})
  }

});


app.get("/api/img-to-txt-data/download/:id", authenticate, (req, res) => {
  const zipPath = path.resolve(`extracted/${req.params.id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(zipPath, "text.zip", (err) => {
    if (err) console.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`extracted/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
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
    console.log("inputPath = ",inputPath)
    console.log("outputPath = ",outputDir)

    const convertionFormat = req.body.format;
    // const outputPath = path.join("extracted", `${Date.now()}.${convertionFormat}`);

    if(!fs.existsSync(outputDir))
      fs.mkdirSync(outputDir, { recursive: true });

    const pythonScript = 'routes/from_ai_text_extract.py';
    // const args = [pythonScript, inputPath, outputDir, convertionFormat];
    const args = ['routes/from_ai_text_extract.py', inputPath, outputDir, convertionFormat];

    const command = `${VENV}python3 routes/from_ai_text_extract.py ${inputPath} ${outputDir} ${convertionFormat}`;
    // console.log(command)
    const process = spawn(`${VENV}python3`, args);

    process.stdout.on('data', (data) => {
      console.log(`Print statement from python script=${pythonScript} : ${data.toString()}`)
    });

    process.stderr.on('data', (data) => {
      console.log(`Error statement from python script=${pythonScript} : ${data.toString()}`);
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
      console.error("Text Extraction action error: ",err);
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

    const command = `${VENV}python3 routes/extract_tables_from_pdf.py ${inputPath} ${outputDir} ${convertionFormat}`;
    // console.log(command)
    const process = spawn(`${VENV}python3`, args);

    process.stdout.on('data', (data) => {
      console.log(`Print statement from python script=${pythonScript} : ${data.toString()}`)
    });

    process.stderr.on('data', (data) => {
      console.log(`Error statement from python script=${pythonScript} : ${data.toString()}`);
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
      console.error("Table Extraction action error: ",err);
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
        console.error("Failed inside csvToPdf function: ",err);
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

function computeColumnWidths(tableData){
    const colCount = tableData[0].length;
  const colWidths = [];

  for (let col = 0; col < colCount; col++) {
    let maxLen = 0;
    for (let row = 0; row < tableData.length; row++) {
      const cell = String(tableData[row][col] || "");
      if (cell.length > maxLen) maxLen = cell.length;
    }

    // Each char ~ 4 points wide, min 40, max 200
    const width = Math.min(Math.max(maxLen * 4, 40), 200);
    colWidths.push(width);
  }

  return colWidths;
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
    if (err) console.error("Download error:", err);
    try {
      fs.rmSync(`uploads/${req.params.id}`, { force: true });
      fs.rmSync(`csv-to-pdf/${req.params.id}`, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
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
    console.error("CSV to PDF conversion error: ", err);
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
      console.error("Image Extraction action error: ",err);
      res.status(500).json({error: "Failed to extract image action."})
  } 

});

app.post("/api/compress-pdf", upload.single("file"), authenticate, ...apiMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Please provide a PDF file." });
    }

    const inputPath = req.file.path;
    const compress_quality = req.body.compress_quality || 'ebook';
    const outputPath = `compressed_${Date.now()}.pdf`;

    exec(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/${compress_quality} -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${outputPath} ${inputPath}`,

      (err) => {
          if(err) {
            try { fs.unlinkSync(inputPath); } catch (_) {}
            return res.status(500).json({error: "Compression failed."});
          }

          res.download(outputPath, "compressed.pdf", (dlErr) => {
              try { fs.unlinkSync(inputPath); } catch (_) {}
              try { fs.unlinkSync(outputPath); } catch (_) {}
              if (dlErr) console.error("Download error:", dlErr);
          });
      });
  } catch (error) {
    console.error("Compress PDF error:", error);
    res.status(500).json({ error: "Failed to compress PDF" });
  }
});

function getNumericOrder(pageOrder){
  let arr = pageOrder.trim().split(',');
  const numArr=arr.map(Number);
  return numArr;
}

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
      console.log(deletedPages);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const newPdf = await PDFDocument.create();

      const pageCount = pdfDoc.getPageCount();
      console.log(pageCount);

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
            if(err)console.log("Error downloading updated (with deleted page) pdf file: ",outputPath);
            // fs.unlinkSync(outputPath);
        });
      console.log("downloaded updated (with deleted pages) pdf");

    }catch(err){
      console.error("Detele action error: ",err);
      res.status(500).json({error: "Failed to perform delete action."})
    }
});

function getPageNumbers(pageNum){
  if(pageNum.length==0)
    return [];
  const arr = pageNum.split(',');
  return arr.map(Number);
}


function reConstructMap(strRotation){

  const parsedArray = JSON.parse(strRotation);
  const reconstructedMap = new Map(parsedArray);

  return reconstructedMap;
}

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
              console.log("Error downloading pdf file ", outputPath);
        });
        console.log("Download successful.")

    }catch(err){
      console.error("Rotation delete action error: ",err);
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
          if(err)console.log("Error downloading reordered pdf file: ",outputPath);
          fs.unlinkSync(outputPath);
      });
    console.log("downloaded reordered updated pdf");

  }catch(err){
    console.error("Re-arrange action error: ", err);
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
    console.log(inputPath)

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

    // console.log("imageDim: w, h", imageDims.width, imageDims.height);
    // console.log("page: w, h", page.getWidth(), page.getHeight());

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
      if(err)console.log("Error downloading img to pdf converted file: ",outputPath);
      fs.unlinkSync(outputPath);
    });
    console.log("downloaded image");

  }catch(err){
    console.error("Image to Pdf conversion error: ",err);
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

      // console.log(pdf.getPageCount());
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
      if (err) console.error("Download error:", err);
      // Delete merged file after sending
      fs.unlinkSync(outputFile);
    });
    // res.download(outputFile);
    console.log("downloaded")

  } catch (err) {
    console.error("Merge error:", err);
    res.status(500).json({ error: "Failed to merge PDF files" });
  }
  
});


app.post("/api/convert", uploadDoc.single("file"), authenticate, ...apiMiddleware, async (req, res, next) => {
  const inputPath = req.file.path;
  
  const ext = path.extname(req.file.originalname) || ".docx";
  const safeInputPath = inputPath + ext;
  fs.renameSync(inputPath, safeInputPath);

  const outputDir = path.join(process.cwd(), "converted");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
  // LibreOffice command
  exec(`soffice --headless --convert-to pdf --outdir ${outputDir} "${safeInputPath}"`, (err) => {
    if (err) {
      console.error("DOC to PDF conversion failed:", err);
      return res.status(500).json({ error: "Conversion failed" });
    }

    
    const files = fs.readdirSync(outputDir);
      console.log("Files in converted/:", files);

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
      console.log("Sending:", outputPath);

    res.download(outputPath, (downloadErr) => {
      if (downloadErr) {
        console.error("Download error:", downloadErr);
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
          console.log(`Deleted expired file: ${path.basename(f)}`);
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

const PORT = process.env.PORT || 3000;
const server = useHttps && sslOptions
  ? https.createServer(sslOptions, app)
  : http.createServer(app);
const protocol = useHttps && sslOptions ? "https" : "http";
server.listen(PORT, () => {
  console.log(`Backend running on ${protocol}://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`Redis: ${process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL ? 'Connected' : 'Not configured'}`);
});

