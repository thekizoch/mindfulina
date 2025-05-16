// Cloudflare Worker for Mindfulina Event Automation (GitHub Only)

// Expected environment variables (secrets) to be set in Worker settings:
// GITHUB_TOKEN
// APPS_SCRIPT_SECRET (optional, for basic auth from Apps Script)

const GITHUB_REPO_OWNER = "thekizoch";
const GITHUB_REPO_NAME = "mindfulina";
const GITHUB_BRANCH = "main"; 

const DEFAULT_COVER_IMAGE = "/images/wide-shot.jpeg";
const DEFAULT_LOCATION = "Mākālei Beach Park, Honolulu"; // Added
const DEFAULT_EVENT_DESCRIPTION_MARKDOWN = `Join us for a rejuvenating 30-minute sound bath to reset and relax your mind, body, and spirit.

## What to know
Mākālei Beach Park features a small beach used by surfers, plus a tree-shaded area with picnic tables. Dogs allowed. Located at 3111 Diamond Head Rd, Honolulu, HI 96815. 

## Before You Arrive
Consider taking a peaceful walk along the shoreline to connect with nature.

## What to Bring
- Towel, yoga mat, or blanket
- Swimsuit and sunscreen
- Optional: hat, sunglasses, water bottle

Let the ocean breeze and sound healing waves guide you into deep rest. See you there.`; // Added

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Expected POST request', { status: 405 });
    }

    if (env.APPS_SCRIPT_SECRET) {
      const authHeader = request.headers.get('X-AppsScript-Secret');
      if (authHeader !== env.APPS_SCRIPT_SECRET) {
        console.error('Worker: Unauthorized - Missing or incorrect X-AppsScript-Secret header.');
        return new Response('Unauthorized', { status: 401 });
      }
      console.log('Worker: X-AppsScript-Secret validated.');
    }

    let eventData;
    try {
      eventData = await request.json();
    } catch (e) {
      console.error('Worker: Failed to parse JSON body:', e);
      return new Response('Invalid JSON payload', { status: 400 });
    }

    console.log('Worker: Received event data:', JSON.stringify(eventData, null, 2));

    if (!eventData.title || !eventData.startTime || !eventData.googleCalendarEventId) {
      console.error('Worker: Missing critical event data fields (title, startTime, googleCalendarEventId).');
      return new Response('Missing required event data fields', { status: 400 });
    }

    try {
      console.log('Worker: Attempting to create GitHub event file...');
      const githubResult = await createGithubEventFile(eventData, env);
      
      const githubStatus = githubResult.status;
      const githubResponseText = await githubResult.text(); 

      console.log(`Worker: GitHub API response status: ${githubStatus}`);
      console.log(`Worker: GitHub API response body (first 500 chars): ${githubResponseText.substring(0,500)}`);

      if (githubStatus !== 201 && githubStatus !== 200) {
        console.error(`Worker: Failed to create GitHub file. Status: ${githubStatus}, Body: ${githubResponseText}`);
        return new Response(`Failed to create GitHub file: ${githubStatus} - ${githubResponseText}`, { status: 500 });
      }
      
      let githubFileUrl = "N/A";
      try {
        const githubJson = JSON.parse(githubResponseText);
        if (githubJson.content && githubJson.content.html_url) {
            githubFileUrl = githubJson.content.html_url;
        }
      } catch (parseError) {
          console.warn("Worker: Could not parse GitHub response JSON to get html_url, but operation might have succeeded based on status.", parseError);
      }

      console.log(`Worker: Successfully created/updated GitHub file. URL (if available): ${githubFileUrl}`);

      return new Response(JSON.stringify({ 
        message: 'GitHub event file processed successfully', 
        githubFileUrl: githubFileUrl,
        githubResponseStatus: githubStatus
      }), { status: 200, headers: { 'Content-Type': 'application/json' }});

    } catch (error) {
      console.error('Worker: Unhandled error processing event:', error.stack || error);
      return new Response('Internal Server Error: ' + error.message, { status: 500 });
    }
  },
};

// --- GitHub File Creation ---
async function createGithubEventFile(eventData, env) {
  const { title, startTime, isAllDay, googleCalendarEventId } = eventData; // Destructure core needed ones
  
  // Use provided location or default; use provided description or default
  const locationToUse = (eventData.location && eventData.location.trim() !== '') ? eventData.location : DEFAULT_LOCATION;
  const descriptionToUse = (eventData.description && eventData.description.trim() !== '') ? eventData.description : DEFAULT_EVENT_DESCRIPTION_MARKDOWN;

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
  
  const datePrefix = new Date(startTime).toISOString().split('T')[0]; 
  const eventPath = `src/content/events/${datePrefix}-${slug}.md`;
  console.log(`Worker: Determined event file path: ${eventPath}`);
  
  // Frontmatter content using the determined location and default cover
  const frontmatterContent = `---
title: "${title ? title.replace(/"/g, '\\"') : 'Mindfulina Event'}"
date: "${startTime}"
location: "${locationToUse.replace(/"/g, '\\"')}"
cover: "${DEFAULT_COVER_IMAGE}"
googleCalendarEventId: "${googleCalendarEventId}"
isAllDay: ${isAllDay || false}
---

${descriptionToUse}
`;
  // The conditional logic for appending "What to know" etc. is removed because
  // DEFAULT_EVENT_DESCRIPTION_MARKDOWN now contains the full desired default structure.
  // If eventData.description is provided, that will be used in its entirety instead.

  const fileContentBase64 = btoa(unescape(encodeURIComponent(frontmatterContent)));

  const githubApiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${eventPath}`;
  console.log(`Worker: GitHub API URL for PUT: ${githubApiUrl}`);

  const commitMessage = `feat: Add event "${title || 'New Event'}" from GCal ID ${googleCalendarEventId}`;

  const requestBody = {
    message: commitMessage,
    content: fileContentBase64,
    branch: GITHUB_BRANCH,
  };

  console.log(`Worker: Sending PUT request to GitHub with message: "${commitMessage}"`);

  const response = await fetch(githubApiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'User-Agent': 'Mindfulina-Event-Automation-Worker/1.0.3', // Incremented version
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(requestBody),
  });
  return response;
}
