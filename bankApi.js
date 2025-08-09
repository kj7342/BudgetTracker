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
