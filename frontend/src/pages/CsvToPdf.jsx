import React, { useState, useRef } from "react";
import { apiService, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";
import PageLayout from "../components/PageLayout";

export default function CsvToPdf() {
  const [cooldown, setCooldown] = useState(0);

  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setStatus("");
    setDownloadUrl("");
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const filename = 'converted.pdf';
      await apiService.downloadFile(downloadUrl, filename);
      setDownloadUrl(null);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  };

  const handleRateLimit = createRateLimitHandler(setCooldown);

  const convertCSVToPDF = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) {
      alert("Please upload a CSV file.");
      return;
    }

    try {
      setStatus(`Converting csv to pdf file...`);
      const response = await apiService.csvToPdf(file);
      
      if (handleApiError(response, handleRateLimit)) {
        setStatus("");
        return;
      }

      const response_data = response.data;
      setStatus(response_data.message);
      setDownloadUrl(response_data.downloadUrl);

    } catch (err) {
      console.error("Error:", err);
      if (handleApiError(err, handleRateLimit)) {
        setStatus("");
        return;
      }
      setStatus(err.response?.data?.error || "Failed to convert from csv to pdf");
      alert(err.response?.data?.error || err.message || "Error converting from csv to pdf");
    }
  };

  return (
    <PageLayout>
        <div className="p-4 flex flex-col items-center" style={{border: "2px solid #000", borderRadius: "15px", padding: "10px"}}>
          <h2 className="text-xl font-bold mb-2" style={{color: 'green'}}>Extract Tables from PDF Files</h2>

          
          <div>
          {/*<canvas ref={canvasRef} className="border rounded shadow" style={{border: '1px solid black', padding: '5px', backgroundColor: '#ccc'}}/>*/}
          {/*{pdfDoc && (
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
              <p style={{fontWeight: ''}}>Please select the output file format</p>
              <select 
                style={{padding: '5px', backgroundColor: '#ccc', color: '#000', border: '1px solid black', borderRadius: '3px', fontSize: '14px'}}
                value={format} 
                onChange={(e) => setFormat(e.target.value)}>
                <option value="csv">csv</option>
                <option value="html">html</option>
                <option value="json">json</option>
                <option value="pdf">pdf</option>
                <option value="xlsx">excel</option>
                <option value="txt">text</option>
                <option value="xml">xml</option>
              </select>
            </div>
          )}*/}
          <div style={{alignItems: "center"}}>
            <input
              type="file"
              style={{backgroundColor: '#ccc', fontSize: '16px', color: 'blue', border: '2px solid black'}}
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="mb-4"/>
          </div>
          {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
            )}
          <button id="btn_csv_to_pdf" style={{margin: '10px'}} onClick={convertCSVToPDF} disabled={cooldown>0}>CSV To PDF</button>
          {status && <p className="mb-2" style={{color: 'green', fontWeight: 'bold'}}>{status}</p>}
        </div>
        {downloadUrl && (
        <div className="flex flex-col items-center">
          <button
            onClick={handleDownload}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded shadow"
          >
            Download PDF (ZIP)
          </button>
        </div>
      )}
        </div>
    </PageLayout>
  );
}
