const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const args = process.argv.slice(2);
const prepareOnly = args.includes('--prepare-only');
const autoPush = !args.includes('--no-autopush');
const publishVersion = !args.includes('--no-publish-version');
const firebasePublish = !args.includes('--no-firebase');
const projectName = 'fs_clean';
const backupRoot = 'H:/Mi unidad/Mi Diario Deportivo/BACKUPS';

const pkgPath = path.join(root, 'package.json');
const appPath = path.join(root, 'app.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function bumpSemverPatch(version) {
  const parts = String(version || '0.0.0')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

const { resolveApkUrl } = require('./resolve-apk-url');

function bumpRuntime(runtimeVersion) {
  return bumpSemverPatch(runtimeVersion || '1.0.0');
}

function run(command, commandArgs, cwd) {
  const res = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });
  if (res.status !== 0) process.exit(res.status || 1);
}

function runCapture(command, commandArgs, cwd) {
  return spawnSync(command, commandArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    encoding: 'utf8',
  });
}

function maybeRunSyncHelpScript() {
  const helpScript = path.join(root, 'scripts', 'sync-help-changelog.js');
  if (fs.existsSync(helpScript)) {
    run(process.execPath, [helpScript], root);
  }
}

function maybeFirebasePublish() {
  if (!firebasePublish) {
    console.log('[release] firebase publish disabled (--no-firebase)');
    return;
  }
  const cfgPath = path.join(root, 'config', 'firebase-app.json');
  if (!fs.existsSync(cfgPath)) {
    console.log('[release] Firebase no configurado (ejecuta: node scripts/firebase-setup.mjs)');
    return;
  }
  const cfg = readJson(cfgPath);
  if (!String(cfg.projectId || '').trim() || !String(cfg.androidAppId || '').trim()) {
    console.log('[release] Firebase incompleto; solo Version_App (Sheet).');
    return;
  }
  const script = path.join(root, 'scripts', 'firebase-publish-release.mjs');
  const res = runCapture(process.execPath, [script], root);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    console.log('[release] Firebase publish falló; Version_App (Sheet) sigue activo como respaldo.');
    maybePublishVersionApp();
  }
}

function maybePublishVersionApp() {
  if (!publishVersion) {
    console.log('[release] publish Version_App disabled (--no-publish-version)');
    return;
  }
  const publishScript = path.join(root, 'scripts', 'publish-version-app.js');
  if (!fs.existsSync(publishScript)) return;
  const res = runCapture(process.execPath, [publishScript], root);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    console.log('[release] Version_App no publicada (redespliega Apps Script o usa --no-publish-version)');
  }
}

function formatTimestamp(date) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function shouldSkipDir(dirName) {
  return ['.git', 'node_modules', 'dist', 'build', '.expo', 'releases'].includes(dirName);
}

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      collectFiles(fullPath, out);
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function isSecretFile(relativePath, baseName) {
  const rel = relativePath.replace(/\\/g, '/').toLowerCase();
  const name = baseName.toLowerCase();

  if (name.startsWith('.env')) return true;
  if (name === 'google-services.json') return true;
  if (name === 'keystore.properties') return true;
  if (/^credentials.*\.json$/.test(name)) return true;
  if (/^oauth.*\.txt$/.test(name)) return true;
  if (/\.(jks|keystore|p12|p8|key|mobileprovision)$/.test(name)) return true;
  if (name.includes('keystore') && !rel.endsWith('keystore.properties.example')) return true;
  return false;
}

function ensureBackupInstructions() {
  fs.mkdirSync(backupRoot, { recursive: true });
  const instructionsPath = path.join(backupRoot, 'INSTRUCCIONES_BACKUP.txt');
  const text = [
    'BACKUP DE SECRETOS - fs_clean',
    '',
    'Que se guarda automaticamente en cada release:',
    '- .env*',
    '- google-services.json',
    '- credentials*.json',
    '- oauth*.txt',
    '- keystore.properties',
    '- *.jks, *.keystore, *.p12, *.p8, *.key, *.mobileprovision',
    '',
    'Donde:',
    '- Se crea una carpeta con fecha: fs_clean_secretos_YYYYMMDD_HHMMSS',
    '- Dentro va REPORT.txt con el detalle de archivos',
    '',
    'Recomendaciones:',
    '- Mantener esta carpeta sincronizada en Drive',
    '- No subir estos secretos al repositorio Git',
    '- Probar restauracion en otro PC antes de viajar',
    '',
  ].join('\n');
  fs.writeFileSync(instructionsPath, text, 'utf8');
}

