// mindfulina/sandbox/list_eventbrite_events.js
// Script to list events for an organization from Eventbrite.

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

async function apiCall(url, method, token, body = null) {
  console.log(`\nAttempting ${method} request to: ${url}`);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const options = { method, headers };
  if (body && method !== 'GET') { // Body should generally not be sent with GET
    options.body = JSON.stringify(body);
  }

  try {
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
      return { details: "Response was not JSON but request was successful.", raw: responseBodyText.substring(0, 1000) }; // Return raw snippet if OK but not JSON
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
    // console.log("Full response data:", JSON.stringify(responseData, null, 2)); // Optionally log full response
    return responseData;
  } catch (error) {
    console.error("\n--- An error occurred during the API call ---");
    console.error("Error message:", error.message);
    if (error.cause) console.error("Cause:", error.cause); // Log native fetch error cause if present
    throw error; 
  }
}

async function listOrgEvents() {
  if (!EVENTBRITE_PRIVATE_TOKEN || EVENTBRITE_PRIVATE_TOKEN === 'YOUR_EVENTBRITE_PRIVATE_TOKEN') {
    console.error("ERROR: EVENTBRITE_PRIVATE_TOKEN is not correctly set in your .env file.");
    return;
  }
  if (!EVENTBRITE_ORGANIZER_ID || EVENTBRITE_ORGANIZER_ID === 'YOUR_EVENTBRITE_ORGANIZER_ID') {
    console.error("ERROR: EVENTBRITE_ORGANIZER_ID is not correctly set in your .env file.");
    return;
  }

  console.log(`Listing events for Organization ID: ${EVENTBRITE_ORGANIZER_ID}`);

  const params = new URLSearchParams({
    page_size: '10', // Number of events per page
    status: "draft,live,started,ended,completed,canceled", // Fetch a variety of statuses
    order_by: "start_desc", // Order by start date, descending (newest first)
    // time_filter: 'all', // 'all', 'current_future', 'past'
    // expand: 'venue,ticket_classes,organizer' // Example: To get more details; be mindful of response size
  });

  const listEventsUrl = `https://www.eventbriteapi.com/v3/organizations/${EVENTBRITE_ORGANIZER_ID}/events/?${params.toString()}`;

  try {
    const result = await apiCall(listEventsUrl, 'GET', EVENTBRITE_PRIVATE_TOKEN);
    
    if (result && result.events) {
      console.log("\n--- Events Found ---");
      if (result.events.length === 0) {
        console.log("No events found for this organization with the specified filters.");
      } else {
        result.events.forEach(event => {
          console.log(`\n  Event Name: ${event.name?.text || 'N/A'}`);
          console.log(`  Event ID: ${event.id}`);
          console.log(`  Status: ${event.status || 'N/A'}`);
          console.log(`  Start Date (Local): ${event.start?.local || 'N/A'}`);
          console.log(`  End Date (Local): ${event.end?.local || 'N/A'}`);
          console.log(`  Is Free: ${event.is_free === undefined ? 'N/A' : event.is_free}`);
          console.log(`  Currency: ${event.currency || 'N/A'}`);
          console.log(`  URL: ${event.url || 'N/A'}`);
          // To see tax_settings if available, you'd likely need to fetch the individual event details
          // using /events/{event_id}/ and potentially an 'expand' parameter.
          // It's unlikely to be in the summary list here.
        });
      }

      console.log("\n--- Pagination ---");
      if (result.pagination) {
        console.log(`  Page Number: ${result.pagination.page_number}`);
        console.log(`  Page Size: ${result.pagination.page_size}`);
        console.log(`  Total Events (approx.): ${result.pagination.object_count}`);
        console.log(`  Page Count: ${result.pagination.page_count}`);
        console.log(`  Has More Items: ${result.pagination.has_more_items}`);
        if (result.pagination.continuation) {
          console.log(`  Continuation token for next page: ${result.pagination.continuation}`);
        }
      } else {
        console.log("  Pagination information not available.");
      }
    } else {
      console.log("\nNo events data returned or result format unexpected.");
      console.log("Full response (or raw snippet if not JSON):", JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error("\nFailed to list events. The error was logged above by the apiCall function.");
  }
}

listOrgEvents();