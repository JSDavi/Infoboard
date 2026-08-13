const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

axios.get('https://pbx.nossatelecom.com.br/security/login', {httpsAgent: agent}).then(res => {
    const $ = cheerio.load(res.data);
    console.log('Inputs do form:');
    $('form input').each((i, el) => {
        console.log($(el).attr('name') + ' : ' + $(el).attr('type') + ' : ' + $(el).attr('value'));
    });
});
