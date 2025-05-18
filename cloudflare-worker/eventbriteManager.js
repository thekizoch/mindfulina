// mindfulina/cloudflare-worker/eventbriteManager.js

// Constants for Eventbrite event creation
const EVENT_CAPACITY = 25;
const EVENT_TIMEZONE = 'Pacific/Honolulu'; // Default timezone for Eventbrite events
const DEFAULT_EVENTBRITE_IMAGE_ID = '1033232763'; // Default uploaded image ID - UPDATED

// Default HTML content if GCal description is empty
const DEFAULT_EVENTBRITE_DESCRIPTION_HTML = `<p>Join us for a sound bath to reset and relax your mind, body, and spirit — reconnecting with your mana and the healing rhythms of the moana.</p>
<h2>Before You Arrive:</h2>
<p>Consider moving your body beforehand; take a gentle walk, stretch, or run before the session to release stagnant energy.</p>
<h2>Bring:</h2>
<ul>
  <li>Towel, mat, or blanket for the ‘āina</li>
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
    'User-Agent': 'Mindfulina-Cloudflare-Worker/1.0.2', 
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
    return { success: true, details: "Response was not JSON but request was successful.", status: response.status };
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
 * Creates an event on Eventbrite using data from Google Calendar.
 * @param {object} gcalEventData - Event data from Google Calendar. Expected: title, startTime, endTime, [description]
 * @param {string} ebToken - Eventbrite Private Token.
 * @param {string} ebOrganizerId - Eventbrite Organizer ID.
 * @param {string} ebVenueId - Eventbrite Venue ID.
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
  const { title, startTime: gcalStartTime, endTime: gcalEndTime, description: gcalDescription } = gcalEventData;

  if (!ebToken || !ebOrganizerId || !ebVenueId) {
    console.error("Worker/eventbriteManager: Missing required Eventbrite IDs (token, organizerId, venueId).");
    throw new Error("Configuration error: Missing Eventbrite parameters for event creation.");
  }
  if (!gcalStartTime || !gcalEndTime) {
      console.error("Worker/eventbriteManager: Missing startTime or endTime from gcalEventData. These are mandatory.");
      throw new Error("Event data error: startTime and endTime are required from Google Calendar.");
  }

  const startTimeObj = new Date(gcalStartTime);
  const endTimeObj = new Date(gcalEndTime);

  const eventbriteStartUTC = startTimeObj.toISOString().slice(0, 19) + 'Z';
  const eventbriteEndUTC = endTimeObj.toISOString().slice(0, 19) + 'Z';
  const eventHtmlDescription = formatDescriptionToHtml(gcalDescription);

  let eventbriteEventId;
  let eventbriteEventUrl;

  try {
    // --- Step 1: Create Base Event ---
    console.log("Worker/eventbriteManager: Creating base Eventbrite event...");
    const eventPayload = {
      event: {
        name: { html: title || "Mindfulina Event" },
        start: { timezone: EVENT_TIMEZONE, utc: eventbriteStartUTC },
        end: { timezone: EVENT_TIMEZONE, utc: eventbriteEndUTC },
        currency: "USD",
        venue_id: ebVenueId,
        capacity: EVENT_CAPACITY,
        listed: true, 
        shareable: true,
        online_event: false,
        ...(imageIdToUse && { logo_id: imageIdToUse }) 
      },
    };
    const createEventUrl = `https://www.eventbriteapi.com/v3/organizations/${ebOrganizerId}/events/`;
    const createdEvent = await eventbriteApiCall(createEventUrl, 'POST', ebToken, eventPayload);
    
    if (!createdEvent || !createdEvent.id) { 
        console.error("Worker/eventbriteManager: Eventbrite event creation call succeeded status-wise but did not return an event ID or essential data.", createdEvent);
        throw new Error("Eventbrite event creation did not return an event ID.");
    }
    eventbriteEventId = createdEvent.id;
    eventbriteEventUrl = createdEvent.url;
    console.log(`Worker/eventbriteManager: Base Eventbrite event created. ID: ${eventbriteEventId}`);

    // --- Step 2: Set Structured Content ---
    console.log("Worker/eventbriteManager: Setting Eventbrite structured content...");
    const structuredContentModules = [{ type: "text", data: { body: { alignment: "left", text: eventHtmlDescription } } }];
    if (imageIdToUse) {
      structuredContentModules.push({ type: "image", data: { image: { image_id: imageIdToUse } } });
      console.log("Worker/eventbriteManager: Image module added to structured content.");
    } else {
      console.log("Worker/eventbriteManager: No imageIdToUse provided, skipping image module in structured content.");
    }
    const structuredContentPayload = { modules: structuredContentModules, publish: true, purpose: "listing" };
    const structuredContentUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/structured_content/1/`; // Assuming version 1 for new events
    await eventbriteApiCall(structuredContentUrl, 'POST', ebToken, structuredContentPayload);
    console.log("Worker/eventbriteManager: Eventbrite structured content set.");

    // --- Step 3: Create Free Ticket Class ---
    console.log("Worker/eventbriteManager: Creating Eventbrite ticket class...");
    const ticketClassPayload = {
      ticket_class: { name: "General Admission", free: true, quantity_total: EVENT_CAPACITY, minimum_quantity: 1, maximum_quantity: 10 },
    };
    const createTicketClassUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/ticket_classes/`;
    await eventbriteApiCall(createTicketClassUrl, 'POST', ebToken, ticketClassPayload);
    console.log("Worker/eventbriteManager: Eventbrite ticket class created.");

    // --- Step 4: Publish Event ---
    console.log("Worker/eventbriteManager: Publishing Eventbrite event...");
    const publishUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/publish/`;
    const publishResult = await eventbriteApiCall(publishUrl, 'POST', ebToken);
    console.log("Worker/eventbriteManager: Eventbrite event publish attempt completed.");

    return { 
      success: true, 
      message: "Eventbrite event creation process completed.", 
      eventId: eventbriteEventId, 
      eventUrl: eventbriteEventUrl,
      published: publishResult?.published || false 
    };
  } catch (error) {
    console.error(`Worker/eventbriteManager: Error processing Eventbrite event for GCal title "${title}":`, error.stack || error.message);
    return { 
      success: false, 
      message: `Eventbrite integration failed: ${error.message}`, 
      eventId: eventbriteEventId, 
      eventUrl: eventbriteEventUrl,
      errorDetails: error.message 
    };
  }
}