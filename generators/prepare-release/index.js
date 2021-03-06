{
    'use strict';


    const Generator = require('yeoman-generator');
    const chalk = require('chalk');
    const log = require('ee-log');
    const Analyzer = require('../../lib/Analyzer');
    const Git = require('../../lib/Git');
    const SemanticVersion = require('../../lib/SemanticVersion');
    const path = require('path');
    const promisify = require('util').promisify;
    const mkdir = promisify(require('fs').mkdir);
    const writeFile = promisify(require('fs').writeFile);
    const readFile = promisify(require('fs').readFile);
    const stat = promisify(require('fs').stat);


    

    module.exports = class RepositoryStatusGenerator extends Generator {



        constructor(args, options) {
            super(args, options);


            this.argument('sourceBranch', {
                required: true,
                type: String
            });

            this.argument('targetBranch', {
                required: true,
                type: String
            });
        }



        
        async execute() {
            const projects = this.config.getAll().projects;
            const sourceBranch = this.options.sourceBranch;
            const targetBranch = this.options.targetBranch;
            const releaseName = targetBranch.replace('release-', '');

            // make sure we're fine
            const analyzer = new Analyzer();
            const messages = await analyzer.analyze({
                destinationRoot: this.destinationRoot(),
                projects: projects,
                targetBranch: this.options.sourceBranch,
            });


            if (messages.size) {
                console.log(chalk.yellow.bold(`Cannot create release, please fix the problems below:`));
                console.log('');
                
                analyzer.printMessages({
                    messages: messages,
                    destinationRoot: this.destinationRoot(),
                });
                return;
            }


            const continueAnswer = await this.prompt([{
                type: 'confirm',
                name: 'continue',
                message: `Going to create the release branch ${chalk.cyan.bold(targetBranch)} from the source branch ${chalk.magenta.bold(sourceBranch)}. Continue?`
            }]);



            if (continueAnswer.continue) {
                const releaseCandidates = new Map();


                await Promise.all(projects.map(async (projectName) => {
                    const projectRoot = path.join(this.destinationRoot(), '../', projectName);
                    const packageJSONPath = path.join(projectRoot, 'package.json');
                    const git = new Git({path: projectRoot});
                    const semver = new SemanticVersion();

                    // make sure to checkout the sourceBranch
                    await git.checkout(sourceBranch);

                    // detect which repositories have been updated
                    // since the last release, which is the last release 
                    // branch encountered or the begin of the history

                    // first find the most recent release branch
                    const allReleaseBranches = Array.from(new Set((await git.listBranches()).filter(name => /^release/i.test(name))));

                    let latestBranch;
                    let latestBranchDate = new Date(0);

                    await Promise.all(allReleaseBranches.map(async (name) => {
                        const branchDate = await git.getBranchForkDate(name, sourceBranch);
                        if (branchDate && branchDate.getTime() > latestBranchDate.getTime()) {
                            latestBranch = name;
                            latestBranchDate = branchDate;
                        }
                    }));


                    let latestTag;
                    if (!latestBranch) {
                        // check if a semevr tga is present, it is probably the 
                        // latest release
                        const tags = await git.getTags();

                        // get latest semver tag
                        latestTag = semver.getLatestSemverFromTags(tags);
                    }

                    // check if there are any updates since the last release
                    const commits = await git.getCommits((latestBranch || (latestTag ? latestTag.name : null)), sourceBranch);

                    // get last commit, for its date
                    const lastCommit = await git.getMostRecentCommit();

                    // if there are no commits and the base
                    // for getting commits was not a release branch
                    // select it for release
                    const doRelease = (commits.length === 0 && !latestBranch || !!commits.length);
                    const versions = semver.getVersionFromCommitLogs(commits);

                    const repository = await git.getOriginUrl();
                    const repositoryMatch = /\.com[\:\/]([a-z0-9-_]+\/[a-z0-9-_]+)\b/gi.exec(repository);
                    //const gitRepository = repositoryMatch ? repositoryMatch[1] : null;

                    // get the package.json file
                    let packageJson;
                    try {
                        const data = await readFile(packageJSONPath);
                        packageJson = JSON.parse(data);
                    } catch (e) {}


                    const baseBranch = (commits.length ? (latestBranch || (latestTag ? latestTag.name : null) || 'master') : 'master');

                    const projectConfig = {
                        name: projectName,
                        doRelease: doRelease,
                        baseBranch: baseBranch,
                        versionUpdates: versions,
                        //gitRepository: gitRepository,
                        dependencyRef: doRelease ? baseBranch : (latestBranchDate > (latestTag ? latestTag.date : null) ? latestBranch : latestTag.name),
                        packageJson: packageJson,
                        changelog: semver.renderChangelog({
                            versions: versions,
                            releaseName: releaseName,
                            branchName: targetBranch,
                            startDate: latestBranchDate,
                            endDate: lastCommit ? lastCommit.date : new Date(),
                            repository: repository,
                        }),
                    };

                    releaseCandidates.set(packageJson.name, projectConfig);



                    if (projectConfig.doRelease) {
                        // get the branch 
                        const hasBranch = await git.hasBranch(targetBranch);
                        if (!hasBranch) await git.createBranch(targetBranch);
                        else await git.checkout(targetBranch);


                        // make sure the changelog dir exists
                        const changelogDir = path.join(projectRoot, 'changelogs');
                        try {
                            await stat(path.join(changelogDir));
                        } catch (e) {
                            await mkdir(changelogDir);
                        }
                        

                        // store change log
                        await writeFile(path.join(changelogDir, `changelog-${targetBranch}.md`), projectConfig.changelog);

                        const changelogFile = path.join('changelogs', `changelog-${targetBranch}.md`);

                        let changelogExists = true;

                        try {
                            await stat(path.join(projectRoot, changelogFile));
                        } catch (e) {
                            changelogExists = false;
                        }


                        if (changelogExists) {
                            const hasChanges = await git.hasUncommitedChanges();
                            if (hasChanges) await git.commit(changelogFile, `chore(changelog): update changelog for ${releaseName} release`);
                        } else {
                            await git.add(changelogFile);
                            await git.commit(changelogFile, `chore(changelog): add changelog for ${releaseName} release`);
                        }
                    }
                }));
                




                // create dependency tree
                Array.from(releaseCandidates.values()).forEach((project) => {
                    if (project.packageJson.dependencies) {
                        project.dependencies = Object.keys(project.packageJson.dependencies)
                            .filter(name => !!name)
                            .filter(name => releaseCandidates.has(name));
                    }

                    if (project.packageJson.devDependencies) {
                        project.devDependencies = Object.keys(project.packageJson.devDependencies)
                            .filter(name => !!name)
                            .filter(name => releaseCandidates.has(name));
                    }

                    if (project.packageJson.optionalDependencies) {
                        project.optionalDependencies = Object.keys(project.packageJson.optionalDependencies)
                            .filter(name => !!name)
                            .filter(name => releaseCandidates.has(name));
                    }
                });

    

    


                // push 
                await Promise.all(Array.from(releaseCandidates.values()).map(async (project) => {
                    if (project.doRelease) {
                        const projectRoot = path.join(this.destinationRoot(), '../', project.name);
                        const git = new Git({path: projectRoot});
                        await git.push(targetBranch);
                    }
                }));
            }
        }
    }
}