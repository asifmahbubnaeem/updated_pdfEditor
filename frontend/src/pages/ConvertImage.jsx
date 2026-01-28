import React, { useState, useRef} from "react";
import PageLayout from "../components/PageLayout";
import NavBar from "../components/NavBar";
import { apiService, downloadBlob, handleApiError } from "../services/api";
import { createRateLimitHandler } from "../utils/rateLimit";

export default function ConvertImage(argument) {
	// body...
	const [file, setFile] = useState(null);
	const [cooldown, setCooldown] = useState(0);
	const fileInputRef = useRef(null);


	// const handleFileChange = async (event) =>{

	// 	const file = event.target.files[0];
	// 	if(!file) return;

	// 	const objectURL = URL.createObjectURL(file);

  //   document.getElementById("image-preview").src = objectURL;
	// 	const reader = new FileReader();
	// 	reader.readAsArrayBuffer(file);

	// 	setFile(file);
	// };


	const handleFileChange = async (event) =>{

		const file = event.target.files[0];
    if (!file) {
        return;
    }

		const reader = new FileReader();
		reader.onload = function(e) {

			const img = new Image();
			img.onload = function() {
				const maxWidth = 1000; // Define your desired max width
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

			}
			img.src = e.target.result;

		};
		reader.readAsDataURL(file);
	};


	  const handleRateLimit = createRateLimitHandler(setCooldown);

	const ConvertImageToPdf = async () => {

		const file = fileInputRef.current.files[0];
		if (!file) return alert("Upload Image (.png/.jpg/.jpeg) file first!");

		let fileType = 'invalid_type';
		if(file.name.toLowerCase().endsWith('.png'))
			fileType = 'png';
		else if(file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg'))
			fileType = 'jpg';

  		if (fileType === 'invalid_type') 
  			return alert("Unsupported Image type, Valid Image types are: .png/.jpg/.jpeg");

  		try{
  			const response = await apiService.convertImage(file, fileType);
  			
  			if (handleApiError(response, handleRateLimit)) {
  				return;
  			}

			downloadBlob(response.data, "ImageToPdf.pdf");

  		}catch(err){
  			console.error(err);
  			if (handleApiError(err, handleRateLimit)) {
  				return;
  			}
  			alert(err.response?.data?.message || err.message || "Image to PDF conversion failed");
  		}
	};

	const getPdfPreviewUrl = (file) => {
    return URL.createObjectURL(file);
  };

	return (
		<PageLayout>
      		<NavBar />
      		<div className="p-4 flex flex-col items-center">
            {cooldown > 0 && (
              <p style={{ color: "red", marginTop: "10px" }}>
                Too many requests. Please wait {cooldown} seconds...
              </p>
            )}
          <h2 className="text-xl font-bold mb-4" style={{color: "green"}}>Convert Image To PDF</h2>
          <div
            className="relative p-3 border rounded-lg shadow-sm bg-white w-44 text-sm text-center"
          >
            {/*<img id="image-preview" src="#" alt="" style={{border: '2px solid black', padding: "5px"}}/>*/}
          	<canvas id="imageCanvas" style={{border: '2px solid green', padding: "5px"}}></canvas>

          </div>

          <div style={{alignItems: "center"}}>
            <input
              type="file"
              text="Upload File"
              accept=".png,.jpg,.jpeg"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{color: "blue", fontSize: '20px', backgroundColor: 'black'}}
              className="mb-4"/>
          </div>
          
          {/*<canvas ref={canvasRef} className="border rounded shadow" />*/}
          <div style={{paddingTop: '10px'}}>
          <button id="decrypt_btn"
            onClick={ConvertImageToPdf}
            disabled={cooldown>0}
            style={{color: '#fff', backgroundColor: 'brown', borderRadius: '10px', fontSize: '14px'}}
            className="bg-green-500 text-white px-4 py-2 rounded">Image To PDF
          </button>
        </div>
    </div>
      	</PageLayout>

		);
}