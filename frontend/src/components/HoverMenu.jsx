import React, { useState } from 'react';
import { Document, Page as Page } from 'react-pdf';
import "../styles/App.css"; // Don't forget to create this CSS file

const HoverMenu = ({ pageNumber }) => {
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  return (
    <div
      className="page-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/*<div className="pdf-viewer">*/}
        {/*
          The Document component wraps your PDF file.
          The PDFPage component renders a specific page number.
        */}
        {/*<Document file={pdfFile}>*/}
          <Page pageNumber={pageNumber} width={250} renderTextLayer={false} renderAnnotationLayer={false}/>
        {/*</Document>*/}
      {/*</div>*/}

      {isHovering && (
        <div className="menu-bar">
          {/*<button onClick={() => alert('Edit clicked!')}>Edit</button>*/}
          <button onClick={() => {alert('Delete clicked!'); console.log("sdfsdf ");}}>❌</button>
          <button onClick={() => alert('Share clicked!')}>🔍</button>
        </div>
      )}
    </div>
  );
};

export default HoverMenu;