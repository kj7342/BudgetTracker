export function parseCSV(line){
  const r=[]; let cur='', q=false; for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (ch==='"'){
      if (q && line[i+1]==='"'){ cur+='"'; i++; }
      else q = !q;
    }
    else if (ch===',' && !q){ r.push(cur); cur=''; }
    else cur+=ch;
  }
  r.push(cur); return r;
}
