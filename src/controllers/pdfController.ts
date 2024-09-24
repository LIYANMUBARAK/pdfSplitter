import fs from 'fs';

import path from 'path'; // Use path for better path handling
import { PDFDocument } from 'pdf-lib';
import { Request, response, Response } from 'express';
import axios, { AxiosRequestConfig } from 'axios';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { writeFile } from 'fs';
import { IncomingMessage } from 'http';


// Controller function to handle the route
export async function getPayload(req: Request, res: Response) {
  try {
    console.log(req.body)
    const url = req.body.customData.pdf
    console.log(url)
    const filePath = "../pdf"
    downloadPDF(url,filePath)


    // await pdfProcess(); // Await the async function
    res.status(200).json({ message: "Second page extracted and saved successfully." });
  } catch (error) {
    console.error("getPayload error: " + error);
    res.status(500).json({ error: "An error occurred while processing the PDF." });
  }
}

async function downloadPDF(url: string, filePath: string) {
    const outputPath = path.resolve(__dirname, '../pdf/downloaded_file.pdf'); // Specify the output file path

    // Using regular expression to extract the reference ID
    const match = url.match(/([a-f0-9\-]{36})$/);
    let referenceId;
    if (match && match[1]) {
        referenceId = match[1];
        console.log("Extracted Reference ID:", referenceId);
    } else {
        console.error("No valid match found in the URL.");
        return;
    }

    try {
        // Step 1: Fetch document data using the referenceId
        const response = await axios.get(`https://services.leadconnectorhq.com/proposals/document/public?referenceId=${referenceId}`);
        const documentData = response.data.document;
        const documentId = documentData._id;
        const locationId = documentData.locationId;

        console.log("Document ID:", documentId);
        console.log("Location ID:", locationId);

        // Step 2: Construct the actual PDF download URL
        const downloadUrl = `https://services.leadconnectorhq.com/proposals/document/public/download?documentId=${documentId}&altType=location&altId=${locationId}&isPublicRequest=true`;

        const options: AxiosRequestConfig = {
            method: 'GET',
            headers: {
                'Accept': 'application/pdf', // Expect a PDF file
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mozilla/5.0',
                'Origin': 'https://link.tyroofs.com',
                'Referer': 'https://link.tyroofs.com/',
                'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Source': 'WEB_USER',
                'Channel': 'APP',
            },
           
        };

        // Step 3: Download the file using axios
        const fileResponse:any = await axios.get(downloadUrl, options);
        
        // Check if the content-type is correct for PDF
        console.log('Response content-type:', fileResponse.headers['content-type']);
      console.log(fileResponse.data)
        if (!fileResponse.data.url) {
            console.error('The response does not contain a valid PDF URL.');
            console.log('Response data:', fileResponse.data.toString()); // Log the response if URL is missing
            return;
        }
        
        // Step 4: Download the PDF file using the URL from the fileResponse
        console.log('Downloading the PDF file from:', fileResponse.data.url);
        
        const downloadResponse = await axios.get(fileResponse.data.url, {
            responseType: 'arraybuffer', // Specify that we want the response as an ArrayBuffer
            headers: {
                'Accept': 'application/pdf', // Expecting a PDF response
                'User-Agent': 'Mozilla/5.0',
                // Add any other headers you need
            }
        });
        
        // Validate the response content type
        if (downloadResponse.headers['content-type'] !== 'application/pdf') {
            console.error('The response is not a PDF file.');
            console.log('Response data:', downloadResponse.data.toString()); // Log the response if it's not PDF
            return;
        }
        
        // Step 5: Write the file to the specified path
        console.log('Saving file...');
        writeFile(outputPath, downloadResponse.data, (err) => {
            if (err) {
                console.error('Error saving the file:', err);
            } else {
                console.log('File saved successfully at', outputPath);
            }
        });
    } catch (error) {
        console.error('Error during PDF download:', error);
    }
}






// Asynchronous function to process the PDF
const pdfProcess = async () => {
  console.log("Start Split Process");

  try {
    // Use absolute paths instead of relative paths
    const inputFilePath = path.resolve(__dirname, '../pdf/Demo.pdf');
    const outputFilePath = path.resolve(__dirname, '../formattedPdf/second_page.pdf');

    // Load the existing PDF document
    const pdfBytes = fs.readFileSync(inputFilePath);  // Use the resolved path here
    const pdf = await PDFDocument.load(pdfBytes);

    // Get the number of pages
    const pagecount = pdf.getPageCount();

    if (pagecount >= 2) {
      // Create a new PDF document for the 2nd page
      const newPdf = await PDFDocument.create();

      // Copy the 2nd page from the original PDF (index 1 is the 2nd page)
      const [secondPage] = await newPdf.copyPages(pdf, [1]);

      // Add the copied page to the new PDF document
      newPdf.addPage(secondPage);

      // Serialize the new PDFDocument to bytes (binary data)
      const newPdfBytes = await newPdf.save();

      // Write the new PDF to the formattedPdf folder
      fs.writeFileSync(outputFilePath, newPdfBytes);  // Use the resolved path here

      console.log(`Second page saved as '${outputFilePath}'`);
    } else {
      console.log("The PDF has fewer than 2 pages.");
    }
  } catch (error) {
    console.error("Error in pdfProcess: " + error);
    throw error; // Re-throw the error to be caught by the calling function
  }

  console.log("End Split Process");
};
