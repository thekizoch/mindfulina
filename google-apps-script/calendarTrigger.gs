// Google Apps Script: Calendar Trigger for Mindfulina Event Automation

const DESIGNATED_CALENDAR_ID = '59304c420efed529578b52fcf9f05481fc59372a74721d10a1587f08fcd15174@group.calendar.google.com';

// Placeholder: Replace with your actual Cloudflare Worker URL once deployed
const CLOUDFLARE_WORKER_URL = 'YOUR_CLOUDFLARE_WORKER_URL_GOES_HERE';

/**
 * Main function triggered by Google Calendar event updates.
 * This function processes events from the DESIGNATED_CALENDAR_ID.
 * @param {Object} e The event object from the Google Calendar trigger.
 */
function onCalendarEventUpdate(e) {
  // --- BEGIN DEBUGGING BLOCK ---
  if (!e) {
    Logger.log('CRITICAL: No event object (e) received at all from the trigger. Exiting.');
    return;
  }
  // Attempt to stringify, but be cautious as 'e' can be complex or contain circular refs in rare cases.
  try {
    Logger.log('DEBUG: Raw event object (e) from trigger: ' + JSON.stringify(e, null, 2));
  } catch (jsonError) {
    Logger.log('DEBUG: Could not JSON.stringify(e). Logging keys instead. Error: ' + jsonError.message);
    let e_keys_fallback = [];
     if (typeof e === 'object' && e !== null) {
        try {
            e_keys_fallback = Object.keys(e);
        } catch (objectKeysError) {
            Logger.log('DEBUG: Could not get Object.keys(e). Error: ' + objectKeysError.message);
        }
     }
    Logger.log('DEBUG: Fallback - Keys in e: ' + e_keys_fallback.join(', '));
  }
  
  let e_keys = [];
  if (typeof e === 'object' && e !== null) {
    try {
        e_keys = Object.keys(e);
    } catch (objectKeysError) {
        Logger.log('DEBUG: Could not get Object.keys(e) for primary key log. Error: ' + objectKeysError.message);
    }
  }
  Logger.log('DEBUG: Primary keys in e: ' + e_keys.join(', '));

  if (e.authMode) {
    Logger.log('DEBUG: e.authMode: ' + e.authMode);
  } else {
    Logger.log('DEBUG: e.authMode property not present.');
  }
  if (e.triggerUid) {
    Logger.log('DEBUG: e.triggerUid: ' + e.triggerUid);
  } else {
    Logger.log('DEBUG: e.triggerUid property not present.');
  }
  // --- END DEBUGGING BLOCK ---

  // Ensure calendarId exists on the event object 'e'
  if (typeof e.calendarId === 'undefined') {
    Logger.log('ERROR: The property "calendarId" is missing from the trigger event object (e). Cannot determine the source calendar. Contents of e logged above.');
    return;
  }
  const calendarId = e.calendarId;
  Logger.log('Trigger received for calendar ID: ' + calendarId);


  if (calendarId === DESIGNATED_CALENDAR_ID) {
    Logger.log('Event is from the designated Mindfulina calendar. Processing...');
    
    // It's often good to wait a few seconds to ensure the event is fully saved,
    // especially if the trigger fires very quickly after event creation/modification.
    Utilities.sleep(5000); // Sleep for 5 seconds (5000 milliseconds)

    // Ensure eventId exists on the event object 'e'
    if (typeof e.eventId === 'undefined') {
      Logger.log('ERROR: The property "eventId" is missing from the trigger event object (e) for calendar: ' + calendarId + '. The raw event object (e) was logged above. Cannot fetch specific event details.');
      return;
    }
    const eventId = e.eventId;
    Logger.log('Found eventId in trigger object: ' + eventId);
    
    const event = CalendarApp.getCalendarById(DESIGNATED_CALENDAR_ID).getEventById(eventId);

    if (event) {
      Logger.log('Successfully fetched CalendarEvent object for eventId: ' + eventId);
      processMindfulinaEvent(event);
    } else {
      Logger.log('ERROR: Could not retrieve CalendarEvent object using eventId: ' + eventId + ' from calendar ' + DESIGNATED_CALENDAR_ID + '. The event might have been deleted very quickly, or this eventId might refer to an instance of a recurring event that requires different handling (e.g., using getEvents() with start/end times).');
    }
  } else {
    Logger.log('Event is NOT from the designated Mindfulina calendar (Expected: "' + DESIGNATED_CALENDAR_ID + '", Got: "' + calendarId + '"). Skipping.');
  }
}

/**
 * Processes the details of a Mindfulina event and sends them to the Cloudflare Worker.
 * @param {GoogleAppsScript.Calendar.CalendarEvent} event The CalendarEvent object.
 */
