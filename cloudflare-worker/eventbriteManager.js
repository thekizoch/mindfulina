// mindfulina/cloudflare-worker/eventbriteManager.js

// Constants for Eventbrite event creation
const EVENT_CAPACITY = 25;
const EVENT_TIMEZONE = 'Pacific/Honolulu'; // Default timezone for Eventbrite events
const DEFAULT_EVENTBRITE_IMAGE_ID = '1033232763'; // Default uploaded image ID
const EVENTBRITE_TEMPLATE_ID = '1371879341039'; // ID of the template event to copy

// Default HTML content if GCal description is empty
const DEFAULT_EVENTBRITE_DESCRIPTION_HTML = `<p>Join us for a sound bath to reset and relax your mind, body, and spirit — reconnecting with your mana and the healing rhythms of the moana.</p>
<h2>Before You Arrive:</h2>
<p>Consider moving your body beforehand; take a gentle walk, stretch, or run before the session to release stagnant energy.</p>
<h2>Bring:</h2>
<ul>
  <li>Towel, mat, or blanket for the ‘āina</li>
  <li>Eye mask if you wish to shut out visual stimulation and the sun</li>
  <li>Swimsuit, sunscreen, and water bottle if you feel called to connect with the moana after our gathering</li>
</ul>
<p>Let the makani (breeze) and sounds of the moana guide your naʻau (inner heart) into deep rest.</p>
<p>E komo mai — all are welcome!</p>`;

async function eventbriteApiCall(url, method, token, body = null) {
  // console.log(`Worker/eventbriteManager: API Call - ${method} ${url}`);
  // if (body && method !== 'GET') console.log(`Worker/eventbriteManager: Request Body - ${JSON.stringify(body, null, 2)}`);

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Mindfulina-Cloudflare-Worker/1.0.3', 
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
    console.error(`Worker/eventbriteManager: API Call to ${url} - Non-JSON response. Status: ${response.status}. Body: ${responseBodyText.substring(0, 500)}`);
    if (!response.ok) {
      throw new Error(`Eventbrite API Error: ${response.status} - ${response.statusText}. Response was not valid JSON.`);
    }
    return { success: true, details: "Response was not JSON but request was successful.", status: response.status, raw_text: responseBodyText };
  }
  if (!response.ok) {
    console.error(`Worker/eventbriteManager: API Error (${method} ${url}) - Status: ${response.status}. Details: ${JSON.stringify(responseData, null,2)}`);
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
  // console.log(`Worker/eventbriteManager: API Success (${method} ${url}) - Status: ${response.status}`);
  return responseData;
}

function formatDescriptionToHtml(textDescription) {
    if (!textDescription || textDescription.trim() === "") {
        return DEFAULT_EVENTBRITE_DESCRIPTION_HTML;
    }
    const escapedText = textDescription
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    return escapedText.split(/\n\s*\n/).map(paragraph => 
        `<p>${paragraph.split('\n').join('<br />')}</p>`
    ).join('');
}

/**
 * Creates an event on Eventbrite by copying a template and updating its content.
 * @param {object} gcalEventData - Event data from Google Calendar. Expected: title, startTime, endTime, googleCalendarEventId, [description]
 * @param {string} ebToken - Eventbrite Private Token.
 * @param {string} ebOrganizerId - Eventbrite Organizer ID (less critical for copy, but good for context).
 * @param {string} ebVenueId - Eventbrite Venue ID (less critical for copy, but good for context).
 * @param {string} [imageIdToUse=DEFAULT_EVENTBRITE_IMAGE_ID] - Eventbrite Image ID for logo and structured content.
 * @returns {Promise<object>} - Result of the event creation process.
 */
