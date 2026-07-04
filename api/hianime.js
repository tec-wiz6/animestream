// /api/hianime.js

import { Hianime } from 'hianime'; // make sure this matches the library name [web:49]

const hianimeClient = new Hianime();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, query, id, episodeId, page = 1 } = req.query;
  console.log(`📡 HiAnime API called: action=${action}`);

  try {
    if (action === 'search') {
      if (!query) {
        return res.status(400).json({ error: 'Missing query parameter' });
      }

      // Use the Hianime library search
      // Depending on the lib, it may be getSearchResults or searchAnime; adjust if needed [web:49]
      const resultsRaw = await hianimeClient.searchAnime(query, Number(page) || 1);
      // Normalize to what your frontend expects
      const results = (resultsRaw?.results || resultsRaw || []).map(item => ({
        title: item.title,
        slugOrId: item.dataId || item.id || item.slug,
        image: item.image || item.poster || null,
        year: item.year || item.releaseYear || null
      }));

      return res.status(200).json({ results });
    }

    if (action === 'episodes') {
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      // Fetch episodes for a specific anime using dataId / slug [web:32]
      const episodesRaw = await hianimeClient.getEpisodes(id);
      const episodes = (episodesRaw?.episodes || episodesRaw || []).map(ep => ({
        number: ep.number || ep.episodeNumber || ep.episode,
        title: ep.title || ep.name || `Episode ${ep.number || ep.episode}`,
        episodeId: ep.id || ep.episodeId || ep.slug
      }));

      return res.status(200).json({ episodes });
    }

    if (action === 'embed') {
      if (!episodeId) {
        return res.status(400).json({ error: 'Missing episodeId parameter' });
      }

      // Get streaming links/iframe for the specific episode
      const streamData = await hianimeClient.getEpisodeSources(episodeId);
      // Choose a primary embed URL depending on what the lib returns [web:49]
      let embedUrl = null;

      if (Array.isArray(streamData?.sources) && streamData.sources.length > 0) {
        // Example: sources[0].url
        embedUrl = streamData.sources[0].url;
      } else if (streamData?.embedUrl) {
        embedUrl = streamData.embedUrl;
      } else if (streamData?.url) {
        embedUrl = streamData.url;
      }

      if (!embedUrl) {
        return res.status(500).json({ error: 'No embed URL found for this episode' });
      }

      return res.status(200).json({ embedUrl });
    }

    return res.status(400).json({ error: 'Invalid action. Use: search, episodes, or embed' });
  } catch (e) {
    console.error('❌ HiAnime API Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
