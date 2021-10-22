// Export the module
module.exports = new create();

// Create the command
function create(){
    // Command and language
    this.config = {};
    this.language = {};

    // Command description
    this.command = {
        arg1: {
            required: false, // Is this required
            values: [] // Values of this argument 
        },
        arg2: {
            required: true, // Is this required
            values: ["value1", "value2"] // Values of this argument
        }
    };

    // This will be executed on bot ready
    this.start = (config, language) => {
        this.config = config;   // Set config
        this.language = language; // Set language

        // Command ready
        return true; // Return true if it's ready
    }

    // This will be executed when the command is called
    this.execute = async (args, message, action, client) => {
        // Command executed

        // args: list of separate words
        // message: raw discord.js message
        // action: actions from main file
        // client: discord client
        action.reply(message, action.get(this.language.ping));
    }
}