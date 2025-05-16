# Automated Event Creation Pipeline

## 1. Goal
Automate the creation of event pages on the Mindfulina website and corresponding listings on Eventbrite, triggered by a single event creation in a designated Google Calendar. This will streamline the event management process, reduce manual effort, and ensure consistency.

## 2. Scope (MVP - Minimum Viable Product)
- **Trigger:** Creating a new event in a *designated Google Calendar* for Mindfulina.
- **Website Update:** Automatically create a new Markdown file in `src/content/events/` in the GitHub repository, using details from the Google Calendar event. This will trigger an automatic rebuild and deployment of the Astro site.
- **Eventbrite Creation:** Automatically create a new, free event on Eventbrite using details from the Google Calendar event.
- **Data Flow:** Google Calendar -> Google Apps Script -> Cloudflare Worker -> GitHub API & Eventbrite API.

## 3. Key Steps & Components

### 3.1. Google Calendar & Google Apps Script (GAS)
1.  **Designated Calendar:** Create and use a specific Google Calendar solely for Mindfulina events that are intended for automation. All events created/updated in this calendar will be processed by the script.
2.  **GAS Trigger Setup:**
    *   Create a Google Apps Script project.
    *   Configure an `onEventAdded` and/or `onEventUpdated` trigger for the script, specifically targeting the *ID of the designated Mindfulina calendar*.
3.  **GAS Logic:**
    *   When an event is added or updated in the designated calendar, the trigger will fire.
    *   The script will extract essential details from the event:
        *   Title
        *   Start Time & End Time (or calculate end time assuming a default duration, e.g., 30 minutes, if not explicitly set differently or if the GCal event is an all-day event)
        *   Location
        *   Description
        *   Google Calendar Event ID (for future reference/idempotency)
    *   Format these details into a JSON payload.
    *   Make an HTTP POST request (acting as a webhook) to a dedicated Cloudflare Worker endpoint, sending the JSON payload.

### 3.2. Cloudflare Worker
1.  **Endpoint Creation:** Develop an HTTP POST endpoint to securely receive data from the Google Apps Script.
2.  **Secrets Management:**
    *   Store GitHub Personal Access Token (PAT) with `repo` scope as a Cloudflare Worker secret.
    *   Store Eventbrite API Key (OAuth token or private token) as a Cloudflare Worker secret.
3.  **Data Processing & Validation:**
    *   Validate the incoming JSON payload from GAS.
    *   Sanitize and format event title (e.g., create a URL-friendly slug for the website filename).
    *   Format dates/times:
        *   For website frontmatter: ISO8601 (as per `src/content/config.ts`).
        *   For Eventbrite API: As per Eventbrite's requirements (typically UTC).
4.  **GitHub Integration (Create Website Event Page):**
    *   **File Naming:** Generate a filename like `YYYY-MM-DD-slugified-title.md`.
    *   **Content Generation:** Construct Markdown content with frontmatter based on `src/content/config.ts`:
        *   `title`: Event title.
        *   `date`: ISO8601 formatted date/time.
        *   `location`: Event location.
        *   `cover`: Use a default image path (e.g., `/images/default-event-cover.jpg`) or make it optional.
        *   `description`: (Optional) A short summary if needed, or leave for the main content.
        *   The main body of the Markdown will be the description from Google Calendar.
    *   **API Call:** Use the GitHub API (e.g., via `@octokit/core.js`) to commit and push the new Markdown file to the `src/content/events/` directory.
5.  **Eventbrite Integration (Create Eventbrite Listing):**
    *   **API Call:** Use the Eventbrite API (e.g., via `fetch`) to create a new event.
    *   **Map Data:**
        *   Event Name: Event title.
        *   Start Date/Time & End Date/Time (ensure correct timezone handling for Eventbrite, usually UTC).
        *   Venue/Location details.
        *   Description (from Google Calendar).
        *   Ticket Class: Create a free ticket type.
        *   Organizer ID: Use your Mindfulina organizer ID.
        *   Status: Publish the event.
6.  **Error Handling & Logging:**
    *   Implement comprehensive error handling for all API calls (GitHub, Eventbrite).
    *   Log key actions, successes, and any errors to Cloudflare Worker logs for debugging.

## 4. Data to be Handled (Summary)
- **Input (from Google Calendar):** Event Title, Start DateTime, End DateTime, Location, Description.
- **Output (for Website - Markdown):** Processed Title, ISO8601 Date, Location, Cover Image Path, Description.
- **Output (for Eventbrite):** Event Name, Start/End DateTimes (UTC), Venue, Description, Ticket Info (Free), Organizer Info.

## 5. Success Criteria (MVP)
- Creating a new event in the designated Google Calendar successfully and automatically:
    - Commits a new event Markdown file to the GitHub repository.
    - Triggers the Astro website to rebuild and deploy with the new event page visible.
    - Creates and publishes a corresponding free event on Eventbrite.
- API keys are securely stored and accessed.
- Basic operational logging is in place within the Cloudflare Worker.

## 6. Future Considerations (Post-MVP)
- Automating updates/cancellations of events synced from Google Calendar.
- Allowing specification of a custom cover image through the Google Calendar event (e.g., a link in the description or an attachment).
- Implementing notifications for successful synchronizations or critical failures.
- Potentially adding the generated Eventbrite link back to the Google Calendar event description or the website event page automatically.