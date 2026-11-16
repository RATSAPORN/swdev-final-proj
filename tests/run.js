// Loading node:test directly avoids child-process spawning restrictions on Windows.
process.env.MONGOMS_DOWNLOAD_DIR ||= require('path').join(__dirname, '../.cache/mongodb');
require('./regressions.test');
require('./system.test');
require('./shop-search.test');
require('./pagination.test');
require('./postman-artifacts.test');