export async function createMindfulinaEventOnEventbrite(
    gcalEventData, 
    ebToken, 
    ebOrganizerId, 
    ebVenueId,     
    imageIdToUse = DEFAULT_EVENTBRITE_IMAGE_ID
) {
  const { title, startTime: gcalStartTime, endTime: gcalEndTime, description: gcalDescription, googleCalendarEventId } = gcalEventData;

  if (!ebToken) { 
    console.error("Worker/eventbriteManager: Missing required Eventbrite Token.");
    throw new Error("Configuration error: Missing Eventbrite token.");
  }
  if (!gcalStartTime || !gcalEndTime || !googleCalendarEventId) {
      console.error("Worker/eventbriteManager: Missing startTime, endTime, or googleCalendarEventId from gcalEventData.");
      throw new Error("Event data error: startTime, endTime, and googleCalendarEventId are required.");
  }

  // Use the Google Calendar title directly, or a default if it's missing.
  const newEventName = title || "Mindfulina Event";
  
  const startTimeObj = new Date(gcalStartTime);
  const endTimeObj = new Date(gcalEndTime);

  const eventbriteStartUTC = startTimeObj.toISOString().slice(0, 19) + 'Z';
  const eventbriteEndUTC = endTimeObj.toISOString().slice(0, 19) + 'Z';
  
  let copiedEventId;
  let copiedEventUrl;

  try {
    // --- Step 1: Copy the Template Event ---
    console.log(`Worker/eventbriteManager: Copying template event ID: ${EVENTBRITE_TEMPLATE_ID} to create "${newEventName}"...`);
    const copyEventUrlApi = `https://www.eventbriteapi.com/v3/events/${EVENTBRITE_TEMPLATE_ID}/copy/`;
    const copyPayload = {
      name: newEventName, // Use the GCal title (or default)
      start_date: eventbriteStartUTC,
      end_date: eventbriteEndUTC,
      timezone: EVENT_TIMEZONE, 
    };
    const copiedEventData = await eventbriteApiCall(copyEventUrlApi, 'POST', ebToken, copyPayload);
    
    if (!copiedEventData || !copiedEventData.id || !copiedEventData.url) {
        console.error("Worker/eventbriteManager: Event copy call response did not include an event ID or URL.", copiedEventData);
        throw new Error("Failed to retrieve necessary details (ID, URL) from event copy response.");
    }
    copiedEventId = copiedEventData.id;
    copiedEventUrl = copiedEventData.url;
    console.log(`Worker/eventbriteManager: Event copied. New ID: ${copiedEventId}, URL: ${copiedEventUrl}`);

    // --- Step 2: Update Logo of the Copied Event ---
    if (imageIdToUse) {
      console.log(`Worker/eventbriteManager: Updating logo for event ID: ${copiedEventId} with image ID: ${imageIdToUse}...`);
      const updateEventUrlApi = `https://www.eventbriteapi.com/v3/events/${copiedEventId}/`;
      const updateLogoPayload = { event: { logo_id: imageIdToUse } };
      await eventbriteApiCall(updateEventUrlApi, 'POST', ebToken, updateLogoPayload);
      console.log(`Worker/eventbriteManager: Logo updated for event ID: ${copiedEventId}`);
    } else {
      console.log(`Worker/eventbriteManager: No imageIdToUse provided, skipping logo update for copied event.`);
    }

    // --- Step 3: Update Structured Content (Description and Image) ---
    console.log(`Worker/eventbriteManager: Updating structured content for event ID: ${copiedEventId}...`);
    const eventHtmlDescription = formatDescriptionToHtml(gcalDescription);
    const structuredContentModules = [{ type: "text", data: { body: { alignment: "left", text: eventHtmlDescription } } }];
    if (imageIdToUse) {
      structuredContentModules.push({ type: "image", data: { image: { image_id: imageIdToUse } } });
    }
    const structuredContentPayload = { modules: structuredContentModules, publish: true, purpose: "listing" }; 
    const structuredContentUrlApi = `https://www.eventbriteapi.com/v3/events/${copiedEventId}/structured_content/1/`;
    await eventbriteApiCall(structuredContentUrlApi, 'POST', ebToken, structuredContentPayload);
    console.log(`Worker/eventbriteManager: Structured content updated for event ID: ${copiedEventId}`);

    // --- Step 4: Update Ticket Class Capacity ---
    console.log(`Worker/eventbriteManager: Fetching ticket classes for event ID: ${copiedEventId} to verify/update capacity...`);
    const listTicketClassesUrlApi = `https://www.eventbriteapi.com/v3/events/${copiedEventId}/ticket_classes/`;
    const ticketClassesData = await eventbriteApiCall(listTicketClassesUrlApi, 'GET', ebToken);

    if (ticketClassesData && ticketClassesData.ticket_classes && ticketClassesData.ticket_classes.length > 0) {
      const mainTicketClass = ticketClassesData.ticket_classes[0]; 
      if (mainTicketClass.quantity_total !== EVENT_CAPACITY) {
        console.log(`Worker/eventbriteManager: Updating capacity of ticket class ID ${mainTicketClass.id} from ${mainTicketClass.quantity_total} to ${EVENT_CAPACITY}...`);
        const updateTicketClassUrlApi = `https://www.eventbriteapi.com/v3/events/${copiedEventId}/ticket_classes/${mainTicketClass.id}/`;
        const updateTicketPayload = { ticket_class: { quantity_total: EVENT_CAPACITY } };
        await eventbriteApiCall(updateTicketClassUrlApi, 'POST', ebToken, updateTicketPayload);
        console.log(`Worker/eventbriteManager: Capacity updated for ticket class ID ${mainTicketClass.id}.`);
      } else {
        console.log(`Worker/eventbriteManager: Ticket class capacity (${mainTicketClass.quantity_total}) already matches EVENT_CAPACITY (${EVENT_CAPACITY}). No update needed.`);
      }
    } else {
      console.warn(`Worker/eventbriteManager: No ticket classes found for event ID ${copiedEventId}, or API response malformed. Skipping capacity update. The template should have a ticket class.`);
    }

    // --- Step 5: Publish Event ---
    console.log(`Worker/eventbriteManager: Publishing event ID: ${copiedEventId}...`);
    const publishUrlApi = `https://www.eventbriteapi.com/v3/events/${copiedEventId}/publish/`;
    const publishResult = await eventbriteApiCall(publishUrlApi, 'POST', ebToken); 
    console.log(`Worker/eventbriteManager: Event publish attempt completed for ID: ${copiedEventId}. Result: ${JSON.stringify(publishResult)}`);

    return { 
      success: true, 
      message: "Eventbrite event copied, updated, and publish process completed.", 
      eventId: copiedEventId, 
      eventUrl: copiedEventUrl,
      published: publishResult?.published || false 
    };
  } catch (error) {
    console.error(`Worker/eventbriteManager: Error in copy/update/publish for GCal event "${title}" (ID: ${googleCalendarEventId}):`, error.stack || error.message);
    return { 
      success: false, 
      message: `Eventbrite integration (copy/update/publish) failed: ${error.message}`, 
      eventId: copiedEventId, 
      eventUrl: copiedEventUrl, 
      errorDetails: error.message, 
      published: false
    };
  }
}