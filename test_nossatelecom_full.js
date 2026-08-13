const axios = require('axios');
const https = require('https');
const fs = require('fs');

const BASE_URL = 'https://pbx.nossatelecom.com.br';
const agent = new https.Agent({ rejectUnauthorized: false });

async function getJS() {
    try {
        const res = await axios.get(`${BASE_URL}/assets/js/core.js`, { httpsAgent: agent, validateStatus: () => true });
        fs.writeFileSync('core.js', res.data);
        const res2 = await axios.get(`${BASE_URL}/assets/js/general.js`, { httpsAgent: agent, validateStatus: () => true });
        fs.writeFileSync('general.js', res2.data);
        console.log('Arquivos JS baixados.');
    } catch (e) {
        console.log(e.message);
    }
}
getJS();
