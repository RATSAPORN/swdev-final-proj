const path = require('node:path');
const fs = require('node:fs/promises');
const newman = require('newman');
const { startDemo } = require('./demo-server');
async function main() {
  const demo = await startDemo({ port: 0 });
  try {
    const output = path.resolve(__dirname, '../.cache/postman');
    await fs.mkdir(output, { recursive: true });
    const collection = require('./Massage-Reservation.postman_collection.json');
    const environment = require('./Local-Demo.postman_environment.json');
    environment.values.find(v => v.key === 'baseUrl').value = demo.baseUrl;
    const summary = await new Promise((resolve, reject) => newman.run({
      collection, environment, reporters: ['cli', 'junit'],
      reporter: { junit: { export: path.join(output, 'newman-results.xml') } },
      timeoutRequest: 10000, timeoutScript: 10000, delayRequest: 20,
    }, (error, result) => error ? reject(error) : resolve(result)));
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ stats: summary.run.stats, failures: summary.run.failures.map(f => ({ at: f.at, source: f.source?.name, message: f.error.message })) }, null, 2));
    console.log(`Reports: ${output}`);
    if (summary.run.failures.length) process.exitCode = 1;
  } finally { await demo.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
