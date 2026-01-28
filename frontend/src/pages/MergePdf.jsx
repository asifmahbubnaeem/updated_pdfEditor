import React, { useState } from "react";
import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";
import { apiService, downloadBlob, handleApiError } from "../services/api.js";
import { createRateLimitHandler } from "../utils/rateLimit.js";

export default function MergePdf() {
  const [files, setFiles] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const HandleRateLimit = createRateLimitHandler(setCooldown);

  // Add files without replacing the old ones
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if(selectedFiles===null)
    {
      files = null;
      return;
    }
    const pdfFiles = selectedFiles.filter((file) =>
      file.name.toLowerCase().endsWith(".pdf")
    );

    setFiles((prevFiles) => [...prevFiles, ...pdfFiles]);
  };

  // Remove a file by index
  const handleRemoveFile = (index) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      alert("Please select at least two PDF files!");
      return;
    }

    console.log("Uploaded files are = ", files);
    try {
      const response = await apiService.mergePdfs(files);
      downloadBlob(response.data, "Merged.pdf");
    } catch (err) {
      console.error(err);
      if (handleApiError(err, HandleRateLimit)) return;
      alert(err.response?.data?.error || err.message || "Merge failed");
    }
  };

  const getPdfPreviewUrl = (file) => {
    return URL.createObjectURL(file);
  };

  return (
  	<PageLayout>
  		<NavBar />
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50" style={{border: "2px solid #000", borderRadius: "15px",padding: "10px"}}>
      <h2 className="text-xl font-bold mb-4" style={{color: "green"}}>Upload Multiple PDFs</h2>

      {/* Hidden file input */}
      <input
        type="file"
        accept="application/pdf"
        multiple
        id="fileInput"
        style={{padding: "10px", color: "blue", fontWeight: 'bold', fontSize: '16px'}}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Show selected files as boxes with previews */}
      <div className="flex flex-wrap gap-4 mb-4 justify-center">
        {files.map((file, idx) => (
          <div
            key={idx}
            className="relative p-3 border rounded-lg shadow-sm bg-white w-44 text-sm text-center"
          >
            {/* PDF Preview */}
            <iframe
              src={getPdfPreviewUrl(file)}
              title={file.name}
              className="w-full h-10 mb-2 border"
            />
              <div style={{paddingBottom: "5px", display: "flex", flexDirection: "row",alignItems: "center",justifyContent: "center"}}>
                {/* File Name */}
                <p className="truncate" style={{fontSize: "16px", color: "blue", fontWeight: 'bold', border: '2px solid black', padding: '5px', backgroundColor:'#ccc', borderRadius: '3px'}}>{file.name}</p>

                {/* Remove button */}
                <button
                  style={{color: "red", backgroundColor: "#ccc", fontWeight: "bold", marginLeft: '20px', border: '2px solid black'}}
                  onClick={() => handleRemoveFile(idx)}
                  className="absolute top-1 right-1 text-red-500 hover:text-red-700">X
                </button>
            </div>

          </div>
        ))}
      </div>

      {/* Upload button */}
      <button
        onClick={handleMerge}
        style={{backgroundColor: "gray", border: "1px solid black"}}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700"
      >
        Merge All PDF
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
