// /api/animepahe.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, query, id, episode } = req.query;

  // If no action, return error
  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }

  try {
    // Browser-like headers to bypass Cloudflare
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://animepahe.pw/',
      'Origin': 'https://animepahe.pw',
      'Cache-Control': 'no-cache'
    };

    let result = {};

    // Action 1: Search for anime
    if (action === 'search') {
      if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
      }
      
      const searchRes = await fetch(
        `https://animepahe.pw/api?query=${encodeURIComponent(query)}`,
        { headers }
      );
      
      if (!searchRes.ok) {
        throw new Error(`Search failed: ${searchRes.status}`);
      }
      
      const data = await searchRes.json();
      result = data;
    }

    // Action 2: Get episodes for an anime
    else if (action === 'episodes') {
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }
      
      const epRes = await fetch(
        `https://animepahe.pw/api?m=release&id=${id}`,
        { headers }
      );
      
      if (!epRes.ok) {
        throw new Error(`Episode fetch failed: ${epRes.status}`);
      }
      
      const data = await epRes.json();
      result = data;
    }

    // Action 3: Get embed URL
    else if (action === 'embed') {
      if (!id || !episode) {
        return res.status(400).json({ error: 'Missing id or episode parameter' });
      }
      
      const embedUrl = `https://animepahe.pw/embed/${id}/${episode}`;
      const playUrl = `https://animepahe.pw/play/${id}/${episode}`;
      
      result = {
        success: true,
        embedUrl: embedUrl,
        playUrl: playUrl
      };
    }

    else {
      return res.status(400).json({ 
        error: 'Invalid action. Use: search, episodes, or embed' 
      });
    }

    // Send response
    res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error'
    });
  }
}
