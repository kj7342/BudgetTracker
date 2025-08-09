export function sanitizeBankApiUrl(url){
  if(!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid bank API URL');
  }
  if(parsed.protocol !== 'https:'){
    throw new Error('Bank API URL must use https');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/**
 * Attempt to discover a bank's API endpoint using its domain name. The bank
 * should expose a well-known JSON file at `/.well-known/bank-api` containing
 * an `api` property with the base URL. Returns the sanitized API URL or `null`
 * if it cannot be determined.
 *
 * @param {string} domain Bank domain (e.g. `example.com`)
 * @param {Function} fetcher Optional fetch-like function
 * @returns {Promise<string|null>} Bank API URL or null
 */
export async function lookupBankApi(domain, fetcher = fetch){
  if(!domain) return null;
  const host = domain.replace(/^https?:\/\//, '');
  let wellKnown;
  try {
    wellKnown = new URL(`https://${host}/.well-known/bank-api`);
  } catch {
    throw new Error('Invalid bank domain');
  }
  const res = await fetcher(wellKnown.toString());
  if(!res || !res.ok) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if(!data || typeof data.api !== 'string') return null;
  return sanitizeBankApiUrl(data.api);
}
