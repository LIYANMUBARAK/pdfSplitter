import fs from 'fs';
import path from 'path'; // Use path for better path handling
import { PDFDocument } from 'pdf-lib';
import { Request, Response } from 'express';

// Controller function to handle the route
export async function getPayload(req: Request, res: Response) {
  try {
    console.log(req.body)
    // await pdfProcess(); // Await the async function
    res.status(200).json({ message: "Second page extracted and saved successfully." });
  } catch (error) {
    console.error("getPayload error: " + error);
    res.status(500).json({ error: "An error occurred while processing the PDF." });
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
