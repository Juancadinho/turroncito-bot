// Script de autorización única. Corre esto UNA vez con: node authorize.js
// Abre tu navegador, aceptas el permiso, y guarda un token.json local
// que el bot usará después sin pedirte login de nuevo.

const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');

const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

// Solo lectura del calendario por ahora
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

async function main() {
  const credentialsRaw = fs.readFileSync(CREDENTIALS_PATH);
  const { installed } = JSON.parse(credentialsRaw);
  const { client_id, client_secret } = installed;

  // Servidor local temporal para recibir el código de autorización de Google
  const server = http.createServer();
  server.listen(0); // puerto libre aleatorio
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\nAbre este link en tu navegador y acepta el permiso:\n');
  console.log(authUrl);
  console.log('\nEsperando que autorices en el navegador...\n');

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get('code');
      if (code) {
        res.end('¡Listo! Ya puedes cerrar esta pestaña y volver a la terminal.');
        resolve(code);
      } else {
        res.end('No se encontró código de autorización.');
        reject(new Error('No auth code received'));
      }
    });
  });

  server.close();

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('Token guardado en token.json. Autorización completa.');
}

main().catch((err) => {
  console.error('Error en la autorización:', err);
});
