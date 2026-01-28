import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";

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
    width: '80%'
  };

  //const pageContent = (<Page pageNumber={pageNumber} width={250} renderTextLayer={false} renderAnnotationLayer={false}/>);

  return (
    <div style={{display: 'flex'}}>
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative border rounded-lg shadow bg-white p-2 app-container"
    > 
      <Page
        pageNumber={pageNumber}
        width={250}
        renderTextLayer={false}
        renderAnnotationLayer={false}
      />
      <div style={{marginTop:'5px', marginBottom:'5px', color: '#000'}}>{pageNumber}</div>

      {/* Overlay buttons */}
      {/*<div style={{marginTop: '5px', marginBottom: '5px'}} className="absolute inset-0 z-10 flex justify-center items-center gap-2 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
        {/*<button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(pageNumber);
          }}
          style={{marginLeft: '5px', marginRight: '5px'}}
          className="px-2 py-1 bg-red-600 text-white rounded shadow"
        >
          ❌
        </button>*/}
        {/*<button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEnlarge(pageNumber);
          }}
          className="px-2 py-1 bg-blue-600 text-white rounded shadow"
        >
          🔍
        </button>*/}
      {/*</div>*/}
     </div>
     <div style={{border: '2px solid black', color: 'black', borderRadius: '4px',backgroundColor: '#ccc',padding: '8px', height: '10%', marginLeft: '5px',}} onClick={() => {console.log("clicked on ", pageNumber)}}>enlarge</div>
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

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
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


  return (
    <PageLayout>
      <NavBar />
      <div className="flex flex-col items-center p-6 bg-gray-50 min-h-screen">
        <h2 className="text-xl font-bold mb-4" style={{color: '#fff'}}>
          Rearrange Pages
        </h2>

        {/* Upload */}
        <input
          type="file"
          style={{color: 'white', backgroundColor:'#222', padding:'5px', fontSize: '16px', border: '2px solid black', marginRight: '5px'}}
          accept="application/pdf"
          onChange={handleFileChange}
          className="mb-4"
        />

        {/* Save button */}
        {file && (
          <button
            onClick={handleSavePdf}
            className="mb-6 px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700"
          >
            💾 Save PDF
          </button>
        )}

        {/* PDF thumbnails */}
        <div style={{border: '2px solid black', marginTop: '15px', paddingLeft: '25px', backgroundColor: '#3f488c'}}>
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
      </div>
      </div>
    </PageLayout>
  );
}
