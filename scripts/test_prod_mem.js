import '../dist-server/server.js';

setTimeout(() => {
  const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.log("Production server node RSS idle:", rss, "MB");
  process.exit(0);
}, 3000);
