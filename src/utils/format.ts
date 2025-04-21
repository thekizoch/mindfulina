/**
 * Formats a date in Hawaiian time (HST) with semantic HTML time element
 */
export const formatHawaiian = (iso: string) => {
  const date = new Date(iso);
  const formatted = date.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Pacific/Honolulu'
  }) + ' HST';
  
  return `<time datetime="${iso}">${formatted}</time>`;
};

/**
 * Generates a Google Calendar event link with pre-filled fields
 */
export const getGoogleCalendarLink = (event: {
  title: string;
  date: string;
  location: string;
  description?: string;
}) => {
  // Format parameters for Google Calendar URL
  const startTime = new Date(event.date);
  const endTime = new Date(startTime.getTime() + 30 * 60000); // Add 30 minutes for end time
  
  const formatGoogleDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d+/g, '');
  };
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(startTime)}/${formatGoogleDate(endTime)}`,
    location: event.location,
    details: event.description || 'Join us for a sound healing session with Mindfulina'
  });
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}; 