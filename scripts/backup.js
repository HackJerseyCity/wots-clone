const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEPLOY_YML = path.join(REPO_ROOT, 'config', 'deploy.yml');
const HOST_DATA_DIR = '/opt/wots-clone/data';
const CONTAINER_DATA_DIR = '/data';

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error('usage: npm run backup <destination-file>');
  console.error('example: npm run backup ~/Desktop/wots.sqlite3');
  process.exit(1);
}

function parseDeployTargets() {
  const yml = fs.readFileSync(DEPLOY_YML, 'utf8');
  const webBlock = yml.match(/servers:[\s\S]*?web:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (!webBlock) throw new Error('could not find servers.web in config/deploy.yml');
  const hosts = webBlock[1]
    .split('\n')
    .map((l) => l.trim().replace(/^-\s*/, '').trim())
    .filter(Boolean);
  if (!hosts.length) throw new Error('no hosts under servers.web');
  const userMatch = yml.match(/^ssh:\s*\n(?:\s+.*\n)*?\s+user:\s*(\S+)/m);
  const user = userMatch ? userMatch[1] : 'root';
  return { host: hosts[0], user };
}

function timestampedPath(target) {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  const d = new Date();
  const stamp =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    '-' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
  return path.join(dir, `${base}-${stamp}${ext}`);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function main() {
  const rawTarget = process.argv[2];
  if (!rawTarget) usage('destination file path required');

  const absTarget = path.resolve(rawTarget);
  const destDir = path.dirname(absTarget);
  if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
    usage(`destination directory does not exist: ${destDir}`);
  }

  let finalTarget = absTarget;
  if (fs.existsSync(absTarget)) {
    finalTarget = timestampedPath(absTarget);
    console.log(`destination exists; using timestamped path: ${finalTarget}`);
  }

  const { host, user } = parseDeployTargets();
  const remote = `${user}@${host}`;

  const tmpName = `.wots-backup-tmp-${Date.now()}-${process.pid}.db`;
  const containerTmp = `${CONTAINER_DATA_DIR}/${tmpName}`;
  const hostTmp = `${HOST_DATA_DIR}/${tmpName}`;

  const inlineNode =
    'const src=process.env.DB_PATH;' +
    `const dst='${containerTmp}';` +
    "const db=require('better-sqlite3')(src,{readonly:true,fileMustExist:true});" +
    'db.backup(dst).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});';

  try {
    console.log(`snapshotting prod DB into ${containerTmp} via kamal app exec...`);
    run('kamal', ['app', 'exec', '--reuse', '--quiet', `node -e "${inlineNode}"`]);

    console.log(`copying ${remote}:${hostTmp} -> ${finalTarget} ...`);
    run('scp', [`${remote}:${hostTmp}`, finalTarget]);

    const size = fs.statSync(finalTarget).size;
    console.log(`\nbackup complete: ${finalTarget} (${size.toLocaleString()} bytes)`);
  } finally {
    try {
      run('ssh', [remote, 'rm', '-f', hostTmp]);
    } catch (e) {
      console.error(`warning: failed to remove prod-side temp file ${hostTmp}: ${e.message}`);
    }
  }
}

main();
