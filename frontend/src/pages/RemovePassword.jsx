import React, { useState, useRef } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
// import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";
import { apiService } from "../services/api.js";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function RemovePassword() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [password, setPassword] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

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
        document.getElementById("encrypt_btn").disabled = false;
        document.getElementById("decrypt_btn").disabled = true;
      }catch(err){
        const canvas = canvasRef.current;
        canvas.width = 0;
        canvas.height = 0;
        setPdfDoc(null);
        setNumPages(0);
        setPageNum(0);
        document.getElementById("encrypt_btn").disabled = true;
        document.getElementById("decrypt_btn").disabled = false;
        console.log("inside exception pdf load");
      }

    };
    reader.readAsArrayBuffer(file);
  };

  const renderPage = async (num, pdf = pdfDoc) => {
    if (!pdf) return;
    const page = await pdf.getPage(num);
    const viewport = page.getViewport({ scale: 1.5 });
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

  const HandleRateLimit = (data) =>{
          // alert(`Rate limit exceeded. Please wait ${data.retryAfter} seconds.`);
      setCooldown(data.retryAfter);
      let remaining = data.retryAfter;
      const interval = setInterval(() => {
        remaining -= 1;
        setCooldown(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 1000);
  }


  const handleEncrypt = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) return alert("Upload PDF first!");
    if (!password.trim()) return alert("Enter password!");

    try {
      setIsEncrypting(true);
      const response = await apiService.encryptPdf(file, password);

      // apiService returns blob data directly
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "-protected.pdf");
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 429) {
        HandleRateLimit(err.response.data);
        return;
      }
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
      
      // apiService returns blob data directly
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "decrypted.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error:", err);
      if (err.response?.status === 429) {
        HandleRateLimit(err.response.data);
        return;
      }
      alert("Error decrypting PDF (maybe wrong password?)");
    }
  };

  return (
    <PageLayout>
      <NavBar />
        <div className="p-4 flex flex-col items-center" style={{border: "2px solid #ccc", borderRadius: "5px",padding: "25px",display: "grid", flexDirection: "column", alignItems: "center" }}>
            {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
            )}
          <h2 className="text-xl font-bold mb-4">Remove Password From PDF</h2>

          <div style={{alignItems: "center"}}>
            <input
              type="file"
              text="Upload File"
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="mb-4"/>
          </div>
          
          {/*<canvas ref={canvasRef} className="border rounded shadow" />*/}
          <div style={{padding: "10px" ,alignItems: "center"}}>
            <input
                  type="password"
                  placeholder="Enter password"
                  // value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border p-2 rounded w-64" style={{width: "50%"}}
                />
          </div>
          <div>
          <button id="decrypt_btn"
            onClick={handleDecrypt}
            disabled={cooldown>0}
            style={{color: '#fff', backgroundColor: '#333', borderRadius: '10px'}}
            className="bg-green-500 text-white px-4 py-2 rounded">Remove Password from PDF file
          </button>
        </div>
          {pdfDoc && (
            <div className="flex flex-col items-center gap-4 mt-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={prevPage}
                  disabled={pageNum <= 1}
                  className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <span>
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

        </div>
    </PageLayout>
  );
}
