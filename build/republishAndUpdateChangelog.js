const path = require("path");
const fs = require("fs");
const execSync = require("child_process").execSync;
const spawnSync = require("child_process").spawnSync;

const apiBaseUrl = "https://api.github.com/repos/dera-/lerna_test";
const pullRequestBody = "※自動作成されたPRです";
const pullRequestLabel = "republish";

function execCommand(command) {
	const words = command.split(" ");
	const result = spawnSync(words[0], words.slice(1));
	if (result.status !== 0) {
		console.log(result.stdout.toString());
		console.log(result.stderr.toString());
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
execCommand(`${lernaPath} version ${target} --allow-branch="${branchName}" --force-publish=* --yes`);
console.log("end to bump version");

// PRの作成とマージ処理
console.log("start to create PR");
const currentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lerna.json")).toString()).version;
// PRを作成する
const pullReqDataString = execSync(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X POST -d '{"title":"v${currentVersion}", "body":"${pullRequestBody}", "head":"dera-:${branchName}", "base":"master"}' ${apiBaseUrl}/pulls`).toString();
const pullReqData = JSON.parse(pullReqDataString);
// issue(PR)にラベル付ける
execSync(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X POST -d '{"labels": ["${pullRequestLabel}"]}' ${apiBaseUrl}/issues/${pullReqData["number"]}/labels`);
// PRのマージ
execSync(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X PUT ${apiBaseUrl}/pulls/${pullReqData["number"]}/merge`);
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
