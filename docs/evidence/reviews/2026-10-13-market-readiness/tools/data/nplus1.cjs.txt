const fs=require('fs');
for (const f of process.argv.slice(2)) {
  const lines=fs.readFileSync(f,'utf8').split('\n');
  const stack=[];
  for (let i=0;i<lines.length;i++){
    const l=lines[i];
    if (/^\s*for\s*\((const|let)\s+[^;]*\bof\b/.test(l) || /\.forEach\(async/.test(l)) stack.push({start:i, depth:(l.match(/^\s*/)[0].length)});
    // pop loops when indentation returns
    while(stack.length && i>stack[stack.length-1].start && /^\s*\}/.test(l) && l.match(/^\s*/)[0].length<=stack[stack.length-1].depth) stack.pop();
    if (stack.length && /await\s+[\w.()]*\.(query|execute)\(|await\s+db\.(select|insert|update)|await\s+tx\.(select|insert|update)/.test(l)) console.log(`${f}:${i+1} (loop@${stack[stack.length-1].start+1}) ${l.trim().slice(0,90)}`);
  }
}
