{
    'use strict';


    const Generator = require('yeoman-generator');
    const chalk = require('chalk');
    const log = require('ee-log');
    const Analyzer = require('../../lib/Analyzer');


    

    module.exports = class RepositoryStatusGenerator extends Generator {



        constructor(args, options) {
            super(args, options);

            this.argument('targetBranch', {
                required: true,
                type: String
            });
        }





        async analyze() {
            const analyzer = new Analyzer();
            const messages = await analyzer.analyze({
                destinationRoot: this.destinationRoot(),
                projects: this.config.getAll().projects,
                targetBranch: this.options.targetBranch,
            });

            if (!messages.size) console.log(chalk.green.bold(`All ${this.config.getAll().projects.length} repositories of this project are up to date, commited and have an ${this.options.targetBranch} branch that is in snyc with the upstream branch!`));

            analyzer.printMessages({
                messages: messages,
                destinationRoot: this.destinationRoot(),
            });
        }
    }
}