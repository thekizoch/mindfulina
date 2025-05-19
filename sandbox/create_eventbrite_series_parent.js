
// mindfulina/sandbox/create_eventbrite_series_parent.js
// Script to create an Eventbrite event SERIES PARENT as a DRAFT.
// This parent event can then have occurrences (individual event dates) added to it.
// Uses a pre-uploaded image ID for the series logo.

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
const EVENTBRITE_VENUE_ID = '266927653'; // Optional: Default venue for the series. Can be overridden by occurrences.
const EVENT_TIMEZONE = 'Pacific/Honolulu';
const EVENT_DURATION_MINUTES = 45; // Used to calculate a conceptual end time for the parent.
// *** YOUR UPLOADED IMAGE ID ***
const ACTUAL_UPLOADED_IMAGE_ID = '1032924873'; // Logo for the series

// Optional: Default HTML content for the series description.
// const DEFAULT_SERIES_DESCRIPTION_HTML_CONTENT = `<p>This is the main description for our awesome event series. More details about specific dates will be in each occurrence.</p>
// <h2>About the Series</h2>
// <p>Join us for a recurring session of rejuvenation and relaxation.</p>`;

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

async function createEventSeriesParent() {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file.");
    return;
  }
  if (!EVENTBRITE_ORGANIZER_ID || EVENTBRITE_ORGANIZER_ID === 'YOUR_EVENTBRITE_ORGANIZER_ID') {
    console.error("ERROR: EVENTBRITE_ORGANIZER_ID is not correctly set in your .env file.");
    return;
  }
   if (!ACTUAL_UPLOADED_IMAGE_ID || ACTUAL_UPLOADED_IMAGE_ID === 'YOUR_UPLOADED_IMAGE_ID_WOULD_GO_HERE') {
    console.error("ERROR: ACTUAL_UPLOADED_IMAGE_ID is not set to a real ID. Please update the constant.");
    return;
   }
   // EVENTBRITE_VENUE_ID is optional for series parent, but if provided ensure it's valid.
   if (!EVENTBRITE_VENUE_ID && EVENTBRITE_VENUE_ID !== null) { // Allow null if intentionally not setting one
     console.warn("Warning: EVENTBRITE_VENUE_ID is not set. The series parent will be created without a default venue.");
   }

  const seriesParentTitle = `My Awesome Event Series Parent (Draft - ${new Date().toLocaleTimeString()})`;
  const now = new Date();
  // For a series parent, start/end times might represent the overall series timeframe,
  // the first planned occurrence, or just a placeholder.
  // Let's set it for tomorrow for this example.
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0); // e.g., Tomorrow 10:00 AM
  const endTime = new Date(startTime.getTime() + (EVENT_DURATION_MINUTES * 60 * 1000)); // e.g., Tomorrow 10:45 AM
  const eventbriteStartUTC = startTime.toISOString().slice(0, 19) + 'Z';
  const eventbriteEndUTC = endTime.toISOString().slice(0, 19) + 'Z';

  console.log(`Series Parent Title: ${seriesParentTitle}`);
  console.log(`Series Parent Conceptual Start Time UTC: ${eventbriteStartUTC}`);
  console.log(`Series Parent Conceptual End Time UTC: ${eventbriteEndUTC}`);
  console.log(`Using Image ID for Series Logo: ${ACTUAL_UPLOADED_IMAGE_ID}`);
  if (EVENTBRITE_VENUE_ID) {
    console.log(`Using Venue ID for Series Parent: ${EVENTBRITE_VENUE_ID}`);
  }


  let seriesParentEventId;
  let seriesParentEventUrl;

  try {
    // --- Step 1: Create Event Series Parent ---
    // This will create the event as a draft by default.
    console.log("--- Step 1: Creating Event Series Parent (as Draft) ---");
    const eventPayload = {
      event: {
        name: { html: seriesParentTitle },
        start: { timezone: EVENT_TIMEZONE, utc: eventbriteStartUTC },
        end: { timezone: EVENT_TIMEZONE, utc: eventbriteEndUTC },
        currency: "USD", // Required for any event
        listed: true,    // Make it publicly listed by default (still needs publishing)
        shareable: true, // Make it shareable by default
        online_event: false,
        logo_id: ACTUAL_UPLOADED_IMAGE_ID, // Logo for the overall series
        is_series: true, // <<< This designates it as a series parent
        // description: { html: DEFAULT_SERIES_DESCRIPTION_HTML_CONTENT }, // Optional: Add if you have a general series description
        // summary: "This is a test event series.", // Optional summary (max 140 chars, plain text)
      },
    };

    // Conditionally add venue_id if it's set
    if (EVENTBRITE_VENUE_ID) {
        eventPayload.event.venue_id = EVENTBRITE_VENUE_ID;
    }

    const createEventUrl = `https://www.eventbriteapi.com/v3/organizations/${EVENTBRITE_ORGANIZER_ID}/events/`;
    const createdEvent = await apiCall(createEventUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, eventPayload);

    if (!createdEvent || !createdEvent.id) {
        throw new Error("Event series parent creation call succeeded but did not return an event ID.");
    }
    seriesParentEventId = createdEvent.id;
    seriesParentEventUrl = createdEvent.url;

    console.log(`\nEvent Series Parent created successfully!`);
    console.log(`Series Parent ID: ${seriesParentEventId}`);
    console.log(`Series Parent URL: ${seriesParentEventUrl}`);
    console.log(`Status: ${createdEvent.status}`); // Should typically be 'draft'
    console.log(`Is Series: ${createdEvent.is_series}`); // Should be true
    console.log(`Is Series Parent: ${createdEvent.is_series_parent}`); // Should be true

    console.log("\nSeries Parent created in DRAFT status.");
    console.log("Next steps: \n1. Add an occurrence (with tickets) to this series parent using its ID. \n2. Then, publish the series parent event.");

  } catch (error) {
    console.error("\n--- An error occurred during the process ---");
    console.error("Error message:", error.message);
    if (seriesParentEventId) {
        console.error(`Process failed. Series Parent (ID: ${seriesParentEventId}) might exist in a partial state. Check dashboard.`);
        if(seriesParentEventUrl) console.error(`Link to potentially created series parent: ${seriesParentEventUrl}`);
    }
  }
}

createEventSeriesParent();