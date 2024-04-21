const fs = require('fs');
const PATH = __dirname + '/data_config.json'
const config = JSON.parse(fs.readFileSync(PATH, 'utf-8'));

module.exports = config;