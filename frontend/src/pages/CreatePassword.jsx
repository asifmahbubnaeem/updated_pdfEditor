import React, { useState, useRef } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
// import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";
import { apiService, downloadBlob, handleApiError } from "../services/api.js";
import { createRateLimitHandler } from "../utils/rateLimit.js";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function App() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [password, setPassword] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const HandleRateLimit = createRateLimitHandler(setCooldown);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function () {
      const typedArray = new Uint8Array(this.result);
      
      try{
        const pdf = await getDocument({ data: typedArray }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setPageNum(1);
        renderPage(1, pdf);
        document.getElementById("encrypt_btn").disabled = (false || cooldown>0);
      }catch(err){
        const canvas = canvasRef.current;
        canvas.width = 0;
        canvas.height = 0;
        setPdfDoc(null);
        setNumPages(0);
        setPageNum(0);
        document.getElementById("encrypt_btn").disabled =( true || cooldown>0);
        console.log("inside exception pdf load");
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

  const handleEncrypt = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return alert("Upload PDF first!");
    if (!password.trim()) return alert("Enter password!");

    try {
      setIsEncrypting(true);
      const response = await apiService.encryptPdf(file, password);
      downloadBlob(response.data, file.name.replace(/\.pdf$/i, "-protected.pdf"));
    } catch (err) {
      console.error(err);
      if (handleApiError(err, HandleRateLimit)) return;
      alert(err.response?.data?.error || err.message || "Encryption failed");
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleDecrypt = async () => {
    const file = fileInputRef.current.files[0];
    if (!file || !password) {
      alert("Please upload a PDF and enter a password.");
      return;
    }

    try {
      const response = await apiService.decryptPdf(file, password);
      downloadBlob(response.data, "decrypted.pdf");
    } catch (err) {
      console.error("Error:", err);
      if (handleApiError(err, HandleRateLimit)) return;
      alert("Error decrypting PDF (maybe wrong password?)");
    }
  };

  return (
    <PageLayout>
      <NavBar />
        <div className="p-4 flex flex-col items-center" style={{border: "2px solid #000", borderRadius: "15px", padding: "10px"}}>
          <h2 className="text-xl font-bold mb-2" style={{color: 'green'}}>Create a Password Protected PDF</h2>

          
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
              style={{backgroundColor: '#ccc', fontSize: '16px', color: 'blue'}}
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="mb-4"/>
          </div>
          <div style={{padding: "10px" ,alignItems: "center"}}>
            <input
                  type="password"
                  placeholder="password"
                  value={password}
                  style={{border: '2px solid blue', padding: '10px', fontSize: '16px', color: '#333', width: "50%"}}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border p-10 rounded w-64"/>
          </div>
          <div>
            <button id="encrypt_btn"
                    style={{color: '#fff', backgroundColor: '#333', borderRadius: '10px'}}
                    onClick={handleEncrypt}
                    disabled={isEncrypting || cooldown>0}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">
                    {isEncrypting ? "Encrypting…" : "Create a password protected PDF"}
            </button>
        </div>
          {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
            )}

        </div>
        </div>
    </PageLayout>
  );
}
