// mindfulina/cloudflare-worker/githubManager.js
// Constants for GitHub interaction (website page creation)
const GITHUB_REPO_OWNER = "thekizoch";
const GITHUB_REPO_NAME = "mindfulina";
const GITHUB_BRANCH = "main";

// Defaults for the website Markdown content
const DEFAULT_WEBSITE_COVER_IMAGE = "/images/wide-shot.jpeg"; // Default cover image for the website event page
const DEFAULT_WEBSITE_LOCATION = "Mākālei Beach Park, Honolulu";
const DEFAULT_WEBSITE_EVENT_DESCRIPTION_MARKDOWN = `Join us for a sound bath to reset and relax your mind, body, and spirit — reconnecting with your mana and the healing rhythms of the moana.

## Before You Arrive
Consider moving your body beforehand; take a gentle walk, stretch, or run before the session to release stagnant energy.

## Bring
- Towel, mat, or blanket for the ‘āina
- Eye mask if you wish to shut out visual stimulation and the sun
- Swimsuit, sunscreen, and water bottle if you feel called to connect with the moana after our gathering

Let the makani (breeze) and sounds of the moana guide your naʻau (inner heart) into deep rest.

E komo mai — all are welcome!`;




/**
 * Creates an event Markdown file in the GitHub repository
 * @param {object} eventData - Event data from Google Calendar (title, startTime, isAllDay, googleCalendarEventId, location, description).
 * @param {string} githubToken - GitHub PAT.
 * @param {string} [eventbriteLink] - Optional Eventbrite link for the event.
 * @returns {Promise<Response>} - The raw response from the GitHub API.
 */
export async function createGithubEventFile(eventData, githubToken, eventbriteLink = '') {
  const { title, startTime, isAllDay, googleCalendarEventId, location, description } = eventData;

  const locationToUse = (location && location.trim() !== '') ? location : DEFAULT_WEBSITE_LOCATION;
  const descriptionToUse = (description && description.trim() !== '') ? description : DEFAULT_WEBSITE_EVENT_DESCRIPTION_MARKDOWN;

  let slug = 'event';
  if (title) {
    slug = title.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
    if (!slug) slug = 'event';
  }

  const date = new Date(startTime);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const datePrefix = `${year}-${month}-${day}`;

  const eventPath = `src/content/events/${datePrefix}-${slug}.md`;
  console.log(`Worker/githubManager: Determined event file path: ${eventPath}`);

  const frontmatterContent = `---
title: "${title ? title.replace(/"/g, '\\"') : 'Mindfulina Event'}"
date: "${startTime}"
location: "${locationToUse.replace(/"/g, '\\"')}"
cover: "${DEFAULT_WEBSITE_COVER_IMAGE}"
googleCalendarEventId: "${googleCalendarEventId}"
isAllDay: ${isAllDay || false}
eventbriteLink: "${eventbriteLink || ''}"
---

${descriptionToUse}
`;

  const utf8Bytes = new TextEncoder().encode(frontmatterContent);
  let binaryString = '';
  utf8Bytes.forEach(byte => {
    binaryString += String.fromCharCode(byte);
  });
  const fileContentBase64 = btoa(binaryString);


  const githubApiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${eventPath}`;
  console.log(`Worker/githubManager: GitHub API URL for PUT: ${githubApiUrl}`);

  const commitMessage = `feat: Add event "${title || 'New Event'}" from GCal ID ${googleCalendarEventId}`;

  const requestBody = {
    message: commitMessage,
    content: fileContentBase64,
    branch: GITHUB_BRANCH,
  };

  console.log(`Worker/githubManager: Sending PUT request to GitHub with message: "${commitMessage}"`);

  return fetch(githubApiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${githubToken}`,
      'User-Agent': 'Mindfulina-Event-Automation-Worker/1.1.1', // Version bump
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(requestBody),
  });
}