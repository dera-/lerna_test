const path = require("path");
const fs = require("fs");
const execSync = require("child_process").execSync;

const apiBaseUrl = "https://api.github.com/repos/dera-/lerna_test";
const pullRequestBody = "※自動作成されたPRです";
const pullRequestLabel = "republish";

if (process.argv.length < 3) {
	console.error("Please enter command as follows: node republishAndUpdateChangelog.js [patch|minor|major]");
	process.exit(1);
}

// どのバージョンを上げるのかを取得
const target = process.argv[2];
if (! /^patch|minor|major$/.test(target)) {
	console.error("Please specify patch, minor or major.");
	process.exit(1);
}

// lerna-changelogコマンドを実行するために環境変数GITHUB_AUTHにgithubへのアクセストークンを与える必要がある。
// しかし、与えられていなくてもコマンド実行時にエラーは発生しないのでここで事前にチェックする。
if (process.env.GITHUB_AUTH == null) {
	console.error("Must provide GITHUB_AUTH.");
	process.exit(1);
}

try {
	// versionのbump処理
	console.log("start to bump version");
	const branchName = "tmp_" + Date.now();
	const lernaPath = path.join(__dirname, "..", "node_modules", ".bin", "lerna");
	// versionのbumpを行う前の準備作業
	execSync("git fetch");
	execSync("git checkout origin/master");
	execSync(`git checkout -b ${branchName}`);
	// 直前のcommitがlernaでversionをbumpしたcommitの場合、versionのbumpに失敗するので空コミットを一度挟んでおく
	execSync("git commit --allow-empty -m 'empty'");
	// versionをbumpするためにはリモート側にブランチを用意しておく必要がある
	execSync(`git push origin ${branchName}`);
	// versionのbumpしてcommit+push(ここでgithubリポジトリにタグとリリースノートが作成される)
	execSync(`${lernaPath} version ${target} --allow-branch=${branchName} --force-publish=* --no-push --yes`);
	console.log("end to bump version");
} catch (e) {
	console.error(e);
	process.exit(1);
}
