import { catalog } from '../data/catalog.js';

export function parseRequest(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(raw => {
    const match = raw.match(/^(?:(\d+)\s*(?:[x×]\s*|\s+))?(.+?)(?:\s+[x×]\s*(\d+))?$/i);
    const query = match[2].toLowerCase();
    const quantity = Number(match[1] || match[3] || 1);
    const options = catalog.filter(item => item.name.toLowerCase().includes(query));
    const item = catalog.find(item => item.name.toLowerCase() === query) || (options.length === 1 ? options[0] : null);
    return { raw, item, quantity };
  });
}
