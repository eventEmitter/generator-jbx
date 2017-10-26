{
    'use strict';

    const promisify = require('util').promisify;
    const exec = promisify(require('child_process').exec);
    const log = require('ee-log');



    module.exports = class Git {


        constructor({
            path
        }) {
            this.path = path;
        }






        async getOriginUrl() {
            const output = await exec(`cd ${this.path} && git remote get-url origin`);
            const match = /[\:\/]([^\/]+\/[^\.]+)/gi.exec(output.stdout);
            if (match) return `https://github.com/${match[1].trim()}`;
            else return null;
        }


        async getMostRecentCommit() {
            const output = await exec(`cd ${this.path} && git log -n 1`);
            return this.parseCommit(output.stdout);
        }



        async checkout(to) {
            const output = await exec(`cd ${this.path} && git checkout ${to}`);
        }


        async push(branch) {
            const output = await exec(`cd ${this.path} && git push -u origin ${branch}`);
        }


        async createBranch(branchName) {
            const output = await exec(`cd ${this.path} && git checkout -b ${branchName}`);
        }


        async add(files) {
            if (!Array.isArray(files)) files = [files];
            const output = await exec(`cd ${this.path} && git add ${files.join(' ')}`);
        }


        async commit(files, message) {
            if (!Array.isArray(files)) files = [files];
            const output = await exec(`cd ${this.path} && git commit ${files.join(' ')} -m "${message}"`);
        }




        async getCommits(from, to = 'HEAD') {
            const output = await exec(`cd ${this.path} && git log${from ? ` ${from}..${to}` : ''}`);
            const commits = [];
            const reg = /commit ([a-f\d]{40})\nAuthor:\s+([^\n]+)\nDate:\s+([^\n]+)([\d\D]+?(?=commit))/ig;
            let text = output.stdout.trim();
            let match;

            while (match = reg.exec(text)) {
                const mailMatch = /([^<]+)<([^>]+)>/gi.exec(match[2]);

                commits.push({
                    id: match[1],
                    author: mailMatch ? mailMatch[1].trim() : match[2].trim(),
                    authorEmail: mailMatch ? mailMatch[2] : null,
                    date: new Date(match[3]),
                    messages: match[4].replace(/^ +/mg, '').trim().split(/\n{2+}/g)
                });
            }

            return commits;
        }





        async getBranchForkDate(base, branchname) {
            const output = await exec(`cd ${this.path} && git show-branch --sha1-name --topic ${base} ${branchname}`);

            if (output.stdout) {
                const match = /.{3}\[([a-f0-9]+)\].*\n\S{2}\s\[.*\n?$/i.exec(output.stdout);
                if (match) {
                    const commit = await this.getCommit(match[1]);
                    if (commit) return commit.date;
                }
            }

            return null;
        }






        async getCommit(id) {
            const output = await exec(`cd ${this.path} && git log -n 1 ${id}`);
            return this.parseCommit(output.stdout);
        }





        parseCommit(message) {
            const match = /commit ([a-f\d]{40})\nAuthor:\s+([^\n]+)\nDate:\s+([^\n]+)([\d\D]+$)/ig.exec(message);

            if (match) {
                return {
                    id: match[1],
                    author: match[2],
                    date: new Date(match[3]),
                    messages: match[4].replace(/^ +/mg, '').trim().split(/\n{2+}/g)
                }
            } else return null;
        }





        async getTags() {
            const output = await exec(`cd ${this.path} && git log --tags --simplify-by-decoration --pretty="format:%ai %d"`);

            const tags = output.stdout
                .split(/\n/gi)
                .map(x => x.trim())
                .filter(x => !!x)
                .map(x => /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [\+\-]\d{4})\s+\(tag: ([^,)]+)/gi.exec(x))
                .filter(y => !!y)
                .map(y => ({name: y[2], date: new Date(y[1])}))
                .sort((a, b) => b.date - a.date);

            return tags;
        }





        async branchHasUpstream() {
            const output = await exec(`cd ${this.path} && git status -sb`);

            return /^## [^\.]+\.\.\.[^\.]+/gi.test(output.stdout);
        }




        async listBranches() {
            const output = await exec(`cd ${this.path} && git branch --all`);

            return output.stdout
                .split(/\n/)
                .map(branch => branch.replace('*', '').trim())
                .map(branch => /\//.test(branch) ? /.+\/.+\/([^\s$]+)/i.exec(branch)[1] : branch);
        }




        async hasBranch(branchName) {
            const output = await exec(`cd ${this.path} && git branch --all`);

            return output.stdout
                .split(/\n/)
                .map(branch => branch.replace('*', '').trim())
                .map(branch => /\//.test(branch) ? /.+\/.+\/([^\s$]+)/i.exec(branch)[1] : branch)
                .includes(branchName);
        }



        async getUpstreamStatus() {
            try {
                await exec('cd '+this.path+' && git fetch');
            } catch (e) {
                log(e);
            }

            const command = `
                UPSTREAM='@{u}'
                LOCAL=$(git rev-parse @)
                REMOTE=$(git rev-parse "$UPSTREAM")
                BASE=$(git merge-base @ "$UPSTREAM")

                if [ $LOCAL = $REMOTE ]; then
                    echo "synced"
                elif [ $LOCAL = $BASE ]; then
                    echo "pull"
                elif [ $REMOTE = $BASE ]; then
                    echo "push"
                else
                    echo "diverged"
                fi
            `;

            const output = await exec('cd '+this.path+' && '+command);

            if (output.stderr.trim() && output.stderr.indexOf('have diverged') === -1) throw new Error(`Unable to determine the upstream status for repository ${this.path}: ${output.stderr}`);
            else return output.stdout.trim();
        }



        async isGitRepository() {
            const output = await exec('cd '+this.path+' && [ -d .git ] || git rev-parse --git-dir');
            return !output.stderr.trim();
        }




        async hasUncommitedChanges() {
            const output = await exec('cd '+this.path+' && git status > /dev/null 2>&1 && git diff-index HEAD --');
            return !!output.stdout.trim();
        }




        async getBranchName() {
            const output = await exec('cd '+this.path+' && branch_name="$(git symbolic-ref HEAD 2>/dev/null)" || branch_name="(unnamed branch)"; branch_name=${branch_name##refs/heads/}; echo $branch_name');
            const branchName = output.stdout.trim();

            if (branchName) return branchName;
            else throw new Error(`Unable to determine the git branch for the repository '${this.basePath}': ${output.stderr}`);
        }
    }
}