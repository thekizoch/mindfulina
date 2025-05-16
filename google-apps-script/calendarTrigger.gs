
// Google Apps Script: Calendar Trigger for Mindfulina Event Automation
// Uses Advanced Calendar Service for precise identification of newly created events.

const DESIGNATED_CALENDAR_ID = '59304c420efed529578b52fcf9f05481fc59372a74721d10a1587f08fcd15174@group.calendar.google.com';

// Placeholder: Replace with your actual Cloudflare Worker URL once deployed
const CLOUDFLARE_WORKER_URL = 'YOUR_CLOUDFLARE_WORKER_URL_GOES_HERE';

const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const PROCESSED_EVENT_CREATION_PREFIX = 'PROCESSED_EVENT_CREATION_'; // Appended with eventId

// Time window (in milliseconds) to consider an event "newly created" by comparing its 'created' timestamp to 'now'.
const NEW_EVENT_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
// Time window (in milliseconds) for how far back to query events using 'timeMin' for Calendar.Events.list.
const EVENT_QUERY_LOOKBACK_MS = 5 * 60 * 1000; // 5 minutes
// Max difference (in milliseconds) between 'created' and 'updated' for an event to be considered brand new.
const CREATED_UPDATED_MAX_DIFF_MS = 15 * 1000; // 15 seconds


/**
 * Main function triggered by Google Calendar event updates.
 * This function processes events from the DESIGNATED_CALENDAR_ID.
 * IMPORTANT: Enable the "Calendar API" (Advanced Google Service) in the Apps Script editor
 * under "Services +" for this script to work.
 * @param {Object} e The event object from the Google Calendar trigger.
 */
function onCalendarEventUpdate(e) {
  if (!e || typeof e.calendarId === 'undefined') {
    Logger.log('Trigger fired with incomplete event object or missing calendarId. Raw object: ' + JSON.stringify(e));
    return;
  }

  if (e.calendarId !== DESIGNATED_CALENDAR_ID) {
    Logger.log('Trigger fired for an irrelevant calendar (' + e.calendarId + '). Skipping.');
    return;
  }

  Logger.log('Designated calendar update detected. Calendar ID: ' + e.calendarId + ', TriggerUID: ' + (e.triggerUid || 'N/A'));
  
  // Brief pause for Google's infrastructure to settle.
  Utilities.sleep(5000); // 5 seconds

  try {
    const now = new Date();
    // timeMin for Calendar.Events.list often refers to event start times for filtering.
    // For "orderBy: 'updated'", it helps narrow the search.
    const timeMinQuery = new Date(now.getTime() - EVENT_QUERY_LOOKBACK_MS).toISOString();

    // Use Advanced Calendar Service
    const response = Calendar.Events.list(DESIGNATED_CALENDAR_ID, {
      orderBy: 'updated',       // Get most recently updated events first
      timeMin: timeMinQuery,    
      maxResults: 5,           
      singleEvents: true,       
      showDeleted: false,
      // Request specific fields to make the response smaller and faster
      fields: 'items(id,summary,created,updated,start,end,location,description),nextPageToken' 
    });

    if (!response || !response.items || response.items.length === 0) {
      Logger.log('No events found in the query window using Advanced Calendar Service. timeMin: ' + timeMinQuery);
      return;
    }

    Logger.log(response.items.length + ' event(s) found by Advanced Service (ordered by updated desc).');

    let newlyCreatedEvent = null;

    for (let i = 0; i < response.items.length; i++) {
      const eventItem = response.items[i];
      if (!eventItem.created || !eventItem.updated || !eventItem.id || !eventItem.summary) {
        Logger.log('  Event item missing critical fields (created, updated, id, or summary). Skipping. Item: ' + JSON.stringify(eventItem).substring(0, 200));
        continue;
      }
      const createdDate = new Date(eventItem.created);
      const updatedDate = new Date(eventItem.updated);

      Logger.log('  Checking event: "' + eventItem.summary + '" (ID: ' + eventItem.id + '), Created: ' + createdDate.toISOString() + ', Updated: ' + updatedDate.toISOString());

      // 1. Check if 'created' is very recent
      if ((now.getTime() - createdDate.getTime()) < NEW_EVENT_THRESHOLD_MS) {
        // 2. For a brand new event, 'created' and 'updated' timestamps should be very close.
        if (Math.abs(updatedDate.getTime() - createdDate.getTime()) < CREATED_UPDATED_MAX_DIFF_MS) { 
          const processedKey = PROCESSED_EVENT_CREATION_PREFIX + eventItem.id;
          if (SCRIPT_PROPERTIES.getProperty(processedKey)) {
            Logger.log('    Event ID ' + eventItem.id + ' was already processed for creation. Skipping.');
            continue; 
          }
          newlyCreatedEvent = eventItem;
          Logger.log('    -> Identified as NEWLY CREATED event: "' + newlyCreatedEvent.summary + '"');
          break; 
        } else {
          Logger.log('    Event created recently, but updated ('+updatedDate.toISOString()+') / created ('+createdDate.toISOString()+') timestamps differ significantly. Not treated as the initial creation trigger.');
        }
      } else {
         Logger.log('    Event not created within the NEW_EVENT_THRESHOLD_MS ('+ (NEW_EVENT_THRESHOLD_MS / 1000) +'s ago).');
      }
    }

    if (newlyCreatedEvent) {
      processEventWithAdvancedApiObject(newlyCreatedEvent);
      const processedKey = PROCESSED_EVENT_CREATION_PREFIX + newlyCreatedEvent.id;
      SCRIPT_PROPERTIES.setProperty(processedKey, new Date().toISOString());
      Logger.log('Marked event ID ' + newlyCreatedEvent.id + ' as processed for creation at ' + SCRIPT_PROPERTIES.getProperty(processedKey));
    } else {
      Logger.log('No definitively *newly created* event identified within the threshold from the ' + response.items.length + ' fetched events that hasn\'t already been processed.');
    }

  } catch (err) {
    let errorMessage = err.toString();
    if (err.stack) {
        errorMessage += ' Stack: ' + err.stack;
    }
    Logger.log('ERROR in onCalendarEventUpdate (Advanced Service): ' + errorMessage);
    if (err.message && (err.message.toLowerCase().includes("calendar is not defined") || err.message.toLowerCase().includes("calendar.events is undefined"))) {
        Logger.log("IMPORTANT: The 'Calendar' Advanced Service might not be enabled, or permissions are missing. Please enable it in the Apps Script editor under 'Services +' and ensure API usage is allowed for this project if it's a GCP-linked project.");
    }
  }
}

