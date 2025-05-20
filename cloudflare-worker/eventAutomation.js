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

    let githubResultSummary = { success: false, message: "GitHub processing not initiated.", fileUrl: null, status: null, error: null };
    let eventbriteResultSummary = { success: false, message: "Eventbrite processing not initiated.", eventUrl: null, eventId: null, published: false, error: null };

    try {
      // --- Step 1: Create Eventbrite Event (to get the link) ---
      console.log('Worker/Automation: Attempting to create Eventbrite event...');
      eventbriteResultSummary = await createMindfulinaEventOnEventbrite(
        eventData,
        env.EVENTBRITE_PRIVATE_TOKEN,
        EVENTBRITE_ORGANIZER_ID, 
        EVENTBRITE_VENUE_ID      
      );

      if (eventbriteResultSummary.success && eventbriteResultSummary.published) {
          console.log(`Worker/Automation: Eventbrite event created and published successfully. URL: ${eventbriteResultSummary.eventUrl}`);
      } else if (eventbriteResultSummary.success && !eventbriteResultSummary.published) {
          console.warn(`Worker/Automation: Eventbrite event created (ID: ${eventbriteResultSummary.eventId}) but NOT published. URL: ${eventbriteResultSummary.eventUrl}`);
          // This is considered a partial success for Eventbrite, but overall success depends on GitHub too,
          // and the website might not want to link to an unpublished event.
      } else {
          console.error(`Worker/Automation: Eventbrite event processing failed. Message: ${eventbriteResultSummary.message}`);
      }

      // --- Step 2: Create GitHub Event File (with Eventbrite link if available and published) ---
      console.log('Worker/Automation: Attempting to create GitHub event file...');
      // Only pass the Eventbrite link if the event was successfully created AND published.
      const eventbriteLinkForGithub = (eventbriteResultSummary.success && eventbriteResultSummary.published) ? eventbriteResultSummary.eventUrl : '';
      
      const githubApiResponse = await createGithubEventFile(eventData, env.GITHUB_TOKEN, eventbriteLinkForGithub);
      
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
          console.warn("Worker/Automation: Could not parse GitHub response JSON to get html_url, but operation succeeded based on status.", parseError);
        }
        console.log(`Worker/Automation: Successfully created/updated GitHub file. URL: ${githubResultSummary.fileUrl || 'N/A'}`);
      }
      
      // --- Step 3: Construct Final Response ---
      // Overall success means Eventbrite event was created AND published, AND GitHub file was created.
      const overallSuccess = eventbriteResultSummary.success && eventbriteResultSummary.published && githubResultSummary.success;
      
      // Use 207 Multi-Status if any part succeeded but not all critical parts.
      // 200 if all critical parts (Eventbrite published, GitHub created) succeeded.
      // 500 if both failed, or a critical part like Eventbrite creation (even if not published) plus GitHub failed.
      let finalStatus;
      if (overallSuccess) {
        finalStatus = 200;
      } else if (eventbriteResultSummary.success || githubResultSummary.success) { // At least one part had some form of success
        finalStatus = 207; // Multi-Status
      } else {
        finalStatus = 500; // Both operations failed entirely
      }

      return new Response(JSON.stringify({ 
        overallStatus: overallSuccess ? "Success" : "One or more operations faced issues or did not complete successfully.",
        eventbrite: eventbriteResultSummary,
        github: githubResultSummary
      }), { status: finalStatus, headers: { 'Content-Type': 'application/json' }});

    } catch (error) { 
      console.error('Worker/Automation: Unhandled error during event processing orchestration:', error.stack || error);
      return new Response(JSON.stringify({
        overallStatus: "Critical Orchestration Failure",
        message: 'Internal Server Error: ' + (error.message || "Unknown error"),
        eventbrite: eventbriteResultSummary, // Include partial results if available
        github: githubResultSummary,     // Include partial results if available
        errorDetails: error.stack 
      }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
  },
};