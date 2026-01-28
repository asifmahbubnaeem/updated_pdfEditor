# Use Node.js 20 LTS as base image
FROM node:20-bookworm-slim

# Install system dependencies for all POST routes that use external tools:
# - qpdf: encrypt/decrypt
# - python3 + pip: convert-pdf-docx, img-to-tbl-data, img-to-txt-data, extract-tables
# - poppler-utils: pdfimages (extract-images), pdf2image
# - ghostscript: gs (compress-pdf)
# - libreoffice: soffice (DOC→PDF convert)
# - tesseract-ocr: pytesseract in extract_tables_from_pdf.py
RUN apt-get update && \
    apt-get install -y \
    qpdf \
    python3 \
    python3-pip \
    poppler-utils \
    ghostscript \
    libreoffice \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages \
        pdf2docx pdfplumber pdf2image pytesseract PyMuPDF csv2pdf pandas google-genai

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (production only)
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads extracted converted docx_converted csv-to-pdf image-extracted table-extracted rotation_action delete_action

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
