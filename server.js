const xila = require('xila');

let server = xila.serve(xila.get("/*", xila.staticAssets("./")));

server.listen(8001);
