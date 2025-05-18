// mindfulina/cloudflare-worker/eventAutomation.js
// Main Cloudflare Worker for Mindfulina Event Automation.
// Orchestrates GitHub and Eventbrite integrations.

import { createGithubEventFile } from './githubManager.js';
import { createMindfulinaEventOnEventbrite } from './eventbriteManager.js';

// Eventbrite Configuration Constants (not secrets, can be managed here or passed if they change per-event type)
const EVENTBRITE_ORGANIZER_ID = '2736604261351'; // Your actual Organizer ID
const EVENTBRITE_VENUE_ID = '266927653';     // Your actual Venue ID for Mākālei Beach Park.
// The default image ID is now a constant within eventbriteManager.js (DEFAULT_EVENTBRITE_IMAGE_ID)

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Expected POST request from Google Apps Script', { status: 405 });
    }

    // Optional: Basic secret validation if Apps Script sends one
    if (env.APPS_SCRIPT_SECRET) {
      const authHeader = request.headers.get('X-AppsScript-Secret');
      if (authHeader !== env.APPS_SCRIPT_SECRET) {
        console.error('Worker/Automation: Unauthorized - Missing or incorrect X-AppsScript-Secret header.');
        return new Response('Unauthorized', { status: 401 });
      }
      console.log('Worker/Automation: X-AppsScript-Secret validated.');
    }

    let eventData;
    try {
      eventData = await request.json();
    } catch (e) {
      console.error('Worker/Automation: Failed to parse JSON body:', e);
      return new Response('Invalid JSON payload', { status: 400 });
    }

    console.log('Worker/Automation: Received event data:', JSON.stringify(eventData, null, 2));

    // Validate critical event data fields from Google Calendar
    if (!eventData.title || !eventData.startTime || !eventData.endTime || !eventData.googleCalendarEventId) {
      console.error('Worker/Automation: Missing critical event data fields (title, startTime, endTime, googleCalendarEventId).');
      return new Response('Missing required event data fields from Google Calendar', { status: 400 });
    }
    // Validate required secrets
    if (!env.GITHUB_TOKEN) {
        console.error('Worker/Automation: Missing GITHUB_TOKEN secret.');
        return new Response('Configuration error: GitHub token not set.', { status: 500 });
    }
    if (!env.EVENTBRITE_PRIVATE_TOKEN) {
        console.error('Worker/Automation: Missing EVENTBRITE_PRIVATE_TOKEN secret.');
        return new Response('Configuration error: Eventbrite token not set.', { status: 500 });
    }

    let githubResultSummary = { success: false, message: "GitHub processing not initiated.", fileUrl: null, status: null, error: null };
    let eventbriteResultSummary = { success: false, message: "Eventbrite processing not initiated.", eventUrl: null, eventId: null, published: false, error: null };

    try {
      // --- Step 1: Create GitHub Event File ---
      console.log('Worker/Automation: Attempting to create GitHub event file...');
      const githubApiResponse = await createGithubEventFile(eventData, env.GITHUB_TOKEN);
      
      githubResultSummary.status = githubApiResponse.status;
      const githubResponseText = await githubApiResponse.text(); 

      if (!githubApiResponse.ok) { 
        const errorMsg = `Failed to create GitHub file: ${githubResultSummary.status} - ${githubResponseText.substring(0, 200)}`;
        console.error(`Worker/Automation: ${errorMsg}`);
        githubResultSummary.message = errorMsg;
        githubResultSummary.error = githubResponseText;
      } else {
        githubResultSummary.success = true;
        githubResultSummary.message = 'GitHub event file processed successfully.';
        try {
          const githubJson = JSON.parse(githubResponseText);
          if (githubJson.content && githubJson.content.html_url) {
            githubResultSummary.fileUrl = githubJson.content.html_url;
          }
        } catch (parseError) {
          console.warn("Worker/Automation: Could not parse GitHub response JSON to get html_url, but operation succeeded based on status.", parseError);
        }
        console.log(`Worker/Automation: Successfully created/updated GitHub file. URL: ${githubResultSummary.fileUrl || 'N/A'}`);
      }

      // --- Step 2: Create Eventbrite Event ---
      // Only proceed with Eventbrite if GitHub was successful.
      if (githubResultSummary.success) {
        console.log('Worker/Automation: Attempting to create Eventbrite event...');
        // The default image ID is handled within eventbriteManager.js (DEFAULT_EVENTBRITE_IMAGE_ID)
        // It's passed implicitly by eventbriteManager unless an explicit imageId is provided as the last arg.
        eventbriteResultSummary = await createMindfulinaEventOnEventbrite(
          eventData,
          env.EVENTBRITE_PRIVATE_TOKEN,
          EVENTBRITE_ORGANIZER_ID, // Constant defined in this file
          EVENTBRITE_VENUE_ID      // Constant defined in this file
          // If you wanted to pass a specific image ID different from the default in eventbriteManager:
          // , 'your_specific_image_id_here_if_needed' 
        );

        if (eventbriteResultSummary.success) {
            console.log(`Worker/Automation: Eventbrite event processing completed. URL: ${eventbriteResultSummary.eventUrl || 'N/A'}`);
        } else {
            console.error(`Worker/Automation: Eventbrite event processing failed. Message: ${eventbriteResultSummary.message}`);
            // eventbriteResultSummary already contains error details from the manager
        }
      } else {
          eventbriteResultSummary.message = "Eventbrite processing skipped due to GitHub failure.";
          console.warn("Worker/Automation: " + eventbriteResultSummary.message);
      }

      // --- Step 3: Construct Final Response ---
      // Consider overall success if both operations are successful.
      const overallSuccess = githubResultSummary.success && eventbriteResultSummary.success;
      // Use 207 Multi-Status if you want to indicate partial success.
      // For simplicity, 200 if all good, 500 if any part critical to the flow failed.
      const finalStatus = overallSuccess ? 200 : (githubResultSummary.success ? 207 : 500);


      return new Response(JSON.stringify({ 
        overallStatus: overallSuccess ? "Success" : "One or more operations failed.",
        github: githubResultSummary,
        eventbrite: eventbriteResultSummary
      }), { status: finalStatus, headers: { 'Content-Type': 'application/json' }});

    } catch (error) { // Catch errors from the orchestration logic itself or unhandled ones from modules
      console.error('Worker/Automation: Unhandled error during event processing orchestration:', error.stack || error);
      // Ensure partial results are included if available
      return new Response(JSON.stringify({
        overallStatus: "Critical Orchestration Failure",
        message: 'Internal Server Error: ' + (error.message || "Unknown error"),
        github: githubResultSummary, 
        eventbrite: eventbriteResultSummary,
        errorDetails: error.stack // Provide stack for critical errors
      }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
  },
};