function backupSensitiveFiles() {
  ensureBackupInstructions();
  const timestamp = formatTimestamp(new Date());
  const backupDir = path.join(backupRoot, `${projectName}_secretos_${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const allFiles = collectFiles(root);
  const selected = [];

  for (const fullPath of allFiles) {
    const relativePath = path.relative(root, fullPath);
    const baseName = path.basename(fullPath);
    if (!isSecretFile(relativePath, baseName)) continue;
    if (relativePath.toLowerCase().includes('/releases/')) continue;
    if (baseName.endsWith('.example')) continue;

    const destPath = path.join(backupDir, relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(fullPath, destPath);
    selected.push(relativePath.replace(/\\/g, '/'));
  }

  const reportPath = path.join(backupDir, 'REPORT.txt');
  const reportLines = [
    `project=${projectName}`,
    `timestamp=${timestamp}`,
    `source=${root}`,
    `total_files=${selected.length}`,
    '',
    ...selected.map((f) => `- ${f}`),
    '',
  ];
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`[release] backup secrets: ${backupDir} (${selected.length} files)`);
}

function autoCommitAndPush(version, versionCode) {
  if (!autoPush) {
    console.log('[release] auto-push disabled (--no-autopush)');
    return;
  }
  if (!fs.existsSync(path.join(root, '.git'))) {
    console.log('[release] no git repo found; skipping auto-push');
    return;
  }

  run('git', ['add', '-A'], root);
  const stagedCheck = runCapture('git', ['diff', '--cached', '--quiet'], root);
  const hasStagedChanges = stagedCheck.status !== 0;
  if (!hasStagedChanges) {
    console.log('[release] no changes to commit');
    return;
  }

  const msg = `chore(release): ${version} (vc${versionCode})`;
  run('git', ['commit', '-m', msg], root);
  run('git', ['push', '-u', 'origin', 'HEAD'], root);
  console.log('[release] git auto-push completed');
}

const pkg = readJson(pkgPath);
const app = readJson(appPath);

const oldVersion = String(pkg.version || '1.0.0');
const newVersion = bumpSemverPatch(oldVersion);

const oldCode = Number(app?.expo?.android?.versionCode || 0);
const newCode = oldCode + 1;
const oldBuild = Number(app?.expo?.ios?.buildNumber || 0);
const newBuild = oldBuild + 1;
const newRuntime = bumpRuntime(app?.expo?.runtimeVersion || '1.0.0');

pkg.version = newVersion;
writeJson(pkgPath, pkg);

app.expo = app.expo || {};
app.expo.version = newVersion;
app.expo.android = app.expo.android || {};
app.expo.android.versionCode = newCode;
app.expo.ios = app.expo.ios || {};
app.expo.ios.buildNumber = String(newBuild);
app.expo.runtimeVersion = newRuntime;
writeJson(appPath, app);

let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
fs.writeFileSync(gradlePath, gradle, 'utf8');

console.log(`[release] version ${oldVersion} -> ${newVersion}`);
console.log(`[release] android.versionCode ${oldCode} -> ${newCode}`);
console.log(`[release] ios.buildNumber ${oldBuild} -> ${newBuild}`);
console.log(`[release] runtimeVersion -> ${newRuntime}`);

maybeRunSyncHelpScript();
backupSensitiveFiles();

if (prepareOnly) {
  console.log('[release] prepare-only done');
  autoCommitAndPush(newVersion, newCode);
  process.exit(0);
}

const androidDir = path.join(root, 'android');
if (process.platform === 'win32') run('cmd.exe', ['/c', 'gradlew.bat', 'assembleRelease'], androidDir);
else run('./gradlew', ['assembleRelease'], androidDir);

const apkPath = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(apkPath)) {
  console.error('[release] APK not found after build');
  process.exit(1);
}

const releasesDir = path.join(root, 'releases');
if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });
const outName = `futsal-lega-v3-${newVersion}-vc${newCode}.apk`;
const outPath = path.join(releasesDir, outName);
fs.copyFileSync(apkPath, outPath);

const firebasePublicDir = path.join(root, 'firebase', 'public');
if (!fs.existsSync(firebasePublicDir)) fs.mkdirSync(firebasePublicDir, { recursive: true });
const hostingApkPath = path.join(firebasePublicDir, 'latest.bin');
fs.copyFileSync(apkPath, hostingApkPath);

let hostingApkUrl = 'https://futsal-amas-lega.web.app/latest.bin';
const fbCfgPath = path.join(root, 'config', 'firebase-app.json');
if (fs.existsSync(fbCfgPath)) {
  try {
    const fbCfg = readJson(fbCfgPath);
    const pid = String(fbCfg.projectId || '').trim();
    if (pid) hostingApkUrl = `https://${pid}.web.app/latest.bin`;
  } catch (e) {
    /* keep default */
  }
}
fs.writeFileSync(path.join(releasesDir, 'apk-drive-url.txt'), `${hostingApkUrl}\n`, 'utf8');
console.log(`[release] Hosting APK: ${hostingApkPath}`);
console.log(`[release] apkUrl: ${hostingApkUrl}`);

const manifestPath = path.join(releasesDir, 'app-version-manifest.json');
const manifestApkUrl = hostingApkUrl;
const manifest = {
  version: newVersion,
  versionCode: newCode,
  apkFileName: outName,
  apkUrl: manifestApkUrl,
  changelog: `Versión ${newVersion} (vc${newCode})`,
  updatedAt: new Date().toISOString(),
};
writeJson(manifestPath, manifest);

console.log(`[release] APK ready: ${outPath}`);
console.log(`[release] Manifest: ${manifestPath}`);
if (firebasePublish && fs.existsSync(path.join(root, 'config', 'firebase-app.json'))) {
  const fbCfg = readJson(path.join(root, 'config', 'firebase-app.json'));
  if (String(fbCfg.projectId || '').trim() && String(fbCfg.androidAppId || '').trim()) {
    maybeFirebasePublish();
  } else {
    maybePublishVersionApp();
  }
} else {
  maybePublishVersionApp();
}
autoCommitAndPush(newVersion, newCode);
