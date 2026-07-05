module.exports = {
  apps: [
    {
      name: 'casepoint',
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        // CloudPanel reverse-proxies the site domain to this port.
        PORT: 3006,
      },
    },
  ],
};
