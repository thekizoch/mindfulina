// mindfulina/eventbrite_ops/upload_image_to_eventbrite.js
// Script to perform the full 3-step image upload process to Eventbrite.
// 1. Get upload instructions from Eventbrite.
// 2. POST image file to the provided S3 URL.
// 3. POST to Eventbrite to finalize the upload and get the image ID.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';

// ES module equivalent of __dirname for this script's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine project root assuming this script is in mindfulina/eventbrite_ops/
const projectRoot = path.resolve(__dirname, '../'); // Goes up one level from eventbrite_ops to mindfulina

// Load .env file from the project root
dotenv.config({ path: path.resolve(projectRoot, '.env') });


const EVENTBRITE_PRIVATE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;
// Path to the image relative to the project root
const RELATIVE_IMAGE_PATH = 'public/images/eventbrite-cover.jpeg'
const IMAGE_FILE_PATH = path.resolve(projectRoot, RELATIVE_IMAGE_PATH);

async function fullImageUpload() {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file in the project root (mindfulina/.env).");
    return;
  }

  if (!fs.existsSync(IMAGE_FILE_PATH)) {
    console.error(`ERROR: Image file not found at ${IMAGE_FILE_PATH}`);
    console.error(`Please ensure '${RELATIVE_IMAGE_PATH}' exists in your project.`);
    return;
  }
  console.log(`Found image file at: ${IMAGE_FILE_PATH}`);

  let uploadToken;
  let finalImageId;

  try {
    // --- Step 1: Get Upload Instructions from Eventbrite ---
    const initialGetUrl = 'https://www.eventbriteapi.com/v3/media/upload/?type=image-event-logo';
    console.log(`\n--- Step 1: GET ${initialGetUrl} to obtain upload instructions ---`);
    
    const step1Response = await fetch(initialGetUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${EVENTBRITE_PRIVATE_TOKEN}` },
    });
    const step1Data = await step1Response.json();

    if (!step1Response.ok || !step1Data.upload_url || !step1Data.upload_data || !step1Data.file_parameter_name || !step1Data.upload_token) {
      console.error("Step 1 Failed: Did not receive valid upload instructions from Eventbrite.");
      console.error("Response Status:", step1Response.status);
      console.error("Response Data:", JSON.stringify(step1Data, null, 2));
      throw new Error("Failed to get upload instructions from Eventbrite.");
    }
    console.log("Step 1 Success: Received upload instructions.");
    uploadToken = step1Data.upload_token; 
    const s3UploadUrl = step1Data.upload_url;
    const s3UploadData = step1Data.upload_data;
    const s3FileParamName = step1Data.file_parameter_name;

    // --- Step 2: Upload Image File to S3 ---
    console.log(`\n--- Step 2: POSTing image to S3 URL: ${s3UploadUrl} ---`);
    const imageFile = await fileFromPath(IMAGE_FILE_PATH);
    const s3FormData = new FormData();

    for (const key in s3UploadData) {
      s3FormData.set(key, s3UploadData[key]);
    }
    s3FormData.set(s3FileParamName, imageFile);

    const step2Response = await fetch(s3UploadUrl, {
      method: 'POST',
      body: s3FormData,
    });

    const step2Status = step2Response.status;
    const step2ResponseText = await step2Response.text(); // Read text regardless of status for S3

    if (!step2Response.ok) {
      console.error(`Step 2 Failed: Error uploading file to S3. Status: ${step2Status}`);
      console.error("S3 Response Text (first 500 chars):", step2ResponseText.substring(0,500));
      throw new Error(`Failed to upload file to S3: ${step2Status} ${step2Response.statusText}`);
    }
    
    console.log(`Step 2 Success: Image uploaded to S3. Status: ${step2Status}`);
    if (step2ResponseText) { // S3 might return empty body on 200/204 for POST
         console.log("S3 Success Response (first 500 chars):", step2ResponseText.substring(0,500));
    }


    // --- Step 3: Finalize Upload with Eventbrite ---
    console.log(`\n--- Step 3: POST to Eventbrite /media/upload/ to finalize with upload_token ---`);
    const finalizeUrl = 'https://www.eventbriteapi.com/v3/media/upload/';
    const finalizePayload = { upload_token: uploadToken };
    
    const step3Response = await fetch(finalizeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_PRIVATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalizePayload),
    });
    const step3Data = await step3Response.json();

    if (!step3Response.ok || !step3Data.id) {
      console.error("Step 3 Failed: Error finalizing upload with Eventbrite.");
      console.error("Response Status:", step3Response.status);
      console.error("Response Data:", JSON.stringify(step3Data, null, 2));
      throw new Error("Failed to finalize upload with Eventbrite.");
    }

    finalImageId = step3Data.id;
    console.log("Step 3 Success: Upload finalized with Eventbrite.");
    console.log("\n===================================================");
    console.log("🎉 IMAGE UPLOADED SUCCESSFULLY! 🎉");
    console.log(`Eventbrite Image ID (logo_id): ${finalImageId}`);
    console.log(`Image URL (from finalization response): ${step3Data.url || step3Data.cdn_url || 'N/A'}`);
    console.log("Crop Mask (if provided):", JSON.stringify(step3Data.crop_mask, null, 2));
    console.log("You can use this Image ID to set event logos or in structured content.");
    console.log("===================================================");

  } catch (error) {
    console.error("\n--- An error occurred during the full image upload process ---");
    console.error("Error message:", error.message);
    if (uploadToken && !finalImageId) {
        console.error(`An upload_token (${uploadToken}) was obtained, but the process may have failed before finalization or during it. Check Eventbrite media library if unsure.`);
    }
  }
}

fullImageUpload();