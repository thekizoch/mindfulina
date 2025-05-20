
// mindfulina/sandbox/create_full_eventbrite_event.js
// Script to create a full event, add structured content (text & image), create ticket class, and publish.
// Uses a pre-uploaded image ID.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the sandbox directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

const EVENTBRITE_PRIVATE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;
const EVENTBRITE_ORGANIZER_ID = process.env.EVENTBRITE_ORGANIZER_ID;

// --- Configuration ---
const EVENTBRITE_VENUE_ID = '266927653'; 
const EVENT_CAPACITY = 25;
const EVENT_TIMEZONE = 'Pacific/Honolulu';
const EVENT_DURATION_MINUTES = 45;
// *** YOUR UPLOADED IMAGE ID ***
const ACTUAL_UPLOADED_IMAGE_ID = '1032924873'; 

const DEFAULT_EVENT_DESCRIPTION_HTML_CONTENT = `<p>Join us for a rejuvenating sound bath to reset and relax your mind, body, and spirit.</p>
<h2>What to know</h2>
<p>Mākālei Beach Park features a small beach used by surfers, plus a tree-shaded area with picnic tables. Dogs allowed. Located at 3111 Diamond Head Rd, Honolulu, HI 96815.</p> 
<h2>Before You Arrive</h2>
<p>Consider taking a peaceful walk along the shoreline to connect with nature.</p>
<h2>What to Bring</h2>
<ul>
  <li>Towel, yoga mat, or blanket</li>
  <li>Swimsuit and sunscreen</li>
  <li>Optional: hat, sunglasses, water bottle</li>
</ul>
<p>Let the ocean breeze and sound healing waves guide you into deep rest. See you there.</p>`;

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

async function createAndPublishEvent() {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file.");
    return;
  }
  if (!EVENTBRITE_ORGANIZER_ID || EVENTBRITE_ORGANIZER_ID === 'YOUR_EVENTBRITE_ORGANIZER_ID') {
    console.error("ERROR: EVENTBRITE_ORGANIZER_ID is not correctly set in your .env file.");
    return;
  }
   if (!EVENTBRITE_VENUE_ID) {
    console.error("ERROR: EVENTBRITE_VENUE_ID is not set in the script constants.");
    return;
  }
   if (!ACTUAL_UPLOADED_IMAGE_ID || ACTUAL_UPLOADED_IMAGE_ID === 'YOUR_UPLOADED_IMAGE_ID_WOULD_GO_HERE') {
    console.error("ERROR: ACTUAL_UPLOADED_IMAGE_ID is not set to a real ID. Please update the constant.");
    return; 
   }

  const eventTitle = `Full Test (Logo & Struct. Content Img) - (${new Date().toLocaleTimeString()})`;
  const now = new Date();
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0); 
  const endTime = new Date(startTime.getTime() + (EVENT_DURATION_MINUTES * 60 * 1000)); 
  const eventbriteStartUTC = startTime.toISOString().slice(0, 19) + 'Z';
  const eventbriteEndUTC = endTime.toISOString().slice(0, 19) + 'Z';

  console.log(`Event Title: ${eventTitle}`);
  console.log(`Eventbrite Start Time UTC (Formatted): ${eventbriteStartUTC}`);
  console.log(`Eventbrite End Time UTC (Formatted): ${eventbriteEndUTC}`);
  console.log(`Using Image ID: ${ACTUAL_UPLOADED_IMAGE_ID}`);


  let eventbriteEventId;
  let eventbriteEventUrl;

  try {
    // --- Step 1: Create Base Event (with logo_id, no summary/description) ---
    console.log("--- Step 1: Creating Base Event (with logo_id) ---");
    const eventPayload = {
      event: {
        name: { html: eventTitle }, 
        start: { timezone: EVENT_TIMEZONE, utc: eventbriteStartUTC },
        end: { timezone: EVENT_TIMEZONE, utc: eventbriteEndUTC },
        currency: "USD",
        venue_id: EVENTBRITE_VENUE_ID,
        capacity: EVENT_CAPACITY,
        listed: true, 
        shareable: true,
        online_event: false,
        logo_id: ACTUAL_UPLOADED_IMAGE_ID, 
      },
    };
    const createEventUrl = `https://www.eventbriteapi.com/v3/organizations/${EVENTBRITE_ORGANIZER_ID}/events/`;
    const createdEvent = await apiCall(createEventUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, eventPayload);
    
    if (!createdEvent || !createdEvent.id) {
        throw new Error("Event creation call succeeded but did not return an event ID.");
    }
    eventbriteEventId = createdEvent.id;
    eventbriteEventUrl = createdEvent.url;
    console.log(`Base event created successfully. ID: ${eventbriteEventId}, URL: ${eventbriteEventUrl}`);

    // --- Step 2: Set Structured Content (Description and Image Module) ---
    console.log("\n--- Step 2: Setting Structured Content ---");
    const structuredContentModules = [
      {
        type: "text",
        data: { body: { alignment: "left", text: DEFAULT_EVENT_DESCRIPTION_HTML_CONTENT } },
      },
      { // Adding the image module using the uploaded image ID
        type: "image",
        data: { image: { image_id: ACTUAL_UPLOADED_IMAGE_ID } },
        // layout: "image_top", // Optional layout: "image_left", "image_right", "image_full_width"
      }
    ];
    
    const structuredContentPayload = {
      modules: structuredContentModules,
      publish: true, 
      purpose: "listing", 
    };
    const structuredContentUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/structured_content/1/`;
    await apiCall(structuredContentUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, structuredContentPayload);
    console.log("Structured content (text & image) set successfully.");

    // --- Step 3: Create Free Ticket Class ---
    console.log("\n--- Step 3: Creating Ticket Class ---");
    const ticketClassPayload = {
      ticket_class: {
        name: "General Admission",
        free: true,
        quantity_total: EVENT_CAPACITY,
        minimum_quantity: 1,    
        maximum_quantity: 10,   
      },
    };
    const createTicketClassUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/ticket_classes/`;
    await apiCall(createTicketClassUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, ticketClassPayload);
    console.log("Ticket class created successfully.");

    // --- Step 4: Publish Event ---
    console.log("\n--- Step 4: Publishing Event ---");
    const publishUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/publish/`;
    const publishResult = await apiCall(publishUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN);
    
    if (publishResult && publishResult.published) {
        console.log(`\nEvent published successfully! Event URL: ${eventbriteEventUrl}`);
    } else {
        console.error("\nEvent was not published successfully according to the API response.");
        console.error("Publish API Response:", JSON.stringify(publishResult, null, 2));
        console.log(`Event ID: ${eventbriteEventId}. URL: ${eventbriteEventUrl}. Check dashboard.`);
    }

  } catch (error) {
    console.error("\n--- An error occurred during the process ---");
    console.error("Error message:", error.message);
    if (eventbriteEventId) {
        console.error(`Process failed. Event (ID: ${eventbriteEventId}) might exist in a partial state. Check dashboard.`);
        if(eventbriteEventUrl) console.error(`Link to potentially created event: ${eventbriteEventUrl}`);
    }
  }
}

createAndPublishEvent();