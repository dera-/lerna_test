const path = require("path");
const fs = require("fs");
const spawnSync = require("child_process").spawnSync;

const pullRequestBody = "※自動作成されたPRです";
const pullRequestLabel = "republish";

function execCommand(command) {
	const result = spawnSync(command);
	if (result.status !== 0) {
		console.error(`Failed: ${command}.`);
		process.exit(1);
	}
	return result.stdout.toString();
}

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

// versionのbump処理
console.log("start to bump version");
const branchName = Date.now();
const lernaPath = path.join(__dirname, "..", "node_modules", ".bin", "lerna");
// versionのbumpを行う前の準備作業
execCommand("git fetch");
execCommand("git checkout origin/master");
execCommand(`git checkout -b ${branchName}`);
execCommand("git commit --allow-empty -m 'empty'");
execCommand(`git push origin ${branchName}`);
// versionのbumpしてcommit+push(ここでgithubリポジトリにタグとリリースノートが作成される)
execCommand(`${lernaPath} version ${target} --allow-branch=* --force-publish=* --yes`);
console.log("end to bump version");

// PRの作成とマージ処理
console.log("start to create PR");
const currentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lerna.json")).toString()).version;
// PRを作成する
const pullReqDataString = execCommand(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X POST -d '{"title":"v${currentVersion}", "body":"${pullRequestBody}", "head":"dera-:${branchName}", "base":"master"}' https://api.github.com/repos/dera-/lerna_test/pulls`);
const pullReqData = JSON.parse(pullReqDataString);
// issue(PR)にラベル付ける
execCommand(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X POST -d '{"labels": ["${pullRequestLabel}"]}' https://api.github.com/repos/dera-/lerna_test/issues/${pullReqData["number"]}/labels`);
// PRのマージ
execCommand(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X PUT https://api.github.com/repos/dera-/lerna_test/pulls/${pullReqData["number"]}/merge`);
// ブランチ削除
execCommand("git checkout origin/master");
execCommand(`git branch -D ${branchName}`);
execCommand(`git push origin :${branchName}`);
console.log("end to merge PR");

// 現在のCHANGELOGに次バージョンのログを追加
console.log("start to update changelog");
execCommand("git checkout master");
execCommand("git pull origin master");
const lernaChangeLogPath = path.join(__dirname, "..", "node_modules", ".bin", "lerna-changelog");
const addedLog = execCommand(`${lernaChangeLogPath} --next-version v${currentVersion}`);
const currentChangeLog = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md")).toString();
const nextChangeLog = currentChangeLog.replace("# CHANGELOG\n\n", "# CHANGELOG\n" + addedLog + "\n");
fs.writeFileSync(path.join(__dirname, "..", "CHANGELOG.md"), nextChangeLog);
execCommand("git add ./CHANGELOG.md");
execCommand("git commit -m 'Update Changelog'");
execCommand("git push origin master");
console.log("end to update changelog");