/**
 * Processes the details of a Mindfulina event (from Advanced Calendar API object)
 * and sends them to the Cloudflare Worker.
 * @param {Object} eventItem The event item object from Calendar.Events.list().
 */
function processEventWithAdvancedApiObject(eventItem) {
  const eventTitle = eventItem.summary || 'Untitled Event'; 
  
  // Handle all-day vs timed events for start and end times
  let startTime, endTime;
  if (eventItem.start) {
    startTime = eventItem.start.dateTime || eventItem.start.date; // dateTime if timed, date if all-day
  } else {
    Logger.log("Warning: eventItem.start is undefined for event ID " + eventItem.id + ". Defaulting start time.");
    startTime = new Date().toISOString(); // Fallback, should not happen for valid events
  }

  if (eventItem.end) {
    endTime = eventItem.end.dateTime || eventItem.end.date; // dateTime if timed, date if all-day
  } else {
    Logger.log("Warning: eventItem.end is undefined for event ID " + eventItem.id + ". Defaulting end time to start time.");
    endTime = startTime; // Fallback
  }
  
  const location = eventItem.location || '';
  const description = eventItem.description || '';
  const gcalEventId = eventItem.id;

  Logger.log('Processing Event Details (Advanced API):');
  Logger.log('  Title: ' + eventTitle);
  Logger.log('  Start Time (from API): ' + startTime);
  Logger.log('  End Time (from API): ' + endTime);
  Logger.log('  Location: ' + location);
  Logger.log('  Description (first 100 chars): ' + (description ? description.substring(0,100) : "N/A"));
  Logger.log('  Google Calendar Event ID: ' + gcalEventId);

  const payload = {
    title: eventTitle,
    startTime: startTime, 
    endTime: endTime,     
    location: location,
    description: description,
    googleCalendarEventId: gcalEventId,
    isAllDay: !!eventItem.start.date, // True if start.date exists (all-day event)
    processedAt: new Date().toISOString()
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log('Attempting to send payload to Cloudflare Worker: ' + CLOUDFLARE_WORKER_URL);
  // Logger.log('Full payload being sent: ' + JSON.stringify(payload, null, 2)); // Uncomment for debugging

  try {
    const response = UrlFetchApp.fetch(CLOUDFLARE_WORKER_URL, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    Logger.log('Webhook Response Code: ' + responseCode);
    // Log only a snippet of body to avoid flooding logs if it's large
    Logger.log('Webhook Response Body (first 500 chars): ' + (responseBody ? responseBody.substring(0,500) : "N/A"));

    if (responseCode >= 200 && responseCode < 300) {
      Logger.log('Event successfully sent to Cloudflare Worker.');
    } else {
      Logger.log('ERROR sending event to Cloudflare Worker. Status: ' + responseCode + ', Full Body: ' + (responseBody || "N/A"));
    }
  } catch (error) {
    Logger.log('CRITICAL FAILURE: Exception during UrlFetchApp.fetch: ' + error.toString() + ' Stack: ' + (error.stack || 'N/A'));
  }
}


/**
 * Helper to manually test processing for a specific event ID using Advanced API.
 * You must enable "Calendar API" advanced service in Apps Script.
 */
function runManualTestForSpecificEvent() {
  const TEST_EVENT_ID_TO_PROCESS = 'PASTE_YOUR_GCAL_EVENT_ID_HERE_FOR_TESTING'; // Replace with actual event ID
  
  if (CLOUDFLARE_WORKER_URL === 'YOUR_CLOUDFLARE_WORKER_URL_GOES_HERE') {
    Logger.log("Warning: CLOUDFLARE_WORKER_URL is a placeholder. Webhook call will fail if not updated.");
  }
  if (!TEST_EVENT_ID_TO_PROCESS || TEST_EVENT_ID_TO_PROCESS === 'PASTE_YOUR_GCAL_EVENT_ID_HERE_FOR_TESTING') {
    Logger.log("Please update TEST_EVENT_ID_TO_PROCESS with a valid Google Calendar Event ID from the DESIGNATED_CALENDAR_ID.");
    return;
  }
  Logger.log('Manually testing processing for event ID: ' + TEST_EVENT_ID_TO_PROCESS);
  
  try {
    const eventItem = Calendar.Events.get(DESIGNATED_CALENDAR_ID, TEST_EVENT_ID_TO_PROCESS, {
        fields: 'id,summary,created,updated,start,end,location,description' // Request specific fields
    });
    if (eventItem) {
      Logger.log('Successfully fetched event via Advanced API. Title: ' + eventItem.summary);
      processEventWithAdvancedApiObject(eventItem);
    } else {
      Logger.log('Manual test: Event not found with ID (Advanced API): ' + TEST_EVENT_ID_TO_PROCESS);
    }
  } catch (error) {
     let errorMessage = error.toString();
    if (error.stack) {
        errorMessage += ' Stack: ' + error.stack;
    }
    Logger.log('Manual test: Error (Advanced API): ' + errorMessage);
     if (error.message && (error.message.toLowerCase().includes("calendar is not defined") || error.message.toLowerCase().includes("calendar.events is undefined"))) {
        Logger.log("IMPORTANT: The 'Calendar' Advanced Service might not be enabled. Please enable it in the Apps Script editor under 'Services +'.");
    }
  }
}

/**
 * Utility to list recent events from the designated calendar using Advanced API.
 * Helps find event IDs for testing.
 * You must enable "Calendar API" advanced service in Apps Script.
 */
function listRecentEventsForTesting() {
  Logger.log('Listing recent events using Advanced Calendar Service...');
  try {
    const now = new Date();
    const timeMinQuery = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString(); // Look back 7 days

    const response = Calendar.Events.list(DESIGNATED_CALENDAR_ID, {
      orderBy: 'updated', // Most recently updated first
      timeMin: timeMinQuery,
      maxResults: 10,
      singleEvents: true,
      showDeleted: false,
      fields: 'items(id,summary,created,updated,start)' // Request only necessary fields
    });

    if (!response || !response.items || response.items.length === 0) {
      Logger.log('No events found in the last 7 days (ordered by updated).');
      return;
    }
    
    Logger.log('Recent events (last 7 days, ordered by updated desc, max 10) in calendar ID ' + DESIGNATED_CALENDAR_ID + ':');
    response.items.forEach(function(eventItem) {
      const created = eventItem.created ? new Date(eventItem.created).toLocaleString() : "N/A";
      const updated = eventItem.updated ? new Date(eventItem.updated).toLocaleString() : "N/A";
      let startDisplay = "N/A";
      if(eventItem.start) {
          startDisplay = eventItem.start.dateTime ? new Date(eventItem.start.dateTime).toLocaleString() : eventItem.start.date;
      }
      Logger.log('  Title: "' + eventItem.summary + '", Start: ' + startDisplay + ', Created: ' + created + ', Updated: ' + updated + ', Event ID: "' + eventItem.id + '"');
    });

  } catch (error) {
     let errorMessage = error.toString();
    if (error.stack) {
        errorMessage += ' Stack: ' + error.stack;
    }
    Logger.log('Error in listRecentEventsForTesting (Advanced API): ' + errorMessage);
     if (error.message && (error.message.toLowerCase().includes("calendar is not defined") || error.message.toLowerCase().includes("calendar.events is undefined"))) {
        Logger.log("IMPORTANT: The 'Calendar' Advanced Service might not be enabled. Please enable it in the Apps Script editor under 'Services +'.");
    }
  }
}
