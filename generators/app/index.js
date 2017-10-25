{
    'use strict';


    const Generator = require('yeoman-generator');
    const chalk = require('chalk');

    

    module.exports = class JBXGenerator extends Generator {

        
        describe() {
            console.log(chalk.green.bold('please use one of the sub-generators!'));
        }
    }
}