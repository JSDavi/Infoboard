const axios = require('axios');
const https = require('https');

const BASE_URL = 'https://pbx.nossatelecom.com.br';
const USER = 'infobrasil.painel';
const PASS = 'info@2026';
const TOKEN = '24a3a233-0d17-5417-b9a2-bbb45fda7b10-2590';
const KEY = '5146774c-d385-5e0d-b980-b9eacf84e432-7197';

const ENDPOINT = '/manutSupervisorPBX/data/1?_rt=' + Math.random();

const agent = new https.Agent({ rejectUnauthorized: false });

async function testApi() {
    console.log('--- Testando Endpoint Direto com Token e Key ---');
    try {
        const res = await axios.get(`${BASE_URL}${ENDPOINT}`, {
            httpsAgent: agent,
            headers: { 
                'Authorization': `Bearer ${TOKEN}`,
                'x-api-key': KEY,
                'x-api-token': TOKEN
            },
            validateStatus: () => true
        });
        
        console.log(`Status Token: ${res.status}`);
        if (res.status === 200 && typeof res.data === 'object' && !res.data.error) {
            console.log('SUCESSO COM TOKEN! Dados:', JSON.stringify(res.data).substring(0, 300));
            return; // Sucesso, não precisa testar cookie
        } else {
            console.log('Token falhou ou retornou erro:', res.data);
        }
    } catch (e) {
        console.log('Erro no token:', e.message);
    }

    console.log('\n--- Testando Endpoint com Login (Cookie) ---');
    try {
        const loginForm = new URLSearchParams();
        loginForm.append('username', USER);
        loginForm.append('password', PASS);
        loginForm.append('login', '1');
        // Adicionando possiveis digitos vazios que vimos no html
        for(let i=1; i<=6; i++) loginForm.append(`digit-${i}`, '');

        const loginRes = await axios.post(`${BASE_URL}/security/login`, loginForm, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            maxRedirects: 0,
            validateStatus: () => true
        });
        
        if (loginRes.headers['set-cookie']) {
            const sessionCookie = loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            console.log('Cookie Obtido:', sessionCookie);
            
            const dashRes = await axios.get(`${BASE_URL}${ENDPOINT}`, {
                httpsAgent: agent,
                headers: { 'Cookie': sessionCookie },
                validateStatus: () => true
            });
            
            console.log(`Status Cookie: ${dashRes.status}`);
            console.log('Dados via Cookie:', JSON.stringify(dashRes.data).substring(0, 500));
        } else {
            console.log('Falha ao obter cookie de login.');
        }
    } catch (e) {
        console.log('Erro no cookie:', e.message);
    }
}

testApi();
