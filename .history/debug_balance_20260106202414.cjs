
const fs = require('fs');
const code = fs.readFileSync('client/src/components/ectd/EnhancedDocumentEditor.jsx', 'utf8');

let balance = 0; // ( )
let braces = 0;  // { }
let divStack = []; 

const lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Simple naive check - ignores strings/comments for speed, but usually sufficient for structural errors
    // We only care about lines around the error
    
    for (let char of line) {
        if (char === '(') balance++;
        if (char === ')') balance--;
        if (char === '{') braces++;
        if (char === '}') braces--;
    }
    
    // Check line 2243 area
    if (i > 2230 && i < 2250) {
        console.log(`Line ${i+1}: Balance=${balance}, Braces=${braces} :: ${line.trim()}`);
    }
}
