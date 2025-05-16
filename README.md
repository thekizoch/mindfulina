# Mindfulina

Code is deployed with CI CD on Cloudflare

## Automated Event Creation Process

This project features an automated pipeline to create new event pages on the website directly from Google Calendar entries:

1.  **Event Creation in Google Calendar:** New events are created in a designated private Google Calendar for Mindfulina.
2.  **Google Apps Script Trigger:** A Google Apps Script, attached to this designated calendar, uses the Advanced Calendar Service to detect newly created events.
3.  **Webhook to Cloudflare Worker:** Upon detecting a new event, the Apps Script extracts its details (title, date, time, location, description) and sends them via an HTTP POST request to a dedicated Cloudflare Worker.
4.  **Cloudflare Worker Processing:** The Cloudflare Worker:
    *   Receives the event data.
    *   Formats the data into a Markdown file structure suitable for the Astro content collection (`src/content/events/`).
    *   Uses the GitHub API to commit and push this new Markdown file to the `mindfulina` repository.
5.  **CI/CD Deployment:** The new commit to the GitHub repository automatically triggers a rebuild and deployment of the Astro website via Cloudflare Pages' CI/CD integration.
6.  **Event Live on Website:** Once the deployment is complete, the new event page becomes live on the Mindfulina website.

This automation streamlines content management for new events, ensuring consistency and reducing manual effort.