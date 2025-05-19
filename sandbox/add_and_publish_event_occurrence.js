
// mindfulina/sandbox/add_and_publish_event_occurrence.js
// Script to add a new single occurrence (date) to an existing Eventbrite event series
// using the /schedules endpoint with an iCalendar RRULE.
// Then, it adds structured content, creates a ticket class, and publishes the new occurrence.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the sandbox directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

const EVENTBRITE_PRIVATE_TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

// --- Configuration for the New Occurrence ---
// !!! IMPORTANT: Set this to the ID of your created Event Series Parent !!!
const SERIES_PARENT_EVENT_ID = '1370549052109'; 

// Optional: If this occurrence is at a different venue than the series parent.
// This endpoint (/schedules) might not support venue_id_override directly in the schedule creation.
// Venue for occurrences created via /schedules typically defaults to the series parent's venue.
// If a different venue is needed, you might have to update the occurrence event *after* creation.
const VENUE_ID_OVERRIDE = null; 

const OCCURRENCE_CAPACITY = 25;
const OCCURRENCE_TIMEZONE = 'Pacific/Honolulu'; // Informational, DTSTART in RRULE must be UTC
const OCCURRENCE_DURATION_MINUTES = 60;

// Image ID for structured content specific to this occurrence
const OCCURRENCE_STRUCTURED_CONTENT_IMAGE_ID = '1032924873'; 

const DEFAULT_OCCURRENCE_DESCRIPTION_HTML_CONTENT = `<p>Join us for this specific session of our rejuvenating sound bath series! This occurrence will focus on deep relaxation.</p>
<h2>What to expect for this session</h2>
<p>Details specific to this date and time will be shared here. We'll explore specific sound frequencies.</p>
<h2>Venue Information</h2>
<p>This session will be held at the specified location. Please check details if different from the main series venue.</p>
<h2>What to Bring (Reminder)</h2>
<ul>
  <li>Towel, yoga mat, or blanket</li>
  <li>Swimsuit and sunscreen (if applicable to venue)</li>
  <li>Optional: hat, sunglasses, water bottle</li>
</ul>
<p>We look forward to seeing you for this unique sound healing experience!</p>`;

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

/**
 * Formats a JavaScript Date object into an iCalendar DTSTART string (YYYYMMDDTHHMMSSZ).
 * @param {Date} date The date to format.
 * @returns {string} The formatted DTSTART string in UTC.
 */
