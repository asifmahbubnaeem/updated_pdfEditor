import React, { useState, useRef } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
// import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
import { apiService, downloadBlob, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";

import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function ExtractImages() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [quality, setQuality] = useState("ebook");
  const [numPages, setNumPages] = useState(null);
  const [password, setPassword] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [status, setStatus] = useState("");
  const [imageCount, setImageCount] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");
  // const [file, setFile] = useState(null);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileChange = async (event) => {


    const file = event.target.files[0];
    if (!file) return;
    // setFile(event.target.files[0]);
    setStatus("");
    setImageCount(0);
    setDownloadUrl("");

    const compression_button = document.getElementById("btn_cmpr");
    const reader = new FileReader();
    reader.onload = async function () {
      const typedArray = new Uint8Array(this.result);
      
      try{
        const pdf = await getDocument({ data: typedArray }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setPageNum(1);
        renderPage(1, pdf);
        compression_button.disabled = (false || cooldown>0);
      }catch(err){
        const canvas = canvasRef.current;
        canvas.width = 0;
        canvas.height = 0;
        setPdfDoc(null);
        setNumPages(0);
        setPageNum(0);
        compression_button.disabled =( true || cooldown>0);
        console.log("inside exception pdf load", err);
      }

    };
    reader.readAsArrayBuffer(file);
  };

  const renderPage = async (num, pdf = pdfDoc) => {
    if (!pdf) return;
    const page = await pdf.getPage(num);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
  };

  const nextPage = () => {
    if (pageNum < numPages) {
      const newPage = pageNum + 1;
      setPageNum(newPage);
      renderPage(newPage);
    }
  };

  const prevPage = () => {
    if (pageNum > 1) {
      const newPage = pageNum - 1;
      setPageNum(newPage);
      renderPage(newPage);
    }
  };


  const generateUserId = () => {
    if (!localStorage.getItem("userId")) {
      localStorage.setItem("userId", crypto.randomUUID());
    }
    
    const userId = localStorage.getItem("userId");

    return userId;

  }

  const handleRateLimit = createRateLimitHandler(setCooldown);


  const handleEncrypt = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return alert("Upload PDF first!");
    if (!password.trim()) return alert("Enter password!");

    try {
      setIsEncrypting(true);
      const response = await apiService.encryptPdf(file, password);
      
      if (handleApiError(response, handleRateLimit)) {
        return;
      }

      const filename = file.name.replace(/\.pdf$/i, "-protected.pdf");
      downloadBlob(response.data, filename);
    } catch (err) {
      console.error(err);
      if (handleApiError(err, handleRateLimit)) {
        return;
      }
      alert(err.response?.data?.message || err.message || "Encryption failed");
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const filename = 'extracted-images.zip';
      await apiService.downloadFile(downloadUrl, filename);
      setImageCount(0);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  };

  const handleExtractionImage = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) {
      alert("Please upload a PDF.");
      return;
    }

    try {
      setStatus("Extracting images...");
      const response = await apiService.extractImages(file);
      
      if (handleApiError(response, handleRateLimit)) {
        setStatus("");
        return;
      }

      const response_data = response.data;
      setStatus(response_data.message);
      setImageCount(response_data.imageCount);
      setDownloadUrl(response_data.downloadUrl);

    } catch (err) {
      console.error("Error:", err);
      if (handleApiError(err, handleRateLimit)) {
        setStatus("");
        return;
      }
      setStatus(err.response?.data?.error || "Failed to extract images");
      alert(err.response?.data?.error || err.message || "Error extracting images");
    }
  };

  return (
    <PageLayout>
      <NavBar />
        <div className="p-4 flex flex-col items-center" style={{border: "2px solid #000", borderRadius: "15px", padding: "10px"}}>
          <h2 className="text-xl font-bold mb-2" style={{color: 'green'}}>Extract Images From PDF</h2>

          
          <div>
          <canvas ref={canvasRef} className="border rounded shadow" style={{border: '1px solid black', padding: '5px', backgroundColor: '#ccc'}}/>
          {pdfDoc && (
            <div className="flex flex-col items-center gap-4 mt-4" style={{padding: "5px",display: "grid", flexDirection: "column", alignItems: "center" }}>
              <div className="flex items-center gap-4">
                <button
                  onClick={prevPage}
                  disabled={pageNum <= 1}
                  className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <span style={{margin: '10px', fontWeight: 'bold'}}>
                  Page {pageNum} of {numPages}
                </span>
                <button
                  onClick={nextPage}
                  disabled={pageNum >= numPages}
                  className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <div style={{alignItems: "center"}}>
            <input
              type="file"
              style={{backgroundColor: '#ccc', fontSize: '16px', color: 'blue', border: '2px solid black'}}
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="mb-4"/>
          </div>
          {cooldown > 0 && (
              <p style={{ color: "orange", marginTop: "10px", fontWeight: 'bold' }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
            )}
          <button id="btn_cmpr" style={{margin: '10px'}} onClick={handleExtractionImage} disabled={cooldown>0}>Extract Images</button>
          {status && <p className="mb-2" style={{color: 'green', fontWeight: 'bold'}}>{status}</p>}

           {imageCount > 0 && (
        <div className="flex flex-col items-center">
          <p style={{color: 'green', fontWeight: 'bold'}}>{imageCount} images found.</p>
          <button
            onClick={handleDownload}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded shadow"
          >
            Download Images (ZIP)
          </button>
        </div>
      )}
        </div>
        </div>
    </PageLayout>
  );
}
