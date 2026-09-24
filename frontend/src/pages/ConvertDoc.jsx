import React, { useState, useRef } from "react";
import { apiService, downloadBlob, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";

import PageLayout from "../components/PageLayout";

export default function App() {
  const [cooldown, setCooldown] = useState(0);

  const fileInputRef = useRef(null);

  const handleRateLimit = createRateLimitHandler(setCooldown);


  // -------- Convert DOC/DOCX to PDF --------
  const handleConvert = async () => {
  const file = fileInputRef.current.files[0];
  if (!file) return alert("Upload DOC/DOCX first!");

  try {
    const response = await apiService.convertDoc(file);
    
    if (handleApiError(response, handleRateLimit)) {
      return;
    }

    const filename = file.name.replace(/\.(docx|doc)$/i, ".pdf");
    downloadBlob(response.data, filename);
  } catch (err) {
    console.error(err);
    if (handleApiError(err, handleRateLimit)) {
      return;
    }
    alert(err.response?.data?.message || err.message || "Conversion failed");
  }
};




  return (
    <PageLayout>
      <div className="p-6 text-center" style={{border: "2px solid #000", borderRadius: "15px", padding: "10px"}}>
        <h2 className="text-2xl font-bold mb-4" style={{color: "green"}}>Convert DOC to PDF</h2>
        <p>Upload your DOC file to convert it into PDF.</p>
        <input
          style={{color: "blue", fontSize: "16px"}}
          type="file"
          accept=".doc,.docx"
          ref={fileInputRef}
          className="mb-4"/>
        <button id="encrypt_btn"
                  style={{backgroundColor: "gray", border: "1px solid black", fontSize: "16px"}}
                  onClick={handleConvert}
                  disabled={cooldown>0}
                  className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">
                  {"Convert To PDF"}
        </button>
        {cooldown > 0 && (
          <p style={{ color: "red", marginTop: "10px" }}>
            Too many requests. Please wait {cooldown} seconds...
          </p>
        )}
      </div>
    </PageLayout>
  );
}
