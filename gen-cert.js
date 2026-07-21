const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const certDir = path.join(__dirname, 'certs');
fs.mkdirSync(certDir, { recursive: true });

const attrs = [{ name: 'commonName', value: '192.168.0.105' }];
const pems = selfsigned.generate(attrs, {
  days: 365,
  keySize: 2048,
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: '192.168.0.105' },
        { type: 2, value: 'localhost' },
        { type: 7, ip: '192.168.0.105' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ],
});

pems.then((p) => {
  fs.writeFileSync(path.join(certDir, 'cert.pem'), p.cert);
  fs.writeFileSync(path.join(certDir, 'key.pem'), p.private);
  console.log('Cert generated successfully');
  console.log('cert.pem:', path.join(certDir, 'cert.pem'));
  console.log('key.pem:', path.join(certDir, 'key.pem'));
}).catch((e) => {
  console.error('Failed:', e.message);
});
