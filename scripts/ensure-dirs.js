const fs = require('fs');
const path = require('path');

const dirs = ['client/dist', 'dist/server'];

dirs.forEach((dir) => {
  const fullPath = path.join(__dirname, '..', dir);
  fs.mkdirSync(fullPath, { recursive: true });
});
