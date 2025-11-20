import fs from 'fs';
import path from 'path';

const WATCHLIST_FILE = path.join(__dirname, '../data/user_watchlist.json');

// Ensure the data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize the watchlist file if it doesn't exist
if (!fs.existsSync(WATCHLIST_FILE)) {
  fs.writeFileSync(
    WATCHLIST_FILE,
    JSON.stringify({
      admin: {
        tags: [],
      },
    }),
    'utf-8'
  );
}

export interface UserWatchlist {
  tags: string[];
}

export interface WatchlistData {
  [userId: string]: UserWatchlist;
}

// Get the user's watchlist
export function getUserWatchlist(userId: string = 'admin'): UserWatchlist {
  try {
    const data = fs.readFileSync(WATCHLIST_FILE, 'utf-8');
    const watchlists: WatchlistData = JSON.parse(data);

    // Initialize user if they don't exist
    if (!watchlists[userId]) {
      watchlists[userId] = { tags: [] };
      fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(watchlists, null, 2), 'utf-8');
    }

    return watchlists[userId];
  } catch (error) {
    console.error('Error reading watchlist:', error);
    return { tags: [] };
  }
}

// Update a user's watchlist
export function updateUserWatchlist(userId: string = 'admin', tags: string[]): UserWatchlist {
  try {
    const data = fs.readFileSync(WATCHLIST_FILE, 'utf-8');
    const watchlists: WatchlistData = JSON.parse(data);

    // Update user's watchlist
    watchlists[userId] = { tags };

    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(watchlists, null, 2), 'utf-8');
    return watchlists[userId];
  } catch (error) {
    console.error('Error updating watchlist:', error);
    return { tags: [] };
  }
}

// Add a tag to a user's watchlist
export function addTagToWatchlist(tag: string, userId: string = 'admin'): UserWatchlist {
  const watchlist = getUserWatchlist(userId);

  // Only add if tag isn't already in the list
  if (!watchlist.tags.includes(tag)) {
    watchlist.tags.push(tag);
    return updateUserWatchlist(userId, watchlist.tags);
  }

  return watchlist;
}

// Remove a tag from a user's watchlist
export function removeTagFromWatchlist(tag: string, userId: string = 'admin'): UserWatchlist {
  const watchlist = getUserWatchlist(userId);

  // Filter out the tag to remove
  const updatedTags = watchlist.tags.filter(t => t !== tag);

  return updateUserWatchlist(userId, updatedTags);
}
