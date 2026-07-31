const { execSync } = require('child_process');

// .env, .env.local, backend/.env.production — but never the committed templates.
const ENV_FILE_PATTERN = /(^|\/)\.env(\.|$)/;
const TEMPLATE_PATTERN = /\.(example|template|sample)$/;

function isSecretEnvFile(file) {
  return ENV_FILE_PATTERN.test(file) && !TEMPLATE_PATTERN.test(file);
}

function listFiles(command) {
  return execSync(command, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);
}

// --tracked is for CI: a pre-commit hook can be skipped with --no-verify or by a
// contributor who never ran `npm install`, so the same rule is enforced on the
// files already in the index.
const trackedMode = process.argv.includes('--tracked');

try {
  const files = listFiles(
    trackedMode ? 'git ls-files' : 'git diff --cached --name-only'
  );
  const envFiles = files.filter(isSecretEnvFile);

  if (envFiles.length > 0) {
    if (trackedMode) {
      console.error('\n  ✖  CHECK FAILED — .env file(s) are tracked by git:\n');
    } else {
      console.error('\n  ✖  COMMIT BLOCKED — detected staged .env file(s):\n');
    }
    envFiles.forEach((f) => console.error('      ' + f));
    console.error(
      '\n  .env files must never be committed — they hold live credentials.' +
        '\n  Remove them from git with `git rm --cached <file>`, rotate any secret' +
        '\n  they exposed, and keep real values in your platform secret manager.' +
        '\n  If you need a template, name it .env.example or .env.template.\n'
    );
    process.exit(1);
  }

  if (trackedMode) {
    console.log('[check-env] No .env files are tracked by git.');
  }
} catch (err) {
  if (err.status && err.status !== 0) {
    process.exit(err.status);
  }
}
