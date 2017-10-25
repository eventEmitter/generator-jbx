{
    'use strict';


    const Generator = require('yeoman-generator');
    const chalk = require('chalk');
    const path = require('path');
    const fs = require('fs');
    const util = require('util');
    const log = require('ee-log');


    const readDir = util.promisify(fs.readdir);
    const stat = util.promisify(fs.stat);
    


    module.exports = class DetectRepositoriesGenerator extends Generator {

        
        async detect() {
            try {
                const parentPath = path.join(this.destinationRoot(), '../');
                const files = await readDir(parentPath);
                const projects = new Map();


                for (const file of files) {
                    const stats = await stat(path.join(parentPath, file));

                    if (stats.isDirectory()) projects.set(file, false);
                }

                (this.config.get('projects') || []).forEach((project) => {
                    if (projects.has(project)) {
                        projects.set(project, true);
                    }
                });


                const answer = await this.prompt([{
                    type: 'checkbox',
                    name: 'projects',
                    message: 'Please select the projects to include in the git workflow!',
                    choices: Array.from(projects.entries()).map(values => ({name: values[0], checked: values[1]})),
                    pageSize: 30
                }]);


                this.config.set('projects', answer.projects);
                this.config.save();
            } catch(err) {
                log(err);
            }
        }
    }
}