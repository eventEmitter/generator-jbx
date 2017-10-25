{
    'use strict';

    
    const chalk = require('chalk');
    const Git = require('./Git');
    const SemanticVersion = require('./SemanticVersion');
    const path = require('path');




    module.exports = class Analyzer {




        async analyze({
            destinationRoot,
            projects,
            targetBranch,
        }) {
            const messages = new Map();


            if (projects) {
                const results = await Promise.all(projects.map(async (projectName) => {
                    const projectRoot = path.join(destinationRoot, '../', projectName);
                    const git = new Git({path: projectRoot});


                    const isGitRepo = await git.isGitRepository();
                    if (!isGitRepo) return this.addError(messages, projectName, `is not a git repository`);

                    const hasBranch = await git.hasBranch(targetBranch);
                    if (!hasBranch) return this.addError(messages, projectName, `has no branch '${targetBranch}'`);

                    const currentBranch = await git.getBranchName();
                    const hasChanges = await git.hasUncommitedChanges();

                    if (currentBranch !== targetBranch) {
                        if (hasChanges) return this.addError(messages, projectName, `is on branch '${currentBranch}' and has uncommited changes`);
                        else await git.checkout(targetBranch);
                    } else if (hasChanges) this.addError(messages, projectName, `has uncommited changes on the '${targetBranch} branch'`);

                    const branchHasUpstream = await git.branchHasUpstream();
                    if (!branchHasUpstream) this.addError(messages, projectName, `the '${targetBranch}' branch has no upstream branch, please set one (git branch --set-upstream-to origin/${targetBranch})`);
                    else {
                        const upstreamStatus = await git.getUpstreamStatus();
                        if (upstreamStatus === 'diverged') this.addError(messages, projectName, `the branch '${targetBranch} has diverged fomr upstream'`);
                        else if (upstreamStatus === 'pull') this.addError(messages, projectName, `the branch '${targetBranch} is behind the upstream branch'`);
                        else if (upstreamStatus === 'push') this.addError(messages, projectName, `the upstream branch is behind the branch '${targetBranch}'`);
                    }


                    const updatedBranch = await git.getBranchName();
                    if (currentBranch !== updatedBranch) await git.checkout(currentBranch);
                }));
            } else return this.addError(messages, 'all', `No projects found, please run yo jbx:discover first`);


            return messages;
        }





        printMessages({
            messages,
            destinationRoot,
        }) {
            for (const projectName of messages.keys()) {
                const messageList = messages.get(projectName);
                const projectRoot = path.join(destinationRoot, '../', projectName);

                console.log(chalk.bold(chalk.white(`Project ${chalk.cyan(projectName)} ${chalk.grey(`(${projectRoot}):`)}`)));
                messageList.forEach(message => console.log(chalk.white(`- ${message}`)));
                console.log('');
            }
        }





        addError(messages, projectName, message) {
            if (!messages.has(projectName)) messages.set(projectName, []);
            messages.get(projectName).push(message);
            return messages;
        }
    }
}