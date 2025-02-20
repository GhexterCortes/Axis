const Fs = require('fs');
const Path = require('path');
const Yml = require('yaml');

    /**
    * @param {string} location - The location of the yml config file.
    * @param {*} content - The content of the file. This will automatically be converted to yml if it's an object
    * @returns {Object} yml parsed object
    */
module.exports = (location, contents) => {
    if(typeof location === 'object') contents = Yml.stringify(contents);
    
    if(!Fs.existsSync(location)) {
        Fs.mkdirSync(Path.dirname(location), { recursive: true });
        Fs.writeFileSync(location, contents.toString());
    }

    return Yml.parse(Fs.readFileSync(location, 'utf8'));
}
