import React, { useState, useRef } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiService, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";
import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function ExtractTextFromImage() {
  const [image, setImage] = useState(null);
  const [format, setFormat] = useState("txt");
  const [mimetype, setMimetype] = useState("");
  const [tableCount, setTableCount] = useState(0);
  
  const [cooldown, setCooldown] = useState(0);

  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);


    const handleFileChange = async (event) =>{
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {

      const img = new Image();
      img.onload = function() {
        const maxWidth = 700; // Define your desired max width
        const mainCanvas = document.getElementById('imageCanvas');
        const ctx = mainCanvas.getContext('2d');

        let newWidth, newHeight;

        if (img.width > maxWidth) {
            newWidth = maxWidth;
            newHeight = (img.height * maxWidth) / img.width;
        } else {
            newWidth = img.width;
            newHeight = img.height;
        }

        mainCanvas.width = newWidth;
        mainCanvas.height = newHeight;
        // 3. Draw the resized image onto the main canvas
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        console.log("Image resized and drawn on canvas.");
        console.log(file.name);

      }
      img.src = e.target.result;
      setImage(img);

    };
    reader.readAsDataURL(file);
    const fileName = file.name;
    let fileExtension = "";
    try{
      fileExtension = fileName.split('.')[1];
      setMimetype(`${fileExtension}`);
      console.log(fileExtension);
    }catch(err){
      console.log("File fileExtension error: ", err);
    }

  };


  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const filename = `extracted-text-${format}.zip`;
      await apiService.downloadFile(downloadUrl, filename);
      setTableCount(0);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  };


  const handleRateLimit = createRateLimitHandler(setCooldown);

  const handleTextExtraction = async () => {
    const file = fileInputRef.current.files[0];
    if (!file) {
      alert("Please upload an image file.");
      return;
    }

    try {
      setStatus(`Extracting text from Image...`);
      const response = await apiService.imageToTextData(file, format, mimetype);
      
      if (handleApiError(response, handleRateLimit)) {
        setStatus("");
        return;
      }

      const response_data = response.data;
      setStatus(response_data.message);
      setTableCount(response_data.tablesCount);
      setDownloadUrl(response_data.downloadUrl);

    } catch (err) {
      console.error("Error:", err);
      if (handleApiError(err, handleRateLimit)) {
        setStatus("");
        return;
      }
      setStatus(err.response?.data?.error || "Failed to extract text");
      setTableCount(0);
      alert(err.response?.data?.error || err.message || "Error extracting text");
    }
  };

  return (
    <PageLayout>
      <NavBar />
        <div className="p-4 flex flex-col items-center" style={{border: "2px solid #000", borderRadius: "15px", padding: "10px"}}>
          <h2 className="text-xl font-bold mb-2" style={{color: 'green'}}>Extract Table Data from Images</h2>

          
          <div>
          <canvas ref={canvasRef} className="border rounded shadow" id="imageCanvas" style={{border: '1px solid black', padding: '5px', backgroundColor: '#ccc'}}/>
          <div style={{alignItems: "center"}}>
            <input
              type="file"
              style={{backgroundColor: '#ccc', fontSize: '16px', color: 'blue', border: '2px solid black'}}
              accept=".png, .jpg, .jpeg"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="mb-4"/>
          </div>
          {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
            )}
          <button id="btn_extract" style={{margin: '10px'}} onClick={handleTextExtraction} disabled={cooldown>0}>Extract Text From Image</button>
          {status && <p className="mb-2" style={{color: 'green', fontWeight: 'bold'}}>{status}</p>}
        </div>
        {tableCount > 0 && (
        <div className="flex flex-col items-center">
          <button
            onClick={handleDownload}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded shadow"
          >
            Download Text (ZIP)
          </button>
        </div>
      )}
        </div>
    </PageLayout>
  );
}
