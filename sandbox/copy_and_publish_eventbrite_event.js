// mindfulina/sandbox/copy_and_publish_eventbrite_event.js
// Script to copy a template Eventbrite event and then publish the new (copied) event.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the sandbox directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

const EVENTBRITE_PRIVATE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

const TEMPLATE_EVENT_ID = '1371879341039'; // Your template event ID
const NEW_EVENT_TIMEZONE = 'Pacific/Honolulu'; // Timezone for the new event's display
const TEMPLATE_EVENT_DURATION_MINUTES = 120; // Duration of your template event (e.g., 10:00 to 12:00 is 2 hours)

async function apiCall(url, method, token, body = null) {
  console.log(`\nAttempting ${method} request to: ${url}`);
  if (body) {
    console.log(`Request body: ${JSON.stringify(body, null, 2)}`);
  }
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const options = { method, headers };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseBodyText = await response.text();
  let responseData;

  try {
    responseData = responseBodyText ? JSON.parse(responseBodyText) : {};
  } catch (e) {
    console.warn(`Could not parse response as JSON. Status: ${response.status}. Raw text: ${responseBodyText.substring(0, 500)}`);
    if (!response.ok) {
        throw new Error(`Eventbrite API Error: ${response.status} - ${response.statusText}. Response was not valid JSON.`);
    }
    responseData = { details: "Response was not JSON but request was successful.", raw_text: responseBodyText };
  }

  if (!response.ok) {
    console.error(`API Error (${method} ${url}) - Status: ${response.status}`);
    console.error("Error details:", JSON.stringify(responseData, null, 2));
    const errorDetail = responseData?.error_detail;
    let specificErrorMessage = "";
    if (typeof errorDetail === 'object' && errorDetail !== null) {
        for (const key in errorDetail) {
            if (Array.isArray(errorDetail[key]) && errorDetail[key].length > 0) {
                 specificErrorMessage += `${key}: ${errorDetail[key].join(', ')}. `;}
            else if (typeof errorDetail[key] === 'string') {
                 specificErrorMessage += `${key}: ${errorDetail[key]}. `;}
        }
    }
    const errorMessage = responseData?.error_description || specificErrorMessage || responseData?.error || responseData?.error_message || response.statusText;
    throw new Error(`Eventbrite API Error: ${response.status} - ${errorMessage.trim()}`);
  }
  console.log(`API Success (${method} ${url}) - Status: ${response.status}`);
  // To see full response data for debugging, uncomment the next line:
  // console.log("Full response data:", JSON.stringify(responseData, null, 2));
  return responseData;
}

async function copyAndPublishEvent() {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file.");
    return;
  }

  console.log(`Attempting to copy event ID: ${TEMPLATE_EVENT_ID} and then publish the copy.`);

  // --- Define new event details ---
  const newEventName = `Copied Event (from ${TEMPLATE_EVENT_ID}) - ${new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1); 
  
  const year = tomorrow.getFullYear();
  const month = tomorrow.getMonth(); // 0-indexed for Date.UTC
  const day = tomorrow.getDate();
  
  const newEventStartHourLocal = 10; // 10 AM in NEW_EVENT_TIMEZONE
  const newEventStartMinuteLocal = 0;

  // Calculate UTC for the API. Pacific/Honolulu is UTC-10.
  // 10:00 AM HNL is 10 (local) + 10 (offset from UTC) = 20:00 UTC.
  const startDateUTC = new Date(Date.UTC(year, month, day, newEventStartHourLocal + 10, newEventStartMinuteLocal, 0));
  const endDateUTC = new Date(startDateUTC.getTime() + TEMPLATE_EVENT_DURATION_MINUTES * 60 * 1000);

  const newEventStartUTCStr = startDateUTC.toISOString().slice(0, 19) + 'Z';
  const newEventEndUTCStr = endDateUTC.toISOString().slice(0, 19) + 'Z';

  console.log(`New event name: "${newEventName}"`);
  console.log(`New event intended local start (${NEW_EVENT_TIMEZONE}): ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(newEventStartHourLocal).padStart(2,'0')}:${String(newEventStartMinuteLocal).padStart(2,'0')}:00`);
  console.log(`New event start (UTC for API): ${newEventStartUTCStr}`);
  console.log(`New event end (UTC for API): ${newEventEndUTCStr}`);
  console.log(`New event timezone (for display on Eventbrite): ${NEW_EVENT_TIMEZONE}`);

  let copiedEventId;
  let copiedEventUrl;

  try {
    // --- Step 1: Copy the Event ---
    console.log("\n--- Step 1: Copying Event ---");
    const copyEventUrl = `https://www.eventbriteapi.com/v3/events/${TEMPLATE_EVENT_ID}/copy/`;
    const copyPayload = {
      name: newEventName,
      start_date: newEventStartUTCStr,
      end_date: newEventEndUTCStr,
      timezone: NEW_EVENT_TIMEZONE, 
    };
    
    const copiedEventData = await apiCall(copyEventUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, copyPayload);

    if (!copiedEventData || !copiedEventData.id || !copiedEventData.url) {
      console.error("Event copy call response did not include an event ID or URL in the expected format.");
      console.error("Full response from copy API:", JSON.stringify(copiedEventData, null, 2));
      throw new Error("Failed to retrieve necessary details (ID, URL) from event copy response.");
    }
    copiedEventId = copiedEventData.id;
    copiedEventUrl = copiedEventData.url; 
    
    console.log(`Event copied successfully. New Event ID: ${copiedEventId}`);
    console.log(`New Event URL: ${copiedEventUrl}`);


    // --- Step 2: Publish the Copied Event ---
    console.log("\n--- Step 2: Publishing Copied Event ---");
    const publishUrl = `https://www.eventbriteapi.com/v3/events/${copiedEventId}/publish/`;
    const publishResult = await apiCall(publishUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN); 
    
    if (publishResult && publishResult.published === true) {
        console.log(`\nSuccessfully published copied event (ID: ${copiedEventId})!`);
        console.log(`Event URL: ${copiedEventUrl}`);
    } else {
        console.error("\nCopied event was NOT published successfully according to the API response.");
        console.error("Publish API Response:", JSON.stringify(publishResult, null, 2));
        if (copiedEventId && copiedEventUrl) {
            console.log(`The copied event (ID: ${copiedEventId}) exists but may still be a draft. Please check the Eventbrite dashboard.`);
            console.log(`Link to the (potentially draft) event: ${copiedEventUrl}`);
        }
        throw new Error(`Event was copied (ID: ${copiedEventId}) but failed to publish or publication status unclear.`);
    }

  } catch (error) {
    console.error("\n--- An error occurred during the copy and/or publish process ---");
    // The error message should have been logged by apiCall or within the try block's specific error handling.
    if (copiedEventId && !error.message.includes(`ID: ${copiedEventId}`)) { 
        // Add context if the error message doesn't already mention the copied event ID
        console.error(`The process failed. If the event was copied, its ID is: ${copiedEventId}.`);
        if(copiedEventUrl) console.error(`Link to this (potentially draft) event: ${copiedEventUrl}`);
    }
  }
}

copyAndPublishEvent();