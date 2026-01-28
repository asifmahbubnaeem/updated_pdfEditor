import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { apiService, downloadBlob, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { PDFDocument } from "pdf-lib"; // <== new import

import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";

// import HoverMenu from '../components/HoverMenu';
import Page2 from '../components/Page';
import '../styles/App.css';

// Worker setup for Vite
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// Sortable item
function SortablePage({ id, pageNumber, onDelete, onEnlarge }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pageContent = (<Page pageNumber={pageNumber} width={250} renderTextLayer={false} renderAnnotationLayer={false}/>);

  return (
    <div
      className="group relative border rounded-lg shadow bg-white p-2 app-container"
    >
      <Page
        pageNumber={pageNumber}
        width={250}
        renderTextLayer={false}
        renderAnnotationLayer={false}
      />

      {/* Overlay buttons */}
      <div style={{marginTop: '5px', marginBottom: '5px'}} className="absolute inset-0 z-10 flex justify-center items-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
        
        <button>{pageNumber}</button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(pageNumber);
          }}
          style={{marginLeft: '5px', marginRight: '5px'}}
          className="px-2 py-1 bg-red-600 text-white rounded shadow"
        >
          ❌
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEnlarge(pageNumber);
          }}
          className="px-2 py-1 bg-blue-600 text-white rounded shadow"
        >
          🔍
        </button>
      </div>
     </div>
     
  );
}

export default function DeletePages() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [deletedPages, setDeletedPages] = useState([]);
  const [enlargedPage, setEnlargedPage] = useState(null);
  const [pagesOrder, setPagesOrder] = useState([]);

  const popupRef = useRef();
  const fileInputRef = useRef(null);
  const [cooldown, setCooldown] = useState(0);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if(document.getElementById("dl_pg"))
      document.getElementById("dl_pg").value="";
    setFile(selected);
    setNumPages(null);
    setDeletedPages([]);
    setPagesOrder([]);
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPagesOrder(Array.from({ length: numPages }, (_, i) => i + 1));
  };

  const handleDelete = (pageNumber) => {
    setDeletedPages((prev) => [...prev, pageNumber]);
    const input_box = document.getElementById("dl_pg");
    if(input_box.value.trim().length>0)
      input_box.value += ",";
    input_box.value+=pageNumber.toString();
  };

  const closePopup = () => setEnlargedPage(null);

  // ESC closes popup
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") closePopup();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Click outside closes popup
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        closePopup();
      }
    };
    if (enlargedPage) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [enlargedPage]);

  // DnD Kit setup
  const sensors = useSensors(useSensor(PointerSensor));

  const handleRateLimit = createRateLimitHandler(setCooldown);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const oldIndex = pagesOrder.indexOf(active.id);
      const newIndex = pagesOrder.indexOf(over.id);
      setPagesOrder(arrayMove(pagesOrder, oldIndex, newIndex));
    }
  };

  // Save new PDF
const handleSavePdf = async () => {
  if (!file) return;

  const existingPdfBytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  // New empty PDF
  const newPdf = await PDFDocument.create();

  // Keep pages that are not deleted, in the new order
  const newOrder = pagesOrder.filter((p) => !deletedPages.includes(p));

  // Copy pages from old pdf into new one
  const copiedPages = await newPdf.copyPages(
    pdfDoc,
    newOrder.map((n) => n - 1) // convert to 0-based index
  );

  copiedPages.forEach((page) => newPdf.addPage(page));

  const pdfBytes = await newPdf.save();

  // Trigger download
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modified.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};


const handleSavePdf_backend = async () =>{

  const file = fileInputRef.current.files[0];
    if (!file) return alert("Upload PDF first!");

  const deletedPageNo = document.getElementById("dl_pg").value.trim();

  try{
    const response = await apiService.deletePages(file, deletedPageNo);
    
    if (handleApiError(response, handleRateLimit)) {
      return;
    }

    downloadBlob(response.data, "DeletedPdf.pdf");

  }catch(err){
    console.error(err);
    if (handleApiError(err, handleRateLimit)) {
      return;
    }
    alert(err.response?.data?.message || err.message || "Deleted Pages action failed");
  }


};
  return (
    <PageLayout>
      <NavBar />
      <div className="flex flex-col items-center p-6 bg-gray-50 min-h-screen">
        <h2 className="text-xl font-bold mb-4">
          Delete PDF Pages
        </h2>
        {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
        )}
        {/* Upload */}
        <input
          type="file"
          style={{color: 'white', fontSize: '16px', padding:'5px', backgroundColor: '#222' ,border: '2px solid black', marginRight: '5px'}}
          accept="application/pdf"
          onChange={handleFileChange}
          ref={fileInputRef}
          className="mb-4"
        />

        {/* Save button */}
        {file &&(
          <button
            onClick={handleSavePdf_backend}//{handleSavePdf}
            className="mb-6 px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700"
          >
            💾 Save PDF
          </button>
        )}

        {/* PDF thumbnails */}
        <div style={{border: '2px solid black', marginTop: '15px', padding: '15px', backgroundColor: '#3f488c'}}>
        {file && (
          <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={pagesOrder} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-10 gap-4">
                  {pagesOrder.map((pageNumber) =>
                    deletedPages.includes(pageNumber) ? null : (
                      <SortablePage
                        key={pageNumber}
                        id={pageNumber}
                        pageNumber={pageNumber}
                        onDelete={handleDelete}
                        onEnlarge={setEnlargedPage}
                      />
                    )
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </Document>
        )}

        {/* Enlarged popup */}
        {enlargedPage && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div
              ref={popupRef}
              className="bg-white p-4 rounded-lg shadow-lg max-w-3xl max-h-[90vh] overflow-auto"
            >
              <Document file={file}>
                <Page
                  pageNumber={enlargedPage}
                  width={250}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          </div>
        )}
        {file && (<div>
          <p>Give the Page number to delete,in comma separated(i.e. 1-5,6,7)</p>
          <input id="dl_pg" type='text' style={{width: '80%', backgroundColor: '#ccc', border: '2px solid black', height: '20px', color: 'green', fontSize: '16px'}}/>
          {/*<button style={{marginLeft: '3px'}}>Delete Pages</button>*/}
      </div>)}
      </div>
      </div>
    </PageLayout>
  );
}
