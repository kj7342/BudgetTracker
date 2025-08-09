export function num(v){
  if (typeof v === 'string') v = v.replace(/[^0-9.\-]/g, '');
  const n = Number(v);
  return isFinite(n) ? n : null;
}
