{
    'use strict';

    const semver = require('semver');
    const log = require('ee-log');




    module.exports = class SemanticVersion {





        renderChangelog({
            versions,
            releaseName,
            branchName,
            version = 'unknown',
            startDate,
            endDate,
            repository,
        }) {
            const majorChanges = this.renderPart({
                title: 'Breaking Changes', 
                commits: versions.major, 
                repository: repository,
            });

            const minorChanges = this.renderPart({
                title: 'Features', 
                commits: versions.minor, 
                repository: repository,
            });

            const patchChanges = this.renderPart({
                title: 'Fixes', 
                commits: versions.patch, 
                repository: repository,
                renderTypes: true
            });

            const invalidChanges = this.renderPart({
                title: 'Other Changes', 
                commits: versions.invalid, 
                repository: repository,
            });


            const document = `
# Changelog for the ${releaseName} release

### Version ${version}

**Branch**: ${branchName}
**Implementation Timespan**: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}
**Breaking Changes**: ${versions.major.length}
**Features**: ${versions.minor.length}
**Fixes**: ${versions.patch.length}
**Total Commits**: ${(versions.major.length+versions.minor.length+versions.patch.length+versions.invalid.length)}

${majorChanges}${minorChanges}${patchChanges}${invalidChanges}
            `;

            return document.trim();
        }






        renderPart({
            title, 
            commits, 
            repository,
            renderTypes = false,
        }) {
            if (commits.length) {
                const typeMap = new Map();

                if (renderTypes) {
                    commits.forEach((commit) => {
                        const type = commit.type || 'other';
                        if (!typeMap.has(type)) typeMap.set(type, []);
                        typeMap.get(type).push(commit);
                    });
                } else {
                    typeMap.set('other', commits);
                }


                let document = `\n\n## ${title}\n\n`;
                const sections = [];

                for (const type of typeMap.keys()) {
                    sections.push({
                        type: type,
                        commits: typeMap.get(type).sort((a, b) => a.date > b.date),
                    });
                }

                sections.sort((a, b) => a.type > b.type ? 1 : -1);

                sections.forEach((item) => {
                    const commitList = item.commits;
                    if (renderTypes) document += `\n\n**${item.type}**\n\n`;

                    commitList.forEach((commit) => {
                        const component = commit.component ? `***${commit.component}***: ` : '';

                        let subject = commit.subject;
                        const linkMatch = /(.*)(https:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/(\d+)[^\s]*)(.*)/gi.exec(subject);
                        if (linkMatch) subject = `${linkMatch[1]} [#${linkMatch[3]}](${linkMatch[2]})${linkMatch[4]}`;
                        //if (subject.length > 70) subject = subject.substr(0, 67)+'..';

                        document += `- ${component}${subject || '[no message]'} - *${commit.author}* ([${commit.id.substr(0,7)}](${repository}/commit/${commit.id}))\n`
                    });
                });

                document += '\n\n';

                return document;
            } else return '';
        }




        formatDate(date) {
            return `${this.pad(date.getDate())}.${this.pad(date.getMonth()+1)}.${date.getFullYear()}`;
        }



        pad(input, len = 2, char = '0') {
            input = String(input);
            return char.repeat(len-input.length)+input;
        }





        getVersionFromCommitLogs(commitLogs) {
            // count patch version until a feature 
            // was reached, from then on count features
            // until a major version was reached. from then on 
            // only count major versions
            const versions = {
                major: [],
                minor: [],
                patch: [],
                invalid: [],
            };


            commitLogs.forEach((commit) => {
                commit.messages.forEach((message) => {
                    const match = /^(fix|feat|docs|style|refactor|test|chore)(?:\s*\(([^\)]+)\))?\s*[\s:](.*)(?:\n|$)([\D\d]*)/gi.exec(message);

                    if (match) {
                        commit.subject = match[3];
                        commit.component = match[2];
                        commit.type = match[1].toLowerCase();

                        const description = match[4].trim();

                        if (description) {
                            // check for breaking changes
                            const breakingMatch = /([\D\d]+)\n\s*breaking change:(.*)(?:\n|$)([\D\d]*)/gi.exec(commit.description);
                            
                            if (breakingMatch) {
                                commit.description = breakingMatch[1].trim();
                                commit.breakingSubject = breakingMatch[2].trim();
                                commit.breakingDescription = breakingMatch[3].trim();
                            } else commit.description = match[4].trim();
                        }

                        if (match[1].toLowerCase() === 'feat') versions.minor.push(commit);
                        else versions.patch.push(commit);
                    } else {
                        const subjectMatch = /(.*)[\n$]/.exec(message);
                        commit.subject = subjectMatch ? subjectMatch[1] : message;
                        versions.invalid.push(commit);
                    }
                });
            });

            return versions;
        }





        getLatestSemverFromTags(tagList) {
            if (tagList && tagList.length) {
                const highest = tagList[0];
                let index = 1;

                for (let i = 1, l = tagList.length; i < l; i++) {
                    if (semver.valid(tagList[i]) && semver.gt(tagList[i], highest)) {
                        highest = tagList[i];
                    }
                }

                if (semver.valid(highest)) return highest;
            }

            return null;
        }
    }
}