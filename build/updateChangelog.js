const path = require("path");
const fs = require("fs");
const semver = require("semver");
const execSync = require("child_process").execSync;

if (process.argv.length < 3) {
	console.error("Please enter command as follows: node updateChangelog.js [patch|minor|major|empty]");
	process.exit(1);
}

// どのバージョンを上げるのかを取得
const arg = process.argv[2];
if (! /^patch|minor|major|empty$/.test(arg)) {
	console.error("Please specify patch, minor, major or empty.");
	process.exit(1);
}

// 更新するモジュールが無ければChangelog更新処理を行わず終了する
if (arg !== "empty" && parseInt(execSync(`${path.join(__dirname, "..", "node_modules", ".bin", "lerna")} changed | wc -l`).toString(), 10) === 0) {
	console.error("No modules to update version.");
	process.exit(1);
}

// lerna-changelogコマンドを実行するために環境変数GITHUB_AUTHにgithubへのアクセストークンを与える必要がある。
// しかし、与えられていなくてもコマンド実行時にエラーは発生しないのでここで事前にチェックする。
if (process.env.GITHUB_AUTH == null) {
	console.error("Must provide GITHUB_AUTH.");
	process.exit(1);
}

// 全akashic-cli-xxxに依存するakashic-cliモジュールの次のバージョン番号を取得
const packageJson = require(path.join(__dirname, "..", "packages", "pkg002", "package.json"));
const target = arg === "empty" ? "patch" : arg;
const nextVersion = semver.inc(packageJson["version"], target);

// 現在のCHANGELOGに次バージョンのログを追加
const currentChangeLog = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md")).toString();
let addedLog;
if (arg === "empty") {
	addedLog = `## ${nextVersion}\n* Ignorable change to fix broken publish ${packageJson["version"]}`;
} else {
	addedLog = execSync(`${path.join(__dirname, "..", "node_modules", ".bin", "lerna-changelog")} --next-version ${nextVersion}`).toString();
}
const nextChangeLog = currentChangeLog.replace("# CHANGELOG\n\n", "# CHANGELOG\n" + addedLog + "\n");
fs.writeFileSync(path.join(__dirname, "..", "CHANGELOG.md"), nextChangeLog);
