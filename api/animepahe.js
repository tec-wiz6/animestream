// /api/animepahe.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, query, id, episode } = req.query;

  console.log(`📡 API called: action=${action}`);

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://animepahe.pw/',
      'Origin': 'https://animepahe.pw'
    };

    let result = {};

    // SEARCH - try with different headers
    if (action === 'search') {
      if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
      }
      
      const url = `https://animepahe.pw/api?query=${encodeURIComponent(query)}`;
      console.log(`🔍 Searching: ${url}`);
      
      try {
        const response = await fetch(url, { 
          headers,
          // Add timeout to avoid hanging
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        result = data;
      } catch (fetchError) {
        console.log('Fetch error:', fetchError.message);
        
        // Try without the accept header
        const simpleHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        const retryResponse = await fetch(url, { headers: simpleHeaders });
        if (retryResponse.ok) {
          const data = await retryResponse.json();
          result = data;
        } else {
          throw new Error(`Search failed: ${retryResponse.status}`);
        }
      }
    } 
    // EPISODES - try with different approaches
    else if (action === 'episodes') {
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }
      
      const url = `https://animepahe.pw/api?m=release&id=${id}`;
      console.log(`📼 Fetching episodes: ${url}`);
      
      try {
        const response = await fetch(url, { 
          headers,
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        result = data;
      } catch (fetchError) {
        console.log('Episode fetch error:', fetchError.message);
        
        // Try without the accept header
        const simpleHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        const retryResponse = await fetch(url, { headers: simpleHeaders });
        if (retryResponse.ok) {
          const data = await retryResponse.json();
          result = data;
        } else {
          throw new Error(`Episode fetch failed: ${retryResponse.status}`);
        }
      }
    } 
    else if (action === 'embed') {
      if (!id || !episode) {
        return res.status(400).json({ error: 'Missing id or episode parameter' });
      }
      
      result = {
        success: true,
        embedUrl: `https://animepahe.pw/embed/${id}/${episode}`,
        playUrl: `https://animepahe.pw/play/${id}/${episode}`
      };
    } 
    else {
      return res.status(400).json({ error: 'Invalid action. Use: search, episodes, or embed' });
    }

    console.log(`✅ Returning result with ${result.data?.length || 0} items`);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ API Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      // Don't return stack in production
    });
  }
}
