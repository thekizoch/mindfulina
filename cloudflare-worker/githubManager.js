// Constants for GitHub interaction (website page creation)
const GITHUB_REPO_OWNER = "thekizoch";
const GITHUB_REPO_NAME = "mindfulina";
const GITHUB_BRANCH = "main";

// Defaults for the website Markdown content
const DEFAULT_WEBSITE_COVER_IMAGE = "/images/wide-shot.jpeg"; // Default cover image for the website event page
const DEFAULT_WEBSITE_LOCATION = "Mākālei Beach Park, Honolulu";
const DEFAULT_WEBSITE_EVENT_DESCRIPTION_MARKDOWN = `Join us for a rejuvenating sound bath to reset and relax your mind, body, and spirit.

## What to know
Mākālei Beach Park features a small beach used by surfers, plus a tree-shaded area with picnic tables. Dogs allowed. Located at 3111 Diamond Head Rd, Honolulu, HI 96815. 

## Before You Arrive
Consider taking a peaceful walk along the shoreline to connect with nature.

## What to Bring
- Towel, yoga mat, or blanket
- Swimsuit and sunscreen
- Optional: hat, sunglasses, water bottle

Let the ocean breeze and sound healing waves guide you into deep rest. See you there.`;

/**
 * Creates an event Markdown file in the GitHub repository.
 * @param {object} eventData - Event data from Google Calendar (title, startTime, isAllDay, googleCalendarEventId, location, description).
 * @param {string} githubToken - GitHub Personal Access Token.
 * @returns {Promise<Response>} - The raw response from the GitHub API.
 */
export async function createGithubEventFile(eventData, githubToken) {
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
  // Pad month and day with zero if needed
  const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() is 0-indexed
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
eventbriteLink: "" # Placeholder, can be updated later if desired
---

${descriptionToUse}
`;

  // Convert to Base64: Ensure UTF-8 handling for special characters
  // For Cloudflare Workers, TextEncoder/TextDecoder are available globally for UTF-8.
  // btoa only works on ASCII or binary strings from Latin1.
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
    // TODO: Add committer and author details if desired, though not strictly necessary
    // committer: { name: "Mindfulina Automation", email: "automation@yourdomain.com" },
    // author: { name: "Mindfulina Calendar Sync", email: "calendar-sync@yourdomain.com" }
  };

  console.log(`Worker/githubManager: Sending PUT request to GitHub with message: "${commitMessage}"`);

  return fetch(githubApiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${githubToken}`,
      'User-Agent': 'Mindfulina-Event-Automation-Worker/1.1.0', // Version update
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(requestBody),
  });
}
