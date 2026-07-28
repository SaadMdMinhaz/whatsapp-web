const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const certDir = path.join(__dirname, 'certs');
fs.mkdirSync(certDir, { recursive: true });

const ifaces = os.networkInterfaces();
let IP = '127.0.0.1';
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
      IP = iface.address;
      break;
    }
  }
  if (IP !== '127.0.0.1') break;
}

const attrs = [{ name: 'commonName', value: IP }];
const pems = selfsigned.generate(attrs, {
  days: 365,
  keySize: 2048,
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: IP },
        { type: 2, value: 'localhost' },
        { type: 7, ip: IP },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ],
});

pems.then((p) => {
  fs.writeFileSync(path.join(certDir, 'cert.pem'), p.cert);
  fs.writeFileSync(path.join(certDir, 'key.pem'), p.private);
  console.log('Cert generated for IP:', IP);
  console.log('cert.pem:', path.join(certDir, 'cert.pem'));
  console.log('key.pem:', path.join(certDir, 'key.pem'));
}).catch((e) => {
  console.error('Failed:', e.message);
});
