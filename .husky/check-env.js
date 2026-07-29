const { execSync } = require('child_process');

try {
  const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  const files = output.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  const envFiles = files.filter(f => /(^|\/)\.env(\.|$)/.test(f));

  if (envFiles.length > 0) {
    console.error('\n  ✖  COMMIT BLOCKED — detected staged .env file(s):\n');
    envFiles.forEach(f => console.error('      ' + f));
    console.error('\n  .env files must never be committed. Check your .gitignore.\n  If you need a template, name it .env.example or .env.template.\n');
    process.exit(1);
  }
} catch (err) {
  if (err.status && err.status !== 0) {
    process.exit(err.status);
  }
}
