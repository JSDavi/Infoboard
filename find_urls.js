const fs = require('fs');
const path = require('path');

function findUrls(file) {
    const data = fs.readFileSync(file, 'utf8');
    const regex = /['"](\/[a-zA-Z0-9_\-\/]+(\.php|\.json)?)['"]/g;
    let matches;
    let urls = new Set();
    
    while ((matches = regex.exec(data)) !== null) {
        if (!matches[1].startsWith('/assets')) { // ignorar imagens, js, css
            urls.add(matches[1]);
        }
    }
    
    console.log(`\n=== URLs encontradas em ${file} ===`);
    urls.forEach(url => console.log(url));
}

findUrls('c:\\Users\\Davi.Oliveira\\Documents\\GEMINI\\core.js');
findUrls('c:\\Users\\Davi.Oliveira\\Documents\\GEMINI\\general.js');
