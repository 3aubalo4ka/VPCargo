const app = require('./src/app');
const env = require('./src/config/env');

app.listen(env.port, () => {
  console.log(`VPCargo started on :${env.port}`);
});
