// mindfulina/cloudflare-worker/eventAutomation.js
// Main Cloudflare Worker for Mindfulina Event Automation.
// Orchestrates GitHub and Eventbrite integrations.

import { createGithubEventFile } from './githubManager.js';
import { createMindfulinaEventOnEventbrite } from './eventbriteManager.js';

// Eventbrite Configuration Constants
const EVENTBRITE_ORGANIZER_ID = '2736604261351'; 
const EVENTBRITE_VENUE_ID = '266927653';     

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Expected POST request from Google Apps Script', { status: 405 });
    }

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

    if (!eventData.title || !eventData.startTime || !eventData.endTime || !eventData.googleCalendarEventId) {
      console.error('Worker/Automation: Missing critical event data fields (title, startTime, endTime, googleCalendarEventId).');
      return new Response('Missing required event data fields from Google Calendar', { status: 400 });
    }
    if (!env.GITHUB_TOKEN) {
        console.error('Worker/Automation: Missing GITHUB_TOKEN secret.');
        return new Response('Configuration error: GitHub token not set.', { status: 500 });
    }
    if (!env.EVENTBRITE_PRIVATE_TOKEN) {
        console.error('Worker/Automation: Missing EVENTBRITE_PRIVATE_TOKEN secret.');
        return new Response('Configuration error: Eventbrite token not set.', { status: 500 });
    }

    let eventbriteResultSummary = { success: false, message: "Eventbrite processing not initiated.", eventUrl: null, eventId: null, published: false, error: null };
    let githubResultSummary = { success: false, message: "GitHub processing not initiated.", fileUrl: null, status: null, error: null };

    try {
      // --- Step 1: Create Eventbrite Event (to get the URL) ---
      console.log('Worker/Automation: Attempting to create Eventbrite event...');
      eventbriteResultSummary = await createMindfulinaEventOnEventbrite(
        eventData,
        env.EVENTBRITE_PRIVATE_TOKEN,
        EVENTBRITE_ORGANIZER_ID,
        EVENTBRITE_VENUE_ID
        // DEFAULT_EVENTBRITE_IMAGE_ID is handled within eventbriteManager
      );

      if (eventbriteResultSummary.success && eventbriteResultSummary.published) {
          console.log(`Worker/Automation: Eventbrite event processed successfully and published. URL: ${eventbriteResultSummary.eventUrl}`);
      } else if (eventbriteResultSummary.success && !eventbriteResultSummary.published) {
          console.warn(`Worker/Automation: Eventbrite event created (ID: ${eventbriteResultSummary.eventId}) but NOT published. URL: ${eventbriteResultSummary.eventUrl}. Proceeding with GitHub page creation.`);
          // This state is considered a partial success for the overall flow.
      } else {
          console.error(`Worker/Automation: Eventbrite event processing failed. Message: ${eventbriteResultSummary.message}. GitHub page creation will proceed without an Eventbrite link.`);
      }

      // --- Step 2: Create GitHub Event File (passing Eventbrite URL if available) ---
      console.log('Worker/Automation: Attempting to create GitHub event file...');
      const eventbriteLinkForGithub = (eventbriteResultSummary.success && eventbriteResultSummary.eventUrl) 
                                      ? eventbriteResultSummary.eventUrl 
                                      : null;

      const githubApiResponse = await createGithubEventFile(
        eventData, 
        env.GITHUB_TOKEN, 
        eventbriteLinkForGithub 
      );
      
      githubResultSummary.status = githubApiResponse.status; 
      const githubResponseText = await githubApiResponse.text(); 

      if (!githubApiResponse.ok) { 
        const errorMsg = `Failed to create GitHub file: ${githubResultSummary.status} - ${githubResponseText.substring(0, 200)}`;
        console.error(`Worker/Automation: ${errorMsg}`);
        githubResultSummary.message = errorMsg;
        githubResultSummary.error = githubResponseText;
        githubResultSummary.success = false;
      } else {
        githubResultSummary.success = true;
        githubResultSummary.message = 'GitHub event file processed successfully.';
        try {
          const githubJson = JSON.parse(githubResponseText);
          if (githubJson.content && githubJson.content.html_url) {
            githubResultSummary.fileUrl = githubJson.content.html_url;
          }
        } catch (parseError) {
          console.warn("Worker/Automation: Could not parse GitHub response JSON to get html_url, but operation succeeded based on status code.", parseError);
        }
        console.log(`Worker/Automation: Successfully created/updated GitHub file. URL: ${githubResultSummary.fileUrl || 'N/A'}`);
      }

      // --- Step 3: Construct Final Response ---
      // Overall success requires Eventbrite to be created (published or not) AND GitHub file created.
      // Publish status of Eventbrite is noted in its own summary.
      const overallSuccess = eventbriteResultSummary.success && githubResultSummary.success;
      const finalStatus = overallSuccess ? 200 : 207; // 200 for full success, 207 if any part had issues but didn't halt flow

      return new Response(JSON.stringify({ 
        overallStatus: overallSuccess ? "Success" : "One or more operations had issues.",
        eventbrite: eventbriteResultSummary,
        github: githubResultSummary
      }), { status: finalStatus, headers: { 'Content-Type': 'application/json' }});

    } catch (error) { 
      console.error('Worker/Automation: Unhandled error during event processing orchestration:', error.stack || error);
      return new Response(JSON.stringify({
        overallStatus: "Critical Orchestration Failure",
        message: 'Internal Server Error: ' + (error.message || "Unknown error"),
        eventbrite: eventbriteResultSummary, 
        github: githubResultSummary,       
        errorDetails: error.stack 
      }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
  },
};