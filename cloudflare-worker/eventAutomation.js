// Cloudflare Worker for Mindfulina Event Automation (GitHub Only)

// Expected environment variables (secrets) to be set in Worker settings:
// GITHUB_TOKEN

const GITHUB_REPO_OWNER = "thekizoch"; // Hardcoded repository owner
const GITHUB_REPO_NAME = "mindfulina";  // Hardcoded repository name
const GITHUB_BRANCH = "main";          // Your default branch for new content

const DEFAULT_COVER_IMAGE = "/images/wide-shot.jpg"; // Define your default

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Expected POST request', { status: 405 });
    }

    // Optional: Basic secret validation if APPS_SCRIPT_SECRET is set
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

    // Basic Validation (expand as needed)
    if (!eventData.title || !eventData.startTime || !eventData.googleCalendarEventId) {
      console.error('Worker: Missing critical event data fields (title, startTime, googleCalendarEventId).');
      return new Response('Missing required event data fields', { status: 400 });
    }

    try {
      // 1. Create GitHub Markdown File
      console.log('Worker: Attempting to create GitHub event file...');
      const githubResult = await createGithubEventFile(eventData, env);
      
      const githubStatus = githubResult.status;
      const githubResponseText = await githubResult.text(); // Get text for logging regardless of status

      console.log(`Worker: GitHub API response status: ${githubStatus}`);
      console.log(`Worker: GitHub API response body: ${githubResponseText}`);

      if (githubStatus !== 201 && githubStatus !== 200) { // 201 for created, 200 for updated (though we only create now)
        console.error(`Worker: Failed to create GitHub file. Status: ${githubStatus}, Body: ${githubResponseText}`);
        return new Response(`Failed to create GitHub file: ${githubStatus} - ${githubResponseText}`, { status: 500 });
      }
      
      let githubFileUrl = "N/A";
      try {
        const githubJson = JSON.parse(githubResponseText); // Parse the response text
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
  const { title, startTime, location, description, googleCalendarEventId, isAllDay } = eventData;

  // Sanitize title for filename (simple slugify)
  let slug = 'event'; // default slug
  if (title) {
    slug = title.toLowerCase()
      .replace(/\s+/g, '-')          // Replace spaces with -
      .replace(/[^\w-]+/g, '')       // Remove all non-word chars (except hyphen)
      .replace(/--+/g, '-')          // Replace multiple - with single -
      .replace(/^-+/, '')             // Trim - from start of text
      .replace(/-+$/, '');            // Trim - from end of text
    if (!slug) slug = 'event'; // if title was all special characters
  }
  
  const datePrefix = new Date(startTime).toISOString().split('T')[0]; // YYYY-MM-DD
  const eventPath = `src/content/events/${datePrefix}-${slug}.md`;
  console.log(`Worker: Determined event file path: ${eventPath}`);
  
  const eventDescriptionForFrontmatter = description ? description.substring(0, 160).replace(/"/g, '\\"').replace(/\n/g, ' ') : `Join us for ${title ? title.replace(/"/g, '\\"') : 'this event'}!`;

  const frontmatterContent = `---
title: "${title ? title.replace(/"/g, '\\"') : 'Mindfulina Event'}"
date: "${startTime}"
location: "${location ? location.replace(/"/g, '\\"') : 'To be announced'}"
cover: "${DEFAULT_COVER_IMAGE}"
description: "${eventDescriptionForFrontmatter}"
googleCalendarEventId: "${googleCalendarEventId}"
isAllDay: ${isAllDay || false}
---

${description || 'Event details coming soon.'}
`;

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
      'User-Agent': 'Mindfulina-Event-Automation-Worker/1.0', 
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(requestBody),
  });
  return response;
}