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
	// PRを作るためだけに空コミットをしておく。PRはlerna-changelogでCHANGELOGを更新するために必要。
	execSync("git commit --allow-empty -m 'empty'");
	execSync(`git push origin ${branchName}`);
	console.log("end to bump version");

	// PRの作成とマージ処理
	console.log("start to create PR");
	// PRを作成する
	const pullReqDataString = execSync(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X POST -d '{"title":"PR To Republish", "body":"${pullRequestBody}", "head":"dera-:${branchName}", "base":"master"}' ${apiBaseUrl}/pulls`).toString();
	const pullReqData = JSON.parse(pullReqDataString);
	// issue(PR)にラベル付ける
	execSync(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X POST -d '{"labels": ["${pullRequestLabel}"]}' ${apiBaseUrl}/issues/${pullReqData["number"]}/labels`);
	// PRのマージ
	execSync(`curl --fail -H "Authorization: token ${process.env.GITHUB_AUTH}" -X PUT ${apiBaseUrl}/pulls/${pullReqData["number"]}/merge`);
	// ブランチ削除
	execSync("git checkout origin/master");
	execSync(`git branch -D ${branchName}`);
	execSync(`git push origin :${branchName}`);
	console.log("end to merge PR");

	// publish処理
	console.log("start to publish");
	execSync("git checkout master");
	execSync("git pull origin master");
	// CHANGELOG作成時に必要になるのでpublish前のバージョンを保持しておく
	const currentVersion = require(path.join(__dirname, "..", "lerna.json")).version;
	execSync(`${lernaPath} publish ${target} --force-publish=* --yes`);
	console.log("end to publish");

	// 現在のCHANGELOGに次バージョンのログを追加
	console.log("start to update changelog");
	const lernaChangeLogPath = path.join(__dirname, "..", "node_modules", ".bin", "lerna-changelog");
	const addedLog = execSync(`${lernaChangeLogPath} --from v${currentVersion}`).toString();
	const currentChangeLog = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md")).toString();
	const nextChangeLog = currentChangeLog.replace("# CHANGELOG\n\n", "# CHANGELOG\n" + addedLog + "\n");
	fs.writeFileSync(path.join(__dirname, "..", "CHANGELOG.md"), nextChangeLog);
	execSync("git add ./CHANGELOG.md");
	execSync("git commit -m 'Update Changelog'");
	execSync("git push origin master");
	console.log("end to update changelog");
} catch (e) {
	console.error(e);
	process.exit(1);
}