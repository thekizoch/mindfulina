```javascript
// mindfulina/sandbox/publish_event.js
// Script to publish an existing Eventbrite event by its ID.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the sandbox directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

const EVENTBRITE_PRIVATE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

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
  if (body) {
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
    responseData = { details: "Response was not JSON but request was successful."};
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
  console.log("Response data:", JSON.stringify(responseData, null, 2));
  return responseData;
}

async function publishEvent(eventIdToPublish) {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file.");
    return;
  }
  if (!eventIdToPublish) {
    console.error("ERROR: No Event ID provided to publish. Please pass it as an argument when running the script.");
    console.log("Usage: node mindfulina/sandbox/publish_event.js YOUR_EVENT_ID_HERE");
    return;
  }

  console.log(`Attempting to publish Event ID: ${eventIdToPublish}`);

  try {
    const publishUrl = `https://www.eventbriteapi.com/v3/events/${eventIdToPublish}/publish/`;
    const publishResult = await apiCall(publishUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN);

    if (publishResult && publishResult.published) {
        console.log(`\nEvent (ID: ${eventIdToPublish}) published successfully!`);
        // Optionally, fetch the event to display its URL
        const eventDetails = await apiCall(`https://www.eventbriteapi.com/v3/events/${eventIdToPublish}/`, 'GET', EVENTBRITE_PRIVATE_TOKEN);
        if (eventDetails && eventDetails.url) {
            console.log(`Event URL: ${eventDetails.url}`);
        }
    } else {
        // Check current status as it might already be live or failed for other reasons
        const currentStatus = await apiCall(`https://www.eventbriteapi.com/v3/events/${eventIdToPublish}/`, 'GET', EVENTBRITE_PRIVATE_TOKEN);
        if (currentStatus && currentStatus.status === 'live') {
             console.log(`\nEvent (ID: ${eventIdToPublish}) appears to be live (status: 'live').`);
             if (currentStatus.url) console.log(`Event URL: ${currentStatus.url}`);
        } else {
            console.error(`\nEvent (ID: ${eventIdToPublish}) was NOT published successfully.`);
            console.error("Publish API Response:", JSON.stringify(publishResult, null, 2));
            if (currentStatus) console.log(`Current event status: ${currentStatus.status}`);
        }
    }
  } catch (error) {
    console.error("\n--- An error occurred during the publishing process ---");
    console.error("Error message:", error.message);
    console.error(`Event ID ${eventIdToPublish} might still be in a draft state or encountered an issue. Check Eventbrite dashboard.`);
  }
}

// Get the Event ID from command line arguments
const eventIdFromArg = process.argv[2];
publishEvent(eventIdFromArg);
```