function processMindfulinaEvent(event) {
  const eventTitle = event.getTitle();
  const startTime = event.getStartTime().toISOString();
  const endTime = event.getEndTime().toISOString();
  const location = event.getLocation();
  const description = event.getDescription();
  const gcalEventId = event.getId(); // Gets the unique ID of the CalendarEvent

  Logger.log('Processing Event Details:');
  Logger.log('  Title: ' + eventTitle);
  Logger.log('  Start Time (ISO): ' + startTime);
  Logger.log('  End Time (ISO): ' + endTime);
  Logger.log('  Location: ' + location);
  // Logger.log('  Description: ' + description); // Description can be long, log selectively if needed
  Logger.log('  Google Calendar Event ID (from CalendarEvent.getId()): ' + gcalEventId);

  const payload = {
    title: eventTitle,
    startTime: startTime,
    endTime: endTime,
    location: location,
    description: description,
    googleCalendarEventId: gcalEventId,
    processedAt: new Date().toISOString() // Add a timestamp for when this script processed it
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // Allows manual error handling based on response code
  };

  Logger.log('Attempting to send payload to Cloudflare Worker: ' + CLOUDFLARE_WORKER_URL);
  // Logger.log('Payload being sent: ' + JSON.stringify(payload, null, 2)); // Uncomment to see full payload in logs

  try {
    const response = UrlFetchApp.fetch(CLOUDFLARE_WORKER_URL, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    Logger.log('Webhook Response Code: ' + responseCode);
    Logger.log('Webhook Response Body (first 500 chars): ' + (responseBody ? responseBody.substring(0,500) : "N/A"));
    // Logger.log('Full Webhook Response Body: ' + responseBody); // Uncomment for full body if needed

    if (responseCode >= 200 && responseCode < 300) {
      Logger.log('Event successfully sent to Cloudflare Worker.');
      // Optional: Add a visual cue to the GCal event indicating it has been processed successfully
      // For example, set the event color to green
      // try { event.setColor(CalendarApp.EventColor.GREEN); } catch(e) { Logger.log('Could not set event color: ' + e.message); }
    } else {
      Logger.log('ERROR sending event to Cloudflare Worker. Status: ' + responseCode + ', Body: ' + (responseBody ? responseBody.substring(0,1000) : "N/A"));
      // Optional: Visual cue for failure
      // try { event.setColor(CalendarApp.EventColor.RED); } catch(e) { Logger.log('Could not set event color: ' + e.message); }
    }
  } catch (error) {
    Logger.log('CRITICAL FAILURE: Exception during UrlFetchApp.fetch: ' + error.toString());
    Logger.log('Error Name: ' + error.name);
    Logger.log('Error Message: ' + error.message);
    Logger.log('Error Stack: ' + error.stack);
    // Optional: Visual cue for critical failure
    // try { event.setColor(CalendarApp.EventColor.RED); } catch(e) { Logger.log('Could not set event color: ' + e.message); }
  }
}

/**
 * Helper function to manually test processing for a specific event ID from the designated calendar.
 * 1. Find an event ID from your designated calendar (e.g., by temporarily logging 'gcalEventId' 
 *    when an event is processed, or use other GCal API tools, or run listRecentEventsForTesting).
 * 2. Paste it into the TEST_EVENT_ID_TO_PROCESS constant below.
 * 3. In the Apps Script editor, select "runManualTestForSpecificEvent" from the function dropdown and click "Run".
 * 4. Check the logs for output.
 */
function runManualTestForSpecificEvent() {
  const TEST_EVENT_ID_TO_PROCESS = 'PASTE_YOUR_GCAL_EVENT_ID_HERE_FOR_TESTING'; 
  
  if (CLOUDFLARE_WORKER_URL === 'YOUR_CLOUDFLARE_WORKER_URL_GOES_HERE') {
    Logger.log("Warning: CLOUDFLARE_WORKER_URL is still a placeholder. Webhook call will fail if not updated.");
    // return; // Comment out if you want to test other parts of the script without a real worker URL yet
  }
  if (TEST_EVENT_ID_TO_PROCESS === '' || TEST_EVENT_ID_TO_PROCESS === 'PASTE_YOUR_GCAL_EVENT_ID_HERE_FOR_TESTING') {
    Logger.log("Please update TEST_EVENT_ID_TO_PROCESS with a valid Google Calendar Event ID from the DESIGNATED_CALENDAR_ID to run the manual test.");
    return;
  }

  Logger.log('Manually testing processing for event ID: ' + TEST_EVENT_ID_TO_PROCESS + ' from calendar: ' + DESIGNATED_CALENDAR_ID);
  
  try {
    const event = CalendarApp.getCalendarById(DESIGNATED_CALENDAR_ID).getEventById(TEST_EVENT_ID_TO_PROCESS);
    if (event) {
      Logger.log('Successfully fetched event for manual test. Title: ' + event.getTitle());
      processMindfulinaEvent(event);
    } else {
      Logger.log('Manual test: Event not found with ID: ' + TEST_EVENT_ID_TO_PROCESS + ' in calendar ' + DESIGNATED_CALENDAR_ID);
    }
  } catch (error) {
    Logger.log('Manual test: Error fetching or processing event: ' + error.toString());
  }
}

/**
 * Utility to list recent events from the designated calendar to help find an event ID for testing.
 * Select "listRecentEventsForTesting" and run to see IDs in logs.
 */
function listRecentEventsForTesting() {
  try {
    const calendar = CalendarApp.getCalendarById(DESIGNATED_CALENDAR_ID);
    if (!calendar) {
      Logger.log('Could not access calendar with ID: ' + DESIGNATED_CALENDAR_ID);
      return;
    }
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // Look back 7 days
    const events = calendar.getEvents(oneWeekAgo, now);
    
    if (events.length === 0) {
      Logger.log('No events found in the last week in calendar: ' + DESIGNATED_CALENDAR_ID);
      return;
    }
    
    Logger.log('Recent events (last 7 days) in calendar "' + calendar.getName() + '" (ID: ' + DESIGNATED_CALENDAR_ID + '):');
    for (let i = 0; i < Math.min(events.length, 15); i++) { // Log max 15 recent events
      Logger.log('  Title: "' + events[i].getTitle() + '", Start: ' + events[i].getStartTime() + ', Event ID: "' + events[i].getId() + '"');
    }
  } catch (error) {
    Logger.log('Error in listRecentEventsForTesting: ' + error.toString());
  }
}