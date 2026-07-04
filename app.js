// /api/animepahe.js - SIMPLE VERSION
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, query, id, episode } = req.query;

  console.log(`📡 API called: action=${action}, query=${query}, id=${id}`);

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://animepahe.pw/',
      'Origin': 'https://animepahe.pw'
    };

    let result = {};

    if (action === 'search') {
      if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
      }
      
      const url = `https://animepahe.pw/api?query=${encodeURIComponent(query)}`;
      console.log(`🔍 Searching: ${url}`);
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      result = data;
    } 
    else if (action === 'episodes') {
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }
      
      const url = `https://animepahe.pw/api?m=release&id=${id}`;
      console.log(`📼 Fetching episodes: ${url}`);
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Episode fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      result = data;
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

    console.log(`✅ Returning result`);
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ API Error:', error.message);
    res.status(500).json({ 
      error: error.message
    });
  }
}
