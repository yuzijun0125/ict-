import * as z from 'zod/v4';
import { jsonResult, maskPhi } from './util.js';

async function eutils(endpoint, params) {
  const query = new URLSearchParams(params);
  query.set('tool', 'nexent-fundus-medical');
  if (process.env.NCBI_API_KEY) query.set('api_key', process.env.NCBI_API_KEY);
  if (process.env.NCBI_EMAIL) query.set('email', process.env.NCBI_EMAIL);
  const response = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${endpoint}?${query}`);
  if (!response.ok) throw new Error(`PubMed request failed: HTTP ${response.status}`);
  return response;
}

export function registerLiteratureTools(server) {
  server.registerTool('pubmed_search', {
    title: 'Search PubMed',
    description: 'Search PubMed for ophthalmic evidence and return PMIDs, titles, journals, dates and links.',
    inputSchema: {
      query: z.string().min(2).describe('PubMed search query, preferably in English'),
      maxResults: z.number().int().min(1).max(50).optional().default(10)
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }, async ({ query, maxResults = 10 }) => {
    const searchRes = await eutils('esearch.fcgi', { db: 'pubmed', term: query, retmode: 'json', retmax: String(maxResults), sort: 'relevance' });
    const search = await searchRes.json();
    const ids = search?.esearchresult?.idlist || [];
    if (!ids.length) return jsonResult({ query, count: 0, results: [] });
    const summaryRes = await eutils('esummary.fcgi', { db: 'pubmed', id: ids.join(','), retmode: 'json' });
    const summary = await summaryRes.json();
    const results = ids.map((pmid) => {
      const item = summary.result?.[pmid] || {};
      return {
        pmid,
        title: item.title,
        journal: item.fulljournalname || item.source,
        pubDate: item.pubdate,
        authors: (item.authors || []).slice(0, 5).map((author) => author.name),
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      };
    });
    return jsonResult({ query, count: results.length, results });
  });

  server.registerTool('pubmed_fetch', {
    title: 'Fetch PubMed Abstract',
    description: 'Fetch one PubMed record and abstract text by PMID for evidence checking.',
    inputSchema: { pmid: z.string().regex(/^\d+$/).describe('PubMed PMID') },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }, async ({ pmid }) => {
    const response = await eutils('efetch.fcgi', { db: 'pubmed', id: pmid, retmode: 'xml' });
    const xml = await response.text();
    const collect = (tag) => [...xml.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
      .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return jsonResult({
      pmid,
      titles: collect('ArticleTitle'),
      abstracts: collect('AbstractText').map((value) => maskPhi(value).text),
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    });
  });
}
