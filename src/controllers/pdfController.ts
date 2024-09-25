import fs from 'fs';

import path from 'path'; // Use path for better path handling
import { PDFDocument } from 'pdf-lib';
import { Request, response, Response } from 'express';
import axios, { AxiosRequestConfig } from 'axios';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { writeFile } from 'fs';
import FormData from 'form-data';
import { fetchAuthTokenForLocation } from './authController';
import { promisify } from 'util'; // Import promisify to convert callback-based functions into promises

const unlinkAsync = promisify(fs.unlink); // Promisify fs.unlink to make it work with promises




// Controller function to handle the route
export async function getPayload(req: Request, res: Response) {
  try {
    console.log(req.body)
    const locationId = req.body.location.id
    const contactId = req.body.contact_id
    const url = req.body.customData.pdf
    console.log(url)
    const fileName = `${req.body.first_name}${req.body.last_name}.pdf`
    await downloadPDF(url,fileName)

    const splitFileName = await pdfProcess(fileName) as string// Await the async function

    const uploadedData:any=await uploadPdfToMedia(splitFileName,locationId)
    const fileId = uploadedData.fileId
    console.log(fileId)
    const customFieldId = await getCustomFieldId(locationId) as string
    await updateCustomField(locationId,contactId,fileId,customFieldId)

    await deleteFiles(fileName,splitFileName)

    res.status(200).json({ message: "Second page extracted and saved successfully." });
  } catch (error) {
    console.error("getPayload error: " + error);
    res.status(500).json({ error: "An error occurred while processing the PDF." });
  }
}

async function downloadPDF(url: string,fileName:string) {
    console.log("downloading pdf")
    const outputPath = path.resolve(__dirname, `../pdf/${fileName}`); // Specify the output file path

    // Using regular expression to extract the reference ID
    const match = url.match(/([a-f0-9\-]{36})$/);
    let referenceId;
    if (match && match[1]) {
        referenceId = match[1];
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
      console.log(fileResponse.data)
        if (!fileResponse.data.url) {
            console.error('The response does not contain a valid PDF URL.');
            console.log('Response data:', fileResponse.data.toString()); // Log the response if URL is missing
            return;
        }
        
        // Step 4: Download the PDF file using the URL from the fileResponse
        
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
        await fs.promises.writeFile(outputPath, downloadResponse.data);
        console.log('File saved successfully at', outputPath);

    } catch (error) {
        console.error('Error during PDF download:', error);
    }
}



// Asynchronous function to process the PDF
const pdfProcess = async (fileName: string) => {
    console.log("Start Split Process");
    const fileNameWithoutExtension = fileName.replace(".pdf", "");

    try {
      const splitFileName = `${fileNameWithoutExtension}Split.pdf`;
      const inputFilePath = path.resolve(__dirname, `../pdf/${fileName}`);
      const outputFilePath = path.resolve(__dirname, `../formattedPdf/${splitFileName}`);
  
      // Load the existing PDF document
      const pdfBytes = fs.readFileSync(inputFilePath);
     
      // Force the file to be treated as a buffer
      const pdf = await PDFDocument.load(Buffer.from(pdfBytes));
  
      const pagecount = pdf.getPageCount();
  
      if (pagecount >= 2) {
        const newPdf = await PDFDocument.create();
        const [secondPage] = await newPdf.copyPages(pdf, [1]);
        newPdf.addPage(secondPage);
        const newPdfBytes = await newPdf.save();
        fs.writeFileSync(outputFilePath, newPdfBytes);
        console.log(`Second page saved as '${outputFilePath}'`);
        return splitFileName;
      } else {
        console.log("The PDF has fewer than 2 pages.");
      }
    } catch (error:any) {
      console.error("Error in pdfProcess: " + error);
      if (error.message.includes('Failed to parse PDF document')) {
        console.error('The file is not a valid PDF or is corrupted.');
      }
      throw error;
    }
  
    console.log("End Split Process");
  };



const uploadPdfToMedia = async (pdfName:string,locationId:string)=>{
   try {
    console.log("uploading processed pdf to media function ")
    const filePath = path.resolve(__dirname, `../formattedPdf/${pdfName}`); // Adjust the path to your PDF file

    if (!fs.existsSync(filePath)) {
        throw new Error(`File ${pdfName} does not exist`);
      }


    // Create a FormData object
    const form = new FormData();
    

    // Append the PDF file and other required fields to the form
    form.append('file', fs.createReadStream(filePath)); // Upload the actual file
    form.append('name', pdfName); // Name of the file
    
    const accessToken = await fetchAuthTokenForLocation(locationId);
    const options = {
        method: 'POST',
        url: 'https://services.leadconnectorhq.com/medias/upload-file',
        headers: {
          ...form.getHeaders(), // Get the correct headers for the form
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          Version: '2021-07-28',
        },
        data: form // Use the FormData object as the data
      };
      
      return new Promise(async (resolve, reject) => {
        try {
          const { data } = await axios.request(options);
          console.log(data);
          resolve(data); // Resolve the promise with the data
        } catch (error:any) {
          console.error(error.response ? error.response.data : error.message);
          reject(error.response ? error.response.data : error.message); // Reject the promise with the error
        }
      });
      
} catch (error) {
  console.error('Error uploading PDF:', error);
}
};


const  getCustomFieldId = async(locationId:string)=>{
    console.log("get custom field function")
    try {
            
        let customFieldId:string
        const accessToken = await fetchAuthTokenForLocation(locationId)
        const options = {
            method: 'GET',
            url: `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Version: '2021-07-28',
              Accept: 'application/json'
            }
          };
        
          try {
            const { data } = await axios.request(options);
            const dtpField = data.customFields.find((field:any) => field.name === "DTP second page url");

            if (dtpField) {
              customFieldId = dtpField.id
              return customFieldId
            } else {
              console.log("DTP Custom Field not found.");
            }

    } catch (error) {
        
    }
}catch(error){
    console.log("error getting custom field : "+error)
}
}



const updateCustomField = async (locationId:string,contactId:string,fileId:string,customFieldId:string)=>{
    console.log("updateCustomField function")
    try {
        
       
        const accessToken = await fetchAuthTokenForLocation(locationId)
       


        //update contact with custom field


        const url = `https://services.leadconnectorhq.com/contacts/${contactId}`; // Replace with the actual endpoint
        const data = {
            customFields: [{
                "id":customFieldId,
              "value": fileId // Assuming this is the key for the DTP field
            }]
          };
      
        const options = {
          method: 'PUT', 
          url: url,
          headers: {
            Authorization: `Bearer ${accessToken}`, // Replace with your actual token
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Version: '2021-07-28'
          },
          data: data
        };
      
        try {
          const response = await axios.request(options);
          console.log("Contact updated successfully:", response.data);
        } catch (error:any) {
          console.error("Error updating contact:", error.response ? error.response.data : error.message);
        }

          } catch (error) {
            console.error(error);
          }

        }
   



const deleteFiles = async (fileName: string, splitFileName: string) => {
  try {
    const filePath = path.resolve(__dirname, '../pdf', fileName);
    const splitFilePath = path.resolve(__dirname, '../formattedPdf', splitFileName);



    // Delete the original PDF file
    await unlinkAsync(filePath);
    console.log(`File ${fileName} deleted successfully`);

    // Delete the processed PDF file
    await unlinkAsync(splitFilePath);
    console.log(`File ${splitFileName} deleted successfully`);
  } catch (err) {
    console.error('Error deleting files:', err);
  }
};