function getDtstartString(date) {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

async function addAndPublishOccurrenceToSeries() {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file.");
    return;
  }
  if (!SERIES_PARENT_EVENT_ID || SERIES_PARENT_EVENT_ID === 'YOUR_SERIES_PARENT_EVENT_ID_HERE') {
    console.error("ERROR: SERIES_PARENT_EVENT_ID is not set. Please update the constant.");
    return;
  }
  if (!OCCURRENCE_STRUCTURED_CONTENT_IMAGE_ID) {
    console.error("ERROR: OCCURRENCE_STRUCTURED_CONTENT_IMAGE_ID is not set.");
    return;
  }

  // --- Define Date and Time for the New Occurrence ---
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 14); // Set to 14 days from now to avoid conflicts with previous attempts
  const occurrenceStartTime = new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate(), 15, 0, 0); // 3:00 PM local time
  
  const dtstartUtc = getDtstartString(occurrenceStartTime);
  const recurrenceRule = `DTSTART:${dtstartUtc}\nRRULE:FREQ=DAILY;COUNT=1`;
  
  console.log(`Series Parent ID: ${SERIES_PARENT_EVENT_ID}`);
  console.log(`Occurrence to be created with DTSTART (UTC): ${dtstartUtc}`);
  console.log(`Recurrence Rule: ${recurrenceRule.replace('\n', '\\n')}`);
  console.log(`Occurrence Duration: ${OCCURRENCE_DURATION_MINUTES} minutes`);
  if (VENUE_ID_OVERRIDE) {
    console.warn(`Warning: VENUE_ID_OVERRIDE ('${VENUE_ID_OVERRIDE}') is set, but /schedules endpoint might not directly support it. Venue will likely default to series parent.`);
  }

  let newOccurrenceEventId;
  let newOccurrenceEventUrl; // Will be constructed manually or fetched if possible

  try {
    // --- Step 1: Create New Occurrence using /schedules endpoint ---
    console.log("\n--- Step 1: Creating New Occurrence via /schedules ---");
    const schedulePayload = {
      schedule: {
        occurrence_duration: OCCURRENCE_DURATION_MINUTES * 60, // in seconds
        recurrence_rule: recurrenceRule,
      },
    };
    // Note: venue_id_override is not a standard field for this endpoint's schedule object.
    // It typically inherits from the parent or needs a separate update call to the occurrence.

    const createScheduleUrl = `https://www.eventbriteapi.com/v3/events/${SERIES_PARENT_EVENT_ID}/schedules/`;
    const scheduleResponse = await apiCall(createScheduleUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, schedulePayload);

    if (!scheduleResponse || !scheduleResponse.created_event_ids || scheduleResponse.created_event_ids.length === 0) {
      throw new Error("Create schedule call succeeded but did not return any created_event_ids.");
    }
    newOccurrenceEventId = scheduleResponse.created_event_ids[0]; // Assuming COUNT=1, so one ID
    // The /schedules endpoint response doesn't give the direct URL of the new event.
    // We need to fetch the event details or construct the URL.
    // Let's try fetching the event to get its URL and confirm details.
    console.log(`Occurrence scheduled. Raw ID: ${newOccurrenceEventId}. Fetching details...`);
    
    const occurrenceDetails = await apiCall(`https://www.eventbriteapi.com/v3/events/${newOccurrenceEventId}/`, 'GET', EVENTBRITE_PRIVATE_TOKEN);
    newOccurrenceEventUrl = occurrenceDetails.url;

    console.log(`New occurrence created successfully. Occurrence Event ID: ${newOccurrenceEventId}`);
    console.log(`Occurrence Event URL: ${newOccurrenceEventUrl}`);
    console.log(`Occurrence Status: ${occurrenceDetails.status}`);

    // --- Step 2: Set Structured Content for the Occurrence ---
    console.log(" Step 2: Setting Structured Content for the Occurrence ---");
    const structuredContentModules = [
      {
        type: "text",
        data: { body: { alignment: "left", text: DEFAULT_OCCURRENCE_DESCRIPTION_HTML_CONTENT } },
      },
      {
        type: "image",
        data: { image: { image_id: OCCURRENCE_STRUCTURED_CONTENT_IMAGE_ID } },
      }
    ];
    const structuredContentPayload = {
      modules: structuredContentModules,
      publish: true, 
      purpose: "listing", 
    };
    const structuredContentUrl = `https://www.eventbriteapi.com/v3/events/${newOccurrenceEventId}/structured_content/1/`;
    await apiCall(structuredContentUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, structuredContentPayload);
    console.log("Structured content for the occurrence set successfully.");

    // --- Step 3: Create Ticket Class for the Occurrence ---
    console.log("\n--- Step 3: Creating Ticket Class for the Occurrence ---");
    const ticketClassPayload = {
      ticket_class: {
        name: `General Admission - ${occurrenceStartTime.toLocaleDateString('en-US', {timeZone: OCCURRENCE_TIMEZONE})}`,
        free: true, 
        quantity_total: OCCURRENCE_CAPACITY,
        minimum_quantity: 1,    
        maximum_quantity: 10,   
      },
    };
    const createTicketClassUrl = `https://www.eventbriteapi.com/v3/events/${newOccurrenceEventId}/ticket_classes/`;
    await apiCall(createTicketClassUrl, 'POST', EVENTBRITE_PRIVATE_TOKEN, ticketClassPayload);
    console.log("Ticket class for the occurrence created successfully.");

    console.log(`\n--- Occurrence created and configured successfully (in DRAFT status) ---`);
    console.log(`Occurrence Event ID: ${newOccurrenceEventId}`);
    console.log(`Occurrence Event URL: ${newOccurrenceEventUrl}`);
    console.log(`Occurrence Status: ${occurrenceDetails.status}`); // Re-confirming status from fetched details
    console.log("Next step: Publish the Series Parent event, then publish this occurrence if needed.");

  } catch (error) {
    console.error("\n--- An error occurred during the process ---");
    console.error("Error message:", error.message);
    if (newOccurrenceEventId) {
        console.error(`Process failed. Occurrence (ID: ${newOccurrenceEventId}) might exist in a partial state. Check dashboard.`);
        if(newOccurrenceEventUrl) console.error(`Link to potentially created occurrence: ${newOccurrenceEventUrl}`);
    }
  }
}

addAndPublishOccurrenceToSeries();
