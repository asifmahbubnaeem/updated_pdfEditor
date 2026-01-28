// PdfEditor.jsx
import React, { useState, useRef } from "react";
import { Document, Page } from "react-pdf";
import { PDFDocument } from "pdf-lib";
import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";
import { apiService, downloadBlob, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";

const PdfEditor = () => {
  const [pdfFile, setPdfFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [numPages, setNumPages] = useState(null);
  const fileInputRef = useRef(null);
  const [cooldown, setCooldown] = useState(0);
  const deleted_page_numbers = [];

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(URL.createObjectURL(file));
    } else {
      alert("Please upload a valid PDF file");
    }
  };

  const onLoadSuccess = ({ numPages }) => {
    const initialPages = Array.from({ length: numPages }, (_, i) => ({
      pageNumber: i + 1,
      deleted: false,
      rotation: 0,
    }));
    setPages(initialPages);
    setNumPages(numPages);
  };


  const handleRateLimit = createRateLimitHandler(setCooldown);

  
  const toggleDelete = (index) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, deleted: !p.deleted } : p))
    );
  };

  const rotatePage = (index, direction) => {
    setPages((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              rotation:
                direction === "right"
                ? (p.rotation + 90) % 360
                : direction === "left"
                ? (p.rotation + 270) % 360
                : direction === "reverse"
                ? (p.rotation + 180) % 360
                : p.rotation,
            }
          : p
      )
    );
  };

  const handleSavePdf = async () => {
    if (!pdfFile) return;

    const existingPdfBytes = await fetch(pdfFile).then((res) =>
      res.arrayBuffer()
    );
    const srcDoc = await PDFDocument.load(existingPdfBytes);
    const newDoc = await PDFDocument.create();

    for (let i = 0; i < pages.length; i++) {
      if (!pages[i].deleted) {
        const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
        copiedPage.setRotation(degrees(pages[i].rotation));
        newDoc.addPage(copiedPage);
      }
    }

    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "reversed.pdf";
    link.click();
  };

function getPageInfo(){

  const myMap = new Map();
  pages.map(p => {
    if(p.deleted) deleted_page_numbers.push(p.pageNumber);
    else{
      console.log(p.rotation);
      if(Number(p.rotation)!=0) {
        myMap.set(p.pageNumber, p.rotation);
        console.log("not zero");
      }
    }
  });

  // const page_rotation = Object.fromEntries(myMap);
  const page_rotation = Array.from(myMap);
  console.log("map size = ", page_rotation.size);
  console.log("rotation map = ", page_rotation);
  return page_rotation
}

const handleSavePdf_backend = async () => {

  const file = fileInputRef.current.files[0];
    if (!file) return alert("Upload PDF first!");

  const rotationInfo = getPageInfo();
  console.log("page rotation map = ",JSON.stringify(rotationInfo));
  console.log("page deleted numbers = ",deleted_page_numbers);

  try{
    const response = await apiService.pageDelRotation(file, deleted_page_numbers, rotationInfo);
    
    if (handleApiError(response, handleRateLimit)) {
      return;
    }

    downloadBlob(response.data, "ModifiedPdf.pdf");

  }catch(err){
    console.error(err);
    if (handleApiError(err, handleRateLimit)) {
      return;
    }
    alert(err.response?.data?.message || err.message || "Rearrange/delete Action failed");
  }
};

  return (

    <PageLayout>
      <NavBar />
    <div>
      <h2>Page Rotation & Delete</h2>
      {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
        )}
      <input
        type="file"
        style={{color: 'white', fontSize: '16px', padding:'5px', backgroundColor: '#222' ,border: '2px solid black', marginRight: '5px'}}
        accept="application/pdf"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="mb-4"
      />
      {pdfFile && (
        <button
          className="mt-4 bg-green-600 text-white px-4 py-2 rounded"
          onClick={handleSavePdf_backend}//{handleSavePdf}
        >
          Save PDF
        </button>
      )}
      {/* PDF Preview + Controls */}
      {pdfFile && (
        <Document file={pdfFile} onLoadSuccess={onLoadSuccess}>
          <div className="grid grid-cols-10 gap-4" style={{border: '2px solid black', marginTop: '15px', padding: '15px', backgroundColor: '#3f488c'}}>
            {pages.map((p, index) =>
              !p.deleted ? (
                <div key={index} className="relative text-center">
                  <Page
                    pageNumber={p.pageNumber}
                    width={300}
                    // height={250}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    rotate={p.rotation}
                  />
                  <div className="flex justify-center gap-2 mt-2" style={{fontSize: '16px'}}>
                    <button
                      className="bg-red-500 text-white px-2 py-1 rounded"
                      onClick={() => toggleDelete(index)}
                    >
                      delete
                    </button>
                    <button
                      className="bg-blue-500 text-white px-2 py-1 rounded"
                      onClick={() => rotatePage(index, "reverse")}
                      style={{fontSize: '16px', margin: '5px'}}
                    >
                      reverse
                    </button>
                    <button
                      className="bg-blue-500 text-white px-2 py-1 rounded"
                      onClick={() => rotatePage(index, "left")}
                      style={{fontSize: '16px', margin: '5px'}}
                    >
                      left
                    </button>
                    <button
                      style={{fontSize: '16px', margin: '5px'}}
                      className="bg-blue-500 text-white px-2 py-1 rounded"
                      onClick={() => rotatePage(index, "right")}
                    >
                      right
                    </button>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </Document>
      )}
    </div>
  </PageLayout>
  );
};

export default PdfEditor;
