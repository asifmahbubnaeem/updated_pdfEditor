import React, { useState } from 'react';
import '../styles/App.css'; // Don't forget to create this CSS file

const Page = ({ pageContent }) => {
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
      <div className="page-content">
        {pageContent}
      </div>

      {isHovering && (
        <div className="menu-bar">
          <button onClick={() => alert('Edit clicked!')}>Edit</button>
          <button onClick={() => alert('Delete clicked!')}>Delete</button>
          <button onClick={() => alert('Share clicked!')}>Share</button>
        </div>
      )}
    </div>
  );
};

export default